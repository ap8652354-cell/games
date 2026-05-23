import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { buildWorld } from './world.js';
import { buildCar }   from './car.js';
import { createControls, isTouchDevice } from './controls.js';
import { createHUD }  from './hud.js';
import { createSmokePool } from './particles.js';

// =============================================================
//   Renderer / Scene / Camera
// =============================================================
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.3, 2000);
camera.position.set(0, 6, 100);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// =============================================================
//   Physics world
// =============================================================
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -19.62, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
world.defaultContactMaterial.friction = 0.4;

// =============================================================
//   Loading progress (visual only — we have nothing big to load)
// =============================================================
const loadFill = document.getElementById('loadFill');
const loadHint = document.getElementById('loadHint');
const loadingEl = document.getElementById('loading');
const messages = [
  'Warming up the W16...',
  'Tightening Michelin Pilot Sport tires...',
  'Calibrating active aero...',
  'Filling tank: 100 octane...',
  'Ready to launch!',
];
let progress = 0;
const loadInterval = setInterval(() => {
  progress = Math.min(100, progress + 8 + Math.random() * 12);
  loadFill.style.width = progress + '%';
  loadHint.textContent = messages[Math.min(messages.length - 1, Math.floor(progress / 22))];
  if (progress >= 100) {
    clearInterval(loadInterval);
    setTimeout(() => {
      loadingEl.classList.add('hidden');
      hud.show();
      if (isTouchDevice()) document.getElementById('touch').classList.remove('hidden');
    }, 350);
  }
}, 130);

// =============================================================
//   Build world + car
// =============================================================
const { dynamics } = buildWorld(scene, world);
const car = buildCar(scene, world, new THREE.Vector3(0, 1.2, 78));

// =============================================================
//   Controls + HUD + particles
// =============================================================
const controls = createControls();
const hud = createHUD();
const smoke = createSmokePool(scene, 80);

// =============================================================
//   Camera modes
// =============================================================
const CAMERA_MODES = ['chase', 'low', 'cinematic', 'cockpit'];
let cameraMode = 0;
const camOffsets = {
  chase:     new THREE.Vector3(0, 4.0, -9.5),
  low:       new THREE.Vector3(0, 2.0, -6.0),
  cinematic: new THREE.Vector3(-7, 3.0, -7),
  cockpit:   new THREE.Vector3(0, 1.05, 0.1),
};
const camLookOffset = {
  chase:     new THREE.Vector3(0, 1.2, 4),
  low:       new THREE.Vector3(0, 0.8, 4),
  cinematic: new THREE.Vector3(0, 0.8, 0),
  cockpit:   new THREE.Vector3(0, 1.05, 8),
};

const camPos = new THREE.Vector3();
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  const mode = CAMERA_MODES[cameraMode];
  const off = camOffsets[mode];
  const look = camLookOffset[mode];

  // Compute world-space offset from car
  const carQuat = car.visual.quaternion;
  const worldOff = off.clone().applyQuaternion(carQuat);
  const worldLook = look.clone().applyQuaternion(carQuat);

  camPos.copy(car.visual.position).add(worldOff);
  camTarget.copy(car.visual.position).add(worldLook);

  // Smooth lerp - cockpit needs zero smoothing for accuracy
  const k = mode === 'cockpit' ? 1 : Math.min(1, dt * 6);
  camera.position.lerp(camPos, k);
  // Look smoothing (slightly faster)
  const tmp = new THREE.Vector3().copy(camera.userData.lookAt || camTarget);
  tmp.lerp(camTarget, Math.min(1, dt * 8));
  camera.userData.lookAt = tmp;
  camera.lookAt(tmp);
}

// =============================================================
//   Driving model
// =============================================================
const MAX_ENGINE_FORCE = 2400;
const MAX_REVERSE_FORCE = 1200;
const MAX_BRAKE = 35;
const MAX_STEER = 0.55;          // radians
const STEER_RATE = 2.5;          // rad/sec
let steerVal = 0;
let lastReset = 0;
const startPos = new THREE.Vector3(0, 1.2, 78);

// Determine drive wheels (RWD) and steered wheels (front)
const FL = 0, FR = 1, RL = 2, RR = 3;

