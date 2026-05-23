/**
 * Keyboard + touch controls. Returns a state object that drives the car.
 */
export function createControls() {
  const state = {
    forward: 0,   // 0..1
    back:    0,   // 0..1
    left:    0,
    right:   0,
    handbrake: false,
    cameraToggle: false,
    reset: false,
    hud: false,
  };

  const keys = {};
  function onKey(e, down) {
    keys[e.code] = down;
    if (down) {
      if (e.code === 'KeyC') state.cameraToggle = true;
      if (e.code === 'KeyR') state.reset = true;
      if (e.code === 'KeyH') state.hud = true;
    }
  }
  window.addEventListener('keydown', e => onKey(e, true));
  window.addEventListener('keyup',   e => onKey(e, false));

  // Touch buttons
  document.querySelectorAll('#touch .tbtn').forEach(btn => {
    const k = btn.dataset.key;
    const down = ev => { ev.preventDefault(); touchKey(k, true); };
    const up   = ev => { ev.preventDefault(); touchKey(k, false); };
    btn.addEventListener('touchstart', down, { passive: false });
    btn.addEventListener('touchend',   up,   { passive: false });
    btn.addEventListener('touchcancel',up,   { passive: false });
    btn.addEventListener('mousedown',  down);
    btn.addEventListener('mouseup',    up);
    btn.addEventListener('mouseleave', up);
  });
  function touchKey(k, down) {
    if (k === 'w') keys._gas = down;
    if (k === 's') keys._brk = down;
    if (k === 'a') keys._lt  = down;
    if (k === 'd') keys._rt  = down;
  }

  // Smooth analog values - eases steering to avoid twitchy snap
  let smoothLeft = 0, smoothRight = 0, smoothFwd = 0, smoothBack = 0;
  const ease = (cur, tgt, k) => cur + (tgt - cur) * k;

  function poll(dt = 1/60) {
    const fwdK = (keys.KeyW || keys.ArrowUp   || keys._gas) ? 1 : 0;
    const bckK = (keys.KeyS || keys.ArrowDown || keys._brk) ? 1 : 0;
    const ltK  = (keys.KeyA || keys.ArrowLeft || keys._lt)  ? 1 : 0;
    const rtK  = (keys.KeyD || keys.ArrowRight|| keys._rt)  ? 1 : 0;

    const k = Math.min(1, dt * 24);
    smoothFwd  = ease(smoothFwd,  fwdK, k);
    smoothBack = ease(smoothBack, bckK, k);
    smoothLeft = ease(smoothLeft, ltK,  Math.min(1, dt * 8));
    smoothRight= ease(smoothRight,rtK,  Math.min(1, dt * 8));

    state.forward = smoothFwd;
    state.back    = smoothBack;
    state.left    = smoothLeft;
    state.right   = smoothRight;
    state.handbrake = !!keys.Space;
  }

  function consumeEdge(name) {
    if (state[name]) { state[name] = false; return true; }
    return false;
  }

  return { state, poll, consumeEdge };
}

export function isTouchDevice() {
  return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}
