import { Router, type Request, type Response, type NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  CreateProjectInputSchema,
  UpdateProjectInputSchema,
  CreateChartInputSchema,
  UpdateChartInputSchema,
} from '@mermaidchart/shared';
import {
  Storage,
  InvalidIdError,
  NotFoundError,
  ConflictError,
} from './storage.js';

export function createApiRouter(storage: Storage): Router {
  const router = Router();

  // Create project + initial starter chart
  router.post('/projects', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = CreateProjectInputSchema.parse(req.body ?? {});
      const result = await storage.createProject(input);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // Get project metadata + chart summaries
  router.get('/projects/:p', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await storage.getProjectWithCharts(req.params.p);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Rename project (with baseRevision check)
  router.put('/projects/:p', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = UpdateProjectInputSchema.parse(req.body);
      const project = await storage.updateProject(req.params.p, input);
      res.json({ project });
    } catch (err) {
      next(err);
    }
  });

  // Delete project and all its charts
  router.delete('/projects/:p', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await storage.deleteProject(req.params.p);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Create a new chart inside project
  router.post('/projects/:p/charts', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = CreateChartInputSchema.parse(req.body ?? {});
      const chart = await storage.createChart(req.params.p, input);
      res.status(201).json({ chart });
    } catch (err) {
      next(err);
    }
  });

  // Look up a chart by chartHash alone
  router.get('/charts/:c', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await storage.lookupChart(req.params.c);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Get a single chart
  router.get('/projects/:p/charts/:c', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chart = await storage.getChart(req.params.p, req.params.c);
      const project = await storage.getProject(req.params.p);
      res.json({ chart, project });
    } catch (err) {
      next(err);
    }
  });

  // Update a chart (name and/or code with baseRevision)
  router.put('/projects/:p/charts/:c', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = UpdateChartInputSchema.parse(req.body);
      const chart = await storage.updateChart(req.params.p, req.params.c, input);
      res.json({ chart });
    } catch (err) {
      next(err);
    }
  });

  // Delete a chart (allows deleting the last chart, leaving an empty project)
  router.delete(
    '/projects/:p/charts/:c',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await storage.deleteChart(req.params.p, req.params.c);
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  // Catch-all for unknown /api routes
  router.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  // Error handler for API routes
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof InvalidIdError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof ZodError) {
      res.status(400).json({
        error: 'Validation error',
        details: err.errors,
      });
      return;
    }
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof ConflictError) {
      res.status(409).json({
        error: err.message,
        conflict: true,
        current: err.current,
      });
      return;
    }
    if (
      typeof err === 'object' &&
      err !== null &&
      'type' in err &&
      (err as { type?: string }).type === 'entity.too.large'
    ) {
      res.status(413).json({ error: 'Payload too large' });
      return;
    }
    if (err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400) {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }

    console.error('Unhandled API error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return router;
}
