import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * Build a Bugatti Chiron-inspired procedural car: chassis + visual mesh +
 * RaycastVehicle physics. Returns an object with update(), reset(), and refs.
 */
export function buildCar(scene, world, startPos = new THREE.Vector3(0, 1.5, 88)) {
  const visual = buildBugattiMesh();
  visual.position.copy(startPos);
  scene.add(visual);

  // ---------- Physics chassis ----------
  // Bugatti Chiron is ~4.5m long, 2.0m wide, 1.2m tall. Mass ~1996 kg.
  const chassisShape = new CANNON.Box(new CANNON.Vec3(1.0, 0.35, 2.25));
  const chassisBody = new CANNON.Body({ mass: 1900, material: new CANNON.Material('chassis') });
  chassisBody.addShape(chassisShape, new CANNON.Vec3(0, 0, 0));
  // Add a lower shape to keep CG low (helps stability)
  const lowShape = new CANNON.Box(new CANNON.Vec3(0.95, 0.18, 2.1));
  chassisBody.addShape(lowShape, new CANNON.Vec3(0, -0.35, 0));
  chassisBody.position.copy(startPos);
  chassisBody.angularDamping = 0.3;
  world.addBody(chassisBody);

  // ---------- Vehicle ----------
  const vehicle = new CANNON.RaycastVehicle({
    chassisBody,
    indexRightAxis:   0, // X
    indexUpAxis:      1, // Y
    indexForwardAxis: 2, // Z
  });

  const wheelOptions = {
    radius: 0.42,
    directionLocal: new CANNON.Vec3(0, -1, 0),
    suspensionStiffness: 55,
    suspensionRestLength: 0.35,
    frictionSlip: 3.2,
    dampingRelaxation: 2.4,
    dampingCompression: 4.5,
    maxSuspensionForce: 100000,
    rollInfluence: 0.02,
    axleLocal: new CANNON.Vec3(-1, 0, 0),
    chassisConnectionPointLocal: new CANNON.Vec3(),
    maxSuspensionTravel: 0.3,
    customSlidingRotationalSpeed: -30,
    useCustomSlidingRotationalSpeed: true,
  };

  const wheelbase = 1.55;   // half-distance front<->rear
  const trackHalf = 0.95;   // half-distance left<->right
  const ride = -0.15;        // ride height

  // Order: 0=FL, 1=FR, 2=RL, 3=RR
  const positions = [
    [ trackHalf, ride,  wheelbase],
    [-trackHalf, ride,  wheelbase],
    [ trackHalf, ride, -wheelbase],
    [-trackHalf, ride, -wheelbase],
  ];
  for (const [x, y, z] of positions) {
    wheelOptions.chassisConnectionPointLocal.set(x, y, z);
    vehicle.addWheel(wheelOptions);
  }
  vehicle.addToWorld(world);

  // Build wheel meshes
  const wheelMeshes = [];
  for (let i = 0; i < vehicle.wheelInfos.length; i++) {
    const info = vehicle.wheelInfos[i];
    const isFront = i < 2;
    const m = buildWheelMesh(info.radius, isFront);
    scene.add(m);
    wheelMeshes.push(m);
  }

  // ---------- API ----------
  function update() {
    visual.position.copy(chassisBody.position);
    visual.quaternion.copy(chassisBody.quaternion);
    // Sync wheel meshes from the vehicle's wheel transforms directly.
    // Cannon's wheel quaternion maps body-local X -> axle. Our cylinder
    // mesh has its axis along Y, so we apply a local Z rotation of +90°
    // to align Y with the axle.
    for (let i = 0; i < vehicle.wheelInfos.length; i++) {
      vehicle.updateWheelTransform(i);
      const t = vehicle.wheelInfos[i].worldTransform;
      wheelMeshes[i].position.copy(t.position);
      wheelMeshes[i].quaternion.copy(t.quaternion);
      wheelMeshes[i].rotateZ(Math.PI / 2);
    }
  }

  function reset(pos = startPos) {
    chassisBody.velocity.setZero();
    chassisBody.angularVelocity.setZero();
    chassisBody.position.set(pos.x, pos.y + 1.0, pos.z);
    chassisBody.quaternion.set(0, 0, 0, 1);
  }

  return { vehicle, chassisBody, visual, wheelMeshes, update, reset };
}

