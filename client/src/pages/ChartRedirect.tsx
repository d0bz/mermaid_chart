import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { isValidHash } from '@mermaidchart/shared';
import { api } from '../api';
import { NotFound } from './NotFound';

export const ChartRedirect: React.FC = () => {
  const { chartHash } = useParams<{ chartHash: string }>();
  const navigate = useNavigate();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!chartHash || !isValidHash(chartHash)) {
      setNotFound(true);
      return;
    }

    let cancelled = false;
    api
      .lookupChart(chartHash)
      .then((res) => {
        if (cancelled) return;
        navigate(`/${res.projectId}/${res.chartId}`, { replace: true });
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });

    return () => {
      cancelled = true;
    };
  }, [chartHash, navigate]);

  if (notFound) {
    return (
      <NotFound
        title="Chart Not Found"
        message={`No chart matches hash "${chartHash || ''}".`}
      />
    );
  }

  return (
    <div className="loading-screen" data-testid="chart-redirect-loading">
      <div className="spinner" />
      <p>Resolving chart project…</p>
    </div>
  );
};
