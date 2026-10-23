import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../data');
const CLIENT_DIST_DIR =
  process.env.CLIENT_DIST_DIR || path.resolve(__dirname, '../../client/dist');

async function main() {
  const { app, storage } = await createApp({
    dataDir: DATA_DIR,
    clientDistDir: CLIENT_DIST_DIR,
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Mermaid Live Editor server listening on http://localhost:${PORT} (dataDir: ${storage.getDataDir()})`
    );
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
