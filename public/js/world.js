import * as THREE from 'three';

// Builds the 3D environment: terrain, sky, obstacles, gates, drone mesh.
export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];   // {box: THREE.Box3} for buildings/obstacles
    this.gateGroup = new THREE.Group();
    scene.add(this.gateGroup);

    this._buildLights();
    this._buildGround();
    this._buildEnvironment();
    this.droneMesh = this._buildDrone();
    scene.add(this.droneMesh);
  }

  _buildLights() {
    this.scene.background = new THREE.Color(0x87b5d6);
    this.scene.fog = new THREE.Fog(0x87b5d6, 120, 480);

    const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
    sun.position.set(80, 120, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -120;
    sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120;
    sun.shadow.camera.bottom = -120;
    sun.shadow.camera.far = 400;
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x8fa8c0, 1.1));
  }

  _buildGround() {
    // Grass with a painted grid so altitude/speed are easy to judge
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#4a7a3a';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
    }
    // noise patches
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(${40 + Math.random() * 40}, ${100 + Math.random() * 50}, 40, 0.25)`;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 14, 14);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(60, 60);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1000, 1000),
      new THREE.MeshLambertMaterial({ map: tex })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Launch pad
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 32),
      new THREE.MeshLambertMaterial({ color: 0x333a44 })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.01;
    this.scene.add(pad);
    const padRing = new THREE.Mesh(
      new THREE.RingGeometry(1.0, 1.2, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd866, side: THREE.DoubleSide })
    );
    padRing.rotation.x = -Math.PI / 2;
    padRing.position.y = 0.02;
    this.scene.add(padRing);
  }

  _buildEnvironment() {
    const treeTrunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2b });
    const treeTopMat = new THREE.MeshLambertMaterial({ color: 0x2e5e2a });
    const bldMats = [0x9aa3ad, 0xb0876a, 0x7d8a96].map(
      (col) => new THREE.MeshLambertMaterial({ color: col })
    );

    const rng = mulberry32(1337);

    // Trees scattered around (collision spheres approximated as boxes)
    for (let i = 0; i < 60; i++) {
      const x = (rng() - 0.5) * 380;
      const z = (rng() - 0.5) * 380;
      if (Math.hypot(x, z) < 35) continue; // keep training area clear
      const h = 4 + rng() * 5;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, h * 0.4, 6), treeTrunkMat);
      trunk.position.y = h * 0.2;
      const top = new THREE.Mesh(new THREE.ConeGeometry(h * 0.3, h * 0.7, 7), treeTopMat);
      top.position.y = h * 0.4 + h * 0.35;
      top.castShadow = true;
      tree.add(trunk, top);
      tree.position.set(x, 0, z);
      this.scene.add(tree);
      this.colliders.push({
        box: new THREE.Box3(
          new THREE.Vector3(x - h * 0.22, 0, z - h * 0.22),
          new THREE.Vector3(x + h * 0.22, h * 0.75, z + h * 0.22)
        ),
      });
    }

    // A few buildings further out, useful for orientation practice
    const bldDefs = [
      [60, 0, 10, 14, 10], [-70, 30, 12, 9, 12], [40, -75, 14, 20, 10],
      [-50, -60, 9, 7, 16], [85, 60, 11, 12, 11],
    ];
    for (let i = 0; i < bldDefs.length; i++) {
      const [x, z, w, h, d] = bldDefs[i];
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bldMats[i % bldMats.length]);
      b.position.set(x, h / 2, z);
      b.castShadow = true;
      b.receiveShadow = true;
      this.scene.add(b);
      this.colliders.push({
        box: new THREE.Box3(
          new THREE.Vector3(x - w / 2, 0, z - d / 2),
          new THREE.Vector3(x + w / 2, h, z + d / 2)
        ),
      });
    }
  }

  _buildDrone() {
    const g = new THREE.Group();
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x222831 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, 0.18), frameMat);
    g.add(body);

    const armGeo = new THREE.BoxGeometry(0.32, 0.012, 0.03);
    const arm1 = new THREE.Mesh(armGeo, frameMat);
    arm1.rotation.y = Math.PI / 4;
    const arm2 = new THREE.Mesh(armGeo, frameMat);
    arm2.rotation.y = -Math.PI / 4;
    g.add(arm1, arm2);

    const propMat = new THREE.MeshBasicMaterial({ color: 0x58e6d9, transparent: true, opacity: 0.45 });
    this.props = [];
    for (const [px, pz] of [[0.11, 0.11], [-0.11, 0.11], [0.11, -0.11], [-0.11, -0.11]]) {
      const prop = new THREE.Mesh(new THREE.CircleGeometry(0.065, 12), propMat);
      prop.rotation.x = -Math.PI / 2;
      prop.position.set(px, 0.022, pz);
      g.add(prop);
      this.props.push(prop);
    }

    // Camera pod marks the front
    const cam = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.04, 0.04),
      new THREE.MeshBasicMaterial({ color: 0xff5555 })
    );
    cam.position.set(0, 0.03, -0.1);
    g.add(cam);
    g.castShadow = true;
    return g;
  }

  // --- Gates ---
  clearGates() {
    while (this.gateGroup.children.length) {
      this.gateGroup.remove(this.gateGroup.children[0]);
    }
    this.gates = [];
  }

  /** Adds a gate. dir = horizontal facing angle (radians). radius in meters. */
  addGate(pos, dir = 0, radius = 1.6) {
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.09, 10, 36),
      new THREE.MeshLambertMaterial({ color: 0xff8c00 })
    );
    torus.position.copy(pos);
    torus.rotation.y = dir;
    this.gateGroup.add(torus);

    // Support pole
    if (pos.y > 0.5) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, pos.y - radius, 6),
        new THREE.MeshLambertMaterial({ color: 0x555555 })
      );
      pole.position.set(pos.x, (pos.y - radius) / 2, pos.z);
      this.gateGroup.add(pole);
    }

    const normal = new THREE.Vector3(Math.sin(dir + Math.PI / 2), 0, Math.cos(dir + Math.PI / 2));
    const gate = { pos: pos.clone(), normal, radius, mesh: torus, passed: false };
    this.gates.push(gate);
    return gate;
  }

  setGateActive(index) {
    this.gates.forEach((g, i) => {
      g.mesh.material = g.mesh.material.clone();
      g.mesh.material.color.set(
        g.passed ? 0x3fa34d : i === index ? 0xff8c00 : 0x7d8a96
      );
      if (i === index) g.mesh.material.emissive?.set?.(0x402200);
    });
  }

  /** True if the segment prev->cur passes through the gate disc. */
  checkGatePass(gate, prev, cur) {
    const d0 = prev.clone().sub(gate.pos).dot(gate.normal);
    const d1 = cur.clone().sub(gate.pos).dot(gate.normal);
    if (d0 * d1 >= 0) return false; // didn't cross the plane
    const t = d0 / (d0 - d1);
    const hit = prev.clone().lerp(cur, t);
    return hit.distanceTo(gate.pos) <= gate.radius;
  }

  /** Returns true if pos collides with any obstacle. */
  checkCollision(pos, r = 0.18) {
    for (const c of this.colliders) {
      const cl = c.box.clampPoint(pos, new THREE.Vector3());
      if (cl.distanceToSquared(pos) < r * r) return true;
    }
    return false;
  }

  updateDroneMesh(drone, dt) {
    this.droneMesh.position.copy(drone.pos);
    this.droneMesh.quaternion.copy(drone.quat);
    const spin = drone.armed ? 40 : 0;
    for (const p of this.props) p.rotation.z += spin * dt;
  }
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
