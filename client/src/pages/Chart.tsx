import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Share2,
  Check,
  Trash2,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
  Sparkles,
  Link as LinkIcon,
  Undo2,
  Redo2,
} from 'lucide-react';
import {
  isValidHash,
  type Chart as ChartType,
  type Project as ProjectType,
  type ChartSummary,
} from '@mermaidchart/shared';
import { api, ApiError } from '../api';
import { recordRecentProject } from '../recent';
import { MERMAID_TEMPLATES } from '../templates';
import type { MermaidTheme } from '../mermaidRenderer';
import { Breadcrumb } from '../components/Breadcrumb';
import { ChartSidebar } from '../components/ChartSidebar';
import { CodeEditor } from '../components/CodeEditor';
import { Preview } from '../components/Preview';
import { ConflictBanner } from '../components/ConflictBanner';
import { QuickInsertToolbar } from '../components/QuickInsertToolbar';
import { NotFound } from './NotFound';

type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error' | 'conflict' | 'deleted';

export const Chart: React.FC = () => {
  const { projectHash, chartHash } = useParams<{ projectHash: string; chartHash: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [notFoundInfo, setNotFoundInfo] = useState<{
    notFound: boolean;
    project?: ProjectType;
  }>({ notFound: false });

  const [project, setProject] = useState<ProjectType | null>(null);
  const [siblingCharts, setSiblingCharts] = useState<ChartSummary[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [chartName, setChartName] = useState('');
  const [code, setCode] = useState('');
  const [baseRevision, setBaseRevision] = useState(1);
  const [historyPast, setHistoryPast] = useState<string[]>([]);
  const [historyFuture, setHistoryFuture] = useState<string[]>([]);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [conflictChart, setConflictChart] = useState<ChartType | null>(null);
  const [resolvingConflict, setResolvingConflict] = useState(false);

  const [theme, setTheme] = useState<MermaidTheme>('default');
  const [splitPercent, setSplitPercent] = useState<number>(44);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [creatingSibling, setCreatingSibling] = useState(false);

  // Refs to coordinate debounced autosave and in-flight requests cleanly
  const lastSavedRef = useRef<{ name: string; code: string }>({ name: '', code: '' });
  const latestDraftRef = useRef<{ name: string; code: string }>({ name: '', code: '' });
  const currentCodeRef = useRef<string>('');
  const lastTypingPushTimeRef = useRef<number>(0);
  const baseRevisionRef = useRef<number>(1);
  const saveStatusRef = useRef<SaveStatus>('saved');
  const savingInFlightRef = useRef<boolean>(false);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);

  latestDraftRef.current = { name: chartName, code };
  currentCodeRef.current = code;
  baseRevisionRef.current = baseRevision;
  saveStatusRef.current = saveStatus;

  const applyCodeChange = useCallback((nextCode: string, coalesceTyping = false) => {
    const prevCode = currentCodeRef.current;
    if (nextCode === prevCode) return;

    const now = Date.now();
    const shouldPushSnapshot =
      !coalesceTyping || now - lastTypingPushTimeRef.current > 450;

    if (shouldPushSnapshot) {
      setHistoryPast((past) => [...past.slice(-99), prevCode]);
      if (coalesceTyping) {
        lastTypingPushTimeRef.current = now;
      } else {
        lastTypingPushTimeRef.current = 0;
      }
    }
    setHistoryFuture([]);
    currentCodeRef.current = nextCode;
    setCode(nextCode);
  }, []);

  const handleVisualCodeChange = useCallback(
    (next: string) => applyCodeChange(next, false),
    [applyCodeChange]
  );

  const handleEditorCodeChange = useCallback(
    (next: string) => applyCodeChange(next, true),
    [applyCodeChange]
  );

  const handleUndo = useCallback(() => {
    setHistoryPast((past) => {
      if (past.length === 0) return past;
      const previous = past[past.length - 1];
      const current = currentCodeRef.current;
      setHistoryFuture((future) => [current, ...future.slice(0, 99)]);
      currentCodeRef.current = previous;
      lastTypingPushTimeRef.current = 0;
      setCode(previous);
      return past.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setHistoryFuture((future) => {
      if (future.length === 0) return future;
      const next = future[0];
      const current = currentCodeRef.current;
      setHistoryPast((past) => [...past.slice(-99), current]);
      currentCodeRef.current = next;
      lastTypingPushTimeRef.current = 0;
      setCode(next);
      return future.slice(1);
    });
  }, []);

  // Global keyboard shortcuts for Undo (Ctrl/Cmd+Z) and Redo (Ctrl+Y / Ctrl+Shift+Z)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'SELECT')
      ) {
        return;
      }
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (
        e.key.toLowerCase() === 'y' ||
        (e.key.toLowerCase() === 'z' && e.shiftKey)
      ) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  // Load initial chart + project data
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setNotFoundInfo({ notFound: false });
      setConflictChart(null);

      if (!chartHash || !isValidHash(chartHash)) {
        setNotFoundInfo({ notFound: true });
        setLoading(false);
        return;
      }

      // If projectHash is valid, try loading chart under projectHash first
      if (projectHash && isValidHash(projectHash)) {
        try {
          const [chartRes, projRes] = await Promise.all([
            api.getChart(projectHash, chartHash),
            api.getProject(projectHash),
          ]);
          if (cancelled) return;

          setProject(projRes.project);
          setSiblingCharts(projRes.charts);
          setChartName(chartRes.chart.name);
          currentCodeRef.current = chartRes.chart.code;
          setCode(chartRes.chart.code);
          setHistoryPast([]);
          setHistoryFuture([]);
          setBaseRevision(chartRes.chart.revision);
          baseRevisionRef.current = chartRes.chart.revision;
          lastSavedRef.current = {
            name: chartRes.chart.name,
            code: chartRes.chart.code,
          };
          latestDraftRef.current = {
            name: chartRes.chart.name,
            code: chartRes.chart.code,
          };
          setSaveStatus('saved');

          recordRecentProject({
            id: projRes.project.id,
            name: projRes.project.name,
            lastChartId: chartRes.chart.id,
            lastChartName: chartRes.chart.name,
          });
          setLoading(false);
          return;
        } catch {
          // Fall through to chart lookup / project check
        }
      }

      // Check if the chart exists under a different projectHash and redirect if so
      try {
        const lookup = await api.lookupChart(chartHash);
        if (cancelled) return;
        navigate(`/${lookup.projectId}/${lookup.chartId}`, { replace: true });
        return;
      } catch {
        // Chart hash doesn't exist at all; check if projectHash itself is a valid project
      }

      if (projectHash && isValidHash(projectHash)) {
        try {
          const projRes = await api.getProject(projectHash);
          if (cancelled) return;
          setNotFoundInfo({ notFound: true, project: projRes.project });
          setLoading(false);
          return;
        } catch {
          // Neither project nor chart exists
        }
      }

      if (!cancelled) {
        setNotFoundInfo({ notFound: true });
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [projectHash, chartHash, navigate]);

  const executeSave = useCallback(
    async (overrideRevision?: number) => {
      if (!projectHash || !chartHash) return;
      if (savingInFlightRef.current) return;

      const draftName = latestDraftRef.current.name.trim() || 'Untitled Chart';
      const draftCode = latestDraftRef.current.code;
      const revToUse = overrideRevision ?? baseRevisionRef.current;

      if (
        overrideRevision === undefined &&
        draftName === lastSavedRef.current.name &&
        draftCode === lastSavedRef.current.code
      ) {
        setSaveStatus('saved');
        return;
      }

      savingInFlightRef.current = true;
      setSaveStatus('saving');

      try {
        const res = await api.updateChart(projectHash, chartHash, {
          name: draftName,
          code: draftCode,
          baseRevision: revToUse,
        });

        baseRevisionRef.current = res.chart.revision;
        setBaseRevision(res.chart.revision);
        lastSavedRef.current = { name: res.chart.name, code: res.chart.code };
        setConflictChart(null);

        // Update sibling chart summary in sidebar
        setSiblingCharts((prev) =>
          prev.map((c) =>
            c.id === res.chart.id
              ? {
                  ...c,
                  name: res.chart.name,
                  code: res.chart.code,
                  updatedAt: res.chart.updatedAt,
                  revision: res.chart.revision,
                }
              : c
          )
        );

        if (project) {
          recordRecentProject({
            id: project.id,
            name: project.name,
            lastChartId: res.chart.id,
            lastChartName: res.chart.name,
          });
        }

        // Check if user typed more while save was in flight
        const stillDirty =
          (latestDraftRef.current.name.trim() || 'Untitled Chart') !== res.chart.name ||
          latestDraftRef.current.code !== res.chart.code;
        setSaveStatus(stillDirty ? 'unsaved' : 'saved');
      } catch (err) {
        if (err instanceof ApiError && err.status === 409 && err.current) {
          setConflictChart(err.current as ChartType);
          setSaveStatus('conflict');
        } else if (err instanceof ApiError && err.status === 404) {
          setSaveStatus('deleted');
        } else {
          setSaveStatus('error');
        }
      } finally {
        savingInFlightRef.current = false;
      }
    },
    [projectHash, chartHash, project]
  );

  // Debounced autosave (~1s)
  useEffect(() => {
    if (loading || notFoundInfo.notFound) return;
    if (saveStatus === 'conflict' || saveStatus === 'deleted') return;

    const cleanName = chartName.trim() || 'Untitled Chart';
    const isDirty =
      cleanName !== lastSavedRef.current.name || code !== lastSavedRef.current.code;

    if (!isDirty) {
      if (saveStatus === 'unsaved') {
        setSaveStatus('saved');
      }
      return;
    }

    if (saveStatus !== 'saving') {
      setSaveStatus('unsaved');
    }

    const timer = setTimeout(() => {
      executeSave();
    }, 900);

    return () => clearTimeout(timer);
  }, [chartName, code, loading, notFoundInfo.notFound, saveStatus, executeSave]);

  // Check remote revision on window focus / visibilitychange
  useEffect(() => {
    if (loading || notFoundInfo.notFound || !projectHash || !chartHash) return;

    const checkRemoteRevision = async () => {
      if (savingInFlightRef.current) return;
      if (saveStatusRef.current === 'conflict' || saveStatusRef.current === 'deleted') return;

      try {
        const remote = await api.getChart(projectHash, chartHash);
        if (remote.chart.revision !== baseRevisionRef.current) {
          const cleanName = latestDraftRef.current.name.trim() || 'Untitled Chart';
          const isDirty =
            cleanName !== lastSavedRef.current.name ||
            latestDraftRef.current.code !== lastSavedRef.current.code;

          if (isDirty) {
            setConflictChart(remote.chart);
            setSaveStatus('conflict');
          } else {
            // No local unsaved changes; fast-forward seamlessly
            setChartName(remote.chart.name);
            setCode(remote.chart.code);
            setBaseRevision(remote.chart.revision);
            baseRevisionRef.current = remote.chart.revision;
            lastSavedRef.current = {
              name: remote.chart.name,
              code: remote.chart.code,
            };
            setSaveStatus('saved');
          }
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setSaveStatus('deleted');
        }
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkRemoteRevision();
      }
    };

    window.addEventListener('focus', checkRemoteRevision);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', checkRemoteRevision);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loading, notFoundInfo.notFound, projectHash, chartHash]);

  // Conflict resolution handlers
  const handleOverwriteConflict = async () => {
    if (!conflictChart) return;
    setResolvingConflict(true);
    try {
      await executeSave(conflictChart.revision);
    } finally {
      setResolvingConflict(false);
    }
  };

  const handleLoadTheirs = () => {
    if (!conflictChart) return;
    setChartName(conflictChart.name);
    setCode(conflictChart.code);
    setBaseRevision(conflictChart.revision);
    baseRevisionRef.current = conflictChart.revision;
    lastSavedRef.current = {
      name: conflictChart.name,
      code: conflictChart.code,
    };
    latestDraftRef.current = {
      name: conflictChart.name,
      code: conflictChart.code,
    };
    setConflictChart(null);
    setSaveStatus('saved');
  };

  const handleForkAsNewChart = async () => {
    if (!projectHash) return;
    setResolvingConflict(true);
    try {
      const forkName = `${chartName.trim() || 'Untitled Chart'} (Copy)`;
      const { chart: newChart } = await api.createChart(projectHash, {
        name: forkName,
        code,
      });
      navigate(`/${projectHash}/${newChart.id}`);
    } finally {
      setResolvingConflict(false);
    }
  };

  const handleRecreateDeleted = async () => {
    if (!projectHash) return;
    setResolvingConflict(true);
    try {
      const { chart: recreated } = await api.createChart(projectHash, {
        name: chartName.trim() || 'Recreated Chart',
        code,
      });
      navigate(`/${projectHash}/${recreated.id}`, { replace: true });
    } finally {
      setResolvingConflict(false);
    }
  };

  const handleCreateSiblingChart = async () => {
    if (!projectHash || creatingSibling) return;
    setCreatingSibling(true);
    try {
      const { chart: created } = await api.createChart(projectHash, {
        name: `Chart ${siblingCharts.length + 1}`,
      });
      setSiblingCharts((prev) => [
        {
          id: created.id,
          name: created.name,
          code: created.code,
          updatedAt: created.updatedAt,
          revision: created.revision,
        },
        ...prev,
      ]);
      navigate(`/${projectHash}/${created.id}`);
    } finally {
      setCreatingSibling(false);
    }
  };

  const handleRenameProject = async (newName: string) => {
    if (!project) return;
    try {
      const res = await api.updateProject(project.id, {
        name: newName,
        baseRevision: project.revision,
      });
      setProject(res.project);
      recordRecentProject({
        id: res.project.id,
        name: res.project.name,
        lastChartId: chartHash,
        lastChartName: chartName,
      });
    } catch {
      // Refresh project if conflict
      if (projectHash) {
        api.getProject(projectHash).then((d) => setProject(d.project)).catch(() => {});
      }
    }
  };

  const handleRenameSiblingChart = async (targetChart: ChartSummary, newName: string) => {
    if (!projectHash) return;
    if (targetChart.id === chartHash) {
      setChartName(newName);
      return;
    }
    try {
      const { chart: updated } = await api.updateChart(projectHash, targetChart.id, {
        name: newName,
        baseRevision: targetChart.revision,
      });
      setSiblingCharts((prev) =>
        prev.map((c) =>
          c.id === updated.id
            ? {
                ...c,
                name: updated.name,
                updatedAt: updated.updatedAt,
                revision: updated.revision,
              }
            : c
        )
      );
    } catch {
      // Refresh list on error
      api.getProject(projectHash).then((d) => setSiblingCharts(d.charts)).catch(() => {});
    }
  };

  const handleDuplicateSiblingChart = async (targetChart: ChartSummary) => {
    if (!projectHash) return;
    const { chart: copy } = await api.createChart(projectHash, {
      name: `${targetChart.name} (Copy)`,
      code: targetChart.code,
    });
    setSiblingCharts((prev) => [
      {
        id: copy.id,
        name: copy.name,
        code: copy.code,
        updatedAt: copy.updatedAt,
        revision: copy.revision,
      },
      ...prev,
    ]);
  };

  const handleDeleteSiblingChart = async (targetChart: ChartSummary) => {
    if (!projectHash) return;
    if (!window.confirm(`Delete chart "${targetChart.name}"?`)) return;
    await api.deleteChart(projectHash, targetChart.id);
    const remaining = siblingCharts.filter((c) => c.id !== targetChart.id);
    setSiblingCharts(remaining);
    if (targetChart.id === chartHash) {
      if (remaining.length > 0) {
        navigate(`/${projectHash}/${remaining[0].id}`);
      } else {
        navigate(`/${projectHash}`);
      }
    }
  };

  const handleInsertSnippet = (snippet: string) => {
    const trimmed = currentCodeRef.current.replace(/\s+$/, '');
    applyCodeChange(`${trimmed}\n${snippet}\n`);
  };

  const handleDeleteCurrentChart = async () => {
    if (!projectHash || !chartHash) return;
    if (!window.confirm(`Delete chart "${chartName}"?`)) return;
    await api.deleteChart(projectHash, chartHash);
    navigate(`/${projectHash}`);
  };

  // Resizable splitter drag logic
  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const relX = moveEvent.clientX - rect.left;
      const pct = Math.min(78, Math.max(22, (relX / rect.width) * 100));
      setSplitPercent(pct);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const copyLink = (url: string, key: string) => {
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 1800);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Opening chart editor…</p>
      </div>
    );
  }

  if (notFoundInfo.notFound || !project || !chartHash) {
    return (
      <NotFound
        title={notFoundInfo.project ? 'Chart Not Found in Project' : 'Project or Chart Not Found'}
        message={
          notFoundInfo.project
            ? `The chart "${chartHash || ''}" does not exist in "${notFoundInfo.project.name}".`
            : 'The requested URL does not match any existing project or chart.'
        }
        projectId={notFoundInfo.project?.id}
        projectName={notFoundInfo.project?.name}
      />
    );
  }

  const fullChartUrl = `${window.location.origin}/${project.id}/${chartHash}`;
  const shortChartUrl = `${window.location.origin}/c/${chartHash}`;

  return (
    <div className="editor-page" data-testid="editor-page">
      <header className="editor-topbar">
        <div className="editor-topbar-left">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setSidebarOpen((o) => !o)}
            title={sidebarOpen ? 'Hide project charts sidebar' : 'Show project charts sidebar'}
            data-testid="toggle-sidebar-btn"
          >
            {sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
          </button>

          <Breadcrumb
            projectId={project.id}
            projectName={project.name}
            chartName={chartName}
            onProjectNameChange={handleRenameProject}
            onChartNameChange={setChartName}
          />
        </div>

        <div className="editor-topbar-right">
          <div className={`save-indicator status-${saveStatus}`} data-testid="save-status">
            {saveStatus === 'saved' && (
              <>
                <CheckCircle2 size={14} />
                <span>Saved · v{baseRevision}</span>
              </>
            )}
            {saveStatus === 'unsaved' && (
              <>
                <Clock size={14} />
                <span>Editing…</span>
              </>
            )}
            {saveStatus === 'saving' && (
              <>
                <Loader2 size={14} className="spin" />
                <span>Saving…</span>
              </>
            )}
            {saveStatus === 'conflict' && (
              <>
                <AlertCircle size={14} />
                <span>Conflict!</span>
              </>
            )}
            {saveStatus === 'deleted' && (
              <>
                <AlertCircle size={14} />
                <span>Deleted</span>
              </>
            )}
            {saveStatus === 'error' && (
              <button
                type="button"
                className="btn-link-retry"
                onClick={() => executeSave()}
              >
                <AlertCircle size={14} />
                <span>Save error — Retry</span>
              </button>
            )}
          </div>

          <label className="template-select-wrap" title="Insert starter template">
            <Sparkles size={13} />
            <select
              className="template-select"
              value=""
              onChange={(e) => {
                const tpl = MERMAID_TEMPLATES.find((t) => t.id === e.target.value);
                if (tpl) {
                  applyCodeChange(tpl.code);
                }
              }}
              aria-label="Starter template"
            >
              <option value="" disabled>
                Templates…
              </option>
              {MERMAID_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => copyLink(fullChartUrl, 'full')}
            title="Copy project/chart URL"
            data-testid="copy-chart-url-btn"
          >
            {copiedKey === 'full' ? <Check size={14} /> : <Share2 size={14} />}
            <span>{copiedKey === 'full' ? 'Copied!' : 'Share URL'}</span>
          </button>

          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => copyLink(shortChartUrl, 'short')}
            title="Copy short /c/<chartHash> link"
            data-testid="copy-short-url-btn"
          >
            {copiedKey === 'short' ? <Check size={14} /> : <LinkIcon size={14} />}
            <span>{copiedKey === 'short' ? 'Copied /c/!' : `/c/${chartHash.slice(0, 5)}…`}</span>
          </button>

          <button
            type="button"
            className="icon-btn danger"
            onClick={handleDeleteCurrentChart}
            title="Delete this chart"
            data-testid="editor-delete-chart-btn"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>

      {(saveStatus === 'conflict' || saveStatus === 'deleted') && (
        <ConflictBanner
          remoteChart={conflictChart}
          deletedOnServer={saveStatus === 'deleted'}
          busy={resolvingConflict}
          onOverwrite={handleOverwriteConflict}
          onLoadTheirs={handleLoadTheirs}
          onForkAsNewChart={handleForkAsNewChart}
          onRecreateDeleted={handleRecreateDeleted}
          onBackToProject={() => navigate(`/${project.id}`)}
        />
      )}

      <div className="editor-workspace">
        {sidebarOpen && (
          <ChartSidebar
            projectId={project.id}
            activeChartId={chartHash}
            charts={siblingCharts}
            onCreateChart={handleCreateSiblingChart}
            onRenameChart={handleRenameSiblingChart}
            onDuplicateChart={handleDuplicateSiblingChart}
            onDeleteChart={handleDeleteSiblingChart}
            creating={creatingSibling}
          />
        )}

        <div className="split-pane" ref={splitContainerRef}>
          <div className="split-left" style={{ width: `${splitPercent}%` }}>
            <div className="pane-header">
              <span className="pane-title">Mermaid Syntax</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-xs btn-secondary"
                  onClick={handleUndo}
                  disabled={historyPast.length === 0}
                  title="Undo (Ctrl+Z)"
                  aria-label="Undo"
                  data-testid="editor-undo-btn"
                >
                  <Undo2 size={13} />
                  <span>Undo</span>
                </button>
                <button
                  type="button"
                  className="btn btn-xs btn-secondary"
                  onClick={handleRedo}
                  disabled={historyFuture.length === 0}
                  title="Redo (Ctrl+Y)"
                  aria-label="Redo"
                  data-testid="editor-redo-btn"
                >
                  <Redo2 size={13} />
                  <span>Redo</span>
                </button>
                <span className="pane-hint">Auto-saves to disk</span>
              </div>
            </div>
            <QuickInsertToolbar
              code={code}
              onChangeCode={handleVisualCodeChange}
              onInsertSnippet={handleInsertSnippet}
            />
            <div className="pane-body">
              <CodeEditor
                value={code}
                onChange={handleEditorCodeChange}
              />
            </div>
          </div>

          <div
            className="split-divider"
            onMouseDown={handleDividerMouseDown}
            role="separator"
            aria-orientation="vertical"
            title="Drag to resize panes"
          />

          <div className="split-right" style={{ width: `${100 - splitPercent}%` }}>
            <Preview
              code={code}
              chartName={chartName}
              theme={theme}
              onThemeChange={setTheme}
              onChangeCode={handleVisualCodeChange}
              canUndo={historyPast.length > 0}
              canRedo={historyFuture.length > 0}
              onUndo={handleUndo}
              onRedo={handleRedo}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
