// Simple synthesized motor sound — pitch and volume follow throttle.
export class MotorAudio {
  constructor() {
    this.ctx = null;
    this.started = false;
  }

  _init() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(this.ctx.destination);

    this.osc = this.ctx.createOscillator();
    this.osc.type = 'sawtooth';
    this.osc.frequency.value = 90;

    this.osc2 = this.ctx.createOscillator();
    this.osc2.type = 'square';
    this.osc2.frequency.value = 183; // slight detune for a "4 motors" beat

    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 900;

    this.osc.connect(filt);
    this.osc2.connect(filt);
    filt.connect(this.gain);
    this.osc.start();
    this.osc2.start();
    this.started = true;
  }

  /** Call from a user-gesture context the first time. */
  ensureStarted() {
    if (!this.started) {
      try { this._init(); } catch { /* audio unavailable */ }
    }
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  update(drone, throttle) {
    if (!this.started) return;
    const t = drone.armed ? throttle : 0;
    const idle = drone.armed ? 0.18 : 0;
    const target = Math.min(0.16, idle * 0.3 + t * 0.14);
    this.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.06);
    const f = 80 + (idle + t) * 320;
    this.osc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.08);
    this.osc2.frequency.setTargetAtTime(f * 2.03, this.ctx.currentTime, 0.08);
  }
}
