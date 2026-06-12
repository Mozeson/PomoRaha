// OSD-style HUD overlay + stick position training aid.
export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      mode: document.getElementById('osd-mode'),
      armed: document.getElementById('osd-armed'),
      battery: document.getElementById('osd-battery'),
      alt: document.getElementById('osd-alt'),
      speed: document.getElementById('osd-speed'),
      vspeed: document.getElementById('osd-vspeed'),
      dist: document.getElementById('osd-dist'),
      timer: document.getElementById('osd-timer'),
      message: document.getElementById('osd-message'),
      missionTitle: document.getElementById('mission-title'),
      missionObjective: document.getElementById('mission-objective'),
      missionProgress: document.getElementById('mission-progress'),
      stickL: document.querySelector('#stick-left .stick-dot'),
      stickR: document.querySelector('#stick-right .stick-dot'),
    };
    this._msgTimeout = null;
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  setMission(name, desc) {
    this.el.missionTitle.textContent = name;
    this.el.missionObjective.textContent = desc;
  }

  flash(text, ms = 1800) {
    this.el.message.textContent = text;
    clearTimeout(this._msgTimeout);
    this._msgTimeout = setTimeout(() => { this.el.message.textContent = ''; }, ms);
  }

  setMessage(text) {
    clearTimeout(this._msgTimeout);
    this.el.message.textContent = text;
  }

  update(drone, input, elapsed, progressText) {
    this.el.mode.textContent = drone.mode.toUpperCase();
    this.el.armed.textContent = drone.armed ? 'ARMED' : drone.crashed ? 'CRASHED' : 'DISARMED';
    this.el.armed.classList.toggle('armed', drone.armed || drone.crashed);

    this.el.battery.textContent = `${drone.cellVoltage.toFixed(1)}V ${drone.batteryPct}%`;
    this.el.alt.textContent = `ALT ${drone.altitude.toFixed(1)}m`;
    this.el.speed.textContent = `SPD ${(drone.groundSpeed * 3.6).toFixed(0)}km/h`;
    this.el.vspeed.textContent = `VS ${drone.vel.y >= 0 ? '+' : ''}${drone.vel.y.toFixed(1)}`;
    this.el.dist.textContent = `HOME ${Math.hypot(drone.pos.x, drone.pos.z).toFixed(0)}m`;

    const m = Math.floor(elapsed / 60), s = Math.floor(elapsed % 60);
    this.el.timer.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    this.el.missionProgress.textContent = progressText || '';

    // Stick dots: box is 90px, dot 10px -> range 0..80
    const px = (v) => 40 + v * 38;
    this.el.stickL.style.left = `${px(input.yaw)}px`;
    this.el.stickL.style.top = `${px(1 - 2 * input.throttle)}px`;
    this.el.stickR.style.left = `${px(input.roll)}px`;
    this.el.stickR.style.top = `${px(-input.pitch)}px`;
  }
}