function applyDriving(dt, kmh) {
  const s = controls.state;

  // ----- Steering with speed-sensitive scaling -----
  const speedFactor = Math.max(0.45, 1 - kmh / 320);
  const steerTarget = (s.right - s.left) * MAX_STEER * speedFactor;
  steerVal += Math.sign(steerTarget - steerVal) * Math.min(Math.abs(steerTarget - steerVal), STEER_RATE * dt);
  car.vehicle.setSteeringValue(steerVal, FL);
  car.vehicle.setSteeringValue(steerVal, FR);

  // ----- Engine + braking -----
  const movingForward = car.chassisBody.velocity.dot(getForward(car.chassisBody)) > 0.5;
  const movingBackward = car.chassisBody.velocity.dot(getForward(car.chassisBody)) < -0.5;

  let engine = 0, brake = 0;
  if (s.forward > 0.05) {
    if (movingBackward) {
      brake = MAX_BRAKE * s.forward;     // brake until stopped
    } else {
      engine = -MAX_ENGINE_FORCE * s.forward;   // negative = forward in this axis
    }
  }
  if (s.back > 0.05) {
    if (movingForward) {
      brake = MAX_BRAKE * s.back;
    } else {
      engine = MAX_REVERSE_FORCE * s.back;
    }
  }
  // Coast - tiny engine braking
  if (s.forward < 0.05 && s.back < 0.05) {
    brake = 1.2;
  }

  // RWD - power to rear wheels
  car.vehicle.applyEngineForce(engine, RL);
  car.vehicle.applyEngineForce(engine, RR);
  // Brakes on all wheels
  for (let i = 0; i < 4; i++) car.vehicle.setBrake(brake, i);

  // Handbrake = strong rear brake + reduced friction = drift
  if (s.handbrake) {
    car.vehicle.setBrake(MAX_BRAKE * 1.2, RL);
    car.vehicle.setBrake(MAX_BRAKE * 1.2, RR);
    car.vehicle.wheelInfos[RL].frictionSlip = 1.6;
    car.vehicle.wheelInfos[RR].frictionSlip = 1.6;
  } else {
    car.vehicle.wheelInfos[RL].frictionSlip = 3.2;
    car.vehicle.wheelInfos[RR].frictionSlip = 3.2;
  }
}

function getForward(body) {
  const v = new CANNON.Vec3(0, 0, 1);
  return body.quaternion.vmult(v, new CANNON.Vec3());
}

// =============================================================
//   Smoke from skidding wheels
// =============================================================
const tmpPos = new THREE.Vector3();
function emitTireSmoke(kmh) {
  const skidding = controls.state.handbrake || (controls.state.forward > 0.5 && kmh < 30 && Math.abs(steerVal) > 0.2);
  if (!skidding && kmh > 5 && Math.random() < 0.15) {
    // Subtle dust at speed
    for (let i = 2; i < 4; i++) {
      const wheel = car.wheelMeshes[i];
      tmpPos.copy(wheel.position); tmpPos.y -= 0.2;
      smoke.emit(tmpPos, { life: 0.5, size: 0.6, color: 0xc4b189, opacity: 0.25, spread: 0.5 });
    }
    return;
  }
  if (skidding) {
    for (let i = 2; i < 4; i++) {
      const wheel = car.wheelMeshes[i];
      tmpPos.copy(wheel.position); tmpPos.y -= 0.2;
      smoke.emit(tmpPos, { life: 0.9, size: 0.85, color: 0xeeeeee, opacity: 0.55, spread: 1.4 });
    }
  }
}

// =============================================================
//   Game loop
// =============================================================
const fixedTimeStep = 1 / 60;
let lastTime = performance.now();

function gearFromSpeed(kmh, throttle) {
  if (Math.abs(kmh) < 1) return 'N';
  if (kmh < 0) return 'R';
  // 7-speed DCT inspired
  const gears = [0, 60, 110, 155, 200, 250, 300, 360];
  for (let i = 1; i < gears.length; i++) {
    if (kmh < gears[i]) return String(i);
  }
  return '7';
}

function tick() {
  requestAnimationFrame(tick);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  controls.poll(dt);

  // Camera mode toggle
  if (controls.consumeEdge('cameraToggle')) {
    cameraMode = (cameraMode + 1) % CAMERA_MODES.length;
  }
  // Reset
  if (controls.consumeEdge('reset')) {
    car.reset(startPos);
  }
  // HUD toggle
  if (controls.consumeEdge('hud')) {
    hud.toggle();
  }

  // Speed in km/h
  const speedMS = car.chassisBody.velocity.length();
  const fwd = getForward(car.chassisBody);
  const signed = car.chassisBody.velocity.dot(fwd);
  const kmh = speedMS * 3.6 * (signed >= 0 ? 1 : -1);

  applyDriving(dt, kmh);

  // Auto reset if fallen far below ground
  if (car.chassisBody.position.y < -10) car.reset(startPos);

  // Step physics
  world.step(fixedTimeStep, dt, 3);
  car.update();
  // Sync dynamic obstacles (cones, crates)
  for (const d of dynamics) {
    d.mesh.position.copy(d.body.position);
    d.mesh.quaternion.copy(d.body.quaternion);
  }

  emitTireSmoke(Math.abs(kmh));
  smoke.update(dt, camera);

  updateCamera(dt);

  // HUD
  const throttle = controls.state.forward - controls.state.back;
  const rpm01 = Math.min(1, Math.abs(kmh) / 360 + Math.abs(throttle) * 0.15);
  hud.update({ kmh: Math.abs(kmh), gear: gearFromSpeed(kmh, throttle), rpm01 });

  renderer.render(scene, camera);
}
tick();
