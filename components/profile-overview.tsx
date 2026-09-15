import { useLocale } from '@/components/locale-provider';
import type { Profile } from '@/lib/career';
function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n\s*\n/)
        .filter(Boolean)
        .map((paragraph, i) => (
          <p className="prewrap profile-text" key={i}>
            {paragraph}
          </p>
        ))}
    </>
  );
}
export default function ProfileOverview({ profile }: { profile: Profile }) {
  const { t: tr } = useLocale();
  const summaryParts = profile.summary.split(/(?<=。)/);
  const lead = summaryParts.slice(0, 2).join('');
  const remaining = summaryParts.slice(2).join('');
  return (
    <div className="profile-columns">
      <div className="profile-column">
        <section className="panel profile-summary">
          <h2>{tr('职业摘要')}</h2>
          <p className="profile-text">{lead || tr('尚未补充')}</p>
          {remaining && (
            <details>
              <summary>{tr('展开完整摘要')}</summary>
              <Paragraphs text={remaining} />
            </details>
          )}
        </section>
        <section className="panel">
          <h2>{tr('工作经历与证据')}</h2>
          <div className="experience-list">
            {profile.experience ? (
              profile.experience.split(/\n\s*\n/).map((block, i) => {
                const [heading, ...body] = block.split('\n');
                return (
                  <article key={i}>
                    <h3>{heading}</h3>
                    <p className="prewrap">{body.join('\n')}</p>
                  </article>
                );
              })
            ) : (
              <p>{tr('尚未补充')}</p>
            )}
          </div>
        </section>
      </div>
      <div className="profile-column">
        <section className="panel">
          <h2>{tr('目标岗位')}</h2>
          <ul className="profile-role-list">
            {(profile.targetRoles || tr('尚未补充'))
              .split(/[；\n]/)
              .filter(Boolean)
              .map((role, i) => (
                <li key={i}>{role}</li>
              ))}
          </ul>
        </section>
        <section className="panel">
          <h2>{tr('技能与项目能力')}</h2>
          <div className="skill-groups">
            {(profile.skills || tr('尚未补充'))
              .split('\n')
              .filter(Boolean)
              .map((line, i) => {
                if (!line.includes(' / '))
                  return (
                    <p className="skill-note" key={i}>
                      {line}
                    </p>
                  );
                const colon = line.indexOf('：');
                const label = colon >= 0 ? line.slice(0, colon) : '';
                const content = colon >= 0 ? line.slice(colon + 1) : line;
                return (
                  <div key={i}>
                    {label && <h3>{label}</h3>}
                    <ul className="skill-tags">
                      {content.split(/\s+\/\s+/).map((tag, n) => (
                        <li key={n}>{tag}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
          </div>
        </section>
        <section className="panel">
          <h2>{tr('日语与沟通能力')}</h2>
          <Paragraphs text={profile.japanese || tr('尚未补充')} />
        </section>
        <section className="panel">
          <h2>{tr('求职条件')}</h2>
          <Paragraphs text={profile.conditions || tr('尚未补充')} />
        </section>
      </div>
    </div>
  );
}
