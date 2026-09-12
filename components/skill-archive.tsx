'use client';
import { useState } from 'react';
import { Archive, Copy, Download, FileText } from 'lucide-react';
import archive from '@/lib/skill-archive.generated.json';

function date(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Tokyo',
  }).format(new Date(value));
}
function SkillText({ text }: { text: string }) {
  return (
    <div className="skill-source">
      {text.split(/\n\s*\n/).map((block, i) => {
        const heading = block.match(/^#{1,4} (.+)$/);
        return heading ? <h4 key={i}>{heading[1]}</h4> : <p key={i}>{block}</p>;
      })}
    </div>
  );
}
export default function SkillArchive() {
  const [message, setMessage] = useState('');
  async function copy(prompt: string) {
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage('已复制，粘贴到 Codex 即可调用。');
    } catch {
      setMessage('未能复制，请展开技能后手动复制调用指令。');
    }
  }
  return (
    <section className="panel skill-archive">
      <div className="section-head">
        <h2>
          <Archive size={20} />
          技能档案
        </h2>
        <span className="tag">{archive.skills.length} 个项目技能</span>
      </div>
      <p>项目技能的统一目录，保留说明、参考文档和历史备份。</p>
      <div className="skill-archive-actions">
        <a className="secondary" href={archive.archiveUrl} download>
          <Download size={16} />
          下载全部技能备份
        </a>
        <span>归档于 {date(archive.generatedAt)}</span>
      </div>
      <details className="skill-catalog">
        <summary>查看技能目录与说明</summary>
        {archive.skills.length ? (
          archive.skills.map((skill) => (
            <article className="archived-skill" key={skill.name}>
              <div className="section-head">
                <h3>
                  <FileText size={18} />
                  {skill.title}
                </h3>
                <button
                  className="text-button"
                  onClick={() => void copy(skill.prompt)}
                >
                  <Copy size={15} />
                  复制调用指令
                </button>
              </div>
              <code className="skill-invocation">${skill.name}</code>
              <p>{skill.description}</p>
              <details>
                <summary>查看「{skill.title}」完整说明</summary>
                <p className="skill-prompt">{skill.prompt}</p>
                <SkillText text={skill.content} />
              </details>
              {skill.references.map((reference) => (
                <details key={reference.path}>
                  <summary>
                    {reference.content.split('\n')[0].replace(/^#+\s*/, '')}
                  </summary>
                  <SkillText text={reference.content} />
                </details>
              ))}
              <details>
                <summary>查看源文件位置（{skill.files.length} 个文件）</summary>
                <ul className="skill-file-list">
                  {skill.files.map((path) => (
                    <li key={path}>{path}</li>
                  ))}
                </ul>
              </details>
            </article>
          ))
        ) : (
          <p>暂无项目技能。添加到 .agents/skills 后重新归档。</p>
        )}
      </details>
      <output className="skill-copy-status" aria-live="polite">
        {message}
      </output>
      <details className="skill-history">
        <summary>历史备份（{archive.history.length} 份）</summary>
        <ul>
          {archive.history.map((item) => (
            <li key={item.revision}>
              <span>
                {date(item.createdAt)}
                <small>
                  {item.skillCount} 个技能 · {Math.ceil(item.bytes / 1024)} KB ·
                  版本 {item.revision.slice(0, 8)}
                </small>
              </span>
              <a
                className="text-button"
                href={item.url}
                download
                aria-label={`下载 ${date(item.createdAt)} 版本 ${item.revision.slice(0, 8)} 的技能备份`}
              >
                <Download size={16} />
                下载
              </a>
            </li>
          ))}
        </ul>
      </details>
      <details className="skill-maintenance">
        <summary>如何新增技能或恢复备份</summary>
        <p>
          技能放在项目的 <code>.agents/skills/</code> 中，新增或修改后执行{' '}
          <code>npm run skills:archive</code>{' '}
          更新目录与备份。启动和构建项目时也会更新。
        </p>
        <p>
          恢复前先解压到临时目录，核对
          manifest.json，再与当前项目逐项比较。备份包含项目技能及工作流说明；完整求职资料请使用下方的资料备份入口。
        </p>
      </details>
    </section>
  );
}
