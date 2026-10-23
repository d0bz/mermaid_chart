export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface Chart {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  code: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface ChartSummary {
  id: string;
  name: string;
  description?: string;
  code: string;
  updatedAt: string;
  revision: number;
}

export interface ProjectWithCharts {
  project: Project;
  charts: ChartSummary[];
}

export interface CreateProjectResponse {
  project: Project;
  chart: Chart;
}

export interface ChartLookupResponse {
  projectId: string;
  chartId: string;
}

export interface ConflictResponse<T> {
  error: string;
  conflict: true;
  current: T;
}

export const STARTER_MERMAID_CODE = `flowchart TD
    A[Start] --> B{Is it working?}
    B -- Yes --> C[Great!]
    B -- No --> D[Debug]
    D --> B
    C --> E[Ship it 🚀]
`;