// =============================================================
//                Bugatti Chiron-ish mesh
// =============================================================
function buildBugattiMesh() {
  const car = new THREE.Group();
  car.name = 'Bugatti';

  // Signature two-tone: deep french blue lower / glossy black upper
  const blueMat = new THREE.MeshPhysicalMaterial({
    color: 0x0d3b66, metalness: 0.65, roughness: 0.25,
    clearcoat: 1.0, clearcoatRoughness: 0.06,
  });
  const blackMat = new THREE.MeshPhysicalMaterial({
    color: 0x0a0a0d, metalness: 0.55, roughness: 0.3,
    clearcoat: 1.0, clearcoatRoughness: 0.08,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x111419, metalness: 0.1, roughness: 0.05,
    transmission: 0.35, transparent: true, opacity: 0.85, ior: 1.4,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xeaeaea, metalness: 1.0, roughness: 0.18,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xff2030, emissive: 0x880810, roughness: 0.4, metalness: 0.3,
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff7d1, emissive: 0xfff2c0, emissiveIntensity: 1.2, roughness: 0.2,
  });

  // ============== Lower body (blue) ==============
  // Main floor pan
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.2, 4.4), blueMat);
  floor.position.y = -0.05;
  floor.castShadow = true;
  car.add(floor);

  // Sweeping mid-body (slightly tapered for a wedge silhouette)
  const midShape = new THREE.Shape();
  midShape.moveTo(-0.95, -2.2);
  midShape.lineTo( 0.95, -2.2);
  midShape.lineTo( 1.0,  -1.0);
  midShape.lineTo( 1.0,   1.4);
  midShape.lineTo( 0.85,  2.15);
  midShape.lineTo(-0.85,  2.15);
  midShape.lineTo(-1.0,   1.4);
  midShape.lineTo(-1.0,  -1.0);
  midShape.lineTo(-0.95, -2.2);
  const midGeo = new THREE.ExtrudeGeometry(midShape, { depth: 0.55, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.05, bevelSegments: 3 });
  midGeo.rotateX(-Math.PI / 2);
  midGeo.translate(0, 0.05, 0);
  const mid = new THREE.Mesh(midGeo, blueMat);
  mid.castShadow = true; mid.receiveShadow = true;
  car.add(mid);

  // ============== Upper body / cabin (black) ==============
  // Hood (front, low)
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.18, 1.4), blueMat);
  hood.position.set(0, 0.65, 1.4);
  hood.rotation.x = -0.06;
  hood.castShadow = true;
  car.add(hood);

  // Cabin / roof (low slung)
  const cabinShape = new THREE.Shape();
  cabinShape.moveTo(-0.7, -0.9);
  cabinShape.bezierCurveTo(-0.95, -0.4, -0.95, 0.6, -0.6, 1.0);
  cabinShape.lineTo(0.6, 1.0);
  cabinShape.bezierCurveTo(0.95, 0.6, 0.95, -0.4, 0.7, -0.9);
  cabinShape.lineTo(-0.7, -0.9);
  const cabinGeo = new THREE.ExtrudeGeometry(cabinShape, { depth: 0.45, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.05, bevelSegments: 3 });
  cabinGeo.rotateX(-Math.PI / 2);
  const cabin = new THREE.Mesh(cabinGeo, blackMat);
  cabin.position.set(0, 0.6, -0.1);
  cabin.castShadow = true;
  car.add(cabin);

  // Windshield + roof glass strip (signature curved)
  const wsGeo = new THREE.BoxGeometry(1.5, 0.04, 1.4);
  const ws = new THREE.Mesh(wsGeo, glassMat);
  ws.position.set(0, 1.06, 0.2);
  ws.rotation.x = -0.15;
  car.add(ws);

  // Side windows
  const sideWin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 1.3), glassMat);
  sideWin.position.set(0.92, 0.85, -0.05);
  car.add(sideWin);
  const sideWin2 = sideWin.clone(); sideWin2.position.x = -0.92; car.add(sideWin2);

  // Rear window
  const rw = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.9), glassMat);
  rw.position.set(0, 1.0, -0.85);
  rw.rotation.x = 0.18;
  car.add(rw);

  // Iconic Bugatti C-line (chrome) on the side - represented by a subtle curved bar
  const cLineGeo = new THREE.TorusGeometry(0.6, 0.04, 8, 16, Math.PI);
  const cLine = new THREE.Mesh(cLineGeo, chromeMat);
  cLine.position.set(1.0, 0.55, -0.3);
  cLine.rotation.set(0, Math.PI / 2, Math.PI / 2);
  cLine.scale.set(1, 0.7, 1);
  car.add(cLine);
  const cLine2 = cLine.clone(); cLine2.position.x = -1.0; cLine2.rotation.y = -Math.PI/2; car.add(cLine2);

  // Front grille (horseshoe shape)
  const grilleGeo = new THREE.TorusGeometry(0.32, 0.07, 8, 24, Math.PI);
  const grille = new THREE.Mesh(grilleGeo, chromeMat);
  grille.position.set(0, 0.28, 2.18);
  grille.rotation.x = Math.PI;
  grille.rotation.z = Math.PI;
  car.add(grille);
  const grilleFill = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.45),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 })
  );
  grilleFill.position.set(0, 0.28, 2.17);
  car.add(grilleFill);

  // Front splitter
  const splitter = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 0.04, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x202020, roughness: 0.6 })
  );
  splitter.position.set(0, -0.05, 2.18);
  car.add(splitter);

  // Headlights - quad LED strips
  for (const sx of [-0.55, 0.55]) {
    for (const dy of [0, -0.08]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.06, 0.05), headMat);
      hl.position.set(sx, 0.42 + dy, 2.18);
      car.add(hl);
    }
  }
  // Headlight glow points (point lights that move with car)
  const hlL = new THREE.PointLight(0xfff2c0, 0.6, 28, 1.5);
  hlL.position.set(-0.55, 0.42, 2.4); car.add(hlL);
  const hlR = hlL.clone(); hlR.position.x = 0.55; car.add(hlR);

  // Tail lights - signature thin red strip across the back
  const tailStrip = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.04), tailMat);
  tailStrip.position.set(0, 0.55, -2.18);
  car.add(tailStrip);
  // Quad tail squares
  for (const sx of [-0.55, 0.55]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.05), tailMat);
    t.position.set(sx, 0.42, -2.18);
    car.add(t);
  }

  // Rear diffuser
  const diff = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.18, 0.45),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.55, metalness: 0.5 })
  );
  diff.position.set(0, 0.05, -2.05);
  car.add(diff);

  // Quad exhaust
  for (const sx of [-0.35, -0.12, 0.12, 0.35]) {
    const ex = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.15, 12),
      chromeMat
    );
    ex.rotation.x = Math.PI / 2;
    ex.position.set(sx, 0.1, -2.18);
    car.add(ex);
  }

  // Rear wing (active aero look)
  const wingPostL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.18), blackMat);
  wingPostL.position.set(-0.55, 0.95, -1.7);
  car.add(wingPostL);
  const wingPostR = wingPostL.clone(); wingPostR.position.x = 0.55; car.add(wingPostR);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.5), blackMat);
  wing.position.set(0, 1.18, -1.72);
  wing.rotation.x = -0.08;
  wing.castShadow = true;
  car.add(wing);

  // Side mirrors
  for (const sx of [-1.05, 1.05]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.18), blackMat);
    arm.position.set(sx, 0.95, 0.45);
    car.add(arm);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.1), blackMat);
    m.position.set(sx, 0.95, 0.32);
    car.add(m);
  }

  // Side air intake (signature on Chiron)
  for (const sx of [-1.01, 1.01]) {
    const intake = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.32, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.5 })
    );
    intake.position.set(sx, 0.55, -0.6);
    car.add(intake);
  }

  return car;
}

