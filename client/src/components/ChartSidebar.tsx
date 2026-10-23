import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileCode2, Plus, LayoutGrid, Edit3, Files, Trash2 } from 'lucide-react';
import type { ChartSummary } from '@mermaidchart/shared';

interface ChartSidebarProps {
  projectId: string;
  activeChartId: string;
  charts: ChartSummary[];
  onCreateChart: () => void;
  onRenameChart?: (chart: ChartSummary, newName: string) => void;
  onDuplicateChart?: (chart: ChartSummary) => void;
  onDeleteChart?: (chart: ChartSummary) => void;
  creating?: boolean;
}

export const ChartSidebar: React.FC<ChartSidebarProps> = ({
  projectId,
  activeChartId,
  charts,
  onCreateChart,
  onRenameChart,
  onDuplicateChart,
  onDeleteChart,
  creating,
}) => {
  const [editingChartId, setEditingChartId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');

  const startEditing = (e: React.MouseEvent, chart: ChartSummary) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingChartId(chart.id);
    setEditingValue(chart.name);
  };

  const commitEditing = (chart: ChartSummary) => {
    const trimmed = editingValue.trim();
    setEditingChartId(null);
    if (trimmed && trimmed !== chart.name && onRenameChart) {
      onRenameChart(chart, trimmed);
    }
  };

  return (
    <aside className="chart-sidebar" data-testid="chart-sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Project Charts ({charts.length})</span>
        <button
          type="button"
          className="btn btn-xs btn-primary"
          onClick={onCreateChart}
          disabled={creating}
          title="Create a new chart in this project"
          data-testid="sidebar-new-chart-btn"
        >
          <Plus size={13} />
          <span>New</span>
        </button>
      </div>

      <div className="sidebar-list">
        {charts.map((c) => {
          const isActive = c.id === activeChartId;
          const isEditing = editingChartId === c.id;

          if (isEditing) {
            return (
              <div key={c.id} className={`sidebar-item ${isActive ? 'active' : ''}`}>
                <FileCode2 size={14} className="sidebar-item-icon" />
                <input
                  type="text"
                  className="input sidebar-rename-input"
                  value={editingValue}
                  autoFocus
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={() => commitEditing(c)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEditing(c);
                    if (e.key === 'Escape') setEditingChartId(null);
                  }}
                  data-testid={`sidebar-rename-input-${c.id}`}
                />
              </div>
            );
          }

          return (
            <div
              key={c.id}
              className={`sidebar-item-row ${isActive ? 'active' : ''}`}
              data-testid={`sidebar-chart-${c.id}`}
            >
              <Link to={`/${projectId}/${c.id}`} className="sidebar-item-main">
                <FileCode2 size={14} className="sidebar-item-icon" />
                <div className="sidebar-item-info">
                  <span className="sidebar-item-name">{c.name}</span>
                  <span className="sidebar-item-meta">#{c.id}</span>
                </div>
              </Link>
              <div className="sidebar-item-actions">
                {onRenameChart && (
                  <button
                    type="button"
                    className="sidebar-action-btn"
                    title="Rename chart"
                    onClick={(e) => startEditing(e, c)}
                    data-testid={`sidebar-rename-btn-${c.id}`}
                  >
                    <Edit3 size={12} />
                  </button>
                )}
                {onDuplicateChart && (
                  <button
                    type="button"
                    className="sidebar-action-btn"
                    title="Duplicate chart"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onDuplicateChart(c);
                    }}
                  >
                    <Files size={12} />
                  </button>
                )}
                {onDeleteChart && (
                  <button
                    type="button"
                    className="sidebar-action-btn danger"
                    title="Delete chart"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onDeleteChart(c);
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="sidebar-footer">
        <Link to={`/${projectId}`} className="sidebar-project-link">
          <LayoutGrid size={14} />
          <span>All project charts</span>
        </Link>
      </div>
    </aside>
  );
};
