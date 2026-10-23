import fs from 'node:fs';
import path from 'node:path';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { Storage } from './storage.js';
import { createApiRouter } from './routes.js';

export interface AppOptions {
  dataDir: string;
  clientDistDir?: string;
}

const SPA_HASH_ROUTE_REGEX =
  /^\/(?:|c\/[A-Za-z0-9_-]{10}|[A-Za-z0-9_-]{10}(?:\/[A-Za-z0-9_-]{10})?)\/?$/;

export async function createApp(options: AppOptions): Promise<{ app: Express; storage: Storage }> {
  const storage = new Storage(options.dataDir);
  await storage.init();

  const app = express();
  app.disable('x-powered-by');

  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', createApiRouter(storage));

  // Handle JSON parse or body limit errors before non-API routes
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
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
    }
    next(err);
  });

  const clientDist = options.clientDistDir ? path.resolve(options.clientDistDir) : undefined;
  const indexHtmlPath = clientDist ? path.join(clientDist, 'index.html') : undefined;
  const hasBuiltClient = indexHtmlPath ? fs.existsSync(indexHtmlPath) : false;

  if (clientDist && hasBuiltClient && indexHtmlPath) {
    app.use(express.static(clientDist, { index: false }));

    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api/') || req.path === '/api') {
        res.status(404).json({ error: 'API endpoint not found' });
        return;
      }
      if (SPA_HASH_ROUTE_REGEX.test(req.path)) {
        res.sendFile(indexHtmlPath);
        return;
      }
      res.status(404).sendFile(indexHtmlPath);
    });
  } else {
    app.use((_req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });
  }

  return { app, storage };
}
