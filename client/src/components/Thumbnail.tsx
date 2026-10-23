import React, { useEffect, useState } from 'react';
import { renderMermaidSvg } from '../mermaidRenderer';

interface ThumbnailProps {
  code: string;
}

export const Thumbnail: React.FC<ThumbnailProps> = ({ code }) => {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    renderMermaidSvg(code, 'default').then((res) => {
      if (cancelled) return;
      if ('svg' in res) {
        setSvg(res.svg);
        setFailed(false);
      } else {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (failed) {
    return <div className="thumbnail-fallback">Syntax error in diagram</div>;
  }

  if (!svg) {
    return <div className="thumbnail-fallback">Rendering preview…</div>;
  }

  return (
    <div
      className="thumbnail-svg-container"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};
