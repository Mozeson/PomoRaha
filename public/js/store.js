// Store: vault persistence (localStorage), note model, link/tag extraction.
// Note: { id, title, content, type, created, modified }
// Zettel ID = timestamp YYYYMMDDHHMM (+a/b/c… on collision), the classic
// Luhmann-style unique address that never changes even if the title does.
const Store = (() => {
  const KEY = 'zettel.vault.v1';
  const TYPES = ['fleeting', 'literature', 'permanent', 'index'];
  let vault = null;

  function now() { return Date.now(); }

  function makeId(date) {
    const d = date ? new Date(date) : new Date();
    const p = (n) => String(n).padStart(2, '0');
    let base = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
    let id = base, suffix = 0;
    while (vault.notes[id]) {
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
        return;
      }
    } catch (e) { /* fall through to seed */ }
    vault = { notes: {} };
    seed();
    save();
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(vault));
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
    save();
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
    }
    save();
  }

  function reset() {
    vault = { notes: {} };
    seed();
    save();
  }

  // --- Seed vault: a self-explaining Zettelkasten starter --------------------

  function seed() {
    const t0 = now();
    const add = (id, title, type, content, ageMin) => {
      vault.notes[id] = { id, title, content, type, created: t0 - ageMin * 60000, modified: t0 - ageMin * 60000 };
    };

    add('202601010900', 'Start Here', 'index',
`Welcome to **Zettel** — an online, Obsidian-style note tool built around the **Zettelkasten** method.

This vault is an *index note*: an entry point into a web of ideas. Everything lives in your browser (localStorage) — use *Export vault* from the ⋯ menu to back it up.

## The method in one breath
Capture → distill → connect. See [[The Zettelkasten Method]].

## The three note types
1. [[Fleeting Notes]] — 🌱 quick captures, meant to be processed and deleted.
2. [[Literature Notes]] — 📖 what a source said, in your own words.
3. [[Permanent Notes]] — 🧠 one atomic idea, fully your own, densely linked.

## How to work in this app
See [[How to use this app]] for shortcuts, linking, tags and the graph.

#index #zettelkasten`, 50);

    add('202601010905', 'The Zettelkasten Method', 'permanent',
`The Zettelkasten ("slip box") is Niklas Luhmann's system for thinking in writing. Its power comes from three constraints:

1. **Atomicity** — each note holds exactly *one* idea. If you wrote "and also…", split it.
2. **Autonomy** — each note must make sense on its own, without the source or the note next to it.
3. **Connectivity** — a note earns its place by being linked. An unlinked note is a dead end.

> A note is only as valuable as the network of connections it sits in.

The workflow: capture [[Fleeting Notes]] all day, turn sources into [[Literature Notes]], then distill both into [[Permanent Notes]] and *link them where they belong*. Navigation happens through [[Start Here|index notes]] and follow-the-link exploration — not folders.

#zettelkasten #method`, 45);

    add('202601010910', 'Fleeting Notes', 'fleeting',
`🌱 A fleeting note is a **quick capture**: a thought in the shower, a sentence overheard, a hunch.

- Write it fast, don't polish.
- Within a day or two, either turn it into a [[Permanent Notes|permanent note]] or delete it.
- The inbox must reach zero — fleeting notes are *fuel*, not storage.

Use the **Fleeting** filter in the sidebar as your processing inbox.

#zettelkasten #workflow`, 40);

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

#zettelkasten #reading`, 35);

    add('202601010920', 'Permanent Notes', 'permanent',
`🧠 The heart of the system. A permanent note is **one idea, in your own words, written for your future self**.

Checklist before saving:
- [ ] Is it exactly one idea? ([[The Zettelkasten Method|atomicity]])
- [ ] Would it make sense in five years with no context?
- [ ] Is it linked to at least one existing note?
- [ ] Did I say *why* it matters, not just *what* it is?

When a cluster of permanent notes grows, promote a [[Start Here|new index note]] to map it.

#zettelkasten #method`, 30);

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

## Seeing the shape of your thinking
- **Ctrl+G** opens the graph view: every note is a node, every link an edge. Drag nodes, scroll to zoom, click to open.

#howto`, 25);
  }

  return {
    load, save, all, get, findByTitle, create, update, remove,
    extractLinkTargets, extractTags, outgoing, backlinks, allTags, graphData,
    exportJSON, importJSON, reset, TYPES,
  };
})();
