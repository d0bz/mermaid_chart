import React, { useEffect, useRef, useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  Image as ImageIcon,
  AlertTriangle,
  Palette,
  Plus,
  Trash2,
  X,
  Check,
  GitBranchPlus,
  MousePointerClick,
  Waypoints,
  ArrowLeftRight,
  Undo2,
  Redo2,
  Copy,
  ClipboardPaste,
  Pencil,
} from 'lucide-react';
import { renderMermaidSvg, type MermaidTheme } from '../mermaidRenderer';
import {
  extractSvgElementInfo,
  extractNodeIdFromGroup,
  parseEdgeDataId,
  updateNodeInCode,
  styleNodeInCode,
  addConnectedNodeInCode,
  addStandaloneNodeInCode,
  deleteNodeFromCode,
  connectNodesInCode,
  reconnectEdgeInCode,
  updateEdgeInCode,
  deleteEdgeInCode,
  insertNodeOnEdgeInCode,
  extractNodeStyleSpec,
  pasteNodeInCode,
  NODE_SHAPES,
  NODE_COLOR_PRESETS,
  type SelectedDiagramElement,
  type NodeShape,
  type EdgeArrowType,
  type CopiedNodeData,
} from '../diagramManipulator';

interface PreviewProps {
  code: string;
  chartName: string;
  theme: MermaidTheme;
  onThemeChange: (theme: MermaidTheme) => void;
  onChangeCode?: (nextCode: string) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

interface ConnectionDragState {
  mode: 'new-connection' | 'reconnect-target' | 'reconnect-source';
  fromNodeId: string;
  toNodeId?: string;
  anchorX: number;
  anchorY: number;
  currentX: number;
  currentY: number;
  startClientX: number;
  startClientY: number;
  hoveredNodeId: string | null;
  clickedMidpointNode?: boolean;
}

interface InlineBoxEditState {
  nodeId: string;
  value: string;
  initialLabel: string;
  shape: NodeShape;
  left: number;
  top: number;
  width: number;
  height: number;
}

function clientToSvgCoords(
  svgEl: SVGSVGElement,
  clientX: number,
  clientY: number
): { x: number; y: number } {
  const ctm = svgEl.getScreenCTM();
  if (ctm && typeof svgEl.createSVGPoint === 'function') {
    try {
      const pt = svgEl.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const transformed = pt.matrixTransform(ctm.inverse());
      return { x: transformed.x, y: transformed.y };
    } catch {
      // Fallback below
    }
  }
  const rect = svgEl.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

function findNodeIdAtPoint(
  svgEl: SVGSVGElement,
  eventTarget: EventTarget | null,
  clientX: number,
  clientY: number
): string | null {
  if (eventTarget instanceof Element) {
    const portNode = eventTarget.closest('[data-mc-port-node]')?.getAttribute('data-mc-port-node');
    if (portNode) return portNode;
    const directGroup = eventTarget.closest('g.node');
    if (directGroup) {
      const id =
        directGroup.getAttribute('data-mc-node-id') || extractNodeIdFromGroup(directGroup);
      if (id) return id;
    }
  }

  if (typeof document !== 'undefined' && typeof document.elementsFromPoint === 'function') {
    const els = document.elementsFromPoint(clientX, clientY);
    for (const el of els) {
      const portNode = el.closest('[data-mc-port-node]')?.getAttribute('data-mc-port-node');
      if (portNode) return portNode;
      const g = el.closest('g.node');
      if (g) {
        const id = g.getAttribute('data-mc-node-id') || extractNodeIdFromGroup(g);
        if (id) return id;
      }
    }
  }

  // Bounding rect fallback
  const nodeGroups = Array.from(svgEl.querySelectorAll('g.node'));
  for (const g of nodeGroups) {
    const rect = g.getBoundingClientRect();
    if (
      rect.width > 0 &&
      clientX >= rect.left - 6 &&
      clientX <= rect.right + 6 &&
      clientY >= rect.top - 6 &&
      clientY <= rect.bottom + 6
    ) {
      const id = g.getAttribute('data-mc-node-id') || extractNodeIdFromGroup(g);
      if (id) return id;
    }
  }

  return null;
}

export const Preview: React.FC<PreviewProps> = ({
  code,
  chartName,
  theme,
  onThemeChange,
  onChangeCode,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}) => {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [connectMode, setConnectMode] = useState<boolean>(false);
  const [knownNodes, setKnownNodes] = useState<string[]>([]);

  const [selectedEl, setSelectedEl] = useState<SelectedDiagramElement | null>(null);
  const [linkingFromNodeId, setLinkingFromNodeId] = useState<string | null>(null);
  const [connectTargetNodeId, setConnectTargetNodeId] = useState<string>('');
  const [editLabel, setEditLabel] = useState<string>('');
  const [editShape, setEditShape] = useState<NodeShape>('rect');
  const [connectLabel, setConnectLabel] = useState<string>('Next Step');
  const [connectEdgeLabel, setConnectEdgeLabel] = useState<string>('');
  const [connectEdgeType, setConnectEdgeType] = useState<EdgeArrowType>('-->');
  const [copiedNode, setCopiedNode] = useState<CopiedNodeData | null>(() => {
    try {
      const raw = sessionStorage.getItem('mc_copied_node');
      return raw ? (JSON.parse(raw) as CopiedNodeData) : null;
    } catch {
      return null;
    }
  });
  const [justCopied, setJustCopied] = useState<boolean>(false);
  const [inlineEdit, setInlineEdit] = useState<InlineBoxEditState | null>(null);

  const dragStartRef = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null>(null);
  const connDragRef = useRef<ConnectionDragState | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const labelInputRef = useRef<HTMLInputElement | null>(null);
  const inlineInputRef = useRef<HTMLInputElement | null>(null);

  // Debounced Mermaid render (~280 ms)
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await renderMermaidSvg(code, theme);
      if (cancelled) return;
      if ('svg' in result) {
        setSvg(result.svg);
        setError(null);
      } else {
        setError(result.error);
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, theme]);

  // Render SVG and inject interactive node connection ports & draggable edge endpoint handles
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !svg) return;
    stage.innerHTML = svg;
    if (!onChangeCode) return;

    const svgEl = stage.querySelector('svg');
    if (!svgEl) return;

    const svgNs = 'http://www.w3.org/2000/svg';

    const nodeGroups = Array.from(svgEl.querySelectorAll('g.node'));
    const nodeIds: string[] = [];
    const nodeCenters = new Map<string, { x: number; y: number }>();

    for (const g of nodeGroups) {
      const nodeId = extractNodeIdFromGroup(g);
      if (!nodeId) continue;
      nodeIds.push(nodeId);
      g.setAttribute('data-mc-node-id', nodeId);

      // Parse transform="translate(x, y)" if present
      const transformAttr = g.getAttribute('transform') || '';
      const trMatch = transformAttr.match(/translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/);
      const tx = trMatch ? parseFloat(trMatch[1]) : 0;
      const ty = trMatch ? parseFloat(trMatch[2]) : 0;

      let bbox = { x: -45, y: -22, width: 90, height: 44 };
      try {
        const b = (g as SVGGraphicsElement).getBBox();
        if (b && b.width > 0 && b.height > 0) {
          bbox = { x: b.x, y: b.y, width: b.width, height: b.height };
        }
      } catch {
        // use default bbox
      }

      nodeCenters.set(nodeId, {
        x: tx + bbox.x + bbox.width / 2,
        y: ty + bbox.y + bbox.height / 2,
      });

      // Add 4 connection port handles (top, right, bottom, left) to the node
      const portsGroup = document.createElementNS(svgNs, 'g');
      portsGroup.setAttribute('class', 'mc-node-ports-group');

      const ports: { side: string; cx: number; cy: number }[] = [
        { side: 'top', cx: bbox.x + bbox.width / 2, cy: bbox.y },
        { side: 'right', cx: bbox.x + bbox.width, cy: bbox.y + bbox.height / 2 },
        { side: 'bottom', cx: bbox.x + bbox.width / 2, cy: bbox.y + bbox.height },
        { side: 'left', cx: bbox.x, cy: bbox.y + bbox.height / 2 },
      ];

      for (const p of ports) {
        const circle = document.createElementNS(svgNs, 'circle');
        circle.setAttribute('class', `mc-node-port mc-node-port-${p.side}`);
        circle.setAttribute('cx', String(p.cx));
        circle.setAttribute('cy', String(p.cy));
        circle.setAttribute('r', '6');
        circle.setAttribute('data-mc-port-node', nodeId);
        circle.setAttribute('data-mc-port-abs-x', String(tx + p.cx));
        circle.setAttribute('data-mc-port-abs-y', String(ty + p.cy));
        circle.setAttribute('data-testid', `node-port-${nodeId}-${p.side}`);
        const title = document.createElementNS(svgNs, 'title');
        title.textContent = `Drag from ${nodeId} to connect to another node (or empty space to create new)`;
        circle.appendChild(title);
        portsGroup.appendChild(circle);
      }

      // Add interactive quick-edit badge at top-right corner of the box
      const editBadge = document.createElementNS(svgNs, 'g');
      editBadge.setAttribute('class', 'mc-node-edit-btn');
      editBadge.setAttribute('transform', `translate(${bbox.x + bbox.width - 2}, ${bbox.y + 2})`);
      editBadge.setAttribute('data-mc-edit-node', nodeId);
      editBadge.setAttribute('data-testid', `node-edit-btn-${nodeId}`);

      const editBg = document.createElementNS(svgNs, 'circle');
      editBg.setAttribute('class', 'mc-node-edit-circle');
      editBg.setAttribute('r', '8.5');
      editBg.setAttribute('cx', '0');
      editBg.setAttribute('cy', '0');

      const editIcon = document.createElementNS(svgNs, 'path');
      editIcon.setAttribute('class', 'mc-node-edit-icon');
      editIcon.setAttribute('d', 'M-3,3 L-1.5,3 L2.8,-1.3 L1.3,-2.8 L-3,1.5 Z M-3.5,3.8 L3.5,3.8');

      const editTitle = document.createElementNS(svgNs, 'title');
      editTitle.textContent = `Edit text of ${nodeId} (or double-click box)`;
      editBadge.appendChild(editTitle);
      editBadge.appendChild(editBg);
      editBadge.appendChild(editIcon);
      portsGroup.appendChild(editBadge);

      g.appendChild(portsGroup);
    }

