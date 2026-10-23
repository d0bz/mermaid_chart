export type NodeShape =
  | 'rect'
  | 'round'
  | 'stadium'
  | 'diamond'
  | 'hexagon'
  | 'cylinder'
  | 'circle';

export type EdgeArrowType = '-->' | '-.->' | '==>';

export interface SelectedDiagramElement {
  kind: 'node' | 'edge' | 'edgeLabel' | 'cluster';
  nodeId: string;
  label: string;
  shape: NodeShape;
  fromId?: string;
  toId?: string;
  edgeType?: EdgeArrowType;
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

const SHAPE_PATTERN = `(?:\\(\\[[\\s\\S]*?\\]\\)|\\[\\([\\s\\S]*?\\)\\]|\\(\\([\\s\\S]*?\\)\\)|\\{\\{[\\s\\S]*?\\}\\}|\\[[\\s\\S]*?\\]|\\([\\s\\S]*?\\)|\\{[\\s\\S]*?\\})`;

export function detectNodeShapeInCode(code: string, nodeId: string): NodeShape {
  const esc = escapeRegExp(nodeId);
  const re = new RegExp(`(?:^|[^A-Za-z0-9_])(${esc})\\s*(${SHAPE_PATTERN})`, 'm');
  const match = code.match(re);
  if (match && match[2]) {
    return parseShapeFromDelimited(match[2]).shape;
  }
  return 'rect';
}

export function extractNodeIdFromGroup(nodeGroup: Element): string {
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
  return nodeId;
}

export function parseEdgeDataId(
  edgeDataId: string,
  knownNodeIds: string[]
): { fromId: string; toId: string; index: number } | null {
  const cleaned = edgeDataId.replace(/^mermaid-svg-\d+-\d+-/, '');
  const m = cleaned.match(/^L_(.+)_(\d+)$/);
  if (!m) return null;
  const body = m[1];
  const index = Number(m[2]);

  // Match against known node IDs first (handles node IDs containing underscores)
  for (const candFrom of knownNodeIds) {
    if (body.startsWith(`${candFrom}_`)) {
      const rest = body.slice(candFrom.length + 1);
      if (knownNodeIds.includes(rest)) {
        return { fromId: candFrom, toId: rest, index };
      }
    }
  }

  const parts = body.split('_');
  if (parts.length >= 2) {
    return {
      fromId: parts[0],
      toId: parts.slice(1).join('_'),
      index,
    };
  }
  return null;
}

interface ParsedEdgeLine {
  lineIndex: number;
  indent: string;
  fromId: string;
  fromShape: string;
  arrowType: EdgeArrowType;
  label: string;
  toId: string;
  toShape: string;
}

export function parseEdgeLine(line: string, lineIndex: number): ParsedEdgeLine | null {
  // Match: indent + fromId + optional shape + arrow(with optional label) + toId + optional shape
  const re = new RegExp(
    `^(\\s*)([A-Za-z0-9_]+)\\s*(${SHAPE_PATTERN})?\\s*` +
      `(?:` +
      `(--\\s+([^\\n]+?)\\s+-->)|` +
      `(-\\.\\s+([^\\n]+?)\\s+\\.->)|` +
      `(==\\s+([^\\n]+?)\\s+==>)|` +
      `(-->|-\\.->|==>|---)(?:\\s*\\|([^|]*)\\|)?` +
      `)\\s*` +
      `([A-Za-z0-9_]+)\\s*(${SHAPE_PATTERN})?\\s*;?\\s*$`
  );
  const m = line.match(re);
  if (!m) return null;

  const indent = m[1] || '    ';
  const fromId = m[2];
  const fromShape = m[3] || '';

  let arrowType: EdgeArrowType = '-->';
  let label = '';

  if (m[4]) {
    arrowType = '-->';
    label = m[5].trim();
  } else if (m[6]) {
    arrowType = '-.->';
    label = m[7].trim();
  } else if (m[8]) {
    arrowType = '==>';
    label = m[9].trim();
  } else if (m[10]) {
    const rawArrow = m[10];
    arrowType = rawArrow === '-.->' ? '-.->' : rawArrow === '==>' ? '==>' : '-->';
    label = (m[11] || '').trim();
  }

  const toId = m[12];
  const toShape = m[13] || '';

  return {
    lineIndex,
    indent,
    fromId,
    fromShape,
    arrowType,
    label,
    toId,
    toShape,
  };
}

function formatEdgeArrow(arrowType: EdgeArrowType, label?: string): string {
  const clean = label?.trim() || '';
  if (!clean) return arrowType;
  return `${arrowType}|${clean}|`;
}

export function findEdgeInCode(
  code: string,
  fromId: string,
  toId: string
): ParsedEdgeLine | null {
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseEdgeLine(lines[i], i);
    if (parsed && parsed.fromId === fromId && parsed.toId === toId) {
      return parsed;
    }
  }
  return null;
}

