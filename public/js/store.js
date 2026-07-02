// Store: vault model + localStorage cache + background sync with the server.
// Note: { id, title, content, type, created, modified }
// Zettel ID = timestamp YYYYMMDDHHMM (+a/b/c… on collision), the classic
// Luhmann-style unique address that never changes even if the title does.
//
// Sync model: the server keeps the canonical vault; this client keeps a full
// copy in localStorage so it works offline. Both sides merge with
// last-write-wins per note, and deletions carry tombstones in vault.deleted
// so they propagate across devices.
const Store = (() => {
  const KEY = 'zettel.vault.v1';
  const TOKEN_KEY = 'zettel.token';
  const TYPES = ['fleeting', 'literature', 'permanent', 'index'];
  let vault = null;
  let loaded = false;
  let pushTimer = null;
  let syncing = false;
  let onStatusCb = () => {};
  let onRemoteChangeCb = () => {};

  function now() { return Date.now(); }

  function makeId(date) {
    const d = date ? new Date(date) : new Date();
    const p = (n) => String(n).padStart(2, '0');
    let base = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
    let id = base, suffix = 0;
    while (vault.notes[id] || vault.deleted[id]) {
      suffix++;
      id = base + String.fromCharCode(96 + suffix); // a, b, c…
    }
    return id;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        vault = JSON.parse(raw);
        if (!vault || typeof vault.notes !== 'object') throw new Error('bad vault');
        vault.deleted = vault.deleted || {};
        loaded = true;
        return;
      }
    } catch (e) { /* fall through to seed */ }
    vault = { notes: {}, deleted: {} };
    seed();
    loaded = true;
    save();
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(vault));
    if (loaded) schedulePush();
  }

  function all() {
    return Object.values(vault.notes);
  }

  function get(id) {
    return vault.notes[id] || null;
  }

  function findByTitle(title) {
    const t = String(title).trim().toLowerCase();
    return all().find((n) => n.title.trim().toLowerCase() === t) || vault.notes[title] || null;
  }

  function create({ title = '', content = '', type = 'fleeting' } = {}) {
    const id = makeId();
    const note = { id, title, content, type, created: now(), modified: now() };
    vault.notes[id] = note;
    save();
    return note;
  }

  function update(id, patch) {
    const note = vault.notes[id];
    if (!note) return null;
    Object.assign(note, patch, { modified: now() });
    save();
    return note;
  }

  function remove(id) {
    delete vault.notes[id];
    vault.deleted[id] = now();
    save();
  }

  // --- Sync ------------------------------------------------------------------

  function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t || ''); }

  function onStatus(cb) { onStatusCb = cb; }
  function onRemoteChange(cb) { onRemoteChangeCb = cb; }

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Vault-Token': getToken(),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { const e = new Error('unauthorized'); e.unauthorized = true; throw e; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // Merge a remote vault into ours (LWW + tombstones). Returns true if
  // anything local changed as a result.
  function mergeRemote(remote) {
    let changed = false;
    const rNotes = (remote && remote.notes) || {};
    const rDeleted = (remote && remote.deleted) || {};

    for (const [id, ts] of Object.entries(rDeleted)) {
      const t = Number(ts) || 0;
      if (!vault.deleted[id] || t > vault.deleted[id]) vault.deleted[id] = t;
    }
    for (const [id, n] of Object.entries(rNotes)) {
      if (!n || typeof n !== 'object') continue;
      const cur = vault.notes[id];
      const mod = Number(n.modified) || 0;
      if (!cur || mod > (cur.modified || 0)) {
        vault.notes[id] = {
          id,
          title: String(n.title || ''),
          content: String(n.content || ''),
          type: TYPES.includes(n.type) ? n.type : 'fleeting',
          created: Number(n.created) || now(),
          modified: mod || now(),
        };
        changed = true;
      }
      if (vault.deleted[id] && mod > vault.deleted[id]) delete vault.deleted[id];
    }
    for (const [id, ts] of Object.entries(vault.deleted)) {
      if (vault.notes[id] && ts >= (vault.notes[id].modified || 0)) {
        delete vault.notes[id];
        changed = true;
      }
    }
    return changed;
  }

  // Full round trip: pull remote, merge, push merged, adopt server's answer.
  async function sync() {
    if (syncing) return;
    syncing = true;
    onStatusCb('syncing');
    try {
      const remote = await api('GET', '/api/vault');
      let changed = mergeRemote(remote);
      const merged = await api('PUT', '/api/vault', vault);
      changed = mergeRemote(merged) || changed;
      localStorage.setItem(KEY, JSON.stringify(vault)); // save without re-scheduling a push
      onStatusCb('synced');
      if (changed) onRemoteChangeCb();
    } catch (e) {
      onStatusCb(e.unauthorized ? 'unauthorized' : 'offline');
    } finally {
      syncing = false;
    }
  }

  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(sync, 2000);
  }

  // --- Link & tag extraction -------------------------------------------------

  // Returns raw wikilink targets in a note's content: [[Target]] or [[Target|alias]]
  function extractLinkTargets(content) {
    const out = [];
    const re = /\[\[([^\]\[|\n]+)(?:\|[^\]\[\n]*)?\]\]/g;
    let m;
    while ((m = re.exec(content || ''))) out.push(m[1].trim());
    return out;
  }

  // Resolved outgoing links (note objects) for a note id.
  function outgoing(id) {
    const note = get(id);
    if (!note) return [];
    const seen = new Set();
    const out = [];
    for (const target of extractLinkTargets(note.content)) {
      const dest = findByTitle(target);
      if (dest && dest.id !== id && !seen.has(dest.id)) {
        seen.add(dest.id);
        out.push(dest);
      }
    }
    return out;
  }

  // Notes whose content links to the given note id.
  function backlinks(id) {
    const note = get(id);
    if (!note) return [];
    return all().filter((n) => n.id !== id && outgoing(n.id).some((d) => d.id === id));
  }

  function extractTags(content) {
    const out = new Set();
    const re = /(^|[\s(>])#([\p{L}\p{N}_\/-]+)/gu;
    let m;
    while ((m = re.exec(content || ''))) out.add(m[2]);
    return [...out];
  }

  function allTags() {
    const counts = {};
    for (const n of all()) {
      for (const t of extractTags(n.content)) counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }

  // Full graph: nodes + resolved edges.
  function graphData() {
    const nodes = all();
    const edges = [];
    for (const n of nodes) {
      for (const dest of outgoing(n.id)) edges.push({ source: n.id, target: dest.id });
    }
    return { nodes, edges };
  }

  // --- Import / export -------------------------------------------------------

  function exportJSON() {
    return JSON.stringify(vault, null, 2);
  }

  function importJSON(json) {
    const data = JSON.parse(json);
    if (!data || typeof data.notes !== 'object') throw new Error('Not a valid vault file');
    for (const [id, n] of Object.entries(data.notes)) {
      if (!n || typeof n.content !== 'string') throw new Error('Not a valid vault file');
      vault.notes[id] = {
        id,
        title: String(n.title || ''),
        content: n.content,
        type: TYPES.includes(n.type) ? n.type : 'fleeting',
        created: n.created || now(),
        modified: n.modified || now(),
      };
      delete vault.deleted[id];
    }
    save();
  }

  function reset() {
    for (const id of Object.keys(vault.notes)) vault.deleted[id] = now();
    vault.notes = {};
    seed(true); // force: revive seed notes with fresh timestamps
    save();
  }

  // --- Seed vault: a self-explaining Zettelkasten starter --------------------

  function seed(force = false) {
    // Fixed timestamps (matching the fixed IDs) so a fresh device seeding the
    // same notes merges cleanly with a server where they were edited/deleted.
    const add = (id, title, type, content, minute) => {
      let ts = Date.UTC(2026, 0, 1, 9, minute);
      if (vault.deleted[id]) {
        if (!force) return; // was deleted on another device — stay deleted
        delete vault.deleted[id];
        ts = now();
      }
      vault.notes[id] = { id, title, content, type, created: ts, modified: ts };
    };

    add('202601010900', 'Start Here', 'index',
`Welcome to **Zettel** — an online, Obsidian-style note tool built around the **Zettelkasten** method.

This vault is an *index note*: an entry point into a web of ideas. Notes sync to the server and are cached in your browser, so you can read and write offline.

## The method in one breath
Capture → distill → connect. See [[The Zettelkasten Method]].

## The three note types
1. [[Fleeting Notes]] — 🌱 quick captures, meant to be processed and deleted.
2. [[Literature Notes]] — 📖 what a source said, in your own words.
3. [[Permanent Notes]] — 🧠 one atomic idea, fully your own, densely linked.

## Capture on the go
Open **/capture** on your phone (🌱 button in the sidebar) for a quick fleeting-note form. Add it to your home screen for one-tap capture.

## How to work in this app
See [[How to use this app]] for shortcuts, linking, tags and the graph.

#index #zettelkasten`, 0);

    add('202601010905', 'The Zettelkasten Method', 'permanent',
`The Zettelkasten ("slip box") is Niklas Luhmann's system for thinking in writing. Its power comes from three constraints:

1. **Atomicity** — each note holds exactly *one* idea. If you wrote "and also…", split it.
2. **Autonomy** — each note must make sense on its own, without the source or the note next to it.
3. **Connectivity** — a note earns its place by being linked. An unlinked note is a dead end.

> A note is only as valuable as the network of connections it sits in.

The workflow: capture [[Fleeting Notes]] all day, turn sources into [[Literature Notes]], then distill both into [[Permanent Notes]] and *link them where they belong*. Navigation happens through [[Start Here|index notes]] and follow-the-link exploration — not folders.

#zettelkasten #method`, 5);

    add('202601010910', 'Fleeting Notes', 'fleeting',
`🌱 A fleeting note is a **quick capture**: a thought in the shower, a sentence overheard, a hunch.

- Write it fast, don't polish. On your phone, use the [[Start Here|/capture]] form.
- Within a day or two, either turn it into a [[Permanent Notes|permanent note]] or delete it.
- The inbox must reach zero — fleeting notes are *fuel*, not storage.

Use the **Fleeting** filter in the sidebar as your processing inbox.

#zettelkasten #workflow`, 10);

    add('202601010915', 'Literature Notes', 'literature',
`📖 A literature note answers: *what did this source say that I don't want to lose?*

- One note per source (book, paper, video, conversation).
- Write **in your own words** — copying is not understanding.
- Keep a reference to the source at the bottom.
- Later, mine it for [[Permanent Notes]].

Example structure:

\`\`\`
Key claims…
My questions…
---
Source: Ahrens, "How to Take Smart Notes" (2017)
\`\`\`

#zettelkasten #reading`, 15);

    add('202601010920', 'Permanent Notes', 'permanent',
`🧠 The heart of the system. A permanent note is **one idea, in your own words, written for your future self**.

Checklist before saving:
- [ ] Is it exactly one idea? ([[The Zettelkasten Method|atomicity]])
- [ ] Would it make sense in five years with no context?
- [ ] Is it linked to at least one existing note?
- [ ] Did I say *why* it matters, not just *what* it is?

When a cluster of permanent notes grows, promote a [[Start Here|new index note]] to map it.

#zettelkasten #method`, 20);

    add('202601010925', 'How to use this app', 'permanent',
`Practical guide to this tool.

## Linking
- Type \`[[\` in the editor to link — an autocomplete list appears.
- \`[[Title|shown text]]\` renders an alias.
- Links to notes that don't exist yet show dashed; clicking them creates the note.
- **Backlinks** and **outgoing links** for the open note live in the right panel.

## Finding things
- **Ctrl+O** — quick switcher (type to jump, or create a new note by name).
- **Ctrl+F** focuses sidebar search; filter chips narrow by note type.
- Click any #tag to filter by it.

## Writing
- Markdown: headings, **bold**, *italic*, ==highlight==, \`code\`, lists, quotes, task lists.
- **Ctrl+E** toggles edit / preview. **Ctrl+N** creates a note.

## Capturing on the go
- Open **/capture** on your phone — a one-screen form that files 🌱 fleeting notes straight into the vault, even offline.

## Seeing the shape of your thinking
- **Ctrl+G** opens the graph view: every note is a node, every link an edge. Drag nodes, scroll to zoom, click to open.

#howto`, 25);
  }

  return {
    load, save, all, get, findByTitle, create, update, remove,
    extractLinkTargets, extractTags, outgoing, backlinks, allTags, graphData,
    exportJSON, importJSON, reset, TYPES,
    sync, onStatus, onRemoteChange, getToken, setToken,
  };
})();
