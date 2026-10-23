export type NodeShape =
  | 'rect'
  | 'round'
  | 'stadium'
  | 'diamond'
  | 'hexagon'
  | 'cylinder'
  | 'circle';

export interface SelectedDiagramElement {
  kind: 'node' | 'edgeLabel' | 'cluster';
  nodeId: string;
  label: string;
  shape: NodeShape;
}

export interface NodeColorPreset {
  id: string;
  name: string;
  fill: string;
  stroke: string;
  color: string;
}

export const NODE_COLOR_PRESETS: NodeColorPreset[] = [
  { id: 'default', name: 'Default', fill: '', stroke: '', color: '' },
  { id: 'indigo', name: 'Indigo', fill: '#e0e7ff', stroke: '#4f46e5', color: '#1e1b4b' },
  { id: 'emerald', name: 'Emerald', fill: '#d1fae5', stroke: '#059669', color: '#064e3b' },
  { id: 'amber', name: 'Amber', fill: '#fef3c7', stroke: '#d97706', color: '#451a03' },
  { id: 'rose', name: 'Rose', fill: '#ffe4e6', stroke: '#e11d48', color: '#4c0519' },
  { id: 'sky', name: 'Sky', fill: '#e0f2fe', stroke: '#0284c7', color: '#082f49' },
  { id: 'purple', name: 'Purple', fill: '#f3e8ff', stroke: '#9333ea', color: '#3b0764' },
  { id: 'dark', name: 'Dark Slate', fill: '#1e293b', stroke: '#64748b', color: '#f8fafc' },
];

export const NODE_SHAPES: { id: NodeShape; label: string; preview: string }[] = [
  { id: 'rect', label: 'Rectangle', preview: '[Text]' },
  { id: 'round', label: 'Rounded', preview: '(Text)' },
  { id: 'stadium', label: 'Stadium', preview: '([Text])' },
  { id: 'diamond', label: 'Decision', preview: '{Text}' },
  { id: 'hexagon', label: 'Hexagon', preview: '{{Text}}' },
  { id: 'cylinder', label: 'Database', preview: '[(Text)]' },
  { id: 'circle', label: 'Circle', preview: '((Text))' },
];

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function wrapNodeShape(label: string, shape: NodeShape): string {
  const safeLabel = label || 'Node';
  switch (shape) {
    case 'rect':
      return `[${safeLabel}]`;
    case 'round':
      return `(${safeLabel})`;
    case 'stadium':
      return `([${safeLabel}])`;
    case 'diamond':
      return `{${safeLabel}}`;
    case 'hexagon':
      return `{{${safeLabel}}}`;
    case 'cylinder':
      return `[(${safeLabel})]`;
    case 'circle':
      return `((${safeLabel}))`;
  }
}

export function parseShapeFromDelimited(delimited: string): {
  shape: NodeShape;
  inner: string;
} {
  if (delimited.startsWith('([') && delimited.endsWith('])')) {
    return { shape: 'stadium', inner: delimited.slice(2, -2) };
  }
  if (delimited.startsWith('[(') && delimited.endsWith(')]')) {
    return { shape: 'cylinder', inner: delimited.slice(2, -2) };
  }
  if (delimited.startsWith('((') && delimited.endsWith('))')) {
    return { shape: 'circle', inner: delimited.slice(2, -2) };
  }
  if (delimited.startsWith('{{') && delimited.endsWith('}}')) {
    return { shape: 'hexagon', inner: delimited.slice(2, -2) };
  }
  if (delimited.startsWith('[') && delimited.endsWith(']')) {
    return { shape: 'rect', inner: delimited.slice(1, -1) };
  }
  if (delimited.startsWith('(') && delimited.endsWith(')')) {
    return { shape: 'round', inner: delimited.slice(1, -1) };
  }
  if (delimited.startsWith('{') && delimited.endsWith('}')) {
    return { shape: 'diamond', inner: delimited.slice(1, -1) };
  }
  return { shape: 'rect', inner: delimited };
}

export function detectNodeShapeInCode(code: string, nodeId: string): NodeShape {
  const esc = escapeRegExp(nodeId);
  const re = new RegExp(
    `(?:^|[^A-Za-z0-9_])(${esc})\\s*(\\(\\[[\\s\\S]*?\\]\\)|\\[\\([\\s\\S]*?\\)\\]|\\(\\([\\s\\S]*?\\)\\)|\\{\\{[\\s\\S]*?\\}\\}|\\[[\\s\\S]*?\\]|\\([\\s\\S]*?\\)|\\{[\\s\\S]*?\\})`,
    'm'
  );
  const match = code.match(re);
  if (match && match[2]) {
    return parseShapeFromDelimited(match[2]).shape;
  }
  return 'rect';
}

export function extractSvgElementInfo(
  target: Element,
  code: string
): SelectedDiagramElement | null {
  const nodeGroup = target.closest('g.node, g.actor, g.edgeLabel, g.cluster');
  if (!nodeGroup) return null;

  if (nodeGroup.classList.contains('edgeLabel')) {
    const text =
      nodeGroup.querySelector('.edgeLabel, span, text')?.textContent?.trim() || '';
    if (!text) return null;
    return {
      kind: 'edgeLabel',
      nodeId: text,
      label: text,
      shape: 'rect',
    };
  }

  if (nodeGroup.classList.contains('cluster')) {
    const text =
      nodeGroup.querySelector('.cluster-label, span, text')?.textContent?.trim() || '';
    if (!text) return null;
    return {
      kind: 'cluster',
      nodeId: text,
      label: text,
      shape: 'rect',
    };
  }

  let nodeId = nodeGroup.getAttribute('data-id') || '';
  if (!nodeId) {
    const rawId = (nodeGroup.getAttribute('id') || '').replace(
      /^mermaid-svg-\d+-\d+-/,
      ''
    );
    const m = rawId.match(/^(?:flowchart|state|classId|entity|node)-(.+?)-\d+$/);
    if (m) {
      nodeId = m[1];
    } else if (rawId) {
      nodeId = rawId;
    }
  }

  const labelEl = nodeGroup.querySelector('.nodeLabel, .label, text');
  const label = labelEl?.textContent?.trim() || nodeId;

  if (!nodeId && !label) return null;
  const resolvedId = nodeId || label;
  const shape = detectNodeShapeInCode(code, resolvedId);

  return {
    kind: 'node',
    nodeId: resolvedId,
    label: label || resolvedId,
    shape,
  };
}