export function extractSvgElementInfo(
  target: Element,
  code: string,
  knownNodeIds: string[] = []
): SelectedDiagramElement | null {
  // Check if user clicked an edge path or custom edge handle
  const edgePath = target.closest('path[data-edge="true"], .mc-edge-hit, .mc-edge-endpoint');
  if (edgePath) {
    const dataId =
      edgePath.getAttribute('data-edge-id') || edgePath.getAttribute('data-id') || '';
    const parsedIds = parseEdgeDataId(dataId, knownNodeIds);
    if (parsedIds) {
      const edgeLine = findEdgeInCode(code, parsedIds.fromId, parsedIds.toId);
      return {
        kind: 'edge',
        nodeId: dataId,
        fromId: parsedIds.fromId,
        toId: parsedIds.toId,
        label: edgeLine?.label || '',
        edgeType: edgeLine?.arrowType || '-->',
        shape: 'rect',
      };
    }
  }

  const nodeGroup = target.closest('g.node, g.actor, g.edgeLabel, g.cluster');
  if (!nodeGroup) return null;

  if (nodeGroup.classList.contains('edgeLabel')) {
    const labelGroup = nodeGroup.querySelector('g.label[data-id]');
    const dataId = labelGroup?.getAttribute('data-id') || '';
    const parsedIds = dataId ? parseEdgeDataId(dataId, knownNodeIds) : null;
    const text =
      nodeGroup.querySelector('.edgeLabel, span, text')?.textContent?.trim() || '';

    if (parsedIds) {
      const edgeLine = findEdgeInCode(code, parsedIds.fromId, parsedIds.toId);
      return {
        kind: 'edge',
        nodeId: dataId,
        fromId: parsedIds.fromId,
        toId: parsedIds.toId,
        label: edgeLine?.label ?? text,
        edgeType: edgeLine?.arrowType || '-->',
        shape: 'rect',
      };
    }

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

  const nodeId = extractNodeIdFromGroup(nodeGroup);
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

function hasOtherShapeDefinition(
  lines: string[],
  ignoreLineIdx: number,
  nodeId: string
): boolean {
  const esc = escapeRegExp(nodeId);
  const re = new RegExp(`(?:^|[^A-Za-z0-9_])(${esc})\\s*(${SHAPE_PATTERN})`);
  for (let i = 0; i < lines.length; i++) {
    if (i === ignoreLineIdx) continue;
    if (re.test(lines[i])) return true;
  }
  return false;
}

export function reconnectEdgeInCode(
  code: string,
  oldFromId: string,
  oldToId: string,
  newFromId: string,
  newToId: string
): string {
  if (oldFromId === newFromId && oldToId === newToId) return code;

  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseEdgeLine(lines[i], i);
    if (parsed && parsed.fromId === oldFromId && parsed.toId === oldToId) {
      const replacementLines: string[] = [];

      // If oldFromId is changing and had an inline shape definition not defined elsewhere, preserve it
      let keptFromShape = parsed.fromShape;
      if (oldFromId !== newFromId) {
        keptFromShape = '';
        if (parsed.fromShape && !hasOtherShapeDefinition(lines, i, oldFromId)) {
          replacementLines.push(`${parsed.indent}${oldFromId}${parsed.fromShape}`);
        }
      }

      // If oldToId is changing and had an inline shape definition not defined elsewhere, preserve it
      let keptToShape = parsed.toShape;
      if (oldToId !== newToId) {
        keptToShape = '';
        if (parsed.toShape && !hasOtherShapeDefinition(lines, i, oldToId)) {
          replacementLines.push(`${parsed.indent}${oldToId}${parsed.toShape}`);
        }
      }

      const arrowStr = formatEdgeArrow(parsed.arrowType, parsed.label);
      replacementLines.push(
        `${parsed.indent}${newFromId}${keptFromShape} ${arrowStr} ${newToId}${keptToShape}`
      );

      lines.splice(i, 1, ...replacementLines);
      return lines.join('\n');
    }
  }

  return code;
}

export function connectNodesInCode(
  code: string,
  fromNodeId: string,
  toNodeId: string,
  edgeType: EdgeArrowType = '-->',
  edgeLabel?: string
): string {
  const arrow = formatEdgeArrow(edgeType, edgeLabel);
  const trimmed = code.replace(/\s+$/, '');
  return `${trimmed}\n    ${fromNodeId} ${arrow} ${toNodeId}\n`;
}

export function updateEdgeInCode(
  code: string,
  fromId: string,
  toId: string,
  opts: { label?: string; edgeType?: EdgeArrowType }
): string {
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseEdgeLine(lines[i], i);
    if (parsed && parsed.fromId === fromId && parsed.toId === toId) {
      const nextArrow = opts.edgeType ?? parsed.arrowType;
      const nextLabel = opts.label !== undefined ? opts.label : parsed.label;
      const arrowStr = formatEdgeArrow(nextArrow, nextLabel);
      lines[i] =
        `${parsed.indent}${parsed.fromId}${parsed.fromShape} ${arrowStr} ${parsed.toId}${parsed.toShape}`;
      return lines.join('\n');
    }
  }
  return code;
}

