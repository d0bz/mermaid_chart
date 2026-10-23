import React from 'react';
import { Link } from 'react-router-dom';
import { FileQuestion, Home, FolderOpen } from 'lucide-react';

interface NotFoundProps {
  title?: string;
  message?: string;
  projectId?: string;
  projectName?: string;
}

export const NotFound: React.FC<NotFoundProps> = ({
  title = '404 — Not Found',
  message = "We couldn't find the project or chart you were looking for.",
  projectId,
  projectName,
}) => {
  return (
    <div className="not-found-page" data-testid="not-found-page">
      <div className="not-found-card">
        <div className="not-found-icon">
          <FileQuestion size={44} />
        </div>
        <h1>{title}</h1>
        <p>{message}</p>
        <div className="not-found-actions">
          {projectId && (
            <Link
              to={`/${projectId}`}
              className="btn btn-primary"
              data-testid="back-to-project-link"
            >
              <FolderOpen size={16} />
              <span>Back to {projectName || 'Project'}</span>
            </Link>
          )}
          <Link to="/" className="btn btn-secondary" data-testid="back-to-home-link">
            <Home size={16} />
            <span>Go to Home</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