export function updateNodeInCode(
  code: string,
  element: SelectedDiagramElement,
  newLabel: string,
  newShape?: NodeShape
): string {
  const trimmedLabel = newLabel.trim() || element.label;

  if (element.kind === 'edgeLabel' || element.kind === 'cluster') {
    if (!element.label || element.label === trimmedLabel) return code;
    return code.replace(element.label, trimmedLabel);
  }

  const escId = escapeRegExp(element.nodeId);
  const shapeToUse = newShape ?? element.shape;
  const wrapped = wrapNodeShape(trimmedLabel, shapeToUse);

  // 1. Check if nodeId has an explicit shape definition like A[Start] or B{Decision}
  const shapedRegex = new RegExp(
    `(^|[^A-Za-z0-9_])(${escId})\\s*(\\(\\[[\\s\\S]*?\\]\\)|\\[\\([\\s\\S]*?\\)\\]|\\(\\([\\s\\S]*?\\)\\)|\\{\\{[\\s\\S]*?\\}\\}|\\[[\\s\\S]*?\\]|\\([\\s\\S]*?\\)|\\{[\\s\\S]*?\\})`,
    'm'
  );

  if (shapedRegex.test(code)) {
    return code.replace(shapedRegex, `$1$2${wrapped}`);
  }

  // 2. If nodeId is used bare in a flowchart/graph line, attach the shape/label to its first occurrence
  const lines = code.split('\n');
  const bareRegex = new RegExp(`(^|[^A-Za-z0-9_])(${escId})(?![A-Za-z0-9_])`);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram)\b/.test(line)) {
      continue;
    }
    if (/^\s*style\s+/.test(line)) {
      continue;
    }
    if (bareRegex.test(line)) {
      lines[i] = line.replace(bareRegex, `$1$2${wrapped}`);
      return lines.join('\n');
    }
  }

  // 3. Fallback: replace old label text if present
  if (element.label && code.includes(element.label)) {
    return code.replace(element.label, trimmedLabel);
  }

  return code;
}

export function styleNodeInCode(
  code: string,
  nodeId: string,
  preset: NodeColorPreset
): string {
  const escId = escapeRegExp(nodeId);
  const styleLineRegex = new RegExp(`^\\s*style\\s+${escId}\\s+.*$\\n?`, 'gm');
  const withoutOldStyle = code.replace(styleLineRegex, '').replace(/\n+$/, '');

  if (preset.id === 'default' || !preset.fill) {
    return withoutOldStyle + '\n';
  }

  const styleLine = `    style ${nodeId} fill:${preset.fill},stroke:${preset.stroke},stroke-width:2px,color:${preset.color}`;
  return `${withoutOldStyle}\n${styleLine}\n`;
}

export function generateNextNodeId(code: string, prefix = 'N'): string {
  for (let i = 1; i < 500; i++) {
    const candidate = `${prefix}${i}`;
    const re = new RegExp(`\\b${escapeRegExp(candidate)}\\b`);
    if (!re.test(code)) {
      return candidate;
    }
  }
  return `${prefix}${Date.now().toString(36).slice(-4)}`;
}

export function addConnectedNodeInCode(
  code: string,
  fromNodeId: string,
  opts: {
    edgeType: '-->' | '-.->' | '==>';
    edgeLabel?: string;
    targetLabel: string;
    targetShape: NodeShape;
  }
): { code: string; newNodeId: string } {
  const newNodeId = generateNextNodeId(code, 'N');
  const wrappedTarget = wrapNodeShape(opts.targetLabel.trim() || 'New Step', opts.targetShape);
  const cleanEdgeLabel = opts.edgeLabel?.trim();
  const arrow = cleanEdgeLabel
    ? `${opts.edgeType}|${cleanEdgeLabel}|`
    : opts.edgeType;

  const newLine = `    ${fromNodeId} ${arrow} ${newNodeId}${wrappedTarget}`;
  const trimmed = code.replace(/\s+$/, '');
  return {
    code: `${trimmed}\n${newLine}\n`,
    newNodeId,
  };
}

export function addStandaloneNodeInCode(
  code: string,
  label: string,
  shape: NodeShape = 'rect'
): { code: string; newNodeId: string } {
  const newNodeId = generateNextNodeId(code, 'N');
  const wrapped = wrapNodeShape(label.trim() || 'New Node', shape);
  const trimmed = code.replace(/\s+$/, '');
  return {
    code: `${trimmed}\n    ${newNodeId}${wrapped}\n`,
    newNodeId,
  };
}

export function deleteNodeFromCode(code: string, nodeId: string): string {
  const escId = escapeRegExp(nodeId);
  const nodeTokenRegex = new RegExp(`(^|[^A-Za-z0-9_])(${escId})(?![A-Za-z0-9_])`);
  const lines = code.split('\n');
  const filtered = lines.filter((line, idx) => {
    if (
      idx === 0 &&
      /^\s*(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram)\b/.test(line)
    ) {
      return true;
    }
    return !nodeTokenRegex.test(line);
  });
  return filtered.join('\n');
}
