/**
 * Speedometer, gear indicator, RPM bar.
 */
export function createHUD() {
  const speedNum = document.getElementById('speedNum');
  const needle   = document.getElementById('needle');
  const gearEl   = document.getElementById('gear');
  const rpmFill  = document.getElementById('rpmFill');
  const hudRoot  = document.getElementById('hud');

  // Build dial ticks (0..360 km/h)
  const ticksG = document.getElementById('ticks');
  const maxKmh = 360;
  for (let i = 0; i <= 12; i++) {
    const a = -135 + (i / 12) * 270; // sweep -135..135 deg
    const rad = a * Math.PI / 180;
    const x1 = 100 + Math.cos(rad) * 78;
    const y1 = 100 + Math.sin(rad) * 78;
    const x2 = 100 + Math.cos(rad) * 88;
    const y2 = 100 + Math.sin(rad) * 88;
    const major = i % 2 === 0;
    const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tick.setAttribute('x1', x1); tick.setAttribute('y1', y1);
    tick.setAttribute('x2', x2); tick.setAttribute('y2', y2);
    tick.setAttribute('class', major ? 'tick major' : 'tick');
    ticksG.appendChild(tick);
    if (major) {
      const lx = 100 + Math.cos(rad) * 66;
      const ly = 100 + Math.sin(rad) * 66 + 3;
      const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      txt.setAttribute('x', lx); txt.setAttribute('y', ly);
      txt.setAttribute('class', 'tick-label');
      txt.textContent = Math.round(i / 12 * maxKmh);
      ticksG.appendChild(txt);
    }
  }

  let hudVisible = true;
  function toggle() {
    hudVisible = !hudVisible;
    hudRoot.classList.toggle('hidden', !hudVisible);
  }

  function update({ kmh, gear, rpm01 }) {
    const speed = Math.max(0, Math.min(maxKmh, kmh));
    speedNum.textContent = Math.round(speed);
    const a = -135 + (speed / maxKmh) * 270;
    needle.setAttribute('transform', `rotate(${a + 90} 100 100)`);
    gearEl.textContent = gear;
    rpmFill.style.width = `${Math.round(Math.min(1, Math.max(0, rpm01)) * 100)}%`;
  }

  function show() { hudRoot.classList.remove('hidden'); }

  return { update, toggle, show };
}
