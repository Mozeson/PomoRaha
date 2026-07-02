# Zettel 🗃️

An online, Obsidian-style note-taking app built around the **Zettelkasten** method — zero dependencies, with a built-in sync backend and a phone-friendly quick-capture form.

## Features

- **Markdown editor with live preview** — headings, bold/italic, `code`, fenced code blocks, quotes, lists, task lists (click to toggle), ==highlights==, tags.
- **`[[Wikilinks]]`** — type `[[` for autocomplete; `[[Title|alias]]` supported; links to notes that don't exist yet are shown dashed and are created on click (exactly like Obsidian).
- **Backlinks & outgoing links panel** — see every note that references the open note, with the surrounding context.
- **Graph view** — force-directed graph of the whole vault on canvas: drag nodes, scroll to zoom, click to open a note.
- **Zettelkasten note types** — 🌱 Fleeting · 📖 Literature · 🧠 Permanent · 🗺️ Index, color-coded in the list and the graph, with sidebar filters that double as a processing inbox.
- **Zettel IDs** — every note gets a permanent Luhmann-style timestamp ID (`YYYYMMDDHHMM`) that never changes even when the title does.
- **Quick switcher** (`Ctrl+O`) — jump to any note or create one by name.
- **Search + #tags** — full-text sidebar search, clickable tags with counts.
- **Sync backend** — the server stores the canonical vault in `data/vault.json`; the browser keeps a full offline copy in `localStorage` and syncs in the background (last-write-wins per note, tombstones for deletes — multiple devices converge). Sync status lives in the status bar.
- **📱 Quick capture** (`/capture`) — a one-screen phone form that files ideas straight into the vault as 🌱 fleeting notes: big textarea, tap-to-add tag chips, `Ctrl+Enter` to save. Works offline (queues locally, flushes when back online) and installs to the home screen as a PWA. Process the inbox later with the Fleeting filter.
- **Export/import** — whole vault as JSON, single notes as `.md`.
- **RTL friendly** — paragraphs use `dir="auto"`, so Hebrew notes render correctly.

The vault ships with starter notes that teach the Zettelkasten workflow (fleeting → literature → permanent → index).

## Keyboard shortcuts

| Action | Shortcut |
|---|---|
| New note | `Ctrl+N` |
| Quick switcher | `Ctrl+O` / `Ctrl+P` |
| Toggle edit / preview | `Ctrl+E` |
| Graph view | `Ctrl+G` |
| Focus search | `Ctrl+F` |
| Wikilink autocomplete | type `[[` |

## Run locally

```bash
npm start
# http://localhost:3000
```

No dependencies — Node 18+ only.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `./data` | Where `vault.json` is stored |
| `VAULT_TOKEN` | *(unset)* | If set, all `/api` requests must send this token (`X-Vault-Token` header). The app and capture form prompt for it once and remember it. **Set this if the server is public** — otherwise anyone with the URL can read/write your notes. |

## API

| Route | Does |
|---|---|
| `GET /api/vault` | Full vault (`{notes, deleted}`) |
| `PUT /api/vault` | Merge a client vault into the server's, returns the merged result |
| `POST /api/notes` | Create a note (`{content, title?, type?}`) — used by quick capture |
| `GET /api/tags` | Tag counts across the vault |

## Deploy

Any Node host works. Railway: New Project → Deploy from GitHub repo → Generate Domain; it auto-detects Node and runs `npm start`. **Attach a volume mounted at `/app/data`** (or set `DATA_DIR` to the volume path) so the vault survives redeploys, and set `VAULT_TOKEN`.

## Code layout

```
server.js               static file server + JSON sync API (data/vault.json)
public/
  index.html            app shell: sidebar, editor, graph, panels, switcher
  capture.html          📱 quick-capture form for fleeting notes
  manifest.webmanifest  PWA manifest so /capture installs to a home screen
  css/style.css         Obsidian-like dark theme
  js/store.js           vault model, localStorage cache, sync engine, seed notes
  js/markdown.js        markdown renderer with wikilinks/tags/tasks extensions
  js/graph.js           force-directed graph view (canvas)
  js/app.js             UI controller: views, autocomplete, switcher, shortcuts
  js/capture.js         capture form logic + offline queue
```

## Ideas for later

- Unlinked mentions in the backlinks panel.
- Local graph (neighbors of the current note only).
- Daily notes & templates.
- Share-target PWA so the phone's share sheet can send text straight to /capture.
