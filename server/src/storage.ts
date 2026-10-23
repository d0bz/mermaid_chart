import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  type Project,
  type Chart,
  type ChartSummary,
  type ProjectWithCharts,
  ProjectSchema,
  ChartSchema,
  STARTER_MERMAID_CODE,
  generateHash,
  isValidHash,
} from '@mermaidchart/shared';

export class InvalidIdError extends Error {
  constructor(message = 'Invalid ID format') {
    super(message);
    this.name = 'InvalidIdError';
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError<T> extends Error {
  public readonly current: T;
  constructor(current: T, message = 'Revision conflict') {
    super(message);
    this.name = 'ConflictError';
    this.current = current;
  }
}

export class Storage {
  private readonly dataDir: string;
  private readonly chartIndex: Map<string, string> = new Map();
  private initialized = false;

  constructor(dataDir: string) {
    this.dataDir = path.resolve(dataDir);
  }

  public getDataDir(): string {
    return this.dataDir;
  }

  public async init(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.rebuildChartIndex();
    this.initialized = true;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  private assertValidId(id: unknown, label = 'ID'): asserts id is string {
    if (!isValidHash(id)) {
      throw new InvalidIdError(`Invalid ${label}`);
    }
  }

  private resolveSafePath(...segments: string[]): string {
    const resolved = path.resolve(this.dataDir, ...segments);
    const rel = path.relative(this.dataDir, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new InvalidIdError('Path traversal detected');
    }
    return resolved;
  }

  private projectDir(projectId: string): string {
    this.assertValidId(projectId, 'projectId');
    return this.resolveSafePath(projectId);
  }

  private projectFile(projectId: string): string {
    this.assertValidId(projectId, 'projectId');
    return this.resolveSafePath(projectId, 'project.json');
  }

  private chartsDir(projectId: string): string {
    this.assertValidId(projectId, 'projectId');
    return this.resolveSafePath(projectId, 'charts');
  }

  private chartFile(projectId: string, chartId: string): string {
    this.assertValidId(projectId, 'projectId');
    this.assertValidId(chartId, 'chartId');
    return this.resolveSafePath(projectId, 'charts', `${chartId}.json`);
  }

  private async atomicWriteJson(filePath: string, data: unknown): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmpName = `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    const tmpPath = path.join(dir, tmpName);
    const content = JSON.stringify(data, null, 2);
    await fs.writeFile(tmpPath, content, 'utf-8');
    await fs.rename(tmpPath, filePath);
  }

  private async readJsonFile<T>(filePath: string): Promise<T | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw) as T;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  public async rebuildChartIndex(): Promise<void> {
    this.chartIndex.clear();
    let projectEntries: import('node:fs').Dirent[] = [];
    try {
      projectEntries = await fs.readdir(this.dataDir, { withFileTypes: true });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw err;
    }

    for (const projEntry of projectEntries) {
      if (!projEntry.isDirectory() || !isValidHash(projEntry.name)) {
        continue;
      }
      const projectId = projEntry.name;
      // Ensure project.json exists
      const projJson = await this.readJsonFile<Project>(this.projectFile(projectId));
      if (!projJson) continue;

      const cDir = this.chartsDir(projectId);
      let chartEntries: import('node:fs').Dirent[] = [];
      try {
        chartEntries = await fs.readdir(cDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const chartEntry of chartEntries) {
        if (!chartEntry.isFile() || !chartEntry.name.endsWith('.json')) {
          continue;
        }
        const chartId = chartEntry.name.slice(0, -'.json'.length);
        if (isValidHash(chartId)) {
          this.chartIndex.set(chartId, projectId);
        }
      }
    }
  }

  private async generateUniqueProjectId(): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt++) {
      const id = generateHash();
      const exists = await this.readJsonFile(this.projectFile(id));
      if (!exists) return id;
    }
    throw new Error('Failed to generate unique project ID');
  }

  private generateUniqueChartId(): string {
    for (let attempt = 0; attempt < 20; attempt++) {
      const id = generateHash();
      if (!this.chartIndex.has(id)) return id;
    }
    throw new Error('Failed to generate unique chart ID');
  }

  public async createProject(opts?: {
    name?: string;
    description?: string;
    chartName?: string;
    code?: string;
  }): Promise<{ project: Project; chart: Chart }> {
    await this.ensureInitialized();
    const projectId = await this.generateUniqueProjectId();
    const chartId = this.generateUniqueChartId();
    const now = new Date().toISOString();

    const project: Project = {
      id: projectId,
      name: opts?.name?.trim() || 'Untitled Project',
      description: opts?.description?.trim() || '',
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };

    const chart: Chart = {
      id: chartId,
      projectId,
      name: opts?.chartName?.trim() || 'Untitled Chart',
      description: '',
      code: opts?.code !== undefined ? opts.code : STARTER_MERMAID_CODE,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };

    await this.atomicWriteJson(this.projectFile(projectId), project);
    await this.atomicWriteJson(this.chartFile(projectId, chartId), chart);
    this.chartIndex.set(chartId, projectId);

    return { project, chart };
  }

  public async getProject(projectId: string): Promise<Project> {
    await this.ensureInitialized();
    this.assertValidId(projectId, 'projectId');
    const raw = await this.readJsonFile<unknown>(this.projectFile(projectId));
    if (!raw) {
      throw new NotFoundError('Project not found');
    }
    return ProjectSchema.parse(raw);
  }

  public async getProjectWithCharts(projectId: string): Promise<ProjectWithCharts> {
    await this.ensureInitialized();
    const project = await this.getProject(projectId);
    const cDir = this.chartsDir(projectId);
    let entries: import('node:fs').Dirent[] = [];
    try {
      entries = await fs.readdir(cDir, { withFileTypes: true });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }

    const charts: ChartSummary[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const chartId = entry.name.slice(0, -'.json'.length);
      if (!isValidHash(chartId)) continue;
      const raw = await this.readJsonFile<unknown>(this.chartFile(projectId, chartId));
      if (!raw) continue;
      const parsed = ChartSchema.safeParse(raw);
      if (parsed.success && parsed.data.projectId === projectId) {
        this.chartIndex.set(parsed.data.id, projectId);
        charts.push({
          id: parsed.data.id,
          name: parsed.data.name,
          description: parsed.data.description,
          code: parsed.data.code,
          updatedAt: parsed.data.updatedAt,
          revision: parsed.data.revision,
        });
      }
    }

    charts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { project, charts };
  }

  public async updateProject(
    projectId: string,
    input: { name?: string; description?: string; baseRevision: number }
  ): Promise<Project> {
    await this.ensureInitialized();
    const current = await this.getProject(projectId);
    if (current.revision !== input.baseRevision) {
      throw new ConflictError<Project>(current, 'Project was modified by another session');
    }

    const updated: Project = {
      ...current,
      name: input.name !== undefined ? input.name.trim() : current.name,
      description:
        input.description !== undefined ? input.description.trim() : current.description,
      updatedAt: new Date().toISOString(),
      revision: current.revision + 1,
    };

    await this.atomicWriteJson(this.projectFile(projectId), updated);
    return updated;
  }

  public async deleteProject(projectId: string): Promise<void> {
    await this.ensureInitialized();
    // Verify exists first
    await this.getProject(projectId);
    const pDir = this.projectDir(projectId);

    // Remove all its charts from the index
    for (const [chartId, pId] of this.chartIndex.entries()) {
      if (pId === projectId) {
        this.chartIndex.delete(chartId);
      }
    }

    await fs.rm(pDir, { recursive: true, force: true });
  }

  public async createChart(
    projectId: string,
    opts?: { name?: string; description?: string; code?: string }
  ): Promise<Chart> {
    await this.ensureInitialized();
    const project = await this.getProject(projectId);
    const chartId = this.generateUniqueChartId();
    const now = new Date().toISOString();

    const chart: Chart = {
      id: chartId,
      projectId: project.id,
      name: opts?.name?.trim() || 'Untitled Chart',
      description: opts?.description?.trim() || '',
      code: opts?.code !== undefined ? opts.code : STARTER_MERMAID_CODE,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };

    await this.atomicWriteJson(this.chartFile(projectId, chartId), chart);
    this.chartIndex.set(chartId, projectId);
    return chart;
  }

  public async getChart(projectId: string, chartId: string): Promise<Chart> {
    await this.ensureInitialized();
    this.assertValidId(projectId, 'projectId');
    this.assertValidId(chartId, 'chartId');

    // Verify project exists as well
    await this.getProject(projectId);

    const raw = await this.readJsonFile<unknown>(this.chartFile(projectId, chartId));
    if (!raw) {
      throw new NotFoundError('Chart not found');
    }
    const chart = ChartSchema.parse(raw);
    if (chart.projectId !== projectId) {
      throw new NotFoundError('Chart does not belong to this project');
    }
    this.chartIndex.set(chart.id, projectId);
    return chart;
  }

  public async updateChart(
    projectId: string,
    chartId: string,
    input: { name?: string; description?: string; code?: string; baseRevision: number }
  ): Promise<Chart> {
    await this.ensureInitialized();
    const current = await this.getChart(projectId, chartId);
    if (current.revision !== input.baseRevision) {
      throw new ConflictError<Chart>(current, 'Chart was modified by another session');
    }

    const now = new Date().toISOString();
    const updated: Chart = {
      ...current,
      name: input.name !== undefined ? input.name.trim() : current.name,
      description:
        input.description !== undefined ? input.description.trim() : current.description,
      code: input.code !== undefined ? input.code : current.code,
      updatedAt: now,
      revision: current.revision + 1,
    };

    await this.atomicWriteJson(this.chartFile(projectId, chartId), updated);
    return updated;
  }

  public async deleteChart(projectId: string, chartId: string): Promise<void> {
    await this.ensureInitialized();
    // Ensure chart exists under this project
    await this.getChart(projectId, chartId);
    const cFile = this.chartFile(projectId, chartId);
    await fs.rm(cFile, { force: true });
    this.chartIndex.delete(chartId);
  }

  public async lookupChart(chartId: string): Promise<{ projectId: string; chartId: string }> {
    await this.ensureInitialized();
    this.assertValidId(chartId, 'chartId');

    const cachedProjectId = this.chartIndex.get(chartId);
    if (cachedProjectId) {
      // Verify file still exists on disk
      const raw = await this.readJsonFile<unknown>(this.chartFile(cachedProjectId, chartId));
      if (raw) {
        return { projectId: cachedProjectId, chartId };
      }
      this.chartIndex.delete(chartId);
    }

    // Cache miss: trigger one re-scan of the filesystem before returning 404
    await this.rebuildChartIndex();
    const rescannedProjectId = this.chartIndex.get(chartId);
    if (rescannedProjectId) {
      return { projectId: rescannedProjectId, chartId };
    }

    throw new NotFoundError('Chart not found');
  }
}
