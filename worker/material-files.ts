/** Private originals for saved application materials. Bytes live in the existing R2 bucket. */
export type MaterialFileKind = 'pdf' | 'photo';
export type MaterialFileMeta = { kind: MaterialFileKind; size: number; uploadedAt: string };

export async function ensureMaterialFilesSchema(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS material_files (
    owner TEXT NOT NULL, material_id TEXT NOT NULL, kind TEXT NOT NULL,
    size INTEGER NOT NULL, uploaded_at TEXT NOT NULL,
    PRIMARY KEY(owner, material_id, kind)
  )`).run();
}

export function materialFileId(kind: MaterialFileKind, materialId: string) {
  return kind === 'photo' ? '' : materialId;
}

export function materialFileKey(owner: string, kind: MaterialFileKind, materialId: string) {
  return `${encodeURIComponent(owner)}/material-files/${kind === 'photo' ? 'profile-photo' : encodeURIComponent(materialId) + '.pdf'}`;
}

export async function materialFileMeta(db: D1Database, owner: string, kind: MaterialFileKind, materialId: string): Promise<MaterialFileMeta | null> {
  const row = await db.prepare('SELECT size,uploaded_at FROM material_files WHERE owner=? AND material_id=? AND kind=?')
    .bind(owner, materialFileId(kind, materialId), kind).first<{ size: number; uploaded_at: string }>();
  return row ? { kind, size: row.size, uploadedAt: row.uploaded_at } : null;
}

export async function saveMaterialFile(db: D1Database, bucket: R2Bucket, owner: string, kind: MaterialFileKind, materialId: string, request: Request) {
  const limit = kind === 'pdf' ? 12 * 1024 * 1024 : 5 * 1024 * 1024;
  if (Number(request.headers.get('content-length') || 0) > limit) throw new Error('文件过大');
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length || bytes.length > limit) throw new Error('文件为空或过大');
  const type = request.headers.get('content-type')?.split(';')[0].toLowerCase() || '';
  const pdf = bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-';
  const png = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (kind === 'pdf' ? !(type === 'application/pdf' && pdf) : !((type === 'image/png' && png) || (type === 'image/jpeg' && jpeg) || (type === 'image/webp' && webp)))
    throw new Error(kind === 'pdf' ? '请选择有效的 PDF 文件' : '请选择 PNG、JPEG 或 WebP 照片');
  const key = materialFileKey(owner, kind, materialId);
  await bucket.put(key, bytes, { httpMetadata: { contentType: type } });
  const meta: MaterialFileMeta = { kind, size: bytes.length, uploadedAt: new Date().toISOString() };
  await db.prepare(`INSERT INTO material_files(owner,material_id,kind,size,uploaded_at) VALUES(?,?,?,?,?)
    ON CONFLICT(owner,material_id,kind) DO UPDATE SET size=excluded.size,uploaded_at=excluded.uploaded_at`)
    .bind(owner, materialFileId(kind, materialId), kind, meta.size, meta.uploadedAt).run();
  return meta;
}

export async function deleteMaterialFile(db: D1Database, bucket: R2Bucket, owner: string, kind: MaterialFileKind, materialId: string) {
  await bucket.delete(materialFileKey(owner, kind, materialId));
  await db.prepare('DELETE FROM material_files WHERE owner=? AND material_id=? AND kind=?')
    .bind(owner, materialFileId(kind, materialId), kind).run();
}
