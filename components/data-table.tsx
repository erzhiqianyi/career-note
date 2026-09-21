'use client';
import { ArrowDown, ArrowUp, MoreHorizontal } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

/**
 * One table layout for every collection on the site: a header row, one line per
 * record with a summary only, and icon actions at the end. Detail lives behind a click.
 */
export type Column<K extends string = string> = {
  key: K;
  label: ReactNode;
  /** CSS grid track, e.g. "96px" or "minmax(160px, 1fr)". */
  width: string;
  /** Sortable columns render a button in the header. */
  sortable?: boolean;
  /** Hidden below 1000px / 700px to keep narrow screens readable. */
  hide?: 'tablet' | 'phone';
  align?: 'end';
};

export function DataTable<K extends string>({
  columns,
  label,
  sort,
  desc,
  onSort,
  children,
  className = '',
}: {
  columns: Column<K>[];
  label: string;
  sort?: K;
  desc?: boolean;
  onSort?: (key: K) => void;
  children: ReactNode;
  className?: string;
}) {
  const style = {
    '--dt-cols': columns.map((c) => c.width).join(' '),
    '--dt-cols-tablet': columns
      .filter((c) => c.hide !== 'tablet')
      .map((c) => c.width)
      .join(' '),
  } as CSSProperties;
  return (
    <div className={'dt ' + className} aria-label={label} style={style}>
      <div className="dt-row dt-head">
        {columns.map((c) => {
          const cls =
            'dt-th' +
            (c.hide ? ' dt-hide-' + c.hide : '') +
            (c.align === 'end' ? ' dt-end' : '') +
            (sort === c.key ? ' active' : '');
          return c.sortable && onSort ? (
            <button type="button" key={c.key} className={cls} onClick={() => onSort(c.key)}>
              {c.label}
              {sort === c.key && (desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
            </button>
          ) : (
            <span key={c.key} className={cls}>
              {c.label}
            </span>
          );
        })}
      </div>
      {children}
    </div>
  );
}

/**
 * A row. With `onOpen`, the whole row opens the record (buttons and links inside keep their own
 * behaviour); the title button stays the keyboard-accessible entry, so the row itself is not focusable.
 */
export function DataRow({ children, className = '', onOpen }: { children: ReactNode; className?: string; onOpen?: () => void }) {
  return (
    <div
      className={'dt-row ' + className + (onOpen ? ' dt-clickable' : '')}
      onClick={onOpen ? (event) => { if (!(event.target as HTMLElement).closest('button, a, select, input, textarea, details')) onOpen(); } : undefined}
    >
      {children}
    </div>
  );
}

/** A cell; `label` is shown on phones where the header row is hidden. */
export function DataCell({
  children,
  label,
  hide,
  align,
  className = '',
  title,
}: {
  children?: ReactNode;
  label?: string;
  hide?: 'tablet' | 'phone';
  align?: 'end';
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={
        'dt-cell' +
        (hide ? ' dt-hide-' + hide : '') +
        (align === 'end' ? ' dt-end' : '') +
        ' ' +
        className
      }
      data-label={label}
      title={title}
    >
      {children}
    </span>
  );
}

/** First column: a clickable title with one line of secondary text. */
export function DataTitle({
  title,
  meta,
  onClick,
}: {
  title: ReactNode;
  meta?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <span className="dt-cell dt-main">
      {onClick ? (
        <button className="record-title-button" onClick={onClick}>
          {title}
        </button>
      ) : (
        <b className="dt-title">{title}</b>
      )}
      {meta && <span className="record-meta">{meta}</span>}
    </span>
  );
}

/** Trailing icon actions. Give each button a `title` so the icon is explained on hover. */
export function DataActions({ children }: { children: ReactNode }) {
  return (
    <div className="dt-cell dt-actions">
      {children}
    </div>
  );
}

/** Small count bubble on an icon action, e.g. number of materials. */
export function Count({ n }: { n: number }) {
  return n > 0 ? <i className="dt-count">{n}</i> : null;
}

/** Secondary actions stay available without crowding every record. */
export function DataMoreActions({ label, children }: { label: string; children: ReactNode }) {
  return <details className="dt-more" onKeyDown={(event) => {
    if (event.key === 'Escape') {
      event.currentTarget.open = false;
      event.currentTarget.querySelector('summary')?.focus();
    }
  }}>
    <summary className="icon-button" aria-label={label} title={label}><MoreHorizontal size={16} /></summary>
    <div className="dt-more-menu" onClick={(event) => {
      if ((event.target as HTMLElement).closest('button, a')) event.currentTarget.closest('details')?.removeAttribute('open');
    }}>{children}</div>
  </details>;
}
