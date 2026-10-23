import mermaid from 'mermaid';

export type MermaidTheme = 'default' | 'dark' | 'forest' | 'neutral';

let renderCounter = 0;
let renderQueue: Promise<unknown> = Promise.resolve();

export function renderMermaidSvg(
  code: string,
  theme: MermaidTheme = 'default'
): Promise<{ svg: string } | { error: string }> {
  const next = renderQueue.then(async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      return { error: 'Diagram code is empty' };
    }

    const id = `mermaid-svg-${++renderCounter}-${Date.now()}`;
    try {
      mermaid.initialize({
        startOnLoad: false,
        theme,
        securityLevel: 'strict',
        suppressErrorRendering: true,
      });

      const { svg } = await mermaid.render(id, trimmed);
      cleanupStrayElement(id);
      return { svg };
    } catch (err: unknown) {
      cleanupStrayElement(id);
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Syntax error in Mermaid diagram';
      return { error: message };
    }
  });

  renderQueue = next.catch(() => {});
  return next;
}

function cleanupStrayElement(id: string): void {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(id);
  if (el && el.parentElement === document.body) {
    el.remove();
  }
  const wrapper = document.getElementById(`d${id}`);
  if (wrapper) {
    wrapper.remove();
  }
}