    setKnownNodes(nodeIds);

    // Create top-level interactive layer for edge hit areas, draggable edge endpoints, and rubber-band line
    const overlayLayer = document.createElementNS(svgNs, 'g');
    overlayLayer.setAttribute('class', 'mc-interactive-layer');

    const edgePaths = Array.from(svgEl.querySelectorAll('path[data-edge="true"]'));
    for (const pathEl of edgePaths) {
      const dataId = pathEl.getAttribute('data-id') || pathEl.getAttribute('id') || '';
      const parsed = parseEdgeDataId(dataId, nodeIds);
      if (!parsed) continue;

      const edgeGroup = document.createElementNS(svgNs, 'g');
      edgeGroup.setAttribute('class', 'mc-edge-group');
      edgeGroup.setAttribute('data-edge-id', dataId);
      edgeGroup.setAttribute('data-from', parsed.fromId);
      edgeGroup.setAttribute('data-to', parsed.toId);
      edgeGroup.setAttribute('data-testid', `edge-group-${parsed.fromId}-${parsed.toId}`);

      // Compute start (x0, y0), midpoint (xm, ym), and end (x1, y1) points from path geometry or data-points
      let startPt: { x: number; y: number } | null = null;
      let midPt: { x: number; y: number } | null = null;
      let endPt: { x: number; y: number } | null = null;

      try {
        const svgPath = pathEl as SVGPathElement;
        const total = svgPath.getTotalLength();
        if (total > 0) {
          const p0 = svgPath.getPointAtLength(0);
          const pm = svgPath.getPointAtLength(total * 0.5);
          const p1 = svgPath.getPointAtLength(total);
          startPt = { x: p0.x, y: p0.y };
          midPt = { x: pm.x, y: pm.y };
          endPt = { x: p1.x, y: p1.y };
        }
      } catch {
        // Fallback to data-points below
      }

      if (!startPt || !endPt) {
        const b64Points = pathEl.getAttribute('data-points');
        if (b64Points) {
          try {
            const pts = JSON.parse(atob(b64Points));
            if (Array.isArray(pts) && pts.length >= 2) {
              startPt = { x: Number(pts[0].x), y: Number(pts[0].y) };
              const midIdx = Math.floor(pts.length / 2);
              midPt = { x: Number(pts[midIdx].x), y: Number(pts[midIdx].y) };
              endPt = {
                x: Number(pts[pts.length - 1].x),
                y: Number(pts[pts.length - 1].y),
              };
            }
          } catch {
            // Fallback to node centers
          }
        }
      }

      if (!startPt || !endPt) {
        startPt = nodeCenters.get(parsed.fromId) || null;
        endPt = nodeCenters.get(parsed.toId) || null;
      }
      if (!midPt && startPt && endPt) {
        midPt = {
          x: (startPt.x + endPt.x) / 2,
          y: (startPt.y + endPt.y) / 2,
        };
      }

      const dAttr = pathEl.getAttribute('d') || '';
      if (dAttr) {
        // Visible highlight stroke along the line when hovered or selected
        const highlightPath = document.createElementNS(svgNs, 'path');
        highlightPath.setAttribute('d', dAttr);
        highlightPath.setAttribute('class', 'mc-edge-highlight');
        edgeGroup.appendChild(highlightPath);

        // Wide clickable & directly draggable hit path
        const hitPath = document.createElementNS(svgNs, 'path');
        hitPath.setAttribute('d', dAttr);
        hitPath.setAttribute('class', 'mc-edge-hit');
        hitPath.setAttribute('data-edge-id', dataId);
        hitPath.setAttribute('data-from', parsed.fromId);
        hitPath.setAttribute('data-to', parsed.toId);
        if (startPt && endPt) {
          hitPath.setAttribute('data-start-x', String(startPt.x));
          hitPath.setAttribute('data-start-y', String(startPt.y));
          hitPath.setAttribute('data-end-x', String(endPt.x));
          hitPath.setAttribute('data-end-y', String(endPt.y));
        }
        hitPath.setAttribute('data-testid', `edge-path-${parsed.fromId}-${parsed.toId}`);
        const hitTitle = document.createElementNS(svgNs, 'title');
        hitTitle.textContent = `Click to select connection (${parsed.fromId} → ${parsed.toId}) and show end point, or drag line directly to another node`;
        hitPath.appendChild(hitTitle);
        edgeGroup.appendChild(hitPath);
      }

      if (startPt && endPt && midPt) {
        // Interactive midpoint node shown when hovering over the connection line
        const midNodeGroup = document.createElementNS(svgNs, 'g');
        midNodeGroup.setAttribute('class', 'mc-edge-midpoint-node');
        midNodeGroup.setAttribute('transform', `translate(${midPt.x}, ${midPt.y})`);
        midNodeGroup.setAttribute('data-edge-id', dataId);
        midNodeGroup.setAttribute('data-from', parsed.fromId);
        midNodeGroup.setAttribute('data-to', parsed.toId);
        midNodeGroup.setAttribute('data-cx', String(midPt.x));
        midNodeGroup.setAttribute('data-cy', String(midPt.y));
        midNodeGroup.setAttribute('data-anchor-x', String(startPt.x));
        midNodeGroup.setAttribute('data-anchor-y', String(startPt.y));
        midNodeGroup.setAttribute(
          'data-testid',
          `edge-midpoint-node-${parsed.fromId}-${parsed.toId}`
        );

        const midCircle = document.createElementNS(svgNs, 'circle');
        midCircle.setAttribute('class', 'mc-edge-midpoint-circle');
        midCircle.setAttribute('r', '9');
        midCircle.setAttribute('cx', '0');
        midCircle.setAttribute('cy', '0');

        const midPlusH = document.createElementNS(svgNs, 'line');
        midPlusH.setAttribute('class', 'mc-edge-midpoint-plus');
        midPlusH.setAttribute('x1', '-4');
        midPlusH.setAttribute('y1', '0');
        midPlusH.setAttribute('x2', '4');
        midPlusH.setAttribute('y2', '0');

        const midPlusV = document.createElementNS(svgNs, 'line');
        midPlusV.setAttribute('class', 'mc-edge-midpoint-plus');
        midPlusV.setAttribute('x1', '0');
        midPlusV.setAttribute('y1', '-4');
        midPlusV.setAttribute('x2', '0');
        midPlusV.setAttribute('y2', '4');

        const midTitle = document.createElementNS(svgNs, 'title');
        midTitle.textContent = `Click to insert a node on (${parsed.fromId} → ${parsed.toId}), or drag to reconnect line`;
        midNodeGroup.appendChild(midTitle);
        midNodeGroup.appendChild(midCircle);
        midNodeGroup.appendChild(midPlusH);
        midNodeGroup.appendChild(midPlusV);
        edgeGroup.appendChild(midNodeGroup);

        // Source handle (tail of arrow)
        const srcHandle = document.createElementNS(svgNs, 'circle');
        srcHandle.setAttribute('class', 'mc-edge-endpoint mc-edge-source-handle');
        srcHandle.setAttribute('cx', String(startPt.x));
        srcHandle.setAttribute('cy', String(startPt.y));
        srcHandle.setAttribute('r', '6');
        srcHandle.setAttribute('data-edge-id', dataId);
        srcHandle.setAttribute('data-from', parsed.fromId);
        srcHandle.setAttribute('data-to', parsed.toId);
        srcHandle.setAttribute('data-end', 'source');
        srcHandle.setAttribute('data-anchor-x', String(endPt.x));
        srcHandle.setAttribute('data-anchor-y', String(endPt.y));
        srcHandle.setAttribute(
          'data-testid',
          `edge-handle-source-${parsed.fromId}-${parsed.toId}`
        );
        const srcTitle = document.createElementNS(svgNs, 'title');
        srcTitle.textContent = `Drag to move connection start (${parsed.fromId} → ${parsed.toId}) to another node`;
        srcHandle.appendChild(srcTitle);
        edgeGroup.appendChild(srcHandle);

        // Target handle (point at the end of the line)
        const tgtHandle = document.createElementNS(svgNs, 'circle');
        tgtHandle.setAttribute('class', 'mc-edge-endpoint mc-edge-target-handle');
        tgtHandle.setAttribute('cx', String(endPt.x));
        tgtHandle.setAttribute('cy', String(endPt.y));
        tgtHandle.setAttribute('r', '7.5');
        tgtHandle.setAttribute('data-edge-id', dataId);
        tgtHandle.setAttribute('data-from', parsed.fromId);
        tgtHandle.setAttribute('data-to', parsed.toId);
        tgtHandle.setAttribute('data-end', 'target');
        tgtHandle.setAttribute('data-anchor-x', String(startPt.x));
        tgtHandle.setAttribute('data-anchor-y', String(startPt.y));
        tgtHandle.setAttribute(
          'data-testid',
          `edge-handle-target-${parsed.fromId}-${parsed.toId}`
        );
        const tgtTitle = document.createElementNS(svgNs, 'title');
        tgtTitle.textContent = `Drag end point (${parsed.fromId} → ${parsed.toId}) to reconnect to another node`;
        tgtHandle.appendChild(tgtTitle);
        edgeGroup.appendChild(tgtHandle);
      }

      overlayLayer.appendChild(edgeGroup);
    }

