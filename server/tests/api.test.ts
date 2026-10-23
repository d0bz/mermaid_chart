import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp } from '../src/app.js';
import { generateHash } from '@mermaidchart/shared';

describe('Mermaid Live Editor Storage & REST API', () => {
  let tmpDataDir: string;
  let tmpClientDir: string;

  beforeEach(async () => {
    tmpDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mermaid-test-data-'));
    tmpClientDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mermaid-test-client-'));
    await fs.writeFile(
      path.join(tmpClientDir, 'index.html'),
      '<!DOCTYPE html><html><body>SPA</body></html>',
      'utf-8'
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDataDir, { recursive: true, force: true });
    await fs.rm(tmpClientDir, { recursive: true, force: true });
  });

  it('responds to GET /healthz', async () => {
    const { app } = await createApp({ dataDir: tmpDataDir, clientDistDir: tmpClientDir });
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('creates a project with an initial chart and stores files in nested folders on disk', async () => {
    const { app } = await createApp({ dataDir: tmpDataDir });
    const createRes = await request(app)
      .post('/api/projects')
      .send({ name: 'Architecture Docs', chartName: 'System Overview' });

    expect(createRes.status).toBe(201);
    const { project, chart } = createRes.body;
    expect(project.id).toMatch(/^[A-Za-z0-9_-]{10}$/);
    expect(chart.id).toMatch(/^[A-Za-z0-9_-]{10}$/);
    expect(project.name).toBe('Architecture Docs');
    expect(project.revision).toBe(1);
    expect(chart.projectId).toBe(project.id);
    expect(chart.name).toBe('System Overview');
    expect(chart.revision).toBe(1);
    expect(chart.code).toContain('flowchart TD');

    // Check on-disk structure
    const projectFile = path.join(tmpDataDir, project.id, 'project.json');
    const chartFile = path.join(tmpDataDir, project.id, 'charts', `${chart.id}.json`);
    const diskProject = JSON.parse(await fs.readFile(projectFile, 'utf-8'));
    const diskChart = JSON.parse(await fs.readFile(chartFile, 'utf-8'));
    expect(diskProject.id).toBe(project.id);
    expect(diskChart.id).toBe(chart.id);

    // Load project with charts
    const getProjRes = await request(app).get(`/api/projects/${project.id}`);
    expect(getProjRes.status).toBe(200);
    expect(getProjRes.body.project.id).toBe(project.id);
    expect(getProjRes.body.charts).toHaveLength(1);
    expect(getProjRes.body.charts[0].id).toBe(chart.id);
  });

  it('updates a chart and detects 409 revision conflicts', async () => {
    const { app } = await createApp({ dataDir: tmpDataDir });
    const { body } = await request(app).post('/api/projects').send({});
    const { project, chart } = body;

    // Valid update with revision 1 -> becomes revision 2
    const update1 = await request(app)
      .put(`/api/projects/${project.id}/charts/${chart.id}`)
      .send({
        name: 'Updated Flow',
        code: 'graph LR; X-->Y;',
        baseRevision: 1,
      });
    expect(update1.status).toBe(200);
    expect(update1.body.chart.revision).toBe(2);
    expect(update1.body.chart.name).toBe('Updated Flow');
    expect(update1.body.chart.code).toBe('graph LR; X-->Y;');

    // Stale update with baseRevision 1 -> returns 409 with current chart
    const conflictRes = await request(app)
      .put(`/api/projects/${project.id}/charts/${chart.id}`)
      .send({
        code: 'graph TD; Stale-->Edit;',
        baseRevision: 1,
      });
    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.conflict).toBe(true);
    expect(conflictRes.body.current.revision).toBe(2);
    expect(conflictRes.body.current.code).toBe('graph LR; X-->Y;');
  });

  it('renames a project and detects 409 revision conflicts on project', async () => {
    const { app } = await createApp({ dataDir: tmpDataDir });
    const { body } = await request(app).post('/api/projects').send({ name: 'Initial' });
    const { project } = body;

    const renameRes = await request(app)
      .put(`/api/projects/${project.id}`)
      .send({ name: 'Renamed Project', baseRevision: 1 });
    expect(renameRes.status).toBe(200);
    expect(renameRes.body.project.name).toBe('Renamed Project');
    expect(renameRes.body.project.revision).toBe(2);

    const conflictRes = await request(app)
      .put(`/api/projects/${project.id}`)
      .send({ name: 'Stale Rename', baseRevision: 1 });
    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.conflict).toBe(true);
    expect(conflictRes.body.current.revision).toBe(2);
    expect(conflictRes.body.current.name).toBe('Renamed Project');
  });

  it('returns 404 when requesting a valid chart under the wrong project', async () => {
    const { app } = await createApp({ dataDir: tmpDataDir });
    const p1 = (await request(app).post('/api/projects').send({})).body;
    const p2 = (await request(app).post('/api/projects').send({})).body;

    // Request p2's chart under p1's URL
    const wrongProjGet = await request(app).get(
      `/api/projects/${p1.project.id}/charts/${p2.chart.id}`
    );
    expect(wrongProjGet.status).toBe(404);

    // Attempt to update p2's chart under p1's URL
    const wrongProjPut = await request(app)
      .put(`/api/projects/${p1.project.id}/charts/${p2.chart.id}`)
      .send({ code: 'graph TD; A-->B', baseRevision: 1 });
    expect(wrongProjPut.status).toBe(404);
  });

  it('resolves chart by hash alone via GET /api/charts/:c, rebuilds index on restart, and rescans on cache miss', async () => {
    const { app: app1 } = await createApp({ dataDir: tmpDataDir });
    const created = (await request(app1).post('/api/projects').send({})).body;
    const { project, chart } = created;

    // Lookup via app1
    const lookup1 = await request(app1).get(`/api/charts/${chart.id}`);
    expect(lookup1.status).toBe(200);
    expect(lookup1.body).toEqual({ projectId: project.id, chartId: chart.id });

    // Simulate server restart by creating a new app instance over the same dataDir
    const { app: app2 } = await createApp({ dataDir: tmpDataDir });
    const lookup2 = await request(app2).get(`/api/charts/${chart.id}`);
    expect(lookup2.status).toBe(200);
    expect(lookup2.body).toEqual({ projectId: project.id, chartId: chart.id });

    // Simulate external chart file written directly to disk while app2 is running (cache miss -> rescan)
    const externalChartId = generateHash();
    const externalChart = {
      id: externalChartId,
      projectId: project.id,
      name: 'External Chart',
      code: 'graph TD; Ext-->Disk;',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      revision: 1,
    };
    await fs.writeFile(
      path.join(tmpDataDir, project.id, 'charts', `${externalChartId}.json`),
      JSON.stringify(externalChart, null, 2),
      'utf-8'
    );

    const lookupExt = await request(app2).get(`/api/charts/${externalChartId}`);
    expect(lookupExt.status).toBe(200);
    expect(lookupExt.body).toEqual({ projectId: project.id, chartId: externalChartId });

    // Delete the chart and verify lookup returns 404
    const delRes = await request(app2).delete(
      `/api/projects/${project.id}/charts/${chart.id}`
    );
    expect(delRes.status).toBe(200);

    const lookupAfterDel = await request(app2).get(`/api/charts/${chart.id}`);
    expect(lookupAfterDel.status).toBe(404);
  });

  it('allows deleting the last chart, leaving a valid empty project that can still add new charts', async () => {
    const { app } = await createApp({ dataDir: tmpDataDir });
    const { body } = await request(app).post('/api/projects').send({ name: 'Emptyable' });
    const { project, chart } = body;

    // Delete the only chart
    const delRes = await request(app).delete(`/api/projects/${project.id}/charts/${chart.id}`);
    expect(delRes.status).toBe(200);

    // Project still exists and has 0 charts
    const getProj = await request(app).get(`/api/projects/${project.id}`);
    expect(getProj.status).toBe(200);
    expect(getProj.body.project.id).toBe(project.id);
    expect(getProj.body.charts).toEqual([]);

    // Can create a new chart inside the empty project
    const newChartRes = await request(app)
      .post(`/api/projects/${project.id}/charts`)
      .send({ name: 'Fresh Chart', code: 'sequenceDiagram\nAlice->>Bob: Hi' });
    expect(newChartRes.status).toBe(201);
    expect(newChartRes.body.chart.name).toBe('Fresh Chart');

    const getProjAfter = await request(app).get(`/api/projects/${project.id}`);
    expect(getProjAfter.body.charts).toHaveLength(1);
  });

  it('cascade deletes a project and all its charts from disk and index', async () => {
    const { app } = await createApp({ dataDir: tmpDataDir });
    const { body } = await request(app).post('/api/projects').send({});
    const { project, chart } = body;
    const secondChart = (
      await request(app).post(`/api/projects/${project.id}/charts`).send({ name: 'Second' })
    ).body.chart;

    const delProj = await request(app).delete(`/api/projects/${project.id}`);
    expect(delProj.status).toBe(200);

    // Project and both charts should return 404
    expect((await request(app).get(`/api/projects/${project.id}`)).status).toBe(404);
    expect((await request(app).get(`/api/charts/${chart.id}`)).status).toBe(404);
    expect((await request(app).get(`/api/charts/${secondChart.id}`)).status).toBe(404);

    // Folder removed from disk
    await expect(fs.access(path.join(tmpDataDir, project.id))).rejects.toThrow();
  });

  it('rejects invalid IDs and path traversal attempts', async () => {
    const { app } = await createApp({ dataDir: tmpDataDir });
    const invalidIds = [
      'short',
      'waytoolongid123456789',
      'bad$char!!',
      '..%2F..%2Fetc',
      '..........',
    ];

    for (const badId of invalidIds) {
      const resProj = await request(app).get(`/api/projects/${badId}`);
      expect(resProj.status).toBe(400);

      const resLookup = await request(app).get(`/api/charts/${badId}`);
      expect(resLookup.status).toBe(400);
    }
  });

  it('serves SPA index.html for hash routes and JSON 404 for unknown /api routes', async () => {
    const { app } = await createApp({ dataDir: tmpDataDir, clientDistDir: tmpClientDir });
    const pHash = generateHash();
    const cHash = generateHash();

    const rootRes = await request(app).get('/');
    expect(rootRes.status).toBe(200);
    expect(rootRes.text).toContain('SPA');

    const projRouteRes = await request(app).get(`/${pHash}`);
    expect(projRouteRes.status).toBe(200);
    expect(projRouteRes.text).toContain('SPA');

    const chartRouteRes = await request(app).get(`/${pHash}/${cHash}`);
    expect(chartRouteRes.status).toBe(200);
    expect(chartRouteRes.text).toContain('SPA');

    const shortLinkRes = await request(app).get(`/c/${cHash}`);
    expect(shortLinkRes.status).toBe(200);
    expect(shortLinkRes.text).toContain('SPA');

    const apiTypoRes = await request(app).get('/api/nonexistent');
    expect(apiTypoRes.status).toBe(404);
    expect(apiTypoRes.body.error).toBeDefined();
  });
});
