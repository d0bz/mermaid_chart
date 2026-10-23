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
} from 'lucide-react';
import { renderMermaidSvg, type MermaidTheme } from '../mermaidRenderer';
import {
  extractSvgElementInfo,
  updateNodeInCode,
  styleNodeInCode,
  addConnectedNodeInCode,
  addStandaloneNodeInCode,
  deleteNodeFromCode,
  NODE_SHAPES,
  NODE_COLOR_PRESETS,
  type SelectedDiagramElement,
  type NodeShape,
} from '../diagramManipulator';

interface PreviewProps {
  code: string;
  chartName: string;
  theme: MermaidTheme;
  onThemeChange: (theme: MermaidTheme) => void;
  onChangeCode?: (nextCode: string) => void;
}

export const Preview: React.FC<PreviewProps> = ({
  code,
  chartName,
  theme,
  onThemeChange,
  onChangeCode,
}) => {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const [selectedEl, setSelectedEl] = useState<SelectedDiagramElement | null>(null);
  const [editLabel, setEditLabel] = useState<string>('');
  const [editShape, setEditShape] = useState<NodeShape>('rect');
  const [connectLabel, setConnectLabel] = useState<string>('Next Step');
  const [connectEdgeLabel, setConnectEdgeLabel] = useState<string>('');
  const [connectEdgeType, setConnectEdgeType] = useState<'-->' | '-.->' | '==>'>('-->');

  const dragStartRef = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const labelInputRef = useRef<HTMLInputElement | null>(null);

  // Debounced Mermaid render (~300 ms)
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await renderMermaidSvg(code, theme);
      if (cancelled) return;
      if ('svg' in result) {
        setSvg(result.svg);
        setError(null);
      } else {
        // Keep last valid SVG, show syntax error banner
        setError(result.error);
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, theme]);

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

  const handleZoomIn = () => setScale((s) => Math.min(4, +(s + 0.2).toFixed(2)));
  const handleZoomOut = () => setScale((s) => Math.max(0.25, +(s - 0.2).toFixed(2)));
  const handleResetView = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Ignore clicks inside the floating visual editor popover
    if ((e.target as Element).closest('.visual-node-editor')) return;

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

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    const wasMoved = dragStartRef.current?.moved ?? false;
    setIsDragging(false);
    dragStartRef.current = null;

    if (!wasMoved && onChangeCode) {
      const target = e.target as Element;
      if (target.closest('.visual-node-editor')) return;

      const info = extractSvgElementInfo(target, code);
      if (info) {
        setSelectedEl(info);
        setEditLabel(info.label);
        setEditShape(info.shape);
      } else if (!target.closest('g.node, g.actor, g.edgeLabel, g.cluster')) {
        setSelectedEl(null);
      }
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
      label: currentInputVal.trim() || selectedEl.label,
      shape: nextShape,
    });
    if (shapeOverride) {
      setEditShape(shapeOverride);
    }
  };

  const handleApplyColor = (preset: (typeof NODE_COLOR_PRESETS)[number]) => {
    if (!selectedEl || !onChangeCode) return;
    const nextCode = styleNodeInCode(code, selectedEl.nodeId, preset);
    onChangeCode(nextCode);
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
    <div className={`preview-pane ${theme === 'dark' ? 'preview-dark' : 'preview-light'}`}>
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
              <span className="preview-click-hint">
                <MousePointerClick size={13} />
                <span>Click any node to edit</span>
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
        className={`preview-canvas ${isDragging ? 'dragging' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          setIsDragging(false);
          dragStartRef.current = null;
        }}
        data-testid="preview-canvas"
      >
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
                  : selectedEl.kind === 'edgeLabel'
                    ? 'Edit Edge Label'
                    : 'Edit Subgraph Title'}
              </span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setSelectedEl(null)}
                title="Close inspector"
              >
                <X size={14} />
              </button>
            </div>

            <form className="visual-editor-section" onSubmit={(e) => handleApplyNodeLabelAndShape(e)}>
              <label className="visual-editor-label">Label Text</label>
              <div className="visual-editor-row">
                <input
                  key={`${selectedEl.nodeId}:${selectedEl.label}`}
                  ref={labelInputRef}
                  type="text"
                  className="input visual-editor-input"
                  defaultValue={selectedEl.label}
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

                <form className="visual-editor-section" onSubmit={handleAddConnectedNode}>
                  <label className="visual-editor-label">Add Connected Step</label>
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
                      <span>Connect</span>
                    </button>
                  </div>
                </form>

                <div className="visual-editor-footer">
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
            className="preview-svg-stage interactive-svg"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
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