    // Rubber-band line element for active connection dragging
    const rubberLine = document.createElementNS(svgNs, 'line');
    rubberLine.setAttribute('class', 'mc-rubberband-line');
    rubberLine.setAttribute('style', 'display: none; pointer-events: none;');
    overlayLayer.appendChild(rubberLine);

    svgEl.appendChild(overlayLayer);
  }, [svg, Boolean(onChangeCode)]);

  // Keep SVG visual selection state (.mc-selected-node / .mc-selected-edge / .mc-linking-source) synced with selectedEl
  useEffect(() => {
    const svgEl = stageRef.current?.querySelector('svg');
    if (!svgEl) return;
    svgEl
      .querySelectorAll(
        'g.node.mc-selected-node, g.node.mc-linking-source, g.mc-edge-group.mc-selected-edge'
      )
      .forEach((el) => {
        el.classList.remove('mc-selected-node', 'mc-linking-source', 'mc-selected-edge');
      });

    if (selectedEl?.kind === 'node' && selectedEl.nodeId) {
      const selNode = svgEl.querySelector(
        `g.node[data-mc-node-id="${CSS.escape(selectedEl.nodeId)}"]`
      );
      if (selNode) {
        selNode.classList.add('mc-selected-node');
      }
      // Keep default target node updated to first available other node
      const otherNodes = knownNodes.filter((n) => n !== selectedEl.nodeId);
      if (otherNodes.length > 0 && (!connectTargetNodeId || connectTargetNodeId === selectedEl.nodeId)) {
        setConnectTargetNodeId(otherNodes[0]);
      }
    }

    if (selectedEl?.kind === 'edge' && selectedEl.fromId && selectedEl.toId) {
      const selEdgeGroup = svgEl.querySelector(
        `g.mc-edge-group[data-from="${CSS.escape(selectedEl.fromId)}"][data-to="${CSS.escape(selectedEl.toId)}"]`
      );
      if (selEdgeGroup) {
        selEdgeGroup.classList.add('mc-selected-edge');
      }
    }

    if (linkingFromNodeId) {
      const linkNode = svgEl.querySelector(
        `g.node[data-mc-node-id="${CSS.escape(linkingFromNodeId)}"]`
      );
      if (linkNode) {
        linkNode.classList.add('mc-linking-source');
      }
    }
  }, [svg, selectedEl, linkingFromNodeId, knownNodes, connectTargetNodeId]);

  const computeNodeOverlayRect = (
    nodeId: string
  ): { left: number; top: number; width: number; height: number } | null => {
    const canvasEl = canvasRef.current;
    const svgEl = stageRef.current?.querySelector('svg');
    if (!canvasEl || !svgEl) return null;

    const nodeEl = svgEl.querySelector(
      `g.node[data-mc-node-id="${CSS.escape(nodeId)}"]`
    );
    if (!nodeEl) return null;

    const canvasRect = canvasEl.getBoundingClientRect();
    const shapeEl =
      nodeEl.querySelector('rect, polygon, circle, path, ellipse') || nodeEl;
    const rect = shapeEl.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;

    return {
      left: rect.left - canvasRect.left + rect.width / 2,
      top: rect.top - canvasRect.top + rect.height / 2,
      width: Math.max(140, rect.width + 24),
      height: Math.max(38, rect.height + 8),
    };
  };

  const startInlineNodeEdit = (nodeInfo?: SelectedDiagramElement) => {
    const targetNode =
      nodeInfo && nodeInfo.kind === 'node'
        ? nodeInfo
        : selectedEl?.kind === 'node'
          ? selectedEl
          : null;
    if (!targetNode || !onChangeCode) return;

    const rect = computeNodeOverlayRect(targetNode.nodeId) || {
      left: (canvasRef.current?.clientWidth || 600) / 2,
      top: (canvasRef.current?.clientHeight || 400) / 2,
      width: 160,
      height: 40,
    };

    setSelectedEl(targetNode);
    setEditLabel(targetNode.label);
    setEditShape(targetNode.shape);
    setInlineEdit({
      nodeId: targetNode.nodeId,
      value: targetNode.label,
      initialLabel: targetNode.label,
      shape: targetNode.shape,
      ...rect,
    });
  };

  const commitInlineEdit = (overrideValue?: string) => {
    if (!inlineEdit || !onChangeCode) return;
    const nextLabel = (overrideValue ?? inlineEdit.value).trim();
    const currentSelected: SelectedDiagramElement =
      selectedEl && selectedEl.kind === 'node' && selectedEl.nodeId === inlineEdit.nodeId
        ? selectedEl
        : {
            kind: 'node',
            nodeId: inlineEdit.nodeId,
            label: inlineEdit.initialLabel,
            shape: inlineEdit.shape,
          };

    if (nextLabel && nextLabel !== inlineEdit.initialLabel) {
      const nextCode = updateNodeInCode(code, currentSelected, nextLabel, currentSelected.shape);
      onChangeCode(nextCode);
      setSelectedEl({
        ...currentSelected,
        label: nextLabel,
      });
      setEditLabel(nextLabel);
    }
    setInlineEdit(null);
  };

  const cancelInlineEdit = () => {
    setInlineEdit(null);
  };

  // Focus & select text when inline box editor opens
  useEffect(() => {
    if (!inlineEdit?.nodeId) return;
    const timer = setTimeout(() => {
      if (inlineInputRef.current) {
        inlineInputRef.current.focus();
        inlineInputRef.current.select();
      }
    }, 10);
    return () => clearTimeout(timer);
  }, [inlineEdit?.nodeId]);

  // Keep inline box editor position synced when zooming or panning
  useEffect(() => {
    if (!inlineEdit?.nodeId) return;
    const rect = computeNodeOverlayRect(inlineEdit.nodeId);
    if (rect) {
      setInlineEdit((prev) => (prev ? { ...prev, ...rect } : null));
    }
  }, [scale, pan, svg]);

  const handleCopySelectedNode = () => {
    if (!selectedEl || selectedEl.kind !== 'node') return;
    const styleSpec = extractNodeStyleSpec(code, selectedEl.nodeId);
    const data: CopiedNodeData = {
      sourceNodeId: selectedEl.nodeId,
      label: selectedEl.label,
      shape: selectedEl.shape,
      styleSpec,
    };
    setCopiedNode(data);
    try {
      sessionStorage.setItem('mc_copied_node', JSON.stringify(data));
    } catch {
      // ignore storage errors
    }
    setJustCopied(true);
    setTimeout(() => setJustCopied(false), 1400);
  };

  const handlePasteNode = () => {
    if (!copiedNode || !onChangeCode) return;
    const { code: nextCode, newNodeId } = pasteNodeInCode(code, copiedNode);
    onChangeCode(nextCode);
    setSelectedEl({
      kind: 'node',
      nodeId: newNodeId,
      label: copiedNode.label,
      shape: copiedNode.shape,
    });
    setEditLabel(copiedNode.label);
    setEditShape(copiedNode.shape);
  };

  // Keyboard shortcuts: Copy (Ctrl/Cmd+C or 'c'), Paste (Ctrl/Cmd+V or 'v'), Enter/F2 to edit text, Delete / Backspace, Escape
  useEffect(() => {
    if (!onChangeCode) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'SELECT' ||
          active.isContentEditable ||
          active.closest('.cm-editor'))
      ) {
        return;
      }

      const keyLower = e.key.toLowerCase();
      const isMod = e.ctrlKey || e.metaKey;
      const hasTextSelection = Boolean(window.getSelection()?.toString().trim());

      // Copy selected box: Ctrl+C / Cmd+C or pressing 'c' when a node is selected
      if (
        selectedEl?.kind === 'node' &&
        !hasTextSelection &&
        ((isMod && keyLower === 'c' && !e.shiftKey) || (!isMod && !e.altKey && keyLower === 'c'))
      ) {
        e.preventDefault();
        handleCopySelectedNode();
        return;
      }

      // Paste copied box onto the board: Ctrl+V / Cmd+V or pressing 'v' when a box is copied
      if (
        copiedNode &&
        ((isMod && keyLower === 'v' && !e.shiftKey) || (!isMod && !e.altKey && keyLower === 'v'))
      ) {
        e.preventDefault();
        handlePasteNode();
        return;
      }

      if (!selectedEl) return;

      // Press Enter or F2 when a box is selected to edit its text directly on the box
      if (selectedEl.kind === 'node' && (e.key === 'Enter' || e.key === 'F2')) {
        e.preventDefault();
        startInlineNodeEdit(selectedEl);
        return;
      }

      if (e.key === 'Escape') {
        if (inlineEdit) {
          setInlineEdit(null);
        } else if (linkingFromNodeId) {
          setLinkingFromNodeId(null);
        } else {
          setSelectedEl(null);
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (selectedEl.kind === 'node') {
          const nextCode = deleteNodeFromCode(code, selectedEl.nodeId);
          onChangeCode(nextCode);
          setSelectedEl(null);
          setInlineEdit(null);
          setLinkingFromNodeId(null);
        } else if (selectedEl.kind === 'edge' && selectedEl.fromId && selectedEl.toId) {
          const nextCode = deleteEdgeInCode(code, selectedEl.fromId, selectedEl.toId);
          onChangeCode(nextCode);
          setSelectedEl(null);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [selectedEl, copiedNode, inlineEdit, linkingFromNodeId, code, onChangeCode]);

  // Mouse wheel zooms in and out directly
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY === 0) return;
      const delta = e.deltaY < 0 ? 0.12 : -0.12;
      setScale((s) => Math.min(4, Math.max(0.25, +(s + delta).toFixed(2))));
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  const updateRubberBandDom = (drag: ConnectionDragState | null) => {
    const svgEl = stageRef.current?.querySelector('svg');
    if (!svgEl) return;
    const line = svgEl.querySelector('.mc-rubberband-line') as SVGLineElement | null;
    svgEl.querySelectorAll('g.node.mc-drop-target').forEach((el) => {
      el.classList.remove('mc-drop-target');
    });

    if (!drag || !line) {
      if (line) line.style.display = 'none';
      return;
    }

    line.style.display = 'block';
    if (drag.mode === 'reconnect-source') {
      line.setAttribute('x1', String(drag.currentX));
      line.setAttribute('y1', String(drag.currentY));
      line.setAttribute('x2', String(drag.anchorX));
      line.setAttribute('y2', String(drag.anchorY));
    } else {
      line.setAttribute('x1', String(drag.anchorX));
      line.setAttribute('y1', String(drag.anchorY));
      line.setAttribute('x2', String(drag.currentX));
      line.setAttribute('y2', String(drag.currentY));
    }

    if (drag.hoveredNodeId) {
      const targetGroup = svgEl.querySelector(
        `g.node[data-mc-node-id="${CSS.escape(drag.hoveredNodeId)}"]`
      );
      if (targetGroup) {
        targetGroup.classList.add('mc-drop-target');
      }
    }
  };

  const handleZoomIn = () => setScale((s) => Math.min(4, +(s + 0.2).toFixed(2)));
  const handleZoomOut = () => setScale((s) => Math.max(0.25, +(s - 0.2).toFixed(2)));
  const handleResetView = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as Element;
    if (target.closest('.visual-node-editor, .floating-selection-bar, .inline-box-editor')) return;

    const svgEl = stageRef.current?.querySelector('svg') as SVGSVGElement | null;

    // 1. Check if user grabbed an existing edge endpoint handle, interactive midpoint node, or the connection line itself
    const endpointHandle = target.closest('.mc-edge-endpoint');
    const midpointNode = target.closest('.mc-edge-midpoint-node');
    const edgeHitPath = target.closest('.mc-edge-hit');

    if ((endpointHandle || midpointNode || edgeHitPath) && svgEl && onChangeCode) {
      e.stopPropagation();

      if (endpointHandle) {
        const fromId = endpointHandle.getAttribute('data-from') || '';
        const toId = endpointHandle.getAttribute('data-to') || '';
        const endType = endpointHandle.getAttribute('data-end');
        const anchorX = parseFloat(endpointHandle.getAttribute('data-anchor-x') || '0');
        const anchorY = parseFloat(endpointHandle.getAttribute('data-anchor-y') || '0');
        const handleX = parseFloat(endpointHandle.getAttribute('cx') || '0');
        const handleY = parseFloat(endpointHandle.getAttribute('cy') || '0');

        const dragState: ConnectionDragState = {
          mode: endType === 'source' ? 'reconnect-source' : 'reconnect-target',
          fromNodeId: fromId,
          toNodeId: toId,
          anchorX,
          anchorY,
          currentX: handleX,
          currentY: handleY,
          startClientX: e.clientX,
          startClientY: e.clientY,
          hoveredNodeId: null,
        };
        connDragRef.current = dragState;
        updateRubberBandDom(dragState);
        return;
      }

      if (midpointNode) {
        const fromId = midpointNode.getAttribute('data-from') || '';
        const toId = midpointNode.getAttribute('data-to') || '';
        const anchorX = parseFloat(midpointNode.getAttribute('data-anchor-x') || '0');
        const anchorY = parseFloat(midpointNode.getAttribute('data-anchor-y') || '0');
        const cx = parseFloat(midpointNode.getAttribute('data-cx') || '0');
        const cy = parseFloat(midpointNode.getAttribute('data-cy') || '0');

        const dragState: ConnectionDragState = {
          mode: 'reconnect-target',
          fromNodeId: fromId,
          toNodeId: toId,
          anchorX,
          anchorY,
          currentX: cx,
          currentY: cy,
          startClientX: e.clientX,
          startClientY: e.clientY,
          hoveredNodeId: null,
          clickedMidpointNode: true,
        };
        connDragRef.current = dragState;
        return;
      }

      if (edgeHitPath) {
        const fromId = edgeHitPath.getAttribute('data-from') || '';
        const toId = edgeHitPath.getAttribute('data-to') || '';
        const startX = parseFloat(edgeHitPath.getAttribute('data-start-x') || '0');
        const startY = parseFloat(edgeHitPath.getAttribute('data-start-y') || '0');
        const pt = clientToSvgCoords(svgEl, e.clientX, e.clientY);

        const dragState: ConnectionDragState = {
          mode: 'reconnect-target',
          fromNodeId: fromId,
          toNodeId: toId,
          anchorX: startX,
          anchorY: startY,
          currentX: pt.x,
          currentY: pt.y,
          startClientX: e.clientX,
          startClientY: e.clientY,
          hoveredNodeId: null,
        };
        connDragRef.current = dragState;
        return;
      }
    }

    // 2. Check if user grabbed a node connection port handle OR is in Connect Mode / holding Shift on a node
    const portHandle = target.closest('.mc-node-port');
    const nodeGroup = target.closest('g.node');
    if (svgEl && onChangeCode && (portHandle || ((connectMode || e.shiftKey) && nodeGroup))) {
      e.stopPropagation();
      const fromNodeId =
        portHandle?.getAttribute('data-mc-port-node') ||
        nodeGroup?.getAttribute('data-mc-node-id') ||
        (nodeGroup ? extractNodeIdFromGroup(nodeGroup) : '');

      if (fromNodeId) {
        const pt = clientToSvgCoords(svgEl, e.clientX, e.clientY);
        const absXAttr = portHandle?.getAttribute('data-mc-port-abs-x');
        const absYAttr = portHandle?.getAttribute('data-mc-port-abs-y');
        const anchorX = absXAttr ? parseFloat(absXAttr) : pt.x;
        const anchorY = absYAttr ? parseFloat(absYAttr) : pt.y;

        const dragState: ConnectionDragState = {
          mode: 'new-connection',
          fromNodeId,
          anchorX,
          anchorY,
          currentX: pt.x,
          currentY: pt.y,
          startClientX: e.clientX,
          startClientY: e.clientY,
          hoveredNodeId: null,
        };
        connDragRef.current = dragState;
        updateRubberBandDom(dragState);
        return;
      }
    }

    // 3. Regular canvas pan or click
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
      moved: false,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const activeConnDrag = connDragRef.current;
    if (activeConnDrag) {
      const svgEl = stageRef.current?.querySelector('svg') as SVGSVGElement | null;
      if (!svgEl) return;
      const pt = clientToSvgCoords(svgEl, e.clientX, e.clientY);
      const hovered = findNodeIdAtPoint(svgEl, e.target, e.clientX, e.clientY);
      activeConnDrag.currentX = pt.x;
      activeConnDrag.currentY = pt.y;
      activeConnDrag.hoveredNodeId = hovered;

      const clientDist = Math.hypot(
        e.clientX - activeConnDrag.startClientX,
        e.clientY - activeConnDrag.startClientY
      );
      if (clientDist >= 4 || activeConnDrag.mode === 'new-connection') {
        updateRubberBandDom(activeConnDrag);
      }
      return;
    }

    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      dragStartRef.current.moved = true;
    }
    setPan({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy,
    });
  };

  const selectOrLinkClickedElement = (target: Element) => {
    if (!onChangeCode) return;
    const clickedEditBadge = Boolean(target.closest('[data-mc-edit-node]'));
    const info = extractSvgElementInfo(target, code, knownNodes);
    if (info) {
      // If user clicked the quick-edit badge directly on the box, open inline text editing immediately
      if (clickedEditBadge && info.kind === 'node') {
        startInlineNodeEdit(info);
        return;
      }

      // If user is in click-to-connect mode (or Connect Mode with a selected node) and clicked another node: connect them!
      const activeSourceNodeId =
        linkingFromNodeId ||
        (connectMode && selectedEl?.kind === 'node' ? selectedEl.nodeId : null);

      if (
        info.kind === 'node' &&
        activeSourceNodeId &&
        info.nodeId !== activeSourceNodeId
      ) {
        const nextCode = connectNodesInCode(
          code,
          activeSourceNodeId,
          info.nodeId,
          connectEdgeType,
          connectEdgeLabel
        );
        onChangeCode(nextCode);
        setLinkingFromNodeId(null);
        return;
      }

      // If clicking on a box that is ALREADY selected (and not clicking a port or in connect mode),
      // open interactive inline text editing directly on the box!
      if (
        info.kind === 'node' &&
        selectedEl?.kind === 'node' &&
        selectedEl.nodeId === info.nodeId &&
        !activeSourceNodeId &&
        !target.closest('.mc-node-port')
      ) {
        startInlineNodeEdit(info);
        return;
      }

      setSelectedEl(info);
      setEditLabel(info.label);
      setEditShape(info.shape);
      if (info.kind === 'edge' && info.edgeType) {
        setConnectEdgeType(info.edgeType);
      }
      if (info.kind !== 'node') {
        setLinkingFromNodeId(null);
      }
    } else if (
      !target.closest(
        'g.node, g.actor, g.edgeLabel, g.cluster, path[data-edge="true"], .mc-edge-hit, .mc-edge-group'
      )
    ) {
      setSelectedEl(null);
      setLinkingFromNodeId(null);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onChangeCode) return;
    const target = e.target as Element;
    if (target.closest('.visual-node-editor, .floating-selection-bar, .inline-box-editor')) return;
    const info = extractSvgElementInfo(target, code, knownNodes);
    if (info && info.kind === 'node') {
      e.stopPropagation();
      startInlineNodeEdit(info);
    }
  };

  const handleInsertNodeOnSelectedEdge = (fromIdOverride?: string, toIdOverride?: string) => {
    const fId = fromIdOverride || (selectedEl?.kind === 'edge' ? selectedEl.fromId : '');
    const tId = toIdOverride || (selectedEl?.kind === 'edge' ? selectedEl.toId : '');
    if (!fId || !tId || !onChangeCode) return;

    const { code: nextCode, newNodeId } = insertNodeOnEdgeInCode(
      code,
      fId,
      tId,
      'New Step',
      'rect'
    );
    onChangeCode(nextCode);
    setSelectedEl({
      kind: 'node',
      nodeId: newNodeId,
      label: 'New Step',
      shape: 'rect',
    });
    setEditLabel('New Step');
    setEditShape('rect');
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    const activeConnDrag = connDragRef.current;
    if (activeConnDrag) {
      connDragRef.current = null;
      updateRubberBandDom(null);

      const svgEl = stageRef.current?.querySelector('svg') as SVGSVGElement | null;
      if (!svgEl || !onChangeCode) return;

      const clientDist = Math.hypot(
        e.clientX - activeConnDrag.startClientX,
        e.clientY - activeConnDrag.startClientY
      );

      const dropNodeId =
        findNodeIdAtPoint(svgEl, e.target, e.clientX, e.clientY) ||
        activeConnDrag.hoveredNodeId;

      if (activeConnDrag.mode === 'new-connection') {
        // If user just clicked without dragging (< 6px), treat it as node selection / click-to-connect!
        if (clientDist < 6 && (!dropNodeId || dropNodeId === activeConnDrag.fromNodeId)) {
          selectOrLinkClickedElement(e.target as Element);
          return;
        }

        if (dropNodeId && dropNodeId !== activeConnDrag.fromNodeId) {
          // Connect to existing target node
          const nextCode = connectNodesInCode(
            code,
            activeConnDrag.fromNodeId,
            dropNodeId,
            connectEdgeType,
            connectEdgeLabel
          );
          onChangeCode(nextCode);
          setLinkingFromNodeId(null);
        } else if (!dropNodeId) {
          // Dropped on empty canvas space: create a new node and connect it!
          const dist = Math.hypot(
            activeConnDrag.currentX - activeConnDrag.anchorX,
            activeConnDrag.currentY - activeConnDrag.anchorY
          );
          if (dist > 18) {
            const { code: nextCode, newNodeId } = addConnectedNodeInCode(
              code,
              activeConnDrag.fromNodeId,
              {
                edgeType: '-->',
                targetLabel: 'New Step',
                targetShape: 'rect',
              }
            );
            onChangeCode(nextCode);
            setSelectedEl({
              kind: 'node',
              nodeId: newNodeId,
              label: 'New Step',
              shape: 'rect',
            });
          }
        }
        return;
      }

      // If user clicked (without dragging) on the midpoint interactive node on a connection line:
      // insert a new node onto that connection line!
      if (
        activeConnDrag.clickedMidpointNode &&
        clientDist < 6 &&
        activeConnDrag.fromNodeId &&
        activeConnDrag.toNodeId
      ) {
        handleInsertNodeOnSelectedEdge(activeConnDrag.fromNodeId, activeConnDrag.toNodeId);
        return;
      }

      // If user clicked (without dragging) on a connection line or its endpoint:
      // select the connection line so the point at the end of the line is shown!
      if (
        clientDist < 6 &&
        (!dropNodeId ||
          (activeConnDrag.mode === 'reconnect-target' && dropNodeId === activeConnDrag.toNodeId) ||
          (activeConnDrag.mode === 'reconnect-source' && dropNodeId === activeConnDrag.fromNodeId))
      ) {
        selectOrLinkClickedElement(e.target as Element);
        return;
      }

      if (
        activeConnDrag.mode === 'reconnect-target' &&
        activeConnDrag.toNodeId &&
        dropNodeId &&
        dropNodeId !== activeConnDrag.toNodeId
      ) {
        const nextCode = reconnectEdgeInCode(
          code,
          activeConnDrag.fromNodeId,
          activeConnDrag.toNodeId,
          activeConnDrag.fromNodeId,
          dropNodeId
        );
        onChangeCode(nextCode);
        setSelectedEl({
          kind: 'edge',
          nodeId: `L_${activeConnDrag.fromNodeId}_${dropNodeId}_0`,
          fromId: activeConnDrag.fromNodeId,
          toId: dropNodeId,
          label: '',
          edgeType: '-->',
          shape: 'rect',
        });
        return;
      }

      if (
        activeConnDrag.mode === 'reconnect-source' &&
        activeConnDrag.toNodeId &&
        dropNodeId &&
        dropNodeId !== activeConnDrag.fromNodeId
      ) {
        const nextCode = reconnectEdgeInCode(
          code,
          activeConnDrag.fromNodeId,
          activeConnDrag.toNodeId,
          dropNodeId,
          activeConnDrag.toNodeId
        );
        onChangeCode(nextCode);
        setSelectedEl({
          kind: 'edge',
          nodeId: `L_${dropNodeId}_${activeConnDrag.toNodeId}_0`,
          fromId: dropNodeId,
          toId: activeConnDrag.toNodeId,
          label: '',
          edgeType: '-->',
          shape: 'rect',
        });
        return;
      }

      // Fallback: if released without dropping on a new node, keep the line selected
      selectOrLinkClickedElement(e.target as Element);
      return;
    }

    const wasMoved = dragStartRef.current?.moved ?? false;
    setIsDragging(false);
    dragStartRef.current = null;

    if (!wasMoved && onChangeCode) {
      const target = e.target as Element;
      if (target.closest('.visual-node-editor, .floating-selection-bar, .inline-box-editor')) return;
      selectOrLinkClickedElement(target);
    }
  };

  const handleApplyNodeLabelAndShape = (e?: React.FormEvent, shapeOverride?: NodeShape) => {
    if (e) e.preventDefault();
    if (!selectedEl || !onChangeCode) return;
    const currentInputVal = labelInputRef.current?.value ?? editLabel;
    const nextShape = shapeOverride ?? editShape;
    const nextCode = updateNodeInCode(code, selectedEl, currentInputVal, nextShape);
    onChangeCode(nextCode);
    setSelectedEl({
      ...selectedEl,
      label: currentInputVal.trim(),
      shape: nextShape,
    });
    if (shapeOverride) {
      setEditShape(shapeOverride);
    }
  };

  const handleUpdateSelectedEdge = (opts: {
    newFromId?: string;
    newToId?: string;
    edgeType?: EdgeArrowType;
    label?: string;
  }) => {
    if (!selectedEl || selectedEl.kind !== 'edge' || !selectedEl.fromId || !selectedEl.toId || !onChangeCode) {
      return;
    }
    let nextCode = code;
    const targetFrom = opts.newFromId ?? selectedEl.fromId;
    const targetTo = opts.newToId ?? selectedEl.toId;

    if (targetFrom !== selectedEl.fromId || targetTo !== selectedEl.toId) {
      nextCode = reconnectEdgeInCode(
        nextCode,
        selectedEl.fromId,
        selectedEl.toId,
        targetFrom,
        targetTo
      );
    }
    if (opts.edgeType !== undefined || opts.label !== undefined) {
      nextCode = updateEdgeInCode(nextCode, targetFrom, targetTo, {
        edgeType: opts.edgeType,
        label: opts.label,
      });
    }
    onChangeCode(nextCode);
    setSelectedEl({
      ...selectedEl,
      fromId: targetFrom,
      toId: targetTo,
      edgeType: opts.edgeType ?? selectedEl.edgeType,
      label: opts.label !== undefined ? opts.label : selectedEl.label,
    });
  };

  const handleDeleteSelectedEdge = () => {
    if (!selectedEl || selectedEl.kind !== 'edge' || !selectedEl.fromId || !selectedEl.toId || !onChangeCode) {
      return;
    }
    const nextCode = deleteEdgeInCode(code, selectedEl.fromId, selectedEl.toId);
    onChangeCode(nextCode);
    setSelectedEl(null);
  };

  const handleApplyColor = (preset: (typeof NODE_COLOR_PRESETS)[number]) => {
    if (!selectedEl || !onChangeCode) return;
    const nextCode = styleNodeInCode(code, selectedEl.nodeId, preset);
    onChangeCode(nextCode);
  };

  const handleConnectToExistingNode = (targetIdOverride?: string) => {
    if (!selectedEl || selectedEl.kind !== 'node' || !onChangeCode) return;
    const otherNodes = knownNodes.filter((n) => n !== selectedEl.nodeId);
    const targetId = targetIdOverride || connectTargetNodeId || otherNodes[0];
    if (!targetId || targetId === selectedEl.nodeId) return;

    const nextCode = connectNodesInCode(
      code,
      selectedEl.nodeId,
      targetId,
      connectEdgeType,
      connectEdgeLabel
    );
    onChangeCode(nextCode);
    setConnectEdgeLabel('');
    setLinkingFromNodeId(null);
  };

  const handleAddConnectedNode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEl || !onChangeCode) return;
    const { code: nextCode, newNodeId } = addConnectedNodeInCode(code, selectedEl.nodeId, {
      edgeType: connectEdgeType,
      edgeLabel: connectEdgeLabel,
      targetLabel: connectLabel,
      targetShape: 'rect',
    });
    onChangeCode(nextCode);
    const labelText = connectLabel.trim() || 'New Step';
    setSelectedEl({
      kind: 'node',
      nodeId: newNodeId,
      label: labelText,
      shape: 'rect',
    });
    setEditLabel(labelText);
    setEditShape('rect');
    setConnectEdgeLabel('');
  };

  const handleAddStandaloneNode = () => {
    if (!onChangeCode) return;
    const { code: nextCode, newNodeId } = addStandaloneNodeInCode(code, 'New Node', 'rect');
    onChangeCode(nextCode);
    setSelectedEl({
      kind: 'node',
      nodeId: newNodeId,
      label: 'New Node',
      shape: 'rect',
    });
    setEditLabel('New Node');
    setEditShape('rect');
  };

  const handleDeleteSelectedNode = () => {
    if (!selectedEl || !onChangeCode) return;
    const nextCode = deleteNodeFromCode(code, selectedEl.nodeId);
    onChangeCode(nextCode);
    setSelectedEl(null);
    setLinkingFromNodeId(null);
  };

  const safeFilename =
    (chartName || 'diagram')
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-|-$/g, '') || 'diagram';

  const handleExportSvg = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeFilename}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportPng = () => {
    if (!svg) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return;

    let width = 800;
    let height = 600;
    const viewBox = svgEl.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        width = parts[2];
        height = parts[3];
      }
    }
    svgEl.setAttribute('width', String(width));
    svgEl.setAttribute('height', String(height));
    svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    const serialized = new XMLSerializer().serializeToString(svgEl);
    const encoded = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(serialized)));

    const img = new Image();
    img.onload = () => {
      const dpr = 2;
      const canvas = document.createElement('canvas');
      canvas.width = width * dpr + 48;
      canvas.height = height * dpr + 48;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = theme === 'dark' ? '#0f172a' : '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 24, 24, width * dpr, height * dpr);

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safeFilename}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }, 'image/png');
    };
    img.src = encoded;
  };

  return (
    <div
      className={`preview-pane ${theme === 'dark' ? 'preview-dark' : 'preview-light'} ${
        connectMode ? 'connect-mode-active' : ''
      }`}
    >
      <div className="preview-toolbar">
        <div className="preview-toolbar-group">
          <button
            type="button"
            className="icon-btn"
            onClick={handleZoomOut}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut size={15} />
          </button>
          <span className="zoom-readout" onClick={handleResetView} title="Click to reset zoom">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            className="icon-btn"
            onClick={handleZoomIn}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={handleResetView}
            title="Reset zoom & pan"
            aria-label="Reset zoom and pan"
          >
            <RotateCcw size={15} />
          </button>

          {onChangeCode && (
            <>
              <div className="toolbar-divider" />
              {onUndo && (
                <button
                  type="button"
                  className="btn btn-xs btn-secondary"
                  onClick={onUndo}
                  disabled={!canUndo}
                  title="Undo last change (Ctrl+Z)"
                  aria-label="Undo"
                  data-testid="preview-undo-btn"
                >
                  <Undo2 size={13} />
                  <span>Undo</span>
                </button>
              )}
              {onRedo && (
                <button
                  type="button"
                  className="btn btn-xs btn-secondary"
                  onClick={onRedo}
                  disabled={!canRedo}
                  title="Redo change (Ctrl+Y / Ctrl+Shift+Z)"
                  aria-label="Redo"
                  data-testid="preview-redo-btn"
                >
                  <Redo2 size={13} />
                  <span>Redo</span>
                </button>
              )}
              <button
                type="button"
                className="btn btn-xs btn-primary"
                onClick={handleAddStandaloneNode}
                title="Add a new node visually"
                data-testid="preview-add-node-btn"
              >
                <Plus size={13} />
                <span>Add Node</span>
              </button>
              <button
                type="button"
                className="btn btn-xs btn-secondary"
                onClick={handlePasteNode}
                disabled={!copiedNode}
                title={
                  copiedNode
                    ? `Paste copied node "${copiedNode.label}" onto board (Ctrl+V or V)`
                    : 'Select a box and press Ctrl+C (or C) to copy it first'
                }
                data-testid="preview-paste-node-btn"
              >
                <ClipboardPaste size={13} />
                <span>{copiedNode ? `Paste "${copiedNode.label}"` : 'Paste'}</span>
              </button>
              <button
                type="button"
                className={`btn btn-xs ${connectMode ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setConnectMode((m) => !m)}
                title="When active, drag directly from any node to another node to connect them"
                data-testid="preview-connect-mode-btn"
              >
                <Waypoints size={13} />
                <span>{connectMode ? 'Connect Mode: ON' : 'Connect Mode'}</span>
              </button>
              <span className="preview-click-hint">
                <MousePointerClick size={13} />
                <span>Drag node ports or arrow ends to connect / reconnect</span>
              </span>
            </>
          )}
        </div>

        <div className="preview-toolbar-group">
          <label className="theme-select-label" title="Diagram Theme">
            <Palette size={14} />
            <select
              value={theme}
              onChange={(e) => onThemeChange(e.target.value as MermaidTheme)}
              className="theme-select"
              aria-label="Mermaid theme"
            >
              <option value="default">Default</option>
              <option value="neutral">Neutral</option>
              <option value="forest">Forest</option>
              <option value="dark">Dark</option>
            </select>
          </label>

          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={handleExportSvg}
            disabled={!svg}
            title="Download SVG"
          >
            <Download size={14} />
            <span>SVG</span>
          </button>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={handleExportPng}
            disabled={!svg}
            title="Download PNG"
          >
            <ImageIcon size={14} />
            <span>PNG</span>
          </button>
        </div>
      </div>

      <div
        ref={canvasRef}
        className={`preview-canvas ${isDragging ? 'dragging' : ''} ${
          linkingFromNodeId ? 'linking-target-mode' : ''
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onMouseLeave={() => {
          setIsDragging(false);
          dragStartRef.current = null;
          if (connDragRef.current) {
            connDragRef.current = null;
            updateRubberBandDom(null);
          }
        }}
        data-testid="preview-canvas"
      >
        {inlineEdit && onChangeCode && (
          <div
            className="inline-box-editor"
            style={{
              left: `${inlineEdit.left}px`,
              top: `${inlineEdit.top}px`,
              minWidth: `${inlineEdit.width}px`,
              minHeight: `${inlineEdit.height}px`,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            data-testid="inline-box-editor"
          >
            <input
              ref={inlineInputRef}
              type="text"
              className="inline-box-input"
              value={inlineEdit.value}
              onChange={(e) =>
                setInlineEdit((prev) => (prev ? { ...prev, value: e.target.value } : null))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitInlineEdit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelInlineEdit();
                }
              }}
              onBlur={() => commitInlineEdit()}
              aria-label={`Edit text for box ${inlineEdit.nodeId}`}
              data-testid="inline-box-input"
            />
            <button
              type="button"
              className="inline-box-btn inline-box-save"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commitInlineEdit()}
              title="Apply text (Enter)"
              data-testid="inline-box-save-btn"
            >
              <Check size={13} />
            </button>
            <button
              type="button"
              className="inline-box-btn inline-box-cancel"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => cancelInlineEdit()}
              title="Cancel (Esc)"
              data-testid="inline-box-cancel-btn"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {selectedEl?.kind === 'node' && onChangeCode && (
          <div
            className="floating-selection-bar"
            onClick={(e) => e.stopPropagation()}
            data-testid="floating-selection-bar"
          >
            <span className="floating-selection-badge">
              Node <strong>{selectedEl.nodeId}</strong>
            </span>
            <button
              type="button"
              className="btn btn-xs btn-primary"
              onClick={() => startInlineNodeEdit(selectedEl)}
              title="Edit text directly on the box (or click box again / double-click / press Enter)"
              data-testid="floating-edit-text-btn"
            >
              <Pencil size={13} />
              <span>Edit Text</span>
            </button>
            <button
              type="button"
              className="btn btn-xs btn-secondary"
              onClick={handleCopySelectedNode}
              title="Copy this node (Ctrl+C or press C)"
              data-testid="floating-copy-node-btn"
            >
              {justCopied ? <Check size={13} /> : <Copy size={13} />}
              <span>{justCopied ? 'Copied!' : 'Copy (C)'}</span>
            </button>
            {copiedNode && (
              <button
                type="button"
                className="btn btn-xs btn-secondary"
                onClick={handlePasteNode}
                title={`Paste "${copiedNode.label}" onto board (Ctrl+V or press V)`}
                data-testid="floating-paste-node-btn"
              >
                <ClipboardPaste size={13} />
                <span>Paste</span>
              </button>
            )}
            <button
              type="button"
              className={`btn btn-xs ${
                linkingFromNodeId === selectedEl.nodeId ? 'btn-primary' : 'btn-secondary'
              }`}
              onClick={() =>
                setLinkingFromNodeId((cur) =>
                  cur === selectedEl.nodeId ? null : selectedEl.nodeId
                )
              }
              title="Click here, then click any other node on the diagram to connect them"
              data-testid="floating-connect-node-btn"
            >
              <Waypoints size={13} />
              <span>
                {linkingFromNodeId === selectedEl.nodeId
                  ? 'Click target node on canvas…'
                  : 'Connect to Node'}
              </span>
            </button>
            <button
              type="button"
              className="btn btn-xs btn-danger-outline"
              onClick={handleDeleteSelectedNode}
              title="Delete this node (or press Delete / Backspace)"
              data-testid="floating-delete-node-btn"
            >
              <Trash2 size={13} />
              <span>Delete Node</span>
            </button>
          </div>
        )}

        {selectedEl?.kind === 'edge' && selectedEl.fromId && selectedEl.toId && onChangeCode && (
          <div
            className="floating-selection-bar"
            onClick={(e) => e.stopPropagation()}
            data-testid="floating-edge-selection-bar"
          >
            <span className="floating-selection-badge">
              Line <strong>{selectedEl.fromId} → {selectedEl.toId}</strong> (drag end point or line to move)
            </span>
            <button
              type="button"
              className="btn btn-xs btn-primary"
              onClick={() => handleInsertNodeOnSelectedEdge()}
              title="Insert a new node in the middle of this connection line"
              data-testid="floating-insert-node-on-edge-btn"
            >
              <Plus size={13} />
              <span>Insert Node on Line</span>
            </button>
            <button
              type="button"
              className="btn btn-xs btn-danger-outline"
              onClick={handleDeleteSelectedEdge}
              title="Delete this connection line"
              data-testid="floating-delete-edge-btn"
            >
              <Trash2 size={13} />
              <span>Delete Line</span>
            </button>
          </div>
        )}

        {selectedEl && onChangeCode && (
          <div
            className="visual-node-editor"
            onClick={(e) => e.stopPropagation()}
            data-testid="visual-node-editor"
          >
            <div className="visual-editor-header">
              <span className="visual-editor-title">
                {selectedEl.kind === 'node'
                  ? `Edit Node (${selectedEl.nodeId})`
                  : selectedEl.kind === 'edge'
                    ? `Connection (${selectedEl.fromId} → ${selectedEl.toId})`
                    : selectedEl.kind === 'edgeLabel'
                      ? 'Edit Edge Label'
                      : 'Edit Subgraph Title'}
              </span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  setSelectedEl(null);
                  setLinkingFromNodeId(null);
                }}
                title="Close inspector"
              >
                <X size={14} />
              </button>
            </div>

            <form
              className="visual-editor-section"
              onSubmit={(e) => handleApplyNodeLabelAndShape(e)}
            >
              <label className="visual-editor-label">
                {selectedEl.kind === 'edge' ? 'Connection Label' : 'Label Text'}
              </label>
              <div className="visual-editor-row">
                <input
                  key={`${selectedEl.nodeId}:${selectedEl.label}`}
                  ref={labelInputRef}
                  type="text"
                  className="input visual-editor-input"
                  defaultValue={selectedEl.label}
                  placeholder={selectedEl.kind === 'edge' ? 'Optional edge label…' : ''}
                  onChange={(e) => setEditLabel(e.target.value)}
                  data-testid="visual-node-label-input"
                />
                <button
                  type="submit"
                  className="btn btn-xs btn-primary"
                  onClick={(e) => handleApplyNodeLabelAndShape(e)}
                  data-testid="visual-node-apply-btn"
                >
                  <Check size={13} />
                  <span>Apply</span>
                </button>
              </div>
            </form>

            {selectedEl.kind === 'edge' && selectedEl.fromId && selectedEl.toId && (
              <>
                <div className="visual-editor-section">
                  <label className="visual-editor-label">Reconnect Endpoints</label>
                  <div className="visual-editor-row">
                    <select
                      className="input visual-editor-input"
                      value={selectedEl.fromId}
                      onChange={(e) => handleUpdateSelectedEdge({ newFromId: e.target.value })}
                      aria-label="Connection source node"
                      data-testid="edge-source-select"
                    >
                      {knownNodes.map((n) => (
                        <option key={n} value={n}>
                          From: {n}
                        </option>
                      ))}
                    </select>
                    <select
                      className="input visual-editor-input"
                      value={selectedEl.toId}
                      onChange={(e) => handleUpdateSelectedEdge({ newToId: e.target.value })}
                      aria-label="Connection target node"
                      data-testid="edge-target-select"
                    >
                      {knownNodes.map((n) => (
                        <option key={n} value={n}>
                          To: {n}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="visual-editor-section">
                  <label className="visual-editor-label">Arrow Style</label>
                  <div className="visual-shape-grid">
                    {(['-->', '-.->', '==>'] as EdgeArrowType[]).map((arr) => (
                      <button
                        key={arr}
                        type="button"
                        className={`shape-chip ${selectedEl.edgeType === arr ? 'active' : ''}`}
                        onClick={() => handleUpdateSelectedEdge({ edgeType: arr })}
                      >
                        {arr === '-->' ? 'Solid (-->)' : arr === '-.->' ? 'Dotted (-.->)' : 'Thick (==>)'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="visual-editor-footer" style={{ justifyContent: 'space-between', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn btn-xs btn-primary"
                    onClick={() => handleInsertNodeOnSelectedEdge()}
                    title="Insert a new node on this connection line"
                    data-testid="inspector-insert-node-on-edge-btn"
                  >
                    <Plus size={13} />
                    <span>Insert Node</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-xs btn-secondary"
                    onClick={() =>
                      handleUpdateSelectedEdge({
                        newFromId: selectedEl.toId,
                        newToId: selectedEl.fromId,
                      })
                    }
                    title="Reverse arrow direction"
                  >
                    <ArrowLeftRight size={13} />
                    <span>Reverse</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-xs btn-danger-outline"
                    onClick={handleDeleteSelectedEdge}
                    data-testid="visual-delete-edge-btn"
                  >
                    <Trash2 size={13} />
                    <span>Delete</span>
                  </button>
                </div>
              </>
            )}

            {selectedEl.kind === 'node' && (
              <>
                <div className="visual-editor-section">
                  <label className="visual-editor-label">Shape</label>
                  <div className="visual-shape-grid">
                    {NODE_SHAPES.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`shape-chip ${editShape === s.id ? 'active' : ''}`}
                        onClick={() => handleApplyNodeLabelAndShape(undefined, s.id)}
                        title={s.label}
                        data-testid={`visual-shape-${s.id}`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="visual-editor-section">
                  <label className="visual-editor-label">Color Style</label>
                  <div className="visual-color-row">
                    {NODE_COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className="color-swatch"
                        style={{
                          background: preset.fill || '#334155',
                          borderColor: preset.stroke || '#64748b',
                        }}
                        onClick={() => handleApplyColor(preset)}
                        title={preset.name}
                        data-testid={`visual-color-${preset.id}`}
                      />
                    ))}
                  </div>
                </div>

                {knownNodes.filter((n) => n !== selectedEl.nodeId).length > 0 && (
                  <div className="visual-editor-section">
                    <label className="visual-editor-label">
                      Connect with Existing Node
                    </label>
                    <div className="visual-shape-grid" style={{ marginBottom: '6px' }}>
                      {knownNodes
                        .filter((n) => n !== selectedEl.nodeId)
                        .map((targetId) => (
                          <button
                            key={targetId}
                            type="button"
                            className="shape-chip"
                            onClick={() => handleConnectToExistingNode(targetId)}
                            title={`Connect ${selectedEl.nodeId} ${connectEdgeType} ${targetId}`}
                            data-testid={`connect-chip-${targetId}`}
                          >
                            {selectedEl.nodeId} → {targetId}
                          </button>
                        ))}
                    </div>
                    <div className="visual-editor-row">
                      <select
                        className="input visual-editor-input"
                        value={
                          connectTargetNodeId && connectTargetNodeId !== selectedEl.nodeId
                            ? connectTargetNodeId
                            : knownNodes.find((n) => n !== selectedEl.nodeId) || ''
                        }
                        onChange={(e) => setConnectTargetNodeId(e.target.value)}
                        aria-label="Target existing node"
                        data-testid="connect-existing-node-select"
                      >
                        {knownNodes
                          .filter((n) => n !== selectedEl.nodeId)
                          .map((targetId) => (
                            <option key={targetId} value={targetId}>
                              To Node: {targetId}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-xs btn-primary"
                        onClick={() => handleConnectToExistingNode()}
                        data-testid="connect-existing-node-btn"
                      >
                        <Waypoints size={13} />
                        <span>Connect</span>
                      </button>
                    </div>
                  </div>
                )}

                <form className="visual-editor-section" onSubmit={handleAddConnectedNode}>
                  <label className="visual-editor-label">Add New Connected Node</label>
                  <div className="visual-editor-row">
                    <select
                      className="input visual-edge-select"
                      value={connectEdgeType}
                      onChange={(e) =>
                        setConnectEdgeType(e.target.value as '-->' | '-.->' | '==>')
                      }
                    >
                      <option value="-->">--&gt;</option>
                      <option value="-.->">-.-&gt;</option>
                      <option value="==>">==&gt;</option>
                    </select>
                    <input
                      type="text"
                      className="input visual-editor-input"
                      placeholder="Edge label (optional)"
                      value={connectEdgeLabel}
                      onChange={(e) => setConnectEdgeLabel(e.target.value)}
                    />
                  </div>
                  <div className="visual-editor-row" style={{ marginTop: '6px' }}>
                    <input
                      type="text"
                      className="input visual-editor-input"
                      placeholder="New node label"
                      value={connectLabel}
                      onChange={(e) => setConnectLabel(e.target.value)}
                      data-testid="visual-connect-label-input"
                    />
                    <button
                      type="submit"
                      className="btn btn-xs btn-primary"
                      data-testid="visual-connect-node-btn"
                    >
                      <GitBranchPlus size={13} />
                      <span>Add &amp; Connect</span>
                    </button>
                  </div>
                </form>

                <div className="visual-editor-footer" style={{ justifyContent: 'space-between' }}>
                  <button
                    type="button"
                    className="btn btn-xs btn-secondary"
                    onClick={handleCopySelectedNode}
                    title="Copy this node (Ctrl+C or press C)"
                    data-testid="visual-copy-node-btn"
                  >
                    {justCopied ? <Check size={13} /> : <Copy size={13} />}
                    <span>{justCopied ? 'Copied!' : 'Copy Node'}</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-xs btn-danger-outline"
                    onClick={handleDeleteSelectedNode}
                    data-testid="visual-delete-node-btn"
                  >
                    <Trash2 size={13} />
                    <span>Delete Node</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {svg ? (
          <div
            ref={stageRef}
            className="preview-svg-stage interactive-svg"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            }}
          />
        ) : (
          <div className="preview-empty">No valid diagram rendered yet</div>
        )}
      </div>

      {error && (
        <div className="syntax-error-banner" role="alert" data-testid="syntax-error-banner">
          <div className="syntax-error-header">
            <AlertTriangle size={16} />
            <span>Syntax Error (showing last valid diagram above)</span>
          </div>
          <pre className="syntax-error-details">{error}</pre>
        </div>
      )}
    </div>
  );
};
