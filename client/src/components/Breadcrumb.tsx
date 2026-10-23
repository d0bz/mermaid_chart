import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Home, ChevronRight, Folder, Edit3 } from 'lucide-react';

interface BreadcrumbProps {
  projectId: string;
  projectName: string;
  chartName: string;
  onProjectNameChange?: (name: string) => void;
  onChartNameChange: (name: string) => void;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({
  projectId,
  projectName,
  chartName,
  onProjectNameChange,
  onChartNameChange,
}) => {
  const [editingProject, setEditingProject] = useState(false);
  const [projectDraft, setProjectDraft] = useState(projectName);

  const commitProjectName = () => {
    setEditingProject(false);
    const trimmed = projectDraft.trim();
    if (trimmed && trimmed !== projectName && onProjectNameChange) {
      onProjectNameChange(trimmed);
    } else {
      setProjectDraft(projectName);
    }
  };

  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <Link to="/" className="breadcrumb-link breadcrumb-home" title="All Recent Projects">
        <Home size={15} />
      </Link>
      <ChevronRight size={14} className="breadcrumb-sep" />

      {editingProject ? (
        <input
          type="text"
          className="breadcrumb-chart-input"
          value={projectDraft}
          autoFocus
          onChange={(e) => setProjectDraft(e.target.value)}
          onBlur={commitProjectName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitProjectName();
            if (e.key === 'Escape') {
              setProjectDraft(projectName);
              setEditingProject(false);
            }
          }}
          aria-label="Project name"
          data-testid="breadcrumb-project-name-input"
        />
      ) : (
        <div className="breadcrumb-project-group">
          <Link
            to={`/${projectId}`}
            className="breadcrumb-link breadcrumb-project"
            title="Go back to Project overview"
            data-testid="breadcrumb-project-link"
          >
            <Folder size={14} />
            <span>{projectName}</span>
          </Link>
          {onProjectNameChange && (
            <button
              type="button"
              className="icon-btn breadcrumb-edit-btn"
              title="Rename project"
              onClick={() => {
                setProjectDraft(projectName);
                setEditingProject(true);
              }}
              data-testid="breadcrumb-rename-project-btn"
            >
              <Edit3 size={12} />
            </button>
          )}
        </div>
      )}

      <ChevronRight size={14} className="breadcrumb-sep" />
      <input
        type="text"
        className="breadcrumb-chart-input"
        value={chartName}
        onChange={(e) => onChartNameChange(e.target.value)}
        placeholder="Untitled Chart"
        aria-label="Chart name"
        data-testid="chart-name-input"
      />
    </nav>
  );
};
