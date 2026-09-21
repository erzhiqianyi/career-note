'use client';

import { useEffect, useRef, useState } from 'react';

/** Generated, escaped HTML only. Scripts remain disabled inside the preview. */
export function ResumePreview({ html, title }: { html: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(650);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    let observer: ResizeObserver | undefined;
    const measure = () => {
      observer?.disconnect();
      const main = element.contentDocument?.querySelector('main');
      if (!main) return;
      const resize = () => {
        const style = element.contentWindow!.getComputedStyle(main);
        setHeight(Math.ceil(main.getBoundingClientRect().height +
          parseFloat(style.marginTop || '0') + parseFloat(style.marginBottom || '0')) + 2);
      };
      observer = new ResizeObserver(resize);
      observer.observe(main);
      resize();
    };
    element.addEventListener('load', measure);
    measure();
    return () => { element.removeEventListener('load', measure); observer?.disconnect(); };
  }, [html]);

  return <iframe ref={frame} title={title} sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    srcDoc={html} className="resume-public-preview" style={{ height }} />;
}
