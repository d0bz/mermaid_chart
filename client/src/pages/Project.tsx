import React, { useEffect, useState, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  Home,
  Plus,
  Copy,
  Check,
  Trash2,
  Files,
  ExternalLink,
  FolderOpen,
  AlertOctagon,
  Edit3,
} from 'lucide-react';
import {
  isValidHash,
  type Project as ProjectType,
  type ChartSummary,
} from '@mermaidchart/shared';
import { api, ApiError } from '../api';
import { recordRecentProject, removeRecentProject } from '../recent';
import { Thumbnail } from '../components/Thumbnail';
import { NotFound } from './NotFound';

export const Project: React.FC = () => {
  const { projectHash } = useParams<{ projectHash: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<ProjectType | null>(null);
  const [charts, setCharts] = useState<ChartSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [projectNameInput, setProjectNameInput] = useState('');
  const [projectDescInput, setProjectDescInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [projectConflict, setProjectConflict] = useState<ProjectType | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [creatingChart, setCreatingChart] = useState(false);
  const [renamingChartId, setRenamingChartId] = useState<string | null>(null);
  const [renamingChartValue, setRenamingChartValue] = useState('');
  const [editingDescChartId, setEditingDescChartId] = useState<string | null>(null);
  const [editingDescValue, setEditingDescValue] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadProject = useCallback(async () => {
    if (!projectHash || !isValidHash(projectHash)) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    try {
      const data = await api.getProject(projectHash);
      setProject(data.project);
      setProjectNameInput(data.project.name);
      setProjectDescInput(data.project.description || '');
      setCharts(data.charts);
      setNotFound(false);
      recordRecentProject({
        id: data.project.id,
        name: data.project.name,
        lastChartId: data.charts[0]?.id,
        lastChartName: data.charts[0]?.name,
      });
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [projectHash]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  const handleSaveProjectMeta = async (overrideRevision?: number) => {
    if (!project) return;
    const trimmedName = projectNameInput.trim() || project.name;
    const trimmedDesc = projectDescInput.trim();
    const currentDesc = project.description || '';

    if (
      trimmedName === project.name &&
      trimmedDesc === currentDesc &&
      overrideRevision === undefined
    ) {
      setProjectNameInput(project.name);
      return;
    }

    setSavingName(true);
    setErrorMsg(null);
    try {
      const res = await api.updateProject(project.id, {
        name: trimmedName,
        description: trimmedDesc,
        baseRevision: overrideRevision ?? project.revision,
      });
      setProject(res.project);
      setProjectNameInput(res.project.name);
      setProjectDescInput(res.project.description || '');
      setProjectConflict(null);
      recordRecentProject({ id: res.project.id, name: res.project.name });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.current) {
        setProjectConflict(err.current as ProjectType);
      } else {
        setErrorMsg((err as Error).message || 'Failed to update project');
      }
    } finally {
      setSavingName(false);
    }
  };

  const handleCreateChart = async (opts?: { name?: string; code?: string }) => {
    if (!project || creatingChart) return;
    setCreatingChart(true);
    setErrorMsg(null);
    try {
      const { chart } = await api.createChart(project.id, opts);
      recordRecentProject({
        id: project.id,
        name: project.name,
        lastChartId: chart.id,
        lastChartName: chart.name,
      });
      navigate(`/${project.id}/${chart.id}`);
    } catch (err) {
      setErrorMsg((err as Error).message || 'Failed to create chart');
      setCreatingChart(false);
    }
  };

  const handleDuplicateChart = async (chart: ChartSummary) => {
    if (!project) return;
    setErrorMsg(null);
    try {
      const { chart: copy } = await api.createChart(project.id, {
        name: `${chart.name} (Copy)`,
        description: chart.description,
        code: chart.code,
      });
      setCharts((prev) => [
        {
          id: copy.id,
          name: copy.name,
          description: copy.description,
          code: copy.code,
          updatedAt: copy.updatedAt,
          revision: copy.revision,
        },
        ...prev,
      ]);
    } catch (err) {
      setErrorMsg((err as Error).message || 'Failed to duplicate chart');
    }
  };

  const handleRenameChartSubmit = async (chart: ChartSummary) => {
    if (!project) return;
    const trimmed = renamingChartValue.trim();
    setRenamingChartId(null);
    if (!trimmed || trimmed === chart.name) return;

    try {
      const { chart: updated } = await api.updateChart(project.id, chart.id, {
        name: trimmed,
        baseRevision: chart.revision,
      });
      setCharts((prev) =>
        prev.map((c) =>
          c.id === chart.id
            ? {
                ...c,
                name: updated.name,
                updatedAt: updated.updatedAt,
                revision: updated.revision,
              }
            : c
        )
      );
    } catch (err) {
      setErrorMsg((err as Error).message || 'Failed to rename chart');
      loadProject();
    }
  };

  const handleChartDescSubmit = async (chart: ChartSummary) => {
    if (!project) return;
    const trimmed = editingDescValue.trim();
    setEditingDescChartId(null);
    if (trimmed === (chart.description || '')) return;

    try {
      const { chart: updated } = await api.updateChart(project.id, chart.id, {
        description: trimmed,
        baseRevision: chart.revision,
      });
      setCharts((prev) =>
        prev.map((c) =>
          c.id === chart.id
            ? {
                ...c,
                description: updated.description,
                updatedAt: updated.updatedAt,
                revision: updated.revision,
              }
            : c
        )
      );
    } catch (err) {
      setErrorMsg((err as Error).message || 'Failed to update chart description');
      loadProject();
    }
  };

  const handleDeleteChart = async (chart: ChartSummary) => {
    if (!project) return;
    setErrorMsg(null);
    try {
      await api.deleteChart(project.id, chart.id);
      setCharts((prev) => prev.filter((c) => c.id !== chart.id));
    } catch (err) {
      setErrorMsg((err as Error).message || 'Failed to delete chart');
    }
  };

  const handleDeleteProject = async () => {
    if (!project) return;
    if (!window.confirm(`Delete project "${project.name}" and all ${charts.length} charts?`)) {
      return;
    }
    try {
      await api.deleteProject(project.id);
      removeRecentProject(project.id);
      navigate('/');
    } catch (err) {
      setErrorMsg((err as Error).message || 'Failed to delete project');
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedId(key);
    setTimeout(() => {
      setCopiedId((prev) => (prev === key ? null : prev));
    }, 1800);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading project…</p>
      </div>
    );
  }

  if (notFound || !project) {
    return (
      <NotFound
        title="Project Not Found"
        message={`No project exists with hash "${projectHash || ''}".`}
      />
    );
  }

  const projectUrl = `${window.location.origin}/${project.id}`;

  return (
    <div className="project-page" data-testid="project-page">
      <header className="project-header">
        <div className="project-header-left">
          <Link to="/" className="btn btn-sm btn-secondary" title="Back to Home">
            <Home size={15} />
            <span>Home</span>
          </Link>

          <div className="project-title-block">
            <div className="project-title-wrap">
              <FolderOpen size={18} className="project-folder-icon" />
              <input
                type="text"
                className="project-name-input"
                value={projectNameInput}
                onChange={(e) => setProjectNameInput(e.target.value)}
                onBlur={() => handleSaveProjectMeta()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
                disabled={savingName}
                aria-label="Project name"
                data-testid="project-name-input"
              />
              <span className="hash-pill" title="Project Hash">
                /{project.id}
              </span>
            </div>
            <input
              type="text"
              className="project-desc-input"
              placeholder="Click to add a project description…"
              value={projectDescInput}
              onChange={(e) => setProjectDescInput(e.target.value)}
              onBlur={() => handleSaveProjectMeta()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              disabled={savingName}
              aria-label="Project description"
              data-testid="project-desc-input"
            />
          </div>
        </div>

        <div className="project-header-actions">
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => copyToClipboard(projectUrl, 'project-link')}
            data-testid="copy-project-link-btn"
          >
            {copiedId === 'project-link' ? <Check size={14} /> : <Copy size={14} />}
            <span>{copiedId === 'project-link' ? 'Copied Link!' : 'Copy Project Link'}</span>
          </button>

          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => handleCreateChart()}
            disabled={creatingChart}
            data-testid="project-new-chart-btn"
          >
            <Plus size={15} />
            <span>{creatingChart ? 'Creating…' : 'New Chart'}</span>
          </button>

          <button
            type="button"
            className="btn btn-sm btn-danger-outline"
            onClick={handleDeleteProject}
            title="Delete entire project"
            data-testid="delete-project-btn"
          >
            <Trash2 size={14} />
            <span>Delete Project</span>
          </button>
        </div>
      </header>

      {projectConflict && (
        <div className="conflict-banner" role="alert">
          <div className="conflict-banner-text">
            <AlertOctagon size={18} />
            <div>
              <strong>Project update conflict:</strong> Server has "{projectConflict.name}" (rev #
              {projectConflict.revision}).
            </div>
          </div>
          <div className="conflict-banner-actions">
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => handleSaveProjectMeta(projectConflict.revision)}
            >
              Overwrite with "{projectNameInput}"
            </button>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => {
                setProject(projectConflict);
                setProjectNameInput(projectConflict.name);
                setProjectDescInput(projectConflict.description || '');
                setProjectConflict(null);
              }}
            >
              Load theirs
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="alert-error project-alert" role="alert">
          {errorMsg}
        </div>
      )}

      <main className="project-main">
        {charts.length === 0 ? (
          <div className="empty-charts-state" data-testid="empty-charts-state">
            <FolderOpen size={42} className="empty-charts-icon" />
            <h2>No charts yet</h2>
            <p>This project is empty. Create a new Mermaid chart to get started.</p>
            <button
              type="button"
              className="btn btn-lg btn-primary"
              onClick={() => handleCreateChart()}
              disabled={creatingChart}
              data-testid="empty-state-new-chart-btn"
            >
              <Plus size={18} />
              <span>New chart</span>
            </button>
          </div>
        ) : (
          <div className="charts-grid" data-testid="charts-grid">
            {charts.map((chart) => {
              const chartUrl = `${window.location.origin}/${project.id}/${chart.id}`;
              const isRenaming = renamingChartId === chart.id;
              const isEditingDesc = editingDescChartId === chart.id;

              return (
                <div
                  key={chart.id}
                  className="chart-card"
                  data-testid={`chart-card-${chart.id}`}
                >
                  <Link
                    to={`/${project.id}/${chart.id}`}
                    className="chart-card-preview"
                    title={`Open ${chart.name}`}
                  >
                    <Thumbnail code={chart.code} />
                  </Link>

                  <div className="chart-card-body">
                    <div className="chart-card-title-row">
                      {isRenaming ? (
                        <input
                          type="text"
                          className="input chart-rename-input"
                          value={renamingChartValue}
                          autoFocus
                          onChange={(e) => setRenamingChartValue(e.target.value)}
                          onBlur={() => handleRenameChartSubmit(chart)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameChartSubmit(chart);
                            if (e.key === 'Escape') setRenamingChartId(null);
                          }}
                          data-testid={`chart-rename-input-${chart.id}`}
                        />
                      ) : (
                        <Link
                          to={`/${project.id}/${chart.id}`}
                          className="chart-card-title"
                          data-testid={`chart-card-title-${chart.id}`}
                        >
                          {chart.name}
                        </Link>
                      )}
                      <button
                        type="button"
                        className="icon-btn"
                        title="Rename chart"
                        onClick={() => {
                          setRenamingChartId(chart.id);
                          setRenamingChartValue(chart.name);
                        }}
                        data-testid={`rename-chart-btn-${chart.id}`}
                      >
                        <Edit3 size={14} />
                      </button>
                    </div>

                    {isEditingDesc ? (
                      <input
                        type="text"
                        className="input chart-desc-input"
                        value={editingDescValue}
                        autoFocus
                        placeholder="Chart description…"
                        onChange={(e) => setEditingDescValue(e.target.value)}
                        onBlur={() => handleChartDescSubmit(chart)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleChartDescSubmit(chart);
                          if (e.key === 'Escape') setEditingDescChartId(null);
                        }}
                      />
                    ) : (
                      <div
                        className="chart-card-desc"
                        onClick={() => {
                          setEditingDescChartId(chart.id);
                          setEditingDescValue(chart.description || '');
                        }}
                        title="Click to edit chart description"
                      >
                        {chart.description || 'Add description…'}
                      </div>
                    )}

                    <div className="chart-card-meta">
                      <code>/{chart.id}</code>
                      <span>•</span>
                      <span>Rev #{chart.revision}</span>
                    </div>

                    <div className="chart-card-actions">
                      <Link
                        to={`/${project.id}/${chart.id}`}
                        className="btn btn-xs btn-primary"
                        data-testid={`open-chart-${chart.id}`}
                      >
                        <ExternalLink size={13} />
                        <span>Open</span>
                      </Link>

                      <button
                        type="button"
                        className="btn btn-xs btn-secondary"
                        onClick={() => copyToClipboard(chartUrl, `chart-${chart.id}`)}
                        title="Copy direct chart URL"
                      >
                        {copiedId === `chart-${chart.id}` ? (
                          <Check size={13} />
                        ) : (
                          <Copy size={13} />
                        )}
                        <span>{copiedId === `chart-${chart.id}` ? 'Copied' : 'Link'}</span>
                      </button>

                      <button
                        type="button"
                        className="btn btn-xs btn-secondary"
                        onClick={() => handleDuplicateChart(chart)}
                        title="Duplicate chart"
                        data-testid={`duplicate-chart-${chart.id}`}
                      >
                        <Files size={13} />
                        <span>Duplicate</span>
                      </button>

                      <button
                        type="button"
                        className="btn btn-xs btn-danger-outline"
                        onClick={() => handleDeleteChart(chart)}
                        title="Delete chart"
                        data-testid={`delete-chart-${chart.id}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
