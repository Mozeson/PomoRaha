// Force-directed graph of the vault, rendered on canvas.
// Supports pan (drag background), zoom (wheel), node drag, click-to-open.
const Graph = (() => {
  const COLORS = {
    fleeting: '#6cbf6c',
    literature: '#e0af68',
    permanent: '#9d7cd8',
    index: '#7aa2f7',
  };

  let canvas, ctx, onOpen;
  let nodes = [];        // {id, title, type, x, y, vx, vy, r, degree}
  let edges = [];        // {a, b} node refs
  let running = false;
  let alpha = 0;
  let scale = 1, ox = 0, oy = 0; // view transform
  let dragNode = null, panning = false, moved = false;
  let lastX = 0, lastY = 0;
  let hoverNode = null;
  let positions = {};    // remembered positions across rebuilds

  function init(canvasEl, openCallback) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    onOpen = openCallback;

    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', onTouch, { passive: false });
    canvas.addEventListener('touchmove', onTouch, { passive: false });
    canvas.addEventListener('touchend', onTouch);
  }

  function start(data) {
    resize();
    const byId = {};
    nodes = data.nodes.map((n, i) => {
      const saved = positions[n.id];
      const angle = (i / Math.max(1, data.nodes.length)) * Math.PI * 2;
      const node = {
        id: n.id, title: n.title || 'Untitled', type: n.type,
        x: saved ? saved.x : Math.cos(angle) * 150 + (Math.random() - 0.5) * 60,
        y: saved ? saved.y : Math.sin(angle) * 150 + (Math.random() - 0.5) * 60,
        vx: 0, vy: 0, degree: 0,
      };
      byId[n.id] = node;
      return node;
    });
    edges = data.edges
      .map((e) => ({ a: byId[e.source], b: byId[e.target] }))
      .filter((e) => e.a && e.b);
    for (const e of edges) { e.a.degree++; e.b.degree++; }
    for (const n of nodes) n.r = 5 + Math.min(9, n.degree * 1.6);

    if (!Object.keys(positions).length) { ox = canvas.width / 2; oy = canvas.height / 2; scale = 1; }
    alpha = 1;
    if (!running) { running = true; requestAnimationFrame(tick); }
  }

  function stop() {
    running = false;
    for (const n of nodes) positions[n.id] = { x: n.x, y: n.y };
  }

  function resize() {
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;
    if (!ox && !oy) { ox = canvas.width / 2; oy = canvas.height / 2; }
  }

  // --- physics ---------------------------------------------------------------

  function step() {
    const repulsion = 2600, springLen = 90, springK = 0.02, damping = 0.85;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy || 1;
        if (d2 > 250000) continue;
        const f = (repulsion / d2) * alpha;
        const d = Math.sqrt(d2);
        dx /= d; dy /= d;
        a.vx += dx * f; a.vy += dy * f;
        b.vx -= dx * f; b.vy -= dy * f;
      }
      // gentle pull to origin keeps disconnected clusters on screen
      a.vx -= a.x * 0.003 * alpha;
      a.vy -= a.y * 0.003 * alpha;
    }
    for (const e of edges) {
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - springLen) * springK * alpha;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      e.a.vx += fx; e.a.vy += fy;
      e.b.vx -= fx; e.b.vy -= fy;
    }
    for (const n of nodes) {
      if (n === dragNode) { n.vx = n.vy = 0; continue; }
      n.vx *= damping; n.vy *= damping;
      n.x += n.vx; n.y += n.vy;
    }
    alpha = Math.max(0.02, alpha * 0.995);
  }

  // --- rendering ---------------------------------------------------------------

  function tick() {
    if (!running) return;
    step();
    draw();
    requestAnimationFrame(tick);
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale * devicePixelRatio, 0, 0, scale * devicePixelRatio,
      ox * devicePixelRatio, oy * devicePixelRatio);

    ctx.strokeStyle = 'rgba(140,140,170,0.28)';
    ctx.lineWidth = 1 / scale;
    ctx.beginPath();
    for (const e of edges) {
      ctx.moveTo(e.a.x, e.a.y);
      ctx.lineTo(e.b.x, e.b.y);
    }
    ctx.stroke();

    const fontPx = Math.max(9, 11 / scale);
    ctx.font = `${fontPx}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    for (const n of nodes) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = COLORS[n.type] || '#888';
      ctx.fill();
      if (n === hoverNode) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2 / scale;
        ctx.stroke();
      }
      if (scale > 0.45 || n === hoverNode) {
        ctx.fillStyle = n === hoverNode ? '#ffffff' : 'rgba(220,220,235,0.85)';
        ctx.fillText(n.title, n.x, n.y + n.r + fontPx);
      }
    }
  }

  // --- interaction -------------------------------------------------------------

  function toWorld(cx, cy) {
    const rect = canvas.getBoundingClientRect();
    return { x: (cx - rect.left - ox) / scale, y: (cy - rect.top - oy) / scale };
  }

  function hitNode(cx, cy) {
    const p = toWorld(cx, cy);
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const dx = p.x - n.x, dy = p.y - n.y;
      if (dx * dx + dy * dy <= (n.r + 4) * (n.r + 4)) return n;
    }
    return null;
  }

  function onDown(e) {
    moved = false;
    lastX = e.clientX; lastY = e.clientY;
    dragNode = hitNode(e.clientX, e.clientY);
    panning = !dragNode;
    alpha = Math.max(alpha, 0.3);
  }

  function onMove(e) {
    if (canvas.offsetParent === null) return; // graph hidden
    if (dragNode) {
      const p = toWorld(e.clientX, e.clientY);
      dragNode.x = p.x; dragNode.y = p.y;
      moved = true;
      alpha = Math.max(alpha, 0.3);
    } else if (panning) {
      ox += e.clientX - lastX; oy += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      moved = true;
    } else {
      const h = hitNode(e.clientX, e.clientY);
      if (h !== hoverNode) { hoverNode = h; canvas.style.cursor = h ? 'pointer' : 'grab'; }
    }
  }

  function onUp(e) {
    if (dragNode && !moved && onOpen) onOpen(dragNode.id);
    dragNode = null;
    panning = false;
  }

  function onWheel(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const ns = Math.min(4, Math.max(0.15, scale * factor));
    // zoom around the cursor
    ox = mx - ((mx - ox) / scale) * ns;
    oy = my - ((my - oy) / scale) * ns;
    scale = ns;
  }

  function onTouch(e) {
    const t = e.touches[0];
    if (e.type === 'touchstart' && t) {
      e.preventDefault();
      onDown({ clientX: t.clientX, clientY: t.clientY });
    } else if (e.type === 'touchmove' && t) {
      e.preventDefault();
      onMove({ clientX: t.clientX, clientY: t.clientY });
    } else if (e.type === 'touchend') {
      onUp({});
    }
  }

  return { init, start, stop, resize };
})();
