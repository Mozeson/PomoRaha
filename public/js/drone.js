import * as THREE from 'three';

const G = 9.81;
const DEG = Math.PI / 180;

// Quadcopter physics. Conventions (Three.js): +Y up, body forward = -Z.
// Body rates: pitch about X, yaw about Y, roll about Z.
export class Drone {
  constructor() {
    this.mass = 0.65;                       // kg, typical 5" freestyle quad
    this.maxThrust = this.mass * G * 4.2;   // thrust-to-weight ~4.2
    this.dragLin = 0.12;                    // linear drag coefficient
    this.dragQuad = 0.022;                  // quadratic drag coefficient

    // Rates at rate-multiplier 1.0
    this.maxRateRP = 480 * DEG;             // roll/pitch, rad/s
    this.maxRateYaw = 320 * DEG;
    this.maxTiltAngle = 40 * DEG;           // angle mode tilt limit
    this.rateMult = 0.75;
    this.mode = 'angle';                    // 'angle' | 'acro'

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.angVel = new THREE.Vector3();      // body frame, rad/s

    this.armed = false;
    this.crashed = false;
    this.onGround = true;
    this.batterySec = 240;                  // simulated LiPo flight time
    this.batteryLeft = this.batterySec;

    this._euler = new THREE.Euler();
    this._tmpV = new THREE.Vector3();
    this._tmpQ = new THREE.Quaternion();
  }

  reset(pos = new THREE.Vector3(0, 0.08, 0), yaw = 0) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.quat.setFromEuler(new THREE.Euler(0, yaw, 0, 'YXZ'));
    this.angVel.set(0, 0, 0);
    this.armed = false;
    this.crashed = false;
    this.onGround = true;
    this.batteryLeft = this.batterySec;
  }

  arm() {
    if (this.crashed) return;
    this.armed = true;
    this.onGround = false;
  }

  disarm() { this.armed = false; }

  // input: { throttle: 0..1, roll, pitch, yaw: -1..1 }
  step(input, dt) {
    // Fixed substeps for stability
    const sub = Math.max(1, Math.ceil(dt / 0.004));
    const h = dt / sub;
    for (let i = 0; i < sub; i++) this._integrate(input, h);
  }

  _integrate(input, dt) {
    if (this.armed) this.batteryLeft = Math.max(0, this.batteryLeft - dt);

    // --- Commanded body rates ---
    let cmdX, cmdY, cmdZ; // pitch, yaw, roll rates
    const rp = this.maxRateRP * this.rateMult;
    const yw = this.maxRateYaw * this.rateMult;

    if (this.mode === 'acro') {
      cmdX = -input.pitch * rp;   // stick forward -> nose down
      cmdY = -input.yaw * yw;     // stick right -> nose right
      cmdZ = -input.roll * rp;    // stick right -> right side down
    } else {
      // Angle mode: P controller from commanded tilt to body rates
      this._euler.setFromQuaternion(this.quat, 'YXZ');
      const targetPitch = -input.pitch * this.maxTiltAngle;
      const targetRoll = -input.roll * this.maxTiltAngle;
      const P = 7.0;
      cmdX = THREE.MathUtils.clamp((targetPitch - this._euler.x) * P, -rp, rp);
      cmdZ = THREE.MathUtils.clamp((targetRoll - this._euler.z) * P, -rp, rp);
      cmdY = -input.yaw * yw;
    }

    if (!this.armed) { cmdX = cmdY = cmdZ = 0; }

    // First-order response toward commanded rates (gyro+motor lag)
    const tau = 0.06;
    const k = 1 - Math.exp(-dt / tau);
    this.angVel.x += (cmdX - this.angVel.x) * k;
    this.angVel.y += (cmdY - this.angVel.y) * k;
    this.angVel.z += (cmdZ - this.angVel.z) * k;

    // Integrate orientation (body-frame rates -> right-multiplied delta quat)
    if (!this.onGround) {
      this._tmpQ.set(
        this.angVel.x * dt / 2,
        this.angVel.y * dt / 2,
        this.angVel.z * dt / 2,
        1
      ).normalize();
      this.quat.multiply(this._tmpQ).normalize();
    }

    // --- Forces ---
    // Battery sag: thrust drops as battery empties
    const sag = 0.85 + 0.15 * (this.batteryLeft / this.batterySec);
    const thrustN = this.armed ? input.throttle * this.maxThrust * sag : 0;

    const up = this._tmpV.set(0, 1, 0).applyQuaternion(this.quat);
    const ax = up.x * thrustN / this.mass;
    const ay = up.y * thrustN / this.mass - G;
    const az = up.z * thrustN / this.mass;

    const speed = this.vel.length();
    const drag = this.dragLin + this.dragQuad * speed;

    this.vel.x += (ax - this.vel.x * drag) * dt;
    this.vel.y += (ay - this.vel.y * drag) * dt;
    this.vel.z += (az - this.vel.z * drag) * dt;

    this.pos.addScaledVector(this.vel, dt);

    // --- Ground interaction ---
    if (this.pos.y <= 0.08) {
      const impact = -this.vel.y;
      this._euler.setFromQuaternion(this.quat, 'YXZ');
      const tilt = Math.max(Math.abs(this._euler.x), Math.abs(this._euler.z));

      if (this.armed && (impact > 4.0 || tilt > 65 * DEG)) {
        this.crashed = true;
        this.armed = false;
      }
      this.pos.y = 0.08;
      this.vel.y = Math.max(0, this.vel.y);
      // Ground friction
      this.vel.x *= 1 - Math.min(1, 6 * dt);
      this.vel.z *= 1 - Math.min(1, 6 * dt);

      if (!this.armed || (input.throttle < 0.1 && impact >= 0)) {
        this.onGround = true;
        this.angVel.set(0, 0, 0);
        // Settle level when resting
        this._euler.setFromQuaternion(this.quat, 'YXZ');
        this._euler.x *= 0.9; this._euler.z *= 0.9;
        this.quat.setFromEuler(this._euler);
      }
    }
    if (this.onGround && this.armed && input.throttle > 0.45) {
      this.onGround = false;
    }
  }

  crash() {
    this.crashed = true;
    this.armed = false;
    this.vel.multiplyScalar(0.1);
  }

  get speed() { return this.vel.length(); }
  get groundSpeed() { return Math.hypot(this.vel.x, this.vel.z); }
  get altitude() { return this.pos.y; }

  // Battery voltage display (4S pack)
  get cellVoltage() {
    const f = this.batteryLeft / this.batterySec;
    return 3.5 + 0.7 * f;
  }
  get batteryPct() { return Math.round(100 * this.batteryLeft / this.batterySec); }
}
