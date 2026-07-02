# Zettel 🗃️

An online, Obsidian-style note-taking app built around the **Zettelkasten** method — runs entirely in the browser, zero dependencies.

## Features

- **Markdown editor with live preview** — headings, bold/italic, `code`, fenced code blocks, quotes, lists, task lists (click to toggle), ==highlights==, tags.
- **`[[Wikilinks]]`** — type `[[` for autocomplete; `[[Title|alias]]` supported; links to notes that don't exist yet are shown dashed and are created on click (exactly like Obsidian).
- **Backlinks & outgoing links panel** — see every note that references the open note, with the surrounding context.
- **Graph view** — force-directed graph of the whole vault on canvas: drag nodes, scroll to zoom, click to open a note.
- **Zettelkasten note types** — 🌱 Fleeting · 📖 Literature · 🧠 Permanent · 🗺️ Index, color-coded in the list and the graph, with sidebar filters that double as a processing inbox.
- **Zettel IDs** — every note gets a permanent Luhmann-style timestamp ID (`YYYYMMDDHHMM`) that never changes even when the title does.
- **Quick switcher** (`Ctrl+O`) — jump to any note or create one by name.
- **Search + #tags** — full-text sidebar search, clickable tags with counts.
- **Local-first** — the vault lives in `localStorage`; export/import the whole vault as JSON, export single notes as `.md`.
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

## Deploy

Any static/Node host works (Railway, Render, Vercel…). Railway: New Project → Deploy from GitHub repo → Generate Domain. It auto-detects Node and runs `npm start`.

## Code layout

```
server.js            zero-dependency static file server
public/
  index.html         app shell: sidebar, editor, graph, panels, switcher
  css/style.css      Obsidian-like dark theme
  js/store.js        vault persistence, note model, link/tag extraction, seed notes
  js/markdown.js     markdown renderer with wikilinks/tags/tasks extensions
  js/graph.js        force-directed graph view (canvas)
  js/app.js          UI controller: views, autocomplete, switcher, shortcuts
```

## Ideas for later

- Sync across devices (needs a backend + auth).
- Unlinked mentions in the backlinks panel.
- Local graph (neighbors of the current note only).
- Daily notes & templates.