function buildWheelMesh(radius, isFront) {
  const group = new THREE.Group();

  // Tire
  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 0.32, 28),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.85 })
  );
  group.add(tire);

  // Tread ridge
  const tread = new THREE.Mesh(
    new THREE.TorusGeometry(radius - 0.02, 0.03, 6, 28),
    new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.95 })
  );
  tread.rotation.y = Math.PI / 2;
  group.add(tread);

  // Rim - 5 spoke style
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.7, radius * 0.7, 0.34, 24),
    new THREE.MeshStandardMaterial({ color: 0xc8c8c8, metalness: 1.0, roughness: 0.25 })
  );
  group.add(rim);
  // Hub
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.35, 12),
    new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.4 })
  );
  group.add(hub);
  // Spokes
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.32, radius * 1.05),
      new THREE.MeshStandardMaterial({ color: 0xb0b0b0, metalness: 1.0, roughness: 0.3 })
    );
    spoke.rotation.y = (i / 5) * Math.PI * 2;
    group.add(spoke);
  }
  // Brake caliper (visible behind spokes)
  const caliper = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.18, 0.16),
    new THREE.MeshStandardMaterial({ color: 0xe2bb1f, metalness: 0.6, roughness: 0.4 })
  );
  caliper.position.set(0.16, 0.12, 0);
  group.add(caliper);

  group.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return group;
}
