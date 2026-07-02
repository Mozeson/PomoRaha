// App controller: wires store + markdown + graph to the UI.
(() => {
  const $ = (sel) => document.querySelector(sel);

  const el = {
    sidebar: $('#sidebar'),
    noteList: $('#note-list'),
    search: $('#search-input'),
    typeFilters: $('#type-filters'),
    tagList: $('#tag-list'),
    noteView: $('#note-view'),
    graphView: $('#graph-view'),
    emptyView: $('#empty-view'),
    title: $('#note-title'),
    type: $('#note-type'),
    id: $('#note-id'),
    dates: $('#note-dates'),
    editor: $('#editor'),
    preview: $('#preview'),
    autocomplete: $('#autocomplete'),
    backlinks: $('#backlinks'),
    outlinks: $('#outlinks'),
    backlinkCount: $('#backlink-count'),
    outlinkCount: $('#outlink-count'),
    statusCounts: $('#status-counts'),
    vaultMenu: $('#vault-menu'),
    switcherOverlay: $('#switcher-overlay'),
    switcherInput: $('#switcher-input'),
    switcherResults: $('#switcher-results'),
    importFile: $('#import-file'),
    modeBtn: $('#btn-mode'),
    syncStatus: $('#sync-status'),
  };

  const state = {
    currentId: null,
    mode: 'edit',          // 'edit' | 'preview'
    view: 'note',          // 'note' | 'graph'
    filterType: 'all',
    filterTag: null,
    query: '',
    saveTimer: null,
  };

  const TYPE_ICONS = { fleeting: '🌱', literature: '📖', permanent: '🧠', index: '🗺️' };

  // ---------------------------------------------------------------- helpers

  function fmtDate(ts) {
    return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function debounceSave() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(commitEditor, 400);
  }

  function commitEditor() {
    clearTimeout(state.saveTimer);
    const note = Store.get(state.currentId);
    if (!note) return;
    if (note.content !== el.editor.value || note.title !== el.title.value) {
      Store.update(note.id, { content: el.editor.value, title: el.title.value });
      renderSidebar();
      renderLinksPanel();
      renderStatus();
    }
  }

  // ---------------------------------------------------------------- note view

  function openNote(id, { focusTitle = false } = {}) {
    commitEditor();
    const note = Store.get(id);
    state.currentId = note ? id : null;
    state.view = 'note';
    updateViews();
    if (!note) { renderSidebar(); return; }

    el.title.value = note.title;
    el.type.value = note.type;
    el.editor.value = note.content;
    el.id.textContent = note.id;
    el.dates.textContent = `created ${fmtDate(note.created)} · edited ${fmtDate(note.modified)}`;
    setMode(note.content && !focusTitle ? state.mode : 'edit');
    renderPreview();
    renderSidebar();
    renderLinksPanel();
    renderStatus();
    if (window.innerWidth < 720) el.sidebar.classList.add('collapsed');
    if (focusTitle) el.title.focus();
  }

  function updateViews() {
    const hasNote = !!Store.get(state.currentId);
    el.graphView.classList.toggle('hidden', state.view !== 'graph');
    el.noteView.classList.toggle('hidden', state.view !== 'note' || !hasNote);
    el.emptyView.classList.toggle('hidden', state.view !== 'note' || hasNote);
    if (state.view === 'graph') {
      Graph.start(Store.graphData());
    } else {
      Graph.stop();
    }
  }

  function setMode(mode) {
    state.mode = mode;
    const editing = mode === 'edit';
    el.editor.classList.toggle('hidden', !editing);
    el.preview.classList.toggle('hidden', editing);
    el.modeBtn.textContent = editing ? '👁' : '✎';
    el.modeBtn.title = editing ? 'Preview (Ctrl+E)' : 'Edit (Ctrl+E)';
    if (!editing) renderPreview();
  }

  function renderPreview() {
    el.preview.innerHTML = Markdown.render(el.editor.value);
  }

  function createNote(attrs = {}) {
    commitEditor();
    const note = Store.create(attrs);
    state.mode = 'edit';
    openNote(note.id, { focusTitle: !attrs.title });
    if (attrs.title) el.editor.focus();
    return note;
  }

  function deleteCurrent() {
    const note = Store.get(state.currentId);
    if (!note) return;
    const name = note.title || 'Untitled';
    if (!confirm(`Delete "${name}"? Links pointing to it will show as unresolved.`)) return;
    Store.remove(note.id);
    state.currentId = null;
    const rest = sortedNotes();
    if (rest.length) openNote(rest[0].id);
    else { updateViews(); renderSidebar(); renderStatus(); }
  }

  // ---------------------------------------------------------------- sidebar

  function sortedNotes() {
    return Store.all().sort((a, b) => b.modified - a.modified);
  }

  function filteredNotes() {
    const q = state.query.trim().toLowerCase();
    return sortedNotes().filter((n) => {
      if (state.filterType !== 'all' && n.type !== state.filterType) return false;
      if (state.filterTag && !Store.extractTags(n.content).includes(state.filterTag)) return false;
      if (q && !(n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q) || n.id.includes(q))) return false;
      return true;
    });
  }

  function renderSidebar() {
    const notes = filteredNotes();
    el.noteList.innerHTML = '';
    for (const n of notes) {
      const item = document.createElement('div');
      item.className = 'note-item' + (n.id === state.currentId ? ' active' : '');
      item.dataset.id = n.id;
      const excerpt = n.content.replace(/[#>*`\[\]\-=]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 64);
      item.innerHTML =
        `<div class="note-item-title" dir="auto">${TYPE_ICONS[n.type] || ''} ${Markdown.escapeHtml(n.title || 'Untitled')}</div>` +
        `<div class="note-item-sub"><span class="zid">${n.id}</span>${excerpt ? ' · ' + Markdown.escapeHtml(excerpt) : ''}</div>`;
      item.addEventListener('click', () => openNote(n.id));
      el.noteList.appendChild(item);
    }
    if (!notes.length) {
      el.noteList.innerHTML = '<div class="note-list-empty">No notes match.</div>';
    }
    renderTags();
  }

  function renderTags() {
    el.tagList.innerHTML = '';
    for (const [tag, count] of Store.allTags()) {
      const b = document.createElement('button');
      b.className = 'tag-chip' + (state.filterTag === tag ? ' active' : '');
      b.textContent = `#${tag} (${count})`;
      b.addEventListener('click', () => {
        state.filterTag = state.filterTag === tag ? null : tag;
        renderSidebar();
      });
      el.tagList.appendChild(b);
    }
  }

  function renderStatus() {
    const notes = Store.all();
    const links = notes.reduce((s, n) => s + Store.outgoing(n.id).length, 0);
    const words = (el.editor.value.match(/\S+/g) || []).length;
    const cur = Store.get(state.currentId);
    el.statusCounts.textContent =
      `${notes.length} notes · ${links} links` + (cur ? ` · ${words} words` : '');
  }

  // ---------------------------------------------------------------- links panel

  function linkRow(note, snippet) {
    const div = document.createElement('div');
    div.className = 'link-row';
    div.innerHTML = `<div class="link-row-title" dir="auto">${TYPE_ICONS[note.type] || ''} ${Markdown.escapeHtml(note.title || 'Untitled')}</div>` +
      (snippet ? `<div class="link-row-snippet" dir="auto">${snippet}</div>` : '');
    div.addEventListener('click', () => openNote(note.id));
    return div;
  }

  function contextSnippet(content, targetNote) {
    const re = /\[\[([^\]\[|\n]+)(?:\|[^\]\[\n]*)?\]\]/g;
    let m;
    while ((m = re.exec(content))) {
      const dest = Store.findByTitle(m[1].trim());
      if (dest && dest.id === targetNote.id) {
        const start = Math.max(0, m.index - 40);
        const end = Math.min(content.length, m.index + m[0].length + 40);
        let snip = content.slice(start, end).replace(/\n/g, ' ');
        snip = Markdown.escapeHtml((start > 0 ? '…' : '') + snip + (end < content.length ? '…' : ''));
        return snip.replace(/\[\[([^\]\[|]+)(?:\|([^\]\[]*))?\]\]/g, (_, t, a) => `<b>${(a || t).trim()}</b>`);
      }
    }
    return '';
  }

  function renderLinksPanel() {
    const note = Store.get(state.currentId);
    el.backlinks.innerHTML = '';
    el.outlinks.innerHTML = '';
    if (!note) { el.backlinkCount.textContent = ''; el.outlinkCount.textContent = ''; return; }

    const back = Store.backlinks(note.id);
    el.backlinkCount.textContent = back.length;
    if (!back.length) el.backlinks.innerHTML = '<div class="link-pane-empty">Nothing links here yet. A Zettel grows by being referenced.</div>';
    for (const b of back) el.backlinks.appendChild(linkRow(b, contextSnippet(b.content, note)));

    const out = Store.outgoing(note.id);
    el.outlinkCount.textContent = out.length;
    if (!out.length) el.outlinks.innerHTML = '<div class="link-pane-empty">No outgoing links. Connect this idea with [[…]].</div>';
    for (const o of out) el.outlinks.appendChild(linkRow(o));
  }

  // ---------------------------------------------------------------- wikilink autocomplete

  const ac = { open: false, items: [], selected: 0, start: -1 };

  function checkAutocomplete() {
    const pos = el.editor.selectionStart;
    const text = el.editor.value.slice(0, pos);
    const m = text.match(/\[\[([^\]\[\n]*)$/);
    if (!m) return hideAutocomplete();
    ac.start = pos - m[1].length;
    const q = m[1].toLowerCase();
    ac.items = sortedNotes()
      .filter((n) => n.id !== state.currentId &&
        ((n.title || '').toLowerCase().includes(q) || n.id.includes(q)))
      .slice(0, 8);
    if (!ac.items.length && !q) return hideAutocomplete();
    ac.selected = 0;
    ac.open = true;
    renderAutocomplete(q);
  }

  function renderAutocomplete(q) {
    el.autocomplete.innerHTML = '';
    ac.items.forEach((n, i) => {
      const b = document.createElement('button');
      b.className = i === ac.selected ? 'selected' : '';
      b.innerHTML = `${TYPE_ICONS[n.type] || ''} ${Markdown.escapeHtml(n.title || n.id)}`;
      b.addEventListener('mousedown', (e) => { e.preventDefault(); pickAutocomplete(i); });
      el.autocomplete.appendChild(b);
    });
    if (q) {
      const b = document.createElement('button');
      b.className = 'create' + (ac.items.length === 0 ? ' selected' : '');
      b.textContent = `＋ Create "${q}"`;
      b.addEventListener('mousedown', (e) => { e.preventDefault(); pickAutocomplete(ac.items.length); });
      el.autocomplete.appendChild(b);
    }
    positionAutocomplete();
    el.autocomplete.classList.remove('hidden');
  }

  // Approximate caret position with a mirror div.
  function positionAutocomplete() {
    const mirror = document.createElement('div');
    const style = getComputedStyle(el.editor);
    for (const prop of ['fontSize', 'fontFamily', 'lineHeight', 'padding', 'width', 'letterSpacing', 'whiteSpace', 'wordWrap', 'boxSizing']) {
      mirror.style[prop] = style[prop];
    }
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';
    mirror.textContent = el.editor.value.slice(0, el.editor.selectionStart);
    const marker = document.createElement('span');
    marker.textContent = '​';
    mirror.appendChild(marker);
    el.editor.parentElement.appendChild(mirror);
    const top = marker.offsetTop - el.editor.scrollTop + parseFloat(style.lineHeight || 20) + 6;
    const left = Math.min(marker.offsetLeft, el.editor.clientWidth - 240);
    mirror.remove();
    el.autocomplete.style.top = `${Math.max(8, top)}px`;
    el.autocomplete.style.left = `${Math.max(8, left)}px`;
  }

  function pickAutocomplete(i) {
    const pos = el.editor.selectionStart;
    const typed = el.editor.value.slice(ac.start, pos);
    let insert;
    if (i < ac.items.length) {
      insert = ac.items[i].title || ac.items[i].id;
    } else {
      insert = typed.trim();
      if (!insert) return hideAutocomplete();
    }
    const after = el.editor.value.slice(pos);
    const closing = after.startsWith(']]') ? '' : ']]';
    el.editor.value = el.editor.value.slice(0, ac.start) + insert + closing + after;
    const newPos = ac.start + insert.length + (closing ? 2 : 2);
    el.editor.setSelectionRange(newPos, newPos);
    hideAutocomplete();
    el.editor.focus();
    debounceSave();
  }

  function hideAutocomplete() {
    ac.open = false;
    el.autocomplete.classList.add('hidden');
  }

  // ---------------------------------------------------------------- quick switcher

  const sw = { items: [], selected: 0 };

  function openSwitcher() {
    el.switcherOverlay.classList.remove('hidden');
    el.switcherInput.value = '';
    renderSwitcher('');
    el.switcherInput.focus();
  }

  function closeSwitcher() {
    el.switcherOverlay.classList.add('hidden');
  }

  function renderSwitcher(q) {
    const query = q.trim().toLowerCase();
    sw.items = sortedNotes().filter((n) =>
      !query || (n.title || '').toLowerCase().includes(query) || n.id.includes(query) ||
      n.content.toLowerCase().includes(query)
    ).slice(0, 12);
    sw.selected = 0;
    el.switcherResults.innerHTML = '';
    sw.items.forEach((n, i) => {
      const b = document.createElement('button');
      b.className = i === sw.selected ? 'selected' : '';
      b.innerHTML = `<span dir="auto">${TYPE_ICONS[n.type] || ''} ${Markdown.escapeHtml(n.title || 'Untitled')}</span><span class="zid">${n.id}</span>`;
      b.addEventListener('mousedown', (e) => { e.preventDefault(); pickSwitcher(i); });
      el.switcherResults.appendChild(b);
    });
    if (q.trim() && !sw.items.some((n) => (n.title || '').toLowerCase() === query)) {
      const b = document.createElement('button');
      b.className = 'create' + (sw.items.length === 0 ? ' selected' : '');
      b.textContent = `＋ Create "${q.trim()}"`;
      b.addEventListener('mousedown', (e) => { e.preventDefault(); pickSwitcher(sw.items.length); });
      el.switcherResults.appendChild(b);
    }
  }

  function pickSwitcher(i) {
    closeSwitcher();
    if (i < sw.items.length) openNote(sw.items[i].id);
    else {
      const title = el.switcherInput.value.trim();
      if (title) createNote({ title, type: 'fleeting' });
    }
  }

  function moveSelection(container, items, delta) {
    const sel = container === el.autocomplete ? ac : sw;
    const buttons = container.querySelectorAll('button');
    if (!buttons.length) return;
    sel.selected = (sel.selected + delta + buttons.length) % buttons.length;
    buttons.forEach((b, i) => b.classList.toggle('selected', i === sel.selected));
    buttons[sel.selected].scrollIntoView({ block: 'nearest' });
  }

  // ---------------------------------------------------------------- vault menu

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function handleVaultAction(action) {
    el.vaultMenu.classList.add('hidden');
    if (action === 'export-vault') {
      commitEditor();
      download(`zettel-vault-${new Date().toISOString().slice(0, 10)}.json`, Store.exportJSON(), 'application/json');
    } else if (action === 'import-vault') {
      el.importFile.click();
    } else if (action === 'export-note') {
      const n = Store.get(state.currentId);
      if (!n) return alert('No note open.');
      commitEditor();
      const cur = Store.get(n.id);
      download(`${(cur.title || cur.id).replace(/[\\/:*?"<>|]/g, '_')}.md`,
        `# ${cur.title || 'Untitled'}\n\n${cur.content}\n`, 'text/markdown');
    } else if (action === 'reset-vault') {
      if (confirm('Reset the vault? ALL notes will be replaced by the starter notes. Export first if unsure.')) {
        Store.reset();
        state.currentId = null;
        openNote(sortedNotes()[0].id);
      }
    }
  }

  // ---------------------------------------------------------------- wiring

  function bind() {
    // Sidebar
    $('#btn-new-note').addEventListener('click', () => createNote());
    $('#btn-empty-new').addEventListener('click', () => createNote());
    $('#btn-graph').addEventListener('click', toggleGraph);
    $('#btn-close-graph').addEventListener('click', toggleGraph);
    $('#btn-toggle-sidebar').addEventListener('click', () => el.sidebar.classList.toggle('collapsed'));

    el.search.addEventListener('input', () => { state.query = el.search.value; renderSidebar(); });
    el.typeFilters.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      state.filterType = chip.dataset.type;
      el.typeFilters.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
      renderSidebar();
    });

    // Vault menu
    $('#btn-vault-menu').addEventListener('click', (e) => {
      e.stopPropagation();
      el.vaultMenu.classList.toggle('hidden');
    });
    el.vaultMenu.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) handleVaultAction(b.dataset.action);
    });
    document.addEventListener('click', () => el.vaultMenu.classList.add('hidden'));
    el.importFile.addEventListener('change', () => {
      const f = el.importFile.files[0];
      if (!f) return;
      f.text().then((txt) => {
        try {
          Store.importJSON(txt);
          renderSidebar(); renderStatus();
          alert('Vault imported.');
        } catch (err) {
          alert('Import failed: ' + err.message);
        }
        el.importFile.value = '';
      });
    });

    // Note header
    el.title.addEventListener('input', debounceSave);
    el.title.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); el.editor.focus(); }
    });
    el.type.addEventListener('change', () => {
      const n = Store.get(state.currentId);
      if (n) { Store.update(n.id, { type: el.type.value }); renderSidebar(); }
    });
    el.modeBtn.addEventListener('click', () => setMode(state.mode === 'edit' ? 'preview' : 'edit'));
    $('#btn-delete').addEventListener('click', deleteCurrent);

    // Editor
    el.editor.addEventListener('input', () => { debounceSave(); checkAutocomplete(); renderStatus(); });
    el.editor.addEventListener('blur', () => setTimeout(hideAutocomplete, 150));
    el.editor.addEventListener('keydown', (e) => {
      if (ac.open) {
        if (e.key === 'ArrowDown') { e.preventDefault(); return moveSelection(el.autocomplete, ac.items, 1); }
        if (e.key === 'ArrowUp') { e.preventDefault(); return moveSelection(el.autocomplete, ac.items, -1); }
        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); return pickAutocomplete(ac.selected); }
        if (e.key === 'Escape') { e.stopPropagation(); return hideAutocomplete(); }
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = el.editor.selectionStart;
        el.editor.setRangeText('  ', s, el.editor.selectionEnd, 'end');
        debounceSave();
      }
    });

    // Preview interactions: wikilinks, tags, task checkboxes
    el.preview.addEventListener('click', (e) => {
      const link = e.target.closest('a.wikilink');
      if (link) {
        commitEditor();
        if (link.dataset.new === '1') {
          const note = Store.create({ title: link.dataset.target, type: 'fleeting' });
          openNote(note.id);
        } else {
          openNote(link.dataset.target);
        }
        return;
      }
      const tag = e.target.closest('a.tag-link');
      if (tag) {
        state.filterTag = tag.dataset.tag;
        el.sidebar.classList.remove('collapsed');
        renderSidebar();
        return;
      }
      const task = e.target.closest('input[data-task]');
      if (task) {
        el.editor.value = Markdown.toggleTask(el.editor.value, +task.dataset.task);
        commitEditor();
        renderPreview();
      }
    });

    // Switcher
    el.switcherInput.addEventListener('input', () => renderSwitcher(el.switcherInput.value));
    el.switcherInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(el.switcherResults, sw.items, 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(el.switcherResults, sw.items, -1); }
      else if (e.key === 'Enter') { e.preventDefault(); pickSwitcher(sw.selected); }
      else if (e.key === 'Escape') closeSwitcher();
    });
    el.switcherOverlay.addEventListener('click', (e) => {
      if (e.target === el.switcherOverlay) closeSwitcher();
    });

    // Global shortcuts
    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); createNote(); }
      else if (mod && (e.key.toLowerCase() === 'o' || e.key.toLowerCase() === 'p')) { e.preventDefault(); openSwitcher(); }
      else if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); if (state.view === 'note') setMode(state.mode === 'edit' ? 'preview' : 'edit'); }
      else if (mod && e.key.toLowerCase() === 'g') { e.preventDefault(); toggleGraph(); }
      else if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); el.sidebar.classList.remove('collapsed'); el.search.focus(); }
      else if (e.key === 'Escape') {
        if (!el.switcherOverlay.classList.contains('hidden')) closeSwitcher();
        else if (state.view === 'graph') toggleGraph();
      }
    });

    window.addEventListener('resize', () => { if (state.view === 'graph') Graph.resize(); });
    window.addEventListener('beforeunload', commitEditor);
  }

  function toggleGraph() {
    commitEditor();
    state.view = state.view === 'graph' ? 'note' : 'graph';
    updateViews();
  }

  // ---------------------------------------------------------------- sync

  function bindSync() {
    Store.onStatus((status) => {
      const time = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      if (status === 'syncing') el.syncStatus.textContent = '⟳ syncing…';
      else if (status === 'synced') el.syncStatus.textContent = `✓ synced ${time}`;
      else if (status === 'offline') el.syncStatus.textContent = '⚠ offline — saved locally';
      else if (status === 'unauthorized') el.syncStatus.textContent = '🔒 token required — click to enter';
      el.syncStatus.dataset.status = status;
    });

    Store.onRemoteChange(() => {
      renderSidebar();
      renderStatus();
      const n = Store.get(state.currentId);
      if (!n) {
        // current note was deleted on another device
        if (state.view === 'note') { state.currentId = null; updateViews(); }
        return;
      }
      const typing = document.activeElement === el.editor || document.activeElement === el.title;
      if (!typing && (el.editor.value !== n.content || el.title.value !== n.title)) {
        el.editor.value = n.content;
        el.title.value = n.title;
        el.type.value = n.type;
        el.dates.textContent = `created ${fmtDate(n.created)} · edited ${fmtDate(n.modified)}`;
        if (state.mode === 'preview') renderPreview();
        renderLinksPanel();
      }
      if (state.view === 'graph') Graph.start(Store.graphData());
    });

    el.syncStatus.addEventListener('click', () => {
      if (el.syncStatus.dataset.status === 'unauthorized') {
        const token = prompt('This vault requires an access token:');
        if (token) Store.setToken(token);
      }
      Store.sync();
    });

    Store.sync();
    setInterval(() => Store.sync(), 30000);
    window.addEventListener('focus', () => Store.sync());
    window.addEventListener('online', () => Store.sync());
  }

  // ---------------------------------------------------------------- boot

  Store.load();
  Markdown.setResolver((target) => Store.findByTitle(target));
  if (window.innerWidth < 720) el.sidebar.classList.add('collapsed');
  Graph.init($('#graph-canvas'), (id) => { state.view = 'note'; openNote(id); });
  bind();
  bindSync();

  const first = Store.findByTitle('Start Here') || sortedNotes()[0];
  if (first) {
    state.mode = 'preview';
    openNote(first.id);
  } else {
    updateViews();
    renderSidebar();
    renderStatus();
  }
})();
