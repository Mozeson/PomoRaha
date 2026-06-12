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

    this.touch = null; // set by TouchControls when device mode is mobile
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

    // --- Touch sticks (mobile mode) ---
    if (!gpActive && this.touch?.enabled) {
      this.throttle = this.touch.throttle;
      this.yaw = this.touch.yaw;
      this.pitch = this.touch.pitch;
      this.roll = this.touch.roll;
    } else if (!gpActive) {
      // --- Keyboard (smoothed so flight is controllable) ---
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
    this.touch?.reset();
  }
}

// Dual virtual sticks (Mode 2 layout) + on-screen buttons for phones/tablets.
// Buttons feed the same key codes the keyboard uses, so edge detection is shared.
export class TouchControls {
  constructor(input) {
    input.touch = this;
    this.enabled = false;
    this.throttle = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;

    this.leftKnob = document.querySelector('#touch-left .touch-knob');
    this.rightKnob = document.querySelector('#touch-right .touch-knob');

    // Left stick: yaw springs back, throttle holds its position (like a real TX)
    this._bindStick(document.getElementById('touch-left'), this.leftKnob, {
      onMove: (nx, ny) => {
        this.yaw = nx;
        this.throttle = (ny + 1) / 2;
      },
      onEnd: () => {
        this.yaw = 0;
        setKnob(this.leftKnob, 0, this.throttle * 2 - 1);
      },
    });

    // Right stick: both axes spring back to center
    this._bindStick(document.getElementById('touch-right'), this.rightKnob, {
      onMove: (nx, ny) => {
        this.roll = nx;
        this.pitch = ny;
      },
      onEnd: () => {
        this.roll = 0;
        this.pitch = 0;
        setKnob(this.rightKnob, 0, 0);
      },
    });

    this._bindButton('tb-arm', 'Space', input);
    this._bindButton('tb-reset', 'KeyR', input);
    this._bindButton('tb-menu', 'Escape', input);

    this.reset();
  }

  reset() {
    this.throttle = 0;
    this.yaw = this.pitch = this.roll = 0;
    setKnob(this.leftKnob, 0, -1);
    setKnob(this.rightKnob, 0, 0);
  }

  _bindStick(el, knob, handlers) {
    let pointerId = null;
    const move = (e) => {
      const r = el.getBoundingClientRect();
      const nx = clamp11(((e.clientX - r.left) / r.width) * 2 - 1);
      const ny = clamp11(-(((e.clientY - r.top) / r.height) * 2 - 1));
      handlers.onMove(nx, ny);
      setKnob(knob, nx, ny);
    };
    el.addEventListener('pointerdown', (e) => {
      if (pointerId !== null) return;
      pointerId = e.pointerId;
      el.setPointerCapture(pointerId);
      e.preventDefault();
      move(e);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId === pointerId) move(e);
    });
    const end = (e) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      handlers.onEnd();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  _bindButton(id, code, input) {
    const el = document.getElementById(id);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      input.keys.add(code);
    });
    const release = () => input.keys.delete(code);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}

function setKnob(knob, nx, ny) {
  if (!knob) return;
  knob.style.left = `${50 + nx * 33}%`;
  knob.style.top = `${50 - ny * 33}%`;
}

function clamp11(v) { return Math.max(-1, Math.min(1, v)); }

function approach(cur, target, step) {
  if (cur < target) return Math.min(target, cur + step);
  if (cur > target) return Math.max(target, cur - step);
  return cur;
}
