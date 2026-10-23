import type {
  Project,
  Chart,
  ProjectWithCharts,
  CreateProjectResponse,
  ChartLookupResponse,
} from '@mermaidchart/shared';

export class ApiError<T = unknown> extends Error {
  public readonly status: number;
  public readonly conflict: boolean;
  public readonly current?: T;

  constructor(message: string, status: number, opts?: { conflict?: boolean; current?: T }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.conflict = Boolean(opts?.conflict);
    this.current = opts?.current;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  let body: any = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    body = await res.json();
  }

  if (!res.ok) {
    throw new ApiError(body?.error || `Request failed (${res.status})`, res.status, {
      conflict: body?.conflict,
      current: body?.current,
    });
  }

  return body as T;
}

export const api = {
  createProject(input?: {
    name?: string;
    description?: string;
    chartName?: string;
    code?: string;
  }): Promise<CreateProjectResponse> {
    return requestJson<CreateProjectResponse>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(input ?? {}),
    });
  },

  getProject(projectId: string): Promise<ProjectWithCharts> {
    return requestJson<ProjectWithCharts>(`/api/projects/${encodeURIComponent(projectId)}`);
  },

  updateProject(
    projectId: string,
    input: { name?: string; description?: string; baseRevision: number }
  ): Promise<{ project: Project }> {
    return requestJson<{ project: Project }>(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  deleteProject(projectId: string): Promise<{ ok: true }> {
    return requestJson<{ ok: true }>(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
    });
  },

  createChart(
    projectId: string,
    input?: { name?: string; description?: string; code?: string }
  ): Promise<{ chart: Chart }> {
    return requestJson<{ chart: Chart }>(
      `/api/projects/${encodeURIComponent(projectId)}/charts`,
      {
        method: 'POST',
        body: JSON.stringify(input ?? {}),
      }
    );
  },

  lookupChart(chartId: string): Promise<ChartLookupResponse> {
    return requestJson<ChartLookupResponse>(`/api/charts/${encodeURIComponent(chartId)}`);
  },

  getChart(projectId: string, chartId: string): Promise<{ chart: Chart; project: Project }> {
    return requestJson<{ chart: Chart; project: Project }>(
      `/api/projects/${encodeURIComponent(projectId)}/charts/${encodeURIComponent(chartId)}`
    );
  },

  updateChart(
    projectId: string,
    chartId: string,
    input: { name?: string; description?: string; code?: string; baseRevision: number }
  ): Promise<{ chart: Chart }> {
    return requestJson<{ chart: Chart }>(
      `/api/projects/${encodeURIComponent(projectId)}/charts/${encodeURIComponent(chartId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      }
    );
  },

  deleteChart(projectId: string, chartId: string): Promise<{ ok: true }> {
    return requestJson<{ ok: true }>(
      `/api/projects/${encodeURIComponent(projectId)}/charts/${encodeURIComponent(chartId)}`,
      {
        method: 'DELETE',
      }
    );
  },
};
