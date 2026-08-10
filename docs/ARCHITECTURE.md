# Architecture

## Web mode

- React frontend is built with Vite into `dist/`
- Express server serves `dist/` and all `/api` routes
- SQLite database is stored in `data/app.db`
- Uploaded pages and originals are stored under `storage/`

## Desktop mode

- Electron main process imports `server.mjs`
- `NORMIX_DESKTOP=1` prevents the standalone server from auto-listening
- The main process starts the Express server on `127.0.0.1:0`
- Data is stored under the OS application data directory:
  - macOS: `~/Library/Application Support/Normix`
  - Windows: `%APPDATA%\Normix`
- The renderer loads the local server URL and keeps using relative `/api` paths

## Main modules

- `server.mjs`: Express API, SQLite schema, upload processing, page generation
- `lib/pptx-pages.mjs`: PPTX slide extraction and animation compositing
- `src/App.tsx`: React UI
- `electron/main.mjs`: Electron desktop shell
- `electron/preload.cjs`: safe renderer bridge
