import * as THREE from 'three';
import { BLOCK } from './world.js';

const STORAGE_KEY = 'fpv-custom-map';
const LIMITS = { xz: 80, y: 25, count: 500 }; // grid bounds and block budget

export function loadCustomBlocks() {
  try {
    const arr = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(arr)) {
      return arr.filter((c) => Array.isArray(c) && c.length === 3 && c.every(Number.isInteger));
    }
  } catch { /* corrupted save */ }
  return [];
}

// Map editor: orbit camera + tap-to-place cubes (Minecraft-style face snapping).
// Mouse: click place, drag orbit, right-drag pan, wheel zoom.
// Touch: tap place, one-finger drag orbit, two-finger pinch zoom / drag pan.
export class Builder {
  constructor(canvas, camera, world, onExit) {
    this.canvas = canvas;
    this.camera = camera;
    this.world = world;
    this.onExit = onExit;
    this.active = false;
    this.tool = 'place';

    // Orbit camera state
    this.target = new THREE.Vector3(0, 2, -12);
    this.yaw = 0;
    this.pitch = 0.6;
    this.dist = 34;

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.pointers = new Map();
    this._pinch = null;

    this.ghost = new THREE.Mesh(
      new THREE.BoxGeometry(BLOCK * 1.02, BLOCK * 1.02, BLOCK * 1.02),
      new THREE.MeshBasicMaterial({ color: 0x3fa34d, transparent: true, opacity: 0.4, depthWrite: false })
    );
    this.ghost.visible = false;
    world.scene.add(this.ghost);

    this.ui = document.getElementById('builder-ui');
    this.countEl = document.getElementById('bld-count');
    document.getElementById('bld-place').addEventListener('click', () => this._setTool('place'));
    document.getElementById('bld-delete').addEventListener('click', () => this._setTool('delete'));
    document.getElementById('bld-exit').addEventListener('click', () => this.exit());
    document.getElementById('bld-clear').addEventListener('click', () => {
      if (this.world.blocks.size && confirm('למחוק את כל הקוביות?')) {
        this.world.clearBlocks();
        this._save();
        this._updateCount();
      }
    });

    canvas.addEventListener('pointerdown', (e) => this._onDown(e));
    canvas.addEventListener('pointermove', (e) => this._onMove(e));
    canvas.addEventListener('pointerup', (e) => this._onUp(e));
    canvas.addEventListener('pointercancel', (e) => this._onUp(e));
    canvas.addEventListener('contextmenu', (e) => { if (this.active) e.preventDefault(); });
    canvas.addEventListener('wheel', (e) => {
      if (!this.active) return;
      e.preventDefault();
      this.dist = THREE.MathUtils.clamp(this.dist * Math.exp(e.deltaY * 0.001), 6, 140);
    }, { passive: false });
  }

  enter() {
    this.active = true;
    this.world.clearGates();
    this.world.setBlocks(loadCustomBlocks());
    this._setTool('place');
    this._updateCount();
    this.ui.classList.remove('hidden');
  }

  exit() {
    if (!this.active) return;
    this._save();
    this.active = false;
    this.ghost.visible = false;
    this.pointers.clear();
    this._pinch = null;
    this.ui.classList.add('hidden');
    this.onExit();
  }

