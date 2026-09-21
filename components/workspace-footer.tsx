'use client';

import { useLocale } from '@/components/locale-provider';

/** Shared desktop footer for every workspace page, including record editors. */
export default function WorkspaceFooter() {
  const { t } = useLocale();
  return (
    <footer className="workspace-footer" role="contentinfo">
      <span className="workspace-footer-brand">© {new Date().getFullYear()} Career Note</span>
      <span className="workspace-footer-motto">{t('一歩ずつ、前へ。')}</span>
      <a href="https://github.com/erzhiqianyi/career-note" target="_blank" rel="noopener noreferrer">GitHub</a>
    </footer>
  );
}
