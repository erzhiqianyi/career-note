'use client';
import { Children, type ReactNode } from 'react';
import { useAppearance } from './appearance-provider';
import { alignReading, inlineReadings } from '@/lib/japanese-readings';

/**
 * Render readings saved inside generated Japanese text as {漢字|かんじ}.
 */
export function Ja({ text, mode = 'auto' }: { text: string | undefined | null; mode?: 'ja' | 'auto' }) {
  const { appearance } = useAppearance();
  void mode;
  if (!text) return null;
  return (
    <>
      {inlineReadings(text).map((s, i) =>
        s.reading && appearance.showJapaneseReadings ? (
          <span key={i} className="ja-word">
            {alignReading(s.text, s.reading).map((p, j) => (p.reading ? <ruby key={j}>{p.text}<rt>{p.reading}</rt></ruby> : p.text))}
          </span>
        ) : (
          s.text
        ),
      )}
    </>
  );
}

/** For react-markdown component overrides: annotate the plain-string children of a node. */
export function JaChildren({ children, mode }: { children?: ReactNode; mode?: 'ja' | 'auto' }) {
  return <>{Children.map(children, (child) => (typeof child === 'string' ? <Ja text={child} mode={mode} /> : child))}</>;
}
