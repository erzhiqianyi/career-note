import type { ReactNode } from 'react';
export function RecordList({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="record-list" role="list" aria-label={label}>
      {children}
    </div>
  );
}
export function RecordRow({
  title,
  meta,
  description,
  actions,
  badge,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="record-row" role="listitem">
      <div className="record-main">
        <div className="record-title">
          {title}
          {badge}
        </div>
        {meta && <div className="record-meta">{meta}</div>}
        {description && <p className="record-description">{description}</p>}
        {children}
      </div>
      {actions && <div className="record-actions">{actions}</div>}
    </div>
  );
}
