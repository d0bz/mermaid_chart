# MermaidChart Live Editor

A live Mermaid diagram editor with disk-persisted projects and hierarchical, shareable URLs.

## Features

- **Hierarchical URLs:**
  - `/<projectHash>` — Project overview showing all charts with rendered thumbnails, rename, duplicate, delete, and empty-project support.
  - `/<projectHash>/<chartHash>` — Split-pane live Mermaid editor with CodeMirror 6, breadcrumb navigation back to the project, and a sibling-chart sidebar.
  - `/c/<chartHash>` — Resolves a chart by its hash alone and redirects to `/<projectHash>/<chartHash>` (also auto-redirects if a chart is opened under the wrong project hash).
- **Disk Storage:**
  - Projects are stored on disk under `DATA_DIR/<projectHash>/project.json` and `DATA_DIR/<projectHash>/charts/<chartHash>.json` using atomic temporary-file-then-rename writes.
  - In-memory `chartId -> projectId` index built on startup with automatic filesystem rescan on cache misses.
- **Live Preview & Export:**
  - Debounced (~300ms) Mermaid rendering that preserves the last valid diagram when syntax errors occur.
  - Theme selector (`default`, `neutral`, `forest`, `dark`), interactive zoom/pan, and SVG/PNG export.
- **Autosave & Conflict Warning:**
  - Debounced autosave (~1s) with revision tracking (`baseRevision`).
  - Returns HTTP `409` on concurrent edits and presents a banner to **Overwrite**, **Load theirs**, or **Keep mine as new chart**. Also checks revisions when the browser tab regains focus.

## Development

```bash
# Install dependencies
npm install

# Start server (port 3000) and Vite dev client (port 5173)
npm run dev

# Run backend API & storage tests
npm test

# Build shared, client, and server for production
npm run build

# Start production server (serves built client + API on PORT=3000)
npm start
```

## Docker

```bash
# Build and start with Docker Compose (persists data in named volume mermaid_data)
docker compose up -d --build

# Check health
curl http://localhost:3000/healthz
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `DATA_DIR` | `./data` (`/data` in Docker) | Directory where projects and charts are persisted |
| `CLIENT_DIST_DIR` | `./client/dist` | Path to built frontend assets |
