import * as THREE from 'three';

/**
 * Cheap pooled tire-smoke + dust particles. Uses a single mesh per pool with
 * per-instance attributes for performance.
 */
export function createSmokePool(scene, max = 80) {
  const tex = makeSmokeTexture();
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false,
    blending: THREE.NormalBlending,
  });

  const items = [];
  for (let i = 0; i < max; i++) {
    const m = new THREE.Mesh(geo, mat.clone());
    m.material.opacity = 0;
    m.visible = false;
    scene.add(m);
    items.push({ mesh: m, life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, size: 1 });
  }
  let idx = 0;

  function emit(pos, opts = {}) {
    const p = items[idx];
    idx = (idx + 1) % items.length;
    const m = p.mesh;
    m.visible = true;
    m.position.copy(pos);
    p.maxLife = opts.life ?? 0.9;
    p.life = p.maxLife;
    p.vx = (Math.random() - 0.5) * (opts.spread ?? 1.5);
    p.vz = (Math.random() - 0.5) * (opts.spread ?? 1.5);
    p.vy = 0.6 + Math.random() * 0.8;
    p.size = opts.size ?? 0.8;
    m.scale.setScalar(p.size);
    m.material.opacity = opts.opacity ?? 0.6;
    m.material.color.set(opts.color ?? 0xc8c8c8);
  }

  function update(dt, camera) {
    for (const p of items) {
      if (!p.mesh.visible) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      const t = 1 - p.life / p.maxLife;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.vy *= 0.92;
      p.mesh.scale.setScalar(p.size * (1 + t * 1.6));
      p.mesh.material.opacity = (1 - t) * 0.55;
      // Billboard
      if (camera) p.mesh.lookAt(camera.position);
    }
  }

  return { emit, update };
}

function makeSmokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 60);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  return t;
}
