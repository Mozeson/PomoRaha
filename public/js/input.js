// Keyboard + gamepad input. Gamepad uses Mode 2 (left: throttle/yaw, right: pitch/roll),
// which matches RC transmitters connected over USB.
export class Input {
  constructor() {
    this.keys = new Set();
    this.throttle = 0;   // 0..1
    this.yaw = 0;        // -1..1
    this.pitch = 0;
    this.roll = 0;

    this.armPressed = false;
    this.resetPressed = false;
    this.menuPressed = false;
    this.gamepadConnected = false;

    this._armLatch = false;
    this._resetLatch = false;
    this._menuLatch = false;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    window.addEventListener('gamepadconnected', () => { this.gamepadConnected = true; });
    window.addEventListener('gamepaddisconnected', () => { this.gamepadConnected = false; });
  }

  update(dt) {
    let armNow = false, resetNow = false, menuNow = false;

    // --- Gamepad (takes priority when sticks are moved) ---
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g) : null;
    let gpActive = false;

    if (gp) {
      this.gamepadConnected = true;
      const dz = (v) => Math.abs(v) < 0.06 ? 0 : v;
      const lx = dz(gp.axes[0] ?? 0), ly = dz(gp.axes[1] ?? 0);
      const rx = dz(gp.axes[2] ?? 0), ry = dz(gp.axes[3] ?? 0);

      if (lx || ly || rx || ry) {
        gpActive = true;
        this.yaw = lx;
        this.throttle = Math.min(1, Math.max(0, (1 - ly) / 2)); // stick up = full
        this.roll = rx;
        this.pitch = -ry; // stick forward = positive pitch command
      }
      armNow = gp.buttons[0]?.pressed || gp.buttons[7]?.pressed || false;
      resetNow = gp.buttons[3]?.pressed || false;
      menuNow = gp.buttons[9]?.pressed || false;
    }

    // --- Keyboard (smoothed so flight is controllable) ---
    if (!gpActive) {
      const k = this.keys;
      const tTarget = k.has('KeyW') ? 1 : k.has('KeyS') ? 0 : this.throttle;
      const yTarget = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
      const pTarget = (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0);
      const rTarget = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);

      this.throttle = approach(this.throttle, tTarget, 0.9 * dt);
      this.yaw = approach(this.yaw, yTarget, 5 * dt);
      this.pitch = approach(this.pitch, pTarget, 5 * dt);
      this.roll = approach(this.roll, rTarget, 5 * dt);
    }

    armNow = armNow || this.keys.has('Space');
    resetNow = resetNow || this.keys.has('KeyR');
    menuNow = menuNow || this.keys.has('Escape');

    // Edge detection
    this.armPressed = armNow && !this._armLatch;
    this.resetPressed = resetNow && !this._resetLatch;
    this.menuPressed = menuNow && !this._menuLatch;
    this._armLatch = armNow;
    this._resetLatch = resetNow;
    this._menuLatch = menuNow;
  }

  zeroSticks() {
    this.throttle = 0;
    this.yaw = this.pitch = this.roll = 0;
  }
}

function approach(cur, target, step) {
  if (cur < target) return Math.min(target, cur + step);
  if (cur > target) return Math.max(target, cur - step);
  return cur;
}
