export interface RecentProjectEntry {
  id: string;
  name: string;
  lastChartId?: string;
  lastChartName?: string;
  visitedAt: string;
}

const STORAGE_KEY = 'mermaidchart_recent_projects_v1';

export function getRecentProjects(): RecentProjectEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function recordRecentProject(entry: {
  id: string;
  name: string;
  lastChartId?: string;
  lastChartName?: string;
}): void {
  try {
    const existing = getRecentProjects();
    const prev = existing.find((p) => p.id === entry.id);
    const updatedEntry: RecentProjectEntry = {
      id: entry.id,
      name: entry.name,
      lastChartId: entry.lastChartId ?? prev?.lastChartId,
      lastChartName: entry.lastChartName ?? prev?.lastChartName,
      visitedAt: new Date().toISOString(),
    };
    const next = [updatedEntry, ...existing.filter((p) => p.id !== entry.id)].slice(0, 20);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage errors
  }
}

export function removeRecentProject(projectId: string): void {
  try {
    const existing = getRecentProjects().filter((p) => p.id !== projectId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch {
    // Ignore storage errors
  }
}