  update(dt, input) {
    // Keyboard pan (desktop)
    const k = input.keys;
    const panX = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const panZ = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (panX || panZ) {
      const speed = this.dist * 0.8 * dt;
      const { fwd, right } = this._axes();
      this.target.addScaledVector(right, panX * speed).addScaledVector(fwd, panZ * speed);
      this._clampTarget();
    }

    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist
    );
    this.camera.lookAt(this.target);
  }

  // --- Pointer handling ---
  _onDown(e) {
    if (!this.active) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, travel: 0 });
    if (this.pointers.size === 2) {
      for (const p of this.pointers.values()) p.travel = 99; // two fingers never count as a tap
      this._pinch = null;
    }
    this.ghost.visible = false;
  }

  _onMove(e) {
    if (!this.active) return;
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      // Hover (mouse only): preview placement
      if (e.pointerType === 'mouse') this._updateGhost(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.travel += Math.abs(dx) + Math.abs(dy);
    p.x = e.clientX; p.y = e.clientY;

    if (this.pointers.size === 1) {
      if (p.button === 2) {
        this._panPx(dx, dy);
      } else if (p.travel > 8) {
        this.yaw -= dx * 0.005;
        this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.005, 0.08, 1.45);
      }
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (this._pinch) {
        this.dist = THREE.MathUtils.clamp(this.dist * this._pinch.d / Math.max(d, 1), 6, 140);
        this._panPx(mid.x - this._pinch.mid.x, mid.y - this._pinch.mid.y);
      }
      this._pinch = { d, mid };
    }
  }

  _onUp(e) {
    if (!this.active) return;
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const wasSolo = this.pointers.size === 1;
    this.pointers.delete(e.pointerId);
    this._pinch = null;
    if (wasSolo && p.travel <= 8 && p.button === 0) {
      this._tap(e.clientX, e.clientY);
    }
  }

  _tap(cx, cy) {
    const pick = this._pick(cx, cy);
    if (!pick) return;
    if (this.tool === 'place' && pick.placeCell && this._validCell(pick.placeCell)) {
      this.world.addBlock(...pick.placeCell);
    } else if (this.tool === 'delete' && pick.block) {
      this.world.removeBlock(...pick.block);
    } else {
      return;
    }
    this._save();
    this._updateCount();
  }

  // --- Picking ---
  _pick(cx, cy) {
    const ndc = new THREE.Vector2(
      (cx / window.innerWidth) * 2 - 1,
      -(cy / window.innerHeight) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);

    const hits = this.raycaster.intersectObjects(this.world.blocksGroup.children, true);
    if (hits.length) {
      const hit = hits[0];
      const cell = hit.object.userData.cell;
      const n = hit.face.normal; // blocks are axis-aligned, local == world
      return {
        block: cell,
        placeCell: [cell[0] + Math.round(n.x), cell[1] + Math.round(n.y), cell[2] + Math.round(n.z)],
      };
    }

    const pt = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, pt)) {
      return { placeCell: [Math.round(pt.x / BLOCK), 0, Math.round(pt.z / BLOCK)] };
    }
    return null;
  }

  _validCell(cell) {
    const [gx, gy, gz] = cell;
    if (Math.abs(gx) > LIMITS.xz || Math.abs(gz) > LIMITS.xz) return false;
    if (gy < 0 || gy > LIMITS.y) return false;
    if (gx === 0 && gz === 0 && gy === 0) return false; // keep the launch pad clear
    if (this.world.hasBlock(gx, gy, gz)) return false;
    if (this.world.blocks.size >= LIMITS.count) return false;
    return true;
  }

  _updateGhost(cx, cy) {
    const pick = this._pick(cx, cy);
    let cell = null, color = 0x3fa34d;
    if (this.tool === 'place' && pick?.placeCell && this._validCell(pick.placeCell)) {
      cell = pick.placeCell;
    } else if (this.tool === 'delete' && pick?.block) {
      cell = pick.block;
      color = 0xc23a3a;
    }
    if (cell) {
      this.ghost.position.set(cell[0] * BLOCK, cell[1] * BLOCK + BLOCK / 2, cell[2] * BLOCK);
      this.ghost.material.color.set(color);
      this.ghost.visible = true;
    } else {
      this.ghost.visible = false;
    }
  }

  // --- Helpers ---
  _axes() {
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    return { fwd, right };
  }

  _panPx(dx, dy) {
    const s = this.dist * 0.0016;
    const { fwd, right } = this._axes();
    this.target.addScaledVector(right, -dx * s).addScaledVector(fwd, dy * s);
    this._clampTarget();
  }

  _clampTarget() {
    const max = LIMITS.xz * BLOCK;
    this.target.x = THREE.MathUtils.clamp(this.target.x, -max, max);
    this.target.z = THREE.MathUtils.clamp(this.target.z, -max, max);
  }

  _setTool(tool) {
    this.tool = tool;
    document.getElementById('bld-place').classList.toggle('selected', tool === 'place');
    document.getElementById('bld-delete').classList.toggle('selected', tool === 'delete');
    this.ghost.visible = false;
  }

  _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.world.blockCells()));
  }

  _updateCount() {
    this.countEl.textContent = `${this.world.blocks.size} / ${LIMITS.count}`;
  }
}
