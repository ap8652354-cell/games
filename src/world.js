import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * Build the entire world: sky, lights, ground, road network, ramps,
 * obstacles, decorative props.  Returns { dynamics } - an array of
 * { mesh, body } pairs to sync each frame.
 */
export function buildWorld(scene, world) {
  const dynamics = [];
  // ---------------- Sky / fog ----------------
  scene.background = new THREE.Color(0x9bbcd6);
  scene.fog = new THREE.Fog(0x9bbcd6, 220, 900);

  // Procedural gradient sky dome (cheap but pretty)
  const skyGeo = new THREE.SphereGeometry(900, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      top:    { value: new THREE.Color(0x1a4d8f) },
      mid:    { value: new THREE.Color(0x9bbcd6) },
      bottom: { value: new THREE.Color(0xe8d4a8) },
      offset: { value: 0.08 },
    },
    vertexShader: `varying vec3 vWorld;
      void main(){ vWorld = (modelMatrix * vec4(position,1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vWorld;
      uniform vec3 top, mid, bottom; uniform float offset;
      void main(){
        float h = normalize(vWorld).y;
        vec3 col = mix(bottom, mid, smoothstep(-0.1, 0.25 + offset, h));
        col = mix(col, top, smoothstep(0.25 + offset, 0.85, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // ---------------- Lighting ----------------
  const hemi = new THREE.HemisphereLight(0xbfd4ec, 0x6b5a3e, 0.55);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2d6, 1.6);
  sun.position.set(120, 180, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = 180;
  sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;   sun.shadow.camera.bottom = -s;
  sun.shadow.camera.near = 1;  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);

  // Subtle fill from the opposite side
  const fill = new THREE.DirectionalLight(0xa6c8ff, 0.25);
  fill.position.set(-100, 60, -120);
  scene.add(fill);

  // ---------------- Ground ----------------
  const groundSize = 1600;
  const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize, 200, 200);
  // Gentle hilly terrain in the distance
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const d = Math.hypot(x, y);
    // Flat play-area inside r=180, hills outside
    const hill = Math.max(0, d - 180) * 0.04;
    const noise = Math.sin(x * 0.04) * Math.cos(y * 0.05) * 1.5
                + Math.sin(x * 0.11 + 1.3) * Math.cos(y * 0.09) * 0.8;
    pos.setZ(i, hill + noise * (d > 160 ? 1 : 0.05));
  }
  groundGeo.computeVertexNormals();

  const grassMat = new THREE.MeshStandardMaterial({
    color: 0x4a6b2a, roughness: 0.95, metalness: 0,
    flatShading: false,
  });
  // Vertex-color tint for variation
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = 0.85 + Math.random() * 0.3;
    colors[i*3]   = 0.29 * t;
    colors[i*3+1] = 0.42 * t;
    colors[i*3+2] = 0.16 * t;
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  grassMat.vertexColors = true;

  const ground = new THREE.Mesh(groundGeo, grassMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Physics ground (flat plane — terrain hills are decorative far away)
  const groundBody = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Plane(),
    material: new CANNON.Material('ground'),
  });
  groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  world.addBody(groundBody);

  // ---------------- Road / track ----------------
  // A simple rounded-rectangle race loop made from segments
  const road = buildRoad(scene);
  road.position.y = 0.02; // avoid z-fighting

  // ---------------- Ramps ----------------
  addRamp(scene, world, new THREE.Vector3( 60, 0,  0),  -Math.PI/2, 14, 5);
  addRamp(scene, world, new THREE.Vector3(-60, 0,  20), Math.PI/2,  14, 6);
  addRamp(scene, world, new THREE.Vector3(  0, 0, -70), 0,           18, 7);

  // ---------------- Obstacles ----------------
  // Cones scattered around the track inner field
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 30 + Math.random() * 90;
    addCone(scene, world, dynamics, new THREE.Vector3(Math.cos(a)*r, 0, Math.sin(a)*r));
  }
  // Stacked crates near a corner
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3 - row; col++) {
      const x = -90 + col * 2.2 + row * 1.1;
      const z = -90;
      addCrate(scene, world, dynamics, new THREE.Vector3(x, 1 + row * 2.05, z));
    }
  }
  // A few low walls
  addWall(scene, world, new THREE.Vector3( 110, 1.5, 30), 0.6, 3, 26, 0xb89066);
  addWall(scene, world, new THREE.Vector3(-110, 1.5,-30), 0.6, 3, 26, 0xb89066);

  // ---------------- Decorations ----------------
  // Trees outside the play area
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 200 + Math.random() * 350;
    addTree(scene, new THREE.Vector3(Math.cos(a)*r, 0, Math.sin(a)*r));
  }
  // Distant mountains as backdrop billboards
  addMountains(scene);
  // Start banner
  addStartBanner(scene);

  return { dynamics };
}

// ===================================================================
//                            HELPERS
// ===================================================================

function buildRoad(scene) {
  const group = new THREE.Group();

  const roadMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a2e, roughness: 0.85, metalness: 0.05,
  });
  const lineMat = new THREE.MeshStandardMaterial({
    color: 0xf2eecb, emissive: 0x322f1a, roughness: 0.5,
  });

  // Build a rounded rectangle path (oval-ish)
  const w = 130, h = 90, r = 40, segments = 80;
  const points = [];
  for (let i = 0; i < segments; i++) {
    const t = i / segments * Math.PI * 2;
    // Squircle-ish: parametric rounded rect
    const ax = Math.cos(t), az = Math.sin(t);
    const x = Math.sign(ax) * Math.min(Math.abs(ax) * (w + r), w) + Math.sign(ax) * Math.min(0, 0);
    const z = Math.sign(az) * Math.min(Math.abs(az) * (h + r), h);
    // Smoother: use ellipse with corners
    const ex = Math.cos(t) * (w);
    const ez = Math.sin(t) * (h);
    points.push(new THREE.Vector3(ex, 0, ez));
  }

  const roadWidth = 12;
  const roadGeo = new THREE.BufferGeometry();
  const verts = [];
  const uvs = [];
  const idx = [];

  for (let i = 0; i < points.length; i++) {
    const p  = points[i];
    const pn = points[(i + 1) % points.length];
    const dir = new THREE.Vector3().subVectors(pn, p).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(roadWidth / 2);
    verts.push(p.x - side.x, 0, p.z - side.z);
    verts.push(p.x + side.x, 0, p.z + side.z);
    uvs.push(0, i / 4);
    uvs.push(1, i / 4);
  }
  for (let i = 0; i < points.length; i++) {
    const a = i * 2, b = i * 2 + 1;
    const c = ((i + 1) % points.length) * 2;
    const d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  roadGeo.setIndex(idx);
  roadGeo.computeVertexNormals();

  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = true;
  group.add(road);

  // Center dashed line — use boxes oriented along road heading
  const dashGeo = new THREE.BoxGeometry(0.4, 0.04, 2.5);
  for (let i = 0; i < points.length; i += 2) {
    const p  = points[i];
    const pn = points[(i + 1) % points.length];
    const dir = new THREE.Vector3().subVectors(pn, p).normalize();
    const angle = Math.atan2(dir.x, dir.z);
    const dash = new THREE.Mesh(dashGeo, lineMat);
    dash.position.set(p.x, 0.05, p.z);
    dash.rotation.y = angle;
    dash.receiveShadow = true;
    group.add(dash);
  }

  scene.add(group);
  return group;
}

function addRamp(scene, world, pos, rotY, length, height) {
  const geo = new THREE.BoxGeometry(length, height, 8);
  const mat = new THREE.MeshStandardMaterial({ color: 0xc9c9c9, roughness: 0.7, metalness: 0.1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  // Tilt to make a ramp
  mesh.position.copy(pos);
  mesh.position.y = height / 2;
  mesh.rotation.set(0, rotY, 0);
  // Apply slope along local X
  mesh.rotateZ(Math.atan(height / length));
  scene.add(mesh);

  const shape = new CANNON.Box(new CANNON.Vec3(length / 2, height / 2, 4));
  const body = new CANNON.Body({ mass: 0, shape, material: new CANNON.Material('ramp') });
  body.position.copy(mesh.position);
  body.quaternion.copy(mesh.quaternion);
  world.addBody(body);
}

function addCone(scene, world, dynamics, pos) {
  const group = new THREE.Group();
  // Cone mesh centered at group origin (group origin = body center)
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.45, 1.1, 16),
    new THREE.MeshStandardMaterial({ color: 0xff5e2e, roughness: 0.6 })
  );
  cone.castShadow = true;
  group.add(cone);
  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.42, 0.12, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
  );
  group.add(stripe);
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.06, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x111111 })
  );
  base.position.y = -0.52;
  base.receiveShadow = true;
  group.add(base);
  group.position.set(pos.x, pos.y + 0.55, pos.z);
  scene.add(group);

  const body = new CANNON.Body({
    mass: 1.2,
    shape: new CANNON.Cylinder(0.45, 0.05, 1.1, 8),
    material: new CANNON.Material('cone'),
    linearDamping: 0.4,
    angularDamping: 0.4,
  });
  body.position.copy(group.position);
  world.addBody(body);
  dynamics.push({ mesh: group, body });
}

function addCrate(scene, world, dynamics, pos) {
  const size = 2;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.85 })
  );
  mesh.castShadow = true; mesh.receiveShadow = true;
  // Plank lines via wireframe overlay
  const lines = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color: 0x4a2e15 })
  );
  mesh.add(lines);
  mesh.position.copy(pos);
  scene.add(mesh);

  const body = new CANNON.Body({
    mass: 8,
    shape: new CANNON.Box(new CANNON.Vec3(size/2, size/2, size/2)),
    material: new CANNON.Material('crate'),
    linearDamping: 0.15,
    angularDamping: 0.15,
  });
  body.position.copy(pos);
  world.addBody(body);
  dynamics.push({ mesh, body });
}

function addWall(scene, world, pos, t, h, len, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(t, h, len),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
  );
  mesh.position.copy(pos);
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  const body = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Box(new CANNON.Vec3(t/2, h/2, len/2)),
  });
  body.position.copy(pos);
  world.addBody(body);
}

function addTree(scene, pos) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.9, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a2f1a, roughness: 0.95 })
  );
  trunk.position.set(pos.x, 2, pos.z);
  trunk.castShadow = true;
  scene.add(trunk);

  const leafColor = new THREE.Color().setHSL(0.28 + Math.random()*0.05, 0.5, 0.3 + Math.random()*0.1);
  const leaves = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.6 + Math.random()*1.2, 0),
    new THREE.MeshStandardMaterial({ color: leafColor, roughness: 0.9, flatShading: true })
  );
  leaves.position.set(pos.x, 5.5 + Math.random()*0.6, pos.z);
  leaves.castShadow = true;
  scene.add(leaves);
}

function addMountains(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x4d6076, roughness: 1, flatShading: true });
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 700 + Math.random() * 80;
    const m = new THREE.Mesh(
      new THREE.ConeGeometry(60 + Math.random()*40, 80 + Math.random()*60, 5),
      mat
    );
    m.position.set(Math.cos(a)*r, 30, Math.sin(a)*r);
    scene.add(m);
  }
}

function addStartBanner(scene) {
  const post1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 8, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.5 })
  );
  post1.position.set(0, 4, 90);
  post1.castShadow = true;
  scene.add(post1);
  const post2 = post1.clone(); post2.position.x = 14; scene.add(post2);

  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(15.5, 1.8, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xff3860, emissive: 0x551020, roughness: 0.6 })
  );
  banner.position.set(7, 8.4, 90);
  banner.castShadow = true;
  scene.add(banner);

  // Checker line on the road
  const checkerMat1 = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const checkerMat2 = new THREE.MeshStandardMaterial({ color: 0x111111 });
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 2; j++) {
      const c = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        ((i + j) % 2 === 0) ? checkerMat1 : checkerMat2
      );
      c.rotation.x = -Math.PI / 2;
      c.position.set(1 + i, 0.04, 90 + (j === 0 ? -0.5 : 0.5));
      scene.add(c);
    }
  }
}
