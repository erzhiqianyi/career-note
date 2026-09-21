'use client';
import { Award, Ban, Eye, FileSearch, FileText, MessageSquare, Send, XCircle } from 'lucide-react';
import { useLocale } from '@/components/locale-provider';

/** One icon + colour per application status, so lists can show the stage without spelling it out. */
const MARKS: Record<string, { Icon: typeof Eye; tone: string }> = {
  关注中: { Icon: Eye, tone: 'gray' },
  准备投递: { Icon: FileText, tone: 'slate' },
  已投递: { Icon: Send, tone: 'blue' },
  书类选考: { Icon: FileSearch, tone: 'indigo' },
  面试中: { Icon: MessageSquare, tone: 'strong' },
  内定: { Icon: Award, tone: 'green' },
  未通过: { Icon: XCircle, tone: 'red' },
  已撤回: { Icon: Ban, tone: 'muted' },
};

export default function StatusMark({ status, size = 15, label = false }: { status: string; size?: number; label?: boolean }) {
  const { t } = useLocale();
  const mark = MARKS[status] || MARKS['关注中'];
  const text = t(status);
  return (
    <span className={'status-mark tone-' + mark.tone} title={label ? undefined : text}>
      <mark.Icon size={size} aria-hidden="true" />
      {label ? <span>{text}</span> : <span className="sr-only">{text}</span>}
    </span>
  );
}
