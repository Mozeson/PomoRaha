import * as THREE from 'three';
import { Drone } from './drone.js';
import { Input } from './input.js';
import { World } from './world.js';
import { HUD } from './hud.js';
import { MotorAudio } from './audio.js';
import { MISSIONS, getBestTime, setBestTime } from './missions.js';

// ---------- Renderer / scene ----------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(95, 1, 0.05, 600); // wide FOV like FPV cams

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- Game objects ----------
const world = new World(scene);
const drone = new Drone();
const input = new Input();
const hud = new HUD();
const audio = new MotorAudio();

const SPAWN = new THREE.Vector3(0, 0.08, 0);

// ---------- Settings ----------
const settings = loadSettings();

function loadSettings() {
  let s = { flightmode: 'angle', rates: '0.75', camtilt: '20' };
  try { s = { ...s, ...JSON.parse(localStorage.getItem('fpv-settings') || '{}') }; } catch {}
  for (const key of ['flightmode', 'rates', 'camtilt']) {
    const el = document.getElementById(`set-${key}`);
    el.value = s[key];
    el.addEventListener('change', () => {
      s[key] = el.value;
      localStorage.setItem('fpv-settings', JSON.stringify(s));
    });
  }
  return s;
}

function applySettings() {
  drone.mode = settings.flightmode;
  drone.rateMult = parseFloat(settings.rates);
}

// ---------- Mission state ----------
let state = 'menu';            // menu | flying | complete
let mission = null;
let elapsed = 0;
let started = false;           // timer starts on arm
const prevPos = new THREE.Vector3();

// ---------- Menu ----------
const menuEl = document.getElementById('menu');
const completeEl = document.getElementById('complete-overlay');
const missionListEl = document.getElementById('mission-list');

function fmtTime(t) {
  return `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
}

function buildMissionList() {
  missionListEl.innerHTML = '';
  MISSIONS.forEach((m, i) => {
    const btn = document.createElement('button');
    btn.className = 'mission-btn';
    const best = m.timed ? getBestTime(m.id) : null;
    btn.innerHTML = `
      <div>
        <div class="m-name">${m.name}</div>
        <div class="m-desc">${m.desc}</div>
      </div>
      ${best !== null ? `<div class="m-best">שיא: ${fmtTime(best)}</div>` : ''}
    `;
    btn.addEventListener('click', () => startMission(i));
    missionListEl.appendChild(btn);
  });
}

let missionIndex = 0;

function startMission(i) {
  missionIndex = i;
  mission = MISSIONS[i];
  applySettings();
  mission.setup(world);
  drone.reset(SPAWN.clone());
  input.zeroSticks();
  elapsed = 0;
  started = false;
  hud.setMission(mission.name, mission.desc);
  hud.setMessage('לחצו רווח לחימוש (ARM) — ואז גז בעדינות');
  menuEl.classList.add('hidden');
  completeEl.classList.add('hidden');
  hud.show();
  audio.ensureStarted();
  state = 'flying';
}

function backToMenu() {
  state = 'menu';
  drone.disarm();
  hud.hide();
  completeEl.classList.add('hidden');
  buildMissionList();
  menuEl.classList.remove('hidden');
}

function completeMission() {
  state = 'complete';
  drone.disarm();
  let stats = `זמן: ${fmtTime(elapsed)}`;
  if (mission.timed) {
    const isRecord = setBestTime(mission.id, elapsed);
    if (isRecord) stats += '\n🏆 שיא אישי חדש!';
    else stats += `\nהשיא שלכם: ${fmtTime(getBestTime(mission.id))}`;
  }
  document.getElementById('complete-title').textContent = '✓ המשימה הושלמה';
  document.getElementById('complete-stats').textContent = stats;
  document.getElementById('btn-next').style.display =
    missionIndex < MISSIONS.length - 1 ? '' : 'none';
  completeEl.classList.remove('hidden');
}

document.getElementById('btn-retry').addEventListener('click', () => startMission(missionIndex));
document.getElementById('btn-next').addEventListener('click', () => startMission(missionIndex + 1));
document.getElementById('btn-menu').addEventListener('click', backToMenu);

// Gamepad status note
setInterval(() => {
  const note = document.getElementById('gamepad-status');
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g) : null;
  if (gp) {
    note.textContent = `🎮 שלט מחובר: ${gp.id.slice(0, 40)}`;
    note.classList.add('connected');
  } else {
    note.textContent = '🎮 חברו שלט (Gamepad/RC) לחוויה מלאה — Mode 2';
    note.classList.remove('connected');
  }
}, 1000);

// ---------- Camera ----------
const camTiltQ = new THREE.Quaternion();
const camOffsetLocal = new THREE.Vector3(0, 0.04, -0.05);

function updateCamera() {
  const tilt = parseFloat(settings.camtilt) * Math.PI / 180;
  camTiltQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), tilt); // FPV cam uptilt
  camera.quaternion.copy(drone.quat).multiply(camTiltQ);
  camera.position.copy(camOffsetLocal).applyQuaternion(drone.quat).add(drone.pos);
}

// ---------- Main loop ----------
let lastT = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  input.update(dt);

  if (state === 'flying') {
    if (input.menuPressed) return backToMenu();

    if (input.armPressed) {
      audio.ensureStarted();
      if (drone.armed) {
        drone.disarm();
      } else if (!drone.crashed) {
        if (input.throttle > 0.25) {
          hud.flash('הורידו את הגז לפני חימוש!');
        } else {
          drone.arm();
          if (!started) { started = true; }
          hud.flash('ARMED — גז בעדינות');
        }
      }
    }

    if (input.resetPressed) {
      drone.reset(SPAWN.clone());
      input.zeroSticks();
      if (!mission.timed) hud.flash('איפוס');
      else { mission.setup(world); elapsed = 0; started = false; hud.flash('איפוס מסלול'); }
    }

    if (started && drone.armed) elapsed += dt;

    prevPos.copy(drone.pos);
    drone.step(input, dt);

    // Obstacle collision
    if (!drone.crashed && world.checkCollision(drone.pos)) {
      drone.crash();
      hud.setMessage('💥 התרסקות — R לאיפוס');
    }
    if (drone.crashed && !world.checkCollision(drone.pos)) {
      hud.setMessage('💥 התרסקות — R לאיפוס');
    }
    if (drone.batteryLeft <= 0 && drone.armed) {
      drone.disarm();
      hud.setMessage('🔋 סוללה ריקה — R לאיפוס');
    }

    const result = mission.update({ drone, world, prevPos, hud, elapsed }, dt);
    world.updateDroneMesh(drone, dt);
    updateCamera();
    hud.update(drone, input, elapsed, result.progress);
    audio.update(drone, input.throttle);

    if (result.done) completeMission();
  } else {
    // Idle orbit behind the pad while in menus
    const t = now / 4000;
    camera.position.set(Math.sin(t) * 8, 3, Math.cos(t) * 8);
    camera.lookAt(0, 1, -10);
    audio.update(drone, 0);
  }

  renderer.render(scene, camera);
}

buildMissionList();
requestAnimationFrame(frame);
