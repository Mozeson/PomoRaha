import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Progressive training curriculum. Each mission:
 *  - setup(world): place gates / zones
 *  - update(ctx, dt): ctx = { drone, world, prevPos, hud, elapsed }
 *    returns { done, failed?, message? }
 */
export const MISSIONS = [
  {
    id: 'hover',
    name: 'שיעור 1 — ריחוף יציב',
    desc: 'המראה וריחוף בתוך הטבעת בגובה 2 מ׳ למשך 10 שניות',
    timed: false,
    setup(world) {
      world.clearGates();
      this.zone = V(0, 2, -4);
      this.held = 0;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.5, 0.06, 8, 36),
        new THREE.MeshBasicMaterial({ color: 0x58e6d9, transparent: true, opacity: 0.7 })
      );
      ring.position.copy(this.zone);
      ring.rotation.x = Math.PI / 2;
      world.gateGroup.add(ring);
      this.ringMesh = ring;
    },
    update(ctx, dt) {
      const d = ctx.drone.pos.distanceTo(this.zone);
      const inside = d < 1.5;
      this.held = inside ? this.held + dt : 0;
      this.ringMesh.material.color.set(inside ? 0x3fa34d : 0x58e6d9);
      const need = 10;
      return {
        done: this.held >= need,
        progress: inside
          ? `בתוך האזור — החזיקו ${(need - this.held).toFixed(1)} שניות`
          : `טוסו אל הטבעת הכחולה (מרחק ${d.toFixed(1)} מ׳)`,
      };
    },
  },

  {
    id: 'altitude',
    name: 'שיעור 2 — שליטה בגובה',
    desc: 'עברו דרך 5 שערים בגבהים משתנים',
    timed: true,
    setup(world) {
      world.clearGates();
      const defs = [
        [V(0, 2, -10), 0], [V(3, 5, -22), 0], [V(-3, 3, -34), 0],
        [V(0, 7, -46), 0], [V(0, 2, -58), 0],
      ];
      for (const [p, dir] of defs) world.addGate(p, dir);
      this.next = 0;
      world.setGateActive(0);
    },
    update(ctx) { return gateSequence(this, ctx); },
  },

  {
    id: 'yaw',
    name: 'שיעור 3 — פניות והתמצאות',
    desc: 'מסלול מעגלי: שלבו פנייה (Yaw) עם הטיה כדי לעבור את כל השערים',
    timed: true,
    setup(world) {
      world.clearGates();
      // Gates on a circle centered at (0, -R); facing tangent so the
      // pilot must keep turning (yaw) to line up each gate.
      const R = 22, N = 8;
      for (let i = 0; i < N; i++) {
        const a = ((i + 1) / N) * Math.PI * 2;
        const pos = V(Math.sin(a) * R, 2.5, -R + Math.cos(a) * R);
        world.addGate(pos, a, 1.8);
      }
      this.next = 0;
      world.setGateActive(0);
    },
    update(ctx) { return gateSequence(this, ctx); },
  },

  {
    id: 'slalom',
    name: 'שיעור 4 — סלאלום',
    desc: 'מעברים צרים לסירוגין — דיוק בהטיה צידית',
    timed: true,
    setup(world) {
      world.clearGates();
      for (let i = 0; i < 8; i++) {
        const x = (i % 2 === 0 ? 1 : -1) * 5;
        world.addGate(V(x, 2.2, -12 - i * 12), (i % 2 === 0 ? -1 : 1) * 0.35, 1.4);
      }
      this.next = 0;
      world.setGateActive(0);
    },
    update(ctx) { return gateSequence(this, ctx); },
  },

  {
    id: 'race',
    name: 'שיעור 5 — מסלול מירוץ',
    desc: 'מסלול מלא: גובה, פניות וסלאלום. שפרו את השיא האישי!',
    timed: true,
    setup(world) {
      world.clearGates();
      const defs = [
        [V(0, 2, -14), 0, 1.7], [V(8, 4, -30), -0.5, 1.6], [V(18, 2.5, -44), -0.9, 1.6],
        [V(8, 6, -60), -2.2, 1.6], [V(-8, 3, -64), -2.6, 1.6], [V(-20, 2, -48), 2.5, 1.6],
        [V(-14, 5, -28), 2.0, 1.6], [V(-4, 2.5, -12), 2.8, 1.6], [V(0, 2, 2), Math.PI, 1.8],
      ];
      for (const [p, dir, r] of defs) world.addGate(p, dir, r);
      this.next = 0;
      world.setGateActive(0);
    },
    update(ctx) { return gateSequence(this, ctx); },
  },

  {
    id: 'free',
    name: 'טיסה חופשית',
    desc: 'ללא יעדים — תרגול חופשי בשטח הפתוח',
    timed: false,
    setup(world) { world.clearGates(); },
    update() { return { done: false, progress: 'טיסה חופשית — ESC לתפריט' }; },
  },
];

function gateSequence(mission, ctx) {
  const gates = ctx.world.gates;
  const gate = gates[mission.next];
  if (gate && ctx.world.checkGatePass(gate, ctx.prevPos, ctx.drone.pos)) {
    gate.passed = true;
    mission.next++;
    ctx.world.setGateActive(mission.next);
    ctx.hud.flash(mission.next >= gates.length ? 'מעולה!' : `שער ${mission.next}/${gates.length} ✓`);
  }
  return {
    done: mission.next >= gates.length,
    progress: `שערים: ${mission.next}/${gates.length}`,
  };
}

export function bestTimeKey(id) { return `fpv-best-${id}`; }

export function getBestTime(id) {
  const v = localStorage.getItem(bestTimeKey(id));
  return v ? parseFloat(v) : null;
}

export function setBestTime(id, t) {
  const cur = getBestTime(id);
  if (cur === null || t < cur) {
    localStorage.setItem(bestTimeKey(id), String(t));
    return true;
  }
  return false;
}
