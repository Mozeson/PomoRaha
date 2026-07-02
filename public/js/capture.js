// Quick capture: posts a fleeting note to the vault. If the network is down,
// the note is queued in localStorage and flushed when the connection returns.
(() => {
  const QUEUE_KEY = 'zettel.capture.queue';
  const TOKEN_KEY = 'zettel.token';

  const idea = document.getElementById('idea');
  const saveBtn = document.getElementById('save');
  const tagsRow = document.getElementById('tags');
  const statusEl = document.getElementById('status');
  const queueBadge = document.getElementById('queue-badge');
  const toast = document.getElementById('toast');
  let toastTimer = null;

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  function getQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; } catch (e) { return []; }
  }
  function setQueue(q) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    queueBadge.textContent = q.length ? ` · ${q.length} queued offline` : '';
  }

  async function post(content) {
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Vault-Token': localStorage.getItem(TOKEN_KEY) || '',
      },
      body: JSON.stringify({ content, type: 'fleeting' }),
    });
    if (res.status === 401) {
      const token = prompt('This vault requires an access token:');
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
        return post(content);
      }
      throw Object.assign(new Error('unauthorized'), { unauthorized: true });
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  let flushing = false;
  async function flushQueue() {
    if (flushing) return; // e.g. 'online' event firing twice
    flushing = true;
    try {
      let q = getQueue();
      while (q.length) {
        try {
          await post(q[0].content);
          q.shift();
          setQueue(q);
        } catch (e) {
          return; // still offline (or unauthorized) — try again later
        }
      }
    } finally {
      flushing = false;
    }
  }

  async function capture() {
    const content = idea.value.trim();
    if (!content) return;
    saveBtn.disabled = true;
    try {
      await post(content);
      showToast('Captured 🌱');
      idea.value = '';
      flushQueue();
    } catch (e) {
      if (e.unauthorized) {
        showToast('Token required — not saved');
      } else {
        const q = getQueue();
        q.push({ content, ts: Date.now() });
        setQueue(q);
        showToast('Offline — queued, will sync');
        idea.value = '';
      }
    } finally {
      saveBtn.disabled = false;
      if (navigator.vibrate) navigator.vibrate(25);
      idea.focus();
    }
  }

  async function loadTags() {
    try {
      const res = await fetch('/api/tags', {
        headers: { 'X-Vault-Token': localStorage.getItem(TOKEN_KEY) || '' },
      });
      if (!res.ok) return;
      const tags = await res.json();
      for (const [tag] of tags.slice(0, 12)) {
        const b = document.createElement('button');
        b.textContent = `#${tag}`;
        b.addEventListener('click', () => {
          const sep = idea.value && !/\s$/.test(idea.value) ? ' ' : '';
          idea.value += `${sep}#${tag}`;
          idea.focus();
        });
        tagsRow.appendChild(b);
      }
    } catch (e) { /* offline: no tag chips, capture still works via the queue */ }
  }

  saveBtn.addEventListener('click', capture);
  idea.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); capture(); }
  });
  window.addEventListener('online', flushQueue);

  setQueue(getQueue()); // render badge
  flushQueue();
  loadTags();
  idea.focus();

  if (!navigator.onLine) statusEl.textContent = 'Offline — captures are queued locally.';
})();
