import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  FolderOpen,
  FileCode2,
  Clock,
  Trash2,
  ArrowRight,
  Sparkles,
  Search,
} from 'lucide-react';
import { isValidHash } from '@mermaidchart/shared';
import { api } from '../api';
import {
  getRecentProjects,
  recordRecentProject,
  removeRecentProject,
  type RecentProjectEntry,
} from '../recent';

export const Landing: React.FC = () => {
  const navigate = useNavigate();
  const [recent, setRecent] = useState<RecentProjectEntry[]>(() => getRecentProjects());
  const [projectName, setProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const [lookupInput, setLookupInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCreateProject = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (creating) return;
    setCreating(true);
    setErrorMsg(null);
    try {
      const { project, chart } = await api.createProject({
        name: projectName.trim() || undefined,
      });
      recordRecentProject({
        id: project.id,
        name: project.name,
        lastChartId: chart.id,
        lastChartName: chart.name,
      });
      navigate(`/${project.id}/${chart.id}`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to create project');
      setCreating(false);
    }
  };

  const handleQuickOpen = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const raw = lookupInput.trim();
    if (!raw) return;

    // Extract path segments if full URL or path is pasted
    let cleaned = raw;
    try {
      if (raw.startsWith('http://') || raw.startsWith('https://')) {
        cleaned = new URL(raw).pathname;
      }
    } catch {
      // keep raw
    }

    const segments = cleaned.split('/').filter(Boolean);
    if (segments.length === 2 && segments[0] === 'c' && isValidHash(segments[1])) {
      navigate(`/c/${segments[1]}`);
      return;
    }
    if (segments.length === 2 && isValidHash(segments[0]) && isValidHash(segments[1])) {
      navigate(`/${segments[0]}/${segments[1]}`);
      return;
    }
    if (segments.length === 1 && isValidHash(segments[0])) {
      const hash = segments[0];
      // Check if it's a chart hash first, otherwise navigate to project hash
      try {
        const lookup = await api.lookupChart(hash);
        navigate(`/${lookup.projectId}/${lookup.chartId}`);
        return;
      } catch {
        navigate(`/${hash}`);
        return;
      }
    }

    setErrorMsg('Please enter a valid 10-character project/chart hash or URL.');
  };

  const handleRemoveRecent = (id: string) => {
    removeRecentProject(id);
    setRecent(getRecentProjects());
  };

  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="brand">
          <div className="brand-logo">M</div>
          <div>
            <span className="brand-title">MermaidChart Live</span>
            <span className="brand-subtitle">Disk-persisted projects & shareable URLs</span>
          </div>
        </div>
      </header>

      <main className="landing-main">
        <section className="hero-card">
          <div className="hero-badge">
            <Sparkles size={14} />
            <span>Instant URL-addressable Mermaid workspaces</span>
          </div>
          <h1>Create & collaborate on Mermaid diagrams</h1>
          <p>
            Every project is stored on disk with its own shareable URL{' '}
            <code>/&lt;projectHash&gt;/&lt;chartHash&gt;</code>. Come back anytime with your link to view
            all charts in the project or edit live.
          </p>

          <form className="hero-create-form" onSubmit={handleCreateProject}>
            <input
              type="text"
              className="input hero-input"
              placeholder="Project name (optional, e.g. System Architecture)"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              maxLength={200}
              data-testid="new-project-name-input"
            />
            <button
              type="submit"
              className="btn btn-lg btn-primary"
              disabled={creating}
              data-testid="new-project-btn"
            >
              <Plus size={18} />
              <span>{creating ? 'Creating…' : 'New Project'}</span>
            </button>
          </form>

          <form className="quick-open-form" onSubmit={handleQuickOpen}>
            <div className="quick-open-input-wrap">
              <Search size={15} className="quick-open-icon" />
              <input
                type="text"
                className="input quick-open-input"
                placeholder="Have a project or chart hash / URL? Paste here to open…"
                value={lookupInput}
                onChange={(e) => setLookupInput(e.target.value)}
                data-testid="quick-open-input"
              />
            </div>
            <button type="submit" className="btn btn-secondary">
              <span>Open</span>
              <ArrowRight size={15} />
            </button>
          </form>

          {errorMsg && (
            <div className="alert-error" role="alert">
              {errorMsg}
            </div>
          )}
        </section>

        <section className="recent-section">
          <div className="section-header">
            <h2>
              <Clock size={18} />
              <span>Recent Projects in this Browser</span>
            </h2>
            <span className="section-hint">Stored locally in your browser</span>
          </div>

          {recent.length === 0 ? (
            <div className="empty-recent-box" data-testid="empty-recent">
              <p>No recent projects yet. Click <strong>New Project</strong> above to start!</p>
            </div>
          ) : (
            <div className="recent-grid" data-testid="recent-projects-list">
              {recent.map((item) => (
                <div key={item.id} className="recent-card" data-testid={`recent-project-${item.id}`}>
                  <div className="recent-card-top">
                    <Link to={`/${item.id}`} className="recent-project-title">
                      <FolderOpen size={17} />
                      <span>{item.name}</span>
                    </Link>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => handleRemoveRecent(item.id)}
                      title="Remove from recent list"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="recent-card-hash">
                    <code>/{item.id}</code>
                  </div>
                  <div className="recent-card-actions">
                    <Link to={`/${item.id}`} className="btn btn-sm btn-secondary">
                      <FolderOpen size={14} />
                      <span>Project Overview</span>
                    </Link>
                    {item.lastChartId && (
                      <Link
                        to={`/${item.id}/${item.lastChartId}`}
                        className="btn btn-sm btn-primary"
                      >
                        <FileCode2 size={14} />
                        <span>{item.lastChartName || 'Last Chart'}</span>
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
