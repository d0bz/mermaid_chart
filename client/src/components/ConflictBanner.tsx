import React from 'react';
import { AlertOctagon, RefreshCw, Upload, GitBranch, FolderOpen } from 'lucide-react';
import type { Chart } from '@mermaidchart/shared';

interface ConflictBannerProps {
  remoteChart?: Chart | null;
  deletedOnServer?: boolean;
  busy?: boolean;
  onOverwrite: () => void;
  onLoadTheirs: () => void;
  onForkAsNewChart: () => void;
  onRecreateDeleted?: () => void;
  onBackToProject?: () => void;
}

export const ConflictBanner: React.FC<ConflictBannerProps> = ({
  remoteChart,
  deletedOnServer,
  busy,
  onOverwrite,
  onLoadTheirs,
  onForkAsNewChart,
  onRecreateDeleted,
  onBackToProject,
}) => {
  if (deletedOnServer) {
    return (
      <div className="conflict-banner deleted-banner" role="alert" data-testid="deleted-banner">
        <div className="conflict-banner-text">
          <AlertOctagon size={18} />
          <div>
            <strong>This chart was deleted on the server.</strong>
            <span> Autosave is paused. You can recreate it from your local editor content or go back to the project.</span>
          </div>
        </div>
        <div className="conflict-banner-actions">
          {onRecreateDeleted && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={busy}
              onClick={onRecreateDeleted}
            >
              <Upload size={14} />
              <span>Recreate from local code</span>
            </button>
          )}
          {onBackToProject && (
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              disabled={busy}
              onClick={onBackToProject}
            >
              <FolderOpen size={14} />
              <span>Back to project</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!remoteChart) return null;

  return (
    <div className="conflict-banner" role="alert" data-testid="conflict-banner">
      <div className="conflict-banner-text">
        <AlertOctagon size={18} />
        <div>
          <strong>Edit Conflict Detected (Server is at rev #{remoteChart.revision}).</strong>
          <span> Another session saved changes to this chart. Autosave is paused until you choose how to resolve:</span>
        </div>
      </div>
      <div className="conflict-banner-actions">
        <button
          type="button"
          className="btn btn-sm btn-danger"
          disabled={busy}
          onClick={onOverwrite}
          data-testid="conflict-overwrite-btn"
        >
          <Upload size={14} />
          <span>Overwrite</span>
        </button>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          disabled={busy}
          onClick={onLoadTheirs}
          data-testid="conflict-load-theirs-btn"
        >
          <RefreshCw size={14} />
          <span>Load theirs</span>
        </button>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={busy}
          onClick={onForkAsNewChart}
          data-testid="conflict-fork-btn"
        >
          <GitBranch size={14} />
          <span>Keep mine as new chart</span>
        </button>
      </div>
    </div>
  );
};