export function deleteEdgeInCode(code: string, fromId: string, toId: string): string {
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseEdgeLine(lines[i], i);
    if (parsed && parsed.fromId === fromId && parsed.toId === toId) {
      const preserved: string[] = [];
      if (parsed.fromShape && !hasOtherShapeDefinition(lines, i, fromId)) {
        preserved.push(`${parsed.indent}${fromId}${parsed.fromShape}`);
      }
      if (parsed.toShape && !hasOtherShapeDefinition(lines, i, toId)) {
        preserved.push(`${parsed.indent}${toId}${parsed.toShape}`);
      }
      lines.splice(i, 1, ...preserved);
      return lines.join('\n');
    }
  }
  return code;
}

export function updateNodeInCode(
  code: string,
  element: SelectedDiagramElement,
  newLabel: string,
  newShape?: NodeShape
): string {
  const trimmedLabel = newLabel.trim();

  if (element.kind === 'edge' && element.fromId && element.toId) {
    return updateEdgeInCode(code, element.fromId, element.toId, {
      label: trimmedLabel,
      edgeType: element.edgeType,
    });
  }

  if (element.kind === 'edgeLabel' || element.kind === 'cluster') {
    if (!element.label || element.label === trimmedLabel) return code;
    return code.replace(element.label, trimmedLabel || element.label);
  }

  const finalLabel = trimmedLabel || element.label;
  const escId = escapeRegExp(element.nodeId);
  const shapeToUse = newShape ?? element.shape;
  const wrapped = wrapNodeShape(finalLabel, shapeToUse);

  const shapedRegex = new RegExp(
    `(^|[^A-Za-z0-9_])(${escId})\\s*(${SHAPE_PATTERN})`,
    'm'
  );

  if (shapedRegex.test(code)) {
    return code.replace(shapedRegex, `$1$2${wrapped}`);
  }

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

  if (element.label && code.includes(element.label)) {
    return code.replace(element.label, finalLabel);
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
    edgeType: EdgeArrowType;
    edgeLabel?: string;
    targetLabel: string;
    targetShape: NodeShape;
  }
): { code: string; newNodeId: string } {
  const newNodeId = generateNextNodeId(code, 'N');
  const wrappedTarget = wrapNodeShape(opts.targetLabel.trim() || 'New Step', opts.targetShape);
  const arrow = formatEdgeArrow(opts.edgeType, opts.edgeLabel);

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

  // 1. Collect inline shape definitions for all nodes across the diagram
  const shapeMap = new Map<string, string>();
  const globalShapeRe = new RegExp(`(?:^|[^A-Za-z0-9_])([A-Za-z0-9_]+)\\s*(${SHAPE_PATTERN})`, 'g');
  for (const line of lines) {
    if (/^\s*(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|style)\b/.test(line)) {
      continue;
    }
    let m: RegExpExecArray | null;
    globalShapeRe.lastIndex = 0;
    while ((m = globalShapeRe.exec(line)) !== null) {
      const id = m[1];
      const shapeStr = m[2];
      if (id && shapeStr && !shapeMap.has(id)) {
        shapeMap.set(id, shapeStr);
      }
    }
  }

  // 2. Determine which lines are kept vs removed, and track surviving neighbors from removed edges
  interface RemovedNeighborRef {
    neighborId: string;
    indent: string;
    outputIndex: number;
  }

  const keptLines: string[] = [];
  const removedNeighborRefs: RemovedNeighborRef[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Always keep diagram header line
    if (
      i === 0 &&
      /^\s*(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram)\b/.test(line)
    ) {
      keptLines.push(line);
      continue;
    }

    // Remove style lines for the deleted node
    if (new RegExp(`^\\s*style\\s+${escId}\\b`).test(line)) {
      continue;
    }

    const parsedEdge = parseEdgeLine(line, i);
    if (parsedEdge) {
      if (parsedEdge.fromId === nodeId && parsedEdge.toId === nodeId) {
        continue;
      }
      if (parsedEdge.fromId === nodeId) {
        removedNeighborRefs.push({
          neighborId: parsedEdge.toId,
          indent: parsedEdge.indent,
          outputIndex: keptLines.length,
        });
        continue;
      }
      if (parsedEdge.toId === nodeId) {
        removedNeighborRefs.push({
          neighborId: parsedEdge.fromId,
          indent: parsedEdge.indent,
          outputIndex: keptLines.length,
        });
        continue;
      }
      keptLines.push(line);
      continue;
    }

    if (nodeTokenRegex.test(line)) {
      continue;
    }

    keptLines.push(line);
  }

  // 3. Check if surviving neighbors still exist (and still have their shape) in keptLines
  const handledNeighbors = new Set<string>();
  const insertions = new Map<number, string[]>();

  for (const ref of removedNeighborRefs) {
    const { neighborId, indent, outputIndex } = ref;
    if (handledNeighbors.has(neighborId)) continue;

    const escNeighbor = escapeRegExp(neighborId);
    const neighborPresentRe = new RegExp(`(^|[^A-Za-z0-9_])(${escNeighbor})(?![A-Za-z0-9_])`);
    const neighborShapedRe = new RegExp(
      `(^|[^A-Za-z0-9_])(${escNeighbor})\\s*(${SHAPE_PATTERN})`
    );

    let isPresent = false;
    let hasShape = false;

    for (const kLine of keptLines) {
      if (/^\s*(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|style)\b/.test(kLine)) {
        continue;
      }
      if (neighborPresentRe.test(kLine)) {
        isPresent = true;
      }
      if (neighborShapedRe.test(kLine)) {
        hasShape = true;
      }
    }

    const knownShape = shapeMap.get(neighborId) || '';
    if (!isPresent || (knownShape && !hasShape)) {
      handledNeighbors.add(neighborId);
      const list = insertions.get(outputIndex) || [];
      list.push(`${indent}${neighborId}${knownShape}`);
      insertions.set(outputIndex, list);
    }
  }

  if (insertions.size === 0) {
    return keptLines.join('\n');
  }

  const finalLines: string[] = [];
  for (let idx = 0; idx <= keptLines.length; idx++) {
    const toInsert = insertions.get(idx);
    if (toInsert) {
      finalLines.push(...toInsert);
    }
    if (idx < keptLines.length) {
      finalLines.push(keptLines[idx]);
    }
  }

  return finalLines.join('\n');
}
