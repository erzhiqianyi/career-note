import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

const hash = data => createHash('sha256').update(data).digest('hex');
function scalar(text, key) {
  const match = text.match(new RegExp(`^\\s*${key}:\\s*(.*?)\\s*$`, 'm'));
  if (!match) return '';
  const value = match[1];
  if (value.startsWith('"')) return JSON.parse(value);
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
  if (['>', '|', '>-', '|-'].includes(value)) {
    const lines = text.slice(match.index + match[0].length).split('\n');
    const result = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      if (!/^\s/.test(line)) break;
      result.push(line.trim());
    }
    return result.join(' ');
  }
  return value;
}
function safe(root, path) {
  let cursor = root;
  for (const part of path.split('/')) {
    cursor = join(cursor, part);
    if (lstatSync(cursor).isSymbolicLink()) throw new Error(`Symlinks are not archived: ${path}`);
  }
  return cursor;
}
export function build(root) {
  root = resolve(root);
  const files = {};
  const skills = [];
  const skillRoot = '.agents/skills';
  const walk = path => {
    const absolute = safe(root, path);
    if (lstatSync(absolute).isDirectory()) return readdirSync(absolute).sort().flatMap(name => {
      if (name.startsWith('.') || name === '__pycache__') return [];
      return walk(`${path}/${name}`);
    });
    if (/\.py[co]$/.test(path)) return [];
    files[path] = readFileSync(absolute);
    return [path];
  };
  if (existsSync(join(root, skillRoot))) {
    for (const name of readdirSync(safe(root, skillRoot)).sort()) {
      const folder = `${skillRoot}/${name}`;
      if (!lstatSync(safe(root, folder)).isDirectory()) continue;
      const names = walk(folder);
      const entry = `${folder}/SKILL.md`;
      if (!files[entry]) throw new Error(`Missing SKILL.md: ${name}`);
      const content = files[entry].toString();
      const front = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
      if (!front) throw new Error(`Invalid frontmatter: ${name}`);
      const description = scalar(front[1], 'description');
      if (scalar(front[1], 'name') !== name || !/^[a-z0-9-]{1,64}$/.test(name) || !description) throw new Error(`Invalid skill metadata: ${name}`);
      const meta = files[`${folder}/agents/openai.yaml`]?.toString() || '';
      skills.push({name, title: scalar(meta, 'display_name') || name, description,
        prompt: scalar(meta, 'default_prompt') || `使用 $${name}`, entry,
        content: content.slice(front[0].length).trim(), files: names,
        references: names.filter(path => path.endsWith('.md') && path !== entry).map(path => ({path, content: files[path].toString()}))});
    }
  }
  for (const path of ['AGENTS.md', 'docs/agent-workflow.md', 'docs/skills.md', 'scripts/archive-skills.mjs']) files[path] = readFileSync(safe(root, path));
  if (existsSync(join(root, 'docs/scheduled-sync.md'))) files['docs/scheduled-sync.md'] = readFileSync(safe(root, 'docs/scheduled-sync.md'));
  const entries = Object.keys(files).sort().map(path => ({path, sha256: hash(files[path]), bytes: files[path].length}));
  const revision = hash(JSON.stringify(entries));
  const directory = join(root, 'public/skill-archive');
  mkdirSync(directory, {recursive: true});
  const archive = join(directory, `project-skills-${revision.slice(0, 16)}.zip`);
  let createdAt = new Date().toISOString();
  if (existsSync(archive)) {
    const saved = unzipSync(readFileSync(archive));
    const manifest = JSON.parse(strFromU8(saved['manifest.json']));
    if (manifest.revision !== revision || JSON.stringify(manifest.files) !== JSON.stringify(entries)) throw new Error('Existing archive manifest mismatch');
    for (const entry of entries) if (!saved[entry.path] || hash(saved[entry.path]) !== entry.sha256) throw new Error(`Existing archive content mismatch: ${entry.path}`);
    createdAt = manifest.createdAt;
  } else {
    const manifest = {schemaVersion: 1, createdAt, revision, skillCount: skills.length, files: entries};
    writeFileSync(`${archive}.tmp`, zipSync({...files, 'manifest.json': strToU8(JSON.stringify(manifest, null, 2))}));
    renameSync(`${archive}.tmp`, archive);
  }
  const history = readdirSync(directory).filter(name => /^project-skills-.*\.zip$/.test(name)).map(name => {
    const bytes = readFileSync(safe(root, `public/skill-archive/${name}`));
    const manifest = JSON.parse(strFromU8(unzipSync(bytes)['manifest.json']));
    return {url: `/skill-archive/${name}`, createdAt: manifest.createdAt, revision: manifest.revision, skillCount: manifest.skillCount, bytes: bytes.length};
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const skill of skills) {
    const prefix = '.agents/skills/';
    const content = Object.fromEntries(skill.files.map(path => [path.slice(prefix.length), files[path]]));
    const digest = hash(JSON.stringify(skill.files.map(path => hash(files[path])))).slice(0,16);
    skill.downloadUrl = '/skill-archive/skill-' + skill.name + '-' + digest + '.zip';
    const output = join(root, 'public', skill.downloadUrl);
    if (!existsSync(output)) writeFileSync(output, zipSync(content));
    else {
      const restored = unzipSync(readFileSync(output));
      if (Object.keys(restored).length !== Object.keys(content).length || Object.entries(content).some(([path,bytes]) => !restored[path] || hash(restored[path]) !== hash(bytes))) throw new Error('Single skill archive content mismatch');
    }
  }
  mkdirSync(join(root, 'lib'), {recursive:true});
  // Screenshots for the MCP connection guides; the page only renders images that exist.
  const guides = join(root, 'public/mcp-guides');
  const shots = existsSync(guides) ? readdirSync(guides).filter(name => /\.(png|jpe?g|webp)$/i.test(name)).sort() : [];
  const shotsText = JSON.stringify(shots) + '\n';
  if (!existsSync(join(root, 'lib/mcp-guides.generated.json')) || readFileSync(join(root, 'lib/mcp-guides.generated.json'), 'utf8') !== shotsText) writeFileSync(join(root, 'lib/mcp-guides.generated.json'), shotsText);
  writeFileSync(join(root, 'lib/career-protocol.generated.json'), JSON.stringify({workflow: readFileSync(join(root,'docs/agent-workflow.md'),'utf8')},null,2)+'\n');
  const result = {schemaVersion: 1, generatedAt: createdAt, revision, archiveUrl: `/skill-archive/${archive.split('/').at(-1)}`, skills, history};
  const output = join(root, 'lib/skill-archive.generated.json');
  mkdirSync(dirname(output), {recursive: true});
  const text = JSON.stringify(result, null, 2) + '\n';
  if (!existsSync(output) || readFileSync(output, 'utf8') !== text) writeFileSync(output, text);
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = build(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  console.log(`Archived ${result.skills.length} project skill(s); ${result.history.length} snapshot(s).\n${result.archiveUrl}`);
}
