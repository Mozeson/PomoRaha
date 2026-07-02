// Zettel server: static files + zero-dependency JSON API for vault sync.
// Vault is persisted to DATA_DIR/vault.json (atomic writes).
// Set VAULT_TOKEN to require an X-Vault-Token header on all /api requests.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const VAULT_FILE = path.join(DATA_DIR, 'vault.json');
const TOKEN = process.env.VAULT_TOKEN || '';
const MAX_BODY = 10 * 1024 * 1024;
const TYPES = ['fleeting', 'literature', 'permanent', 'index'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// --------------------------------------------------------------- vault state

let vault = loadVault();

function loadVault() {
  try {
    const v = JSON.parse(fs.readFileSync(VAULT_FILE, 'utf8'));
    if (!v || typeof v.notes !== 'object') throw new Error('bad vault');
    v.deleted = v.deleted || {};
    return v;
  } catch (e) {
    return { notes: {}, deleted: {} };
  }
}

function saveVault() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = VAULT_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(vault));
  fs.renameSync(tmp, VAULT_FILE);
}

function sanitizeNote(id, n) {
  return {
    id,
    title: String(n.title || '').slice(0, 300),
    content: String(n.content || ''),
    type: TYPES.includes(n.type) ? n.type : 'fleeting',
    created: Number(n.created) || Date.now(),
    modified: Number(n.modified) || Date.now(),
  };
}

// Last-write-wins merge with delete tombstones. Mutates and returns `base`.
function mergeVaults(base, incoming) {
  const inNotes = (incoming && incoming.notes) || {};
  const inDeleted = (incoming && incoming.deleted) || {};

  for (const [id, ts] of Object.entries(inDeleted)) {
    const t = Number(ts) || 0;
    if (!base.deleted[id] || t > base.deleted[id]) base.deleted[id] = t;
  }
  for (const [id, n] of Object.entries(inNotes)) {
    if (!n || typeof n !== 'object') continue;
    const cur = base.notes[id];
    const mod = Number(n.modified) || 0;
    if (!cur || mod > (cur.modified || 0)) base.notes[id] = sanitizeNote(id, n);
    if (base.deleted[id] && mod > base.deleted[id]) delete base.deleted[id];
  }
  for (const [id, ts] of Object.entries(base.deleted)) {
    if (base.notes[id] && ts >= (base.notes[id].modified || 0)) delete base.notes[id];
  }
  return base;
}

function makeId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const base = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
  let id = base, suffix = 0;
  while (vault.notes[id] || vault.deleted[id]) {
    suffix++;
    id = base + String.fromCharCode(96 + suffix);
  }
  return id;
}

function extractTags(content) {
  const out = {};
  const re = /(^|[\s(>])#([\p{L}\p{N}_\/-]+)/gu;
  let m;
  while ((m = re.exec(content || ''))) out[m[2]] = (out[m[2]] || 0) + 1;
  return out;
}

// --------------------------------------------------------------- http helpers

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(body);
}

function authorized(req, url) {
  if (!TOKEN) return true;
  const given = req.headers['x-vault-token'] || url.searchParams.get('token') || '';
  const a = Buffer.from(String(given));
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// --------------------------------------------------------------- api routes

async function handleApi(req, res, url) {
  if (!authorized(req, url)) return json(res, 401, { error: 'invalid or missing token' });
  const route = `${req.method} ${url.pathname}`;

  if (route === 'GET /api/vault') {
    return json(res, 200, vault);
  }

  if (route === 'PUT /api/vault') {
    let incoming;
    try {
      incoming = JSON.parse(await readBody(req));
      if (!incoming || typeof incoming.notes !== 'object') throw new Error('missing notes');
    } catch (e) {
      return json(res, 400, { error: 'invalid vault JSON: ' + e.message });
    }
    mergeVaults(vault, incoming);
    saveVault();
    return json(res, 200, vault);
  }

  if (route === 'POST /api/notes') {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (e) {
      return json(res, 400, { error: 'invalid JSON' });
    }
    const content = String(body.content || '').trim();
    if (!content) return json(res, 400, { error: 'content is required' });
    let title = String(body.title || '').trim();
    if (!title) {
      // Derive a title from the first line, minus markdown noise.
      title = content.split('\n')[0].replace(/^[#>\-*\s\[\]]+/, '').slice(0, 80).trim();
    }
    const note = sanitizeNote(makeId(), {
      title, content,
      type: body.type,
      created: Date.now(),
      modified: Date.now(),
    });
    vault.notes[note.id] = note;
    saveVault();
    return json(res, 201, note);
  }

  if (route === 'GET /api/tags') {
    const counts = {};
    for (const n of Object.values(vault.notes)) {
      for (const [t, c] of Object.entries(extractTags(n.content))) counts[t] = (counts[t] || 0) + c;
    }
    return json(res, 200, Object.entries(counts).sort((a, b) => b[1] - a[1]));
  }

  return json(res, 404, { error: 'unknown api route' });
}

// --------------------------------------------------------------- server

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const urlPath = decodeURIComponent(url.pathname);

  if (urlPath.startsWith('/api/')) {
    handleApi(req, res, url).catch((e) => json(res, 500, { error: e.message }));
    return;
  }

  let filePath = path.normalize(path.join(ROOT, urlPath));

  // Prevent path traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  if (urlPath === '/capture') {
    filePath = path.join(ROOT, 'capture.html');
  } else if (urlPath === '/' || !path.extname(filePath)) {
    filePath = path.join(ROOT, 'index.html');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Zettel running on port ${PORT} (data: ${VAULT_FILE}${TOKEN ? ', token auth on' : ''})`);
});
