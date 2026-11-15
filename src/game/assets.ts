import * as THREE from 'three';
import type { MaterialLibrary } from './textures';
import type { BiomeType } from './types';

export interface AnimatedPropRef {
  kind: 'rotor' | 'radar' | 'sway' | 'pulse' | 'bird' | 'hover';
  obj: THREE.Object3D;
  speed: number;
  phase: number;
  wingL?: THREE.Object3D;
  wingR?: THREE.Object3D;
  orbitRadius?: number;
  orbitCenter?: THREE.Vector3;
  baseY?: number;
}

export interface AssetBuilderContext {
  root: THREE.Group;
  mats: MaterialLibrary;
  isSoftwareGl: boolean;
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T;
  trackMat: <T extends THREE.Material>(m: T) => T;
  registerBox: (
    id: string,
    cx: number,
    baseY: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    surface: 'concrete' | 'metal' | 'wood' | 'stone' | 'foliage',
    opts?: { walkable?: boolean },
  ) => void;
  nextId: (prefix: string) => string;
  animatables: AnimatedPropRef[];
}

export function addBlackhawkHelicopter(
  ctx: AssetBuilderContext,
  cx: number,
  baseY: number,
  cz: number,
  yaw: number = 0.4,
  registerCollision: boolean = false,
) {
  const { root, mats, isSoftwareGl, trackGeo, trackMat, animatables } = ctx;
  const grp = new THREE.Group();
  const isAirborne = baseY > 0.15;

  // Contact shadow underneath fuselage ONLY when parked on ground
  if (!isAirborne) {
    const shadow = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(5.5, 11.5)),
      mats.contactShadowMat,
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.025;
    grp.add(shadow);
  }

  // Fuselage side profile extruded
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-3.4, 0.72);
  bodyShape.lineTo(2.1, 0.72);
  bodyShape.lineTo(3.5, 0.96);
  bodyShape.lineTo(3.65, 1.38);
  bodyShape.lineTo(2.45, 2.02);
  bodyShape.lineTo(1.25, 2.48);
  bodyShape.lineTo(-2.1, 2.48);
  bodyShape.lineTo(-3.4, 1.85);
  bodyShape.closePath();

  const hullGeo = trackGeo(
    new THREE.ExtrudeGeometry(bodyShape, {
      depth: 2.1,
      bevelEnabled: true,
      bevelThickness: 0.14,
      bevelSize: 0.12,
      bevelSegments: 2,
    }),
  );
  hullGeo.rotateY(-Math.PI / 2);
  hullGeo.translate(1.05, 0, 0);
  const hull = new THREE.Mesh(hullGeo, mats.heliOlive);
  hull.castShadow = !isSoftwareGl;
  hull.receiveShadow = !isSoftwareGl;
  grp.add(hull);

  // Sloped Armored Cockpit Windshield + Side Windows
  const cockpitGlass = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.75, 0.68, 1.1)),
    mats.opticGlass,
  );
  cockpitGlass.position.set(0, 1.88, 2.38);
  cockpitGlass.rotation.x = -0.62;
  grp.add(cockpitGlass);

  // Twin Turboshaft Engine Nacelles & Exhausts
  [-0.68, 0.68].forEach((ex) => {
    const nacelle = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.32, 0.36, 2.4, 10)),
      mats.steelDark,
    );
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(ex, 2.66, 0.1);
    const intake = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 10)),
      mats.polymerBlack,
    );
    intake.rotation.x = Math.PI / 2;
    intake.position.set(ex, 2.66, 1.32);
    const exhaust = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.24, 0.28, 0.45, 10)),
      mats.rustMetal,
    );
    exhaust.rotation.x = Math.PI / 2;
    exhaust.rotation.z = ex > 0 ? -0.35 : 0.35;
    exhaust.position.set(ex * 1.15, 2.66, -1.2);
    grp.add(nacelle, intake, exhaust);
  });

  // Tail Boom + Vertical Fin + Horizontal Stabilator
  const tailBoom = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.24, 0.48, 5.4, 10)),
    mats.heliOlive,
  );
  tailBoom.rotation.x = Math.PI / 2;
  tailBoom.position.set(0, 1.78, -5.7);
  grp.add(tailBoom);

  const fin = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.18, 1.65, 1.1)),
    mats.heliOlive,
  );
  fin.rotation.x = -0.32;
  fin.position.set(0, 2.45, -8.25);
  const stabilator = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(2.6, 0.12, 0.65)),
    mats.heliOlive,
  );
  stabilator.position.set(0, 1.68, -8.1);
  grp.add(fin, stabilator);

  // Landing Gear Struts + Drag Braces + Rubber Tires
  [
    [-1.18, 1.85],
    [1.18, 1.85],
  ].forEach(([gx, gz]) => {
    const strut = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.07, 0.08, 0.95, 8)),
      mats.steelDark,
    );
    strut.rotation.z = gx > 0 ? -0.35 : 0.35;
    strut.position.set(gx * 0.92, 0.62, gz);
    const brace = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.045, 0.05, 0.86, 6)),
      mats.steelDark,
    );
    brace.rotation.x = 0.58;
    brace.position.set(gx * 0.98, 0.66, gz - 0.32);
    const tire = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12)),
      mats.tireRubber,
    );
    tire.rotation.z = Math.PI / 2;
    tire.position.set(gx * 1.1, 0.36, gz);
    const hub = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.18, 0.18, 0.28, 10)),
      mats.steelGrate,
    );
    hub.rotation.z = Math.PI / 2;
    hub.position.copy(tire.position);
    grp.add(strut, brace, tire, hub);
  });
  // Tail wheel + angled oleo strut & yoke connecting cleanly into tail boom
  const tailStrut = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.05, 0.06, 1.48, 8)),
    mats.steelDark,
  );
  tailStrut.rotation.x = 0.24;
  tailStrut.position.set(0, 0.94, -7.62);
  const tailYoke = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.24, 0.18, 0.18)),
    mats.steelDark,
  );
  tailYoke.position.set(0, 0.3, -7.8);
  const tailWheel = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 10)),
    mats.tireRubber,
  );
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, 0.22, -7.8);
  const tailHub = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.11, 0.11, 0.18, 8)),
    mats.steelGrate,
  );
  tailHub.rotation.z = Math.PI / 2;
  tailHub.position.copy(tailWheel.position);
  grp.add(tailStrut, tailYoke, tailWheel, tailHub);

  // Nose FLIR Sensor Turret & Belly Searchlight Pod
  const flirYoke = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.18, 0.22, 0.22, 10)),
    mats.steelDark,
  );
  flirYoke.position.set(0, 0.72, 2.85);
  const flirBall = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.22, 10, 10)),
    mats.polymerBlack,
  );
  flirBall.position.set(0, 0.56, 2.85);
  const searchHousing = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.16, 0.18, 0.28, 10)),
    mats.steelDark,
  );
  searchHousing.position.set(0, 0.64, 1.35);
  const searchLens = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 10)),
    trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfff8e7,
        emissive: 0xffe8b0,
        emissiveIntensity: isAirborne ? 1.8 : 0.25,
      }),
    ),
  );
  searchLens.position.set(0, 0.5, 1.35);
  grp.add(flirYoke, flirBall, searchHousing, searchLens);

  // Navigation Lights (Red port, Green starboard)
  const portMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 2.0 }),
  );
  const stbdMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 2.0 }),
  );
  const portLight = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.1, 8, 8)), portMat);
  portLight.position.set(-1.18, 1.4, 0.4);
  const stbdLight = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.1, 8, 8)), stbdMat);
  stbdLight.position.set(1.18, 1.4, 0.4);
  grp.add(portLight, stbdLight);

  // Main 4-Blade Rotor Assembly (Animated)
  const mainRotor = new THREE.Group();
  mainRotor.position.set(0, 3.05, 0.1);
  const mast = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.18, 0.22, 0.55, 10)),
    mats.steelDark,
  );
  mast.position.y = -0.22;
  const hubCap = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.38, 0.42, 0.22, 12)),
    mats.gunmetal,
  );
  mainRotor.add(mast, hubCap);
  for (let b = 0; b < 4; b++) {
    const blade = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.28, 0.04, 5.2)),
      mats.polymerBlack,
    );
    const tip = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.29, 0.045, 0.42)),
      mats.hazardStripe,
    );
    const pivot = new THREE.Group();
    pivot.rotation.y = (b * Math.PI) / 2;
    blade.position.z = 2.85;
    tip.position.z = 5.25;
    pivot.add(blade, tip);
    mainRotor.add(pivot);
  }
  grp.add(mainRotor);
  animatables.push({ kind: 'rotor', obj: mainRotor, speed: 9.5, phase: 0 });

  // Tail Rotor Assembly (Animated)
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.24, 2.85, -8.5);
  for (let b = 0; b < 4; b++) {
    const tBlade = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.03, 0.16, 1.05)),
      mats.polymerBlack,
    );
    tBlade.rotation.x = (b * Math.PI) / 2;
    tailRotor.add(tBlade);
  }
  grp.add(tailRotor);
  animatables.push({ kind: 'radar', obj: tailRotor, speed: 14.0, phase: 0 });

  grp.position.set(cx, baseY, cz);
  grp.rotation.order = 'YXZ';
  grp.rotation.y = yaw;
  if (isAirborne) {
    grp.rotation.x = 0.08;
    grp.rotation.z = 0.06;
    animatables.push({
      kind: 'hover',
      obj: grp,
      speed: 1.4,
      phase: (cx + cz) * 0.2,
      baseY,
    });
  }
  root.add(grp);

  if (registerCollision) {
    ctx.registerBox(ctx.nextId('heli'), cx, baseY, cz, 3.2, 3.1, 7.6, 'metal');
  }
}

export function addCoolingTower(
  ctx: AssetBuilderContext,
  cx: number,
  cz: number,
  scale: number = 1.0,
) {
  const { root, mats, trackGeo } = ctx;
  const grp = new THREE.Group();

  // Hyperbolic silhouette via LatheGeometry
  const pts: THREE.Vector2[] = [];
  const h = 26 * scale;
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const y = t * h;
    const r = (7.2 - 3.0 * Math.sin(t * Math.PI * 0.78) + t * 0.8) * scale;
    pts.push(new THREE.Vector2(r, y));
  }
  const shellGeo = trackGeo(new THREE.LatheGeometry(pts, 22));
  const shell = new THREE.Mesh(shellGeo, mats.concreteWall);
  shell.position.y = 1.8 * scale;
  grp.add(shell);

  // Concrete circular ring foundation anchoring intake stilts solidly to ground
  const ringFoot = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(7.35 * scale, 0.45 * scale, 8, 22)),
    mats.concreteBarrier,
  );
  ringFoot.rotation.x = Math.PI / 2;
  ringFoot.position.y = 0.22 * scale;
  grp.add(ringFoot);

  // Diagonal intake support stilts around base
  const stiltCount = 12;
  for (let i = 0; i < stiltCount; i++) {
    const a = (i / stiltCount) * Math.PI * 2;
    const stilt = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.24 * scale, 0.3 * scale, 2.6 * scale, 6)),
      mats.concreteBarrier,
    );
    stilt.position.set(
      Math.cos(a) * 7.1 * scale,
      1.1 * scale,
      Math.sin(a) * 7.1 * scale,
    );
    stilt.rotation.z = Math.cos(a) * 0.18;
    stilt.rotation.x = -Math.sin(a) * 0.18;
    grp.add(stilt);
  }

  // Rim collar + red aviation warning ring
  const rim = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(5.55 * scale, 0.32 * scale, 8, 22)),
    mats.hazardStripe,
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = h + 1.75 * scale;
  grp.add(rim);

  grp.position.set(cx, 0, cz);
  root.add(grp);
}

export function addRadarDish(
  ctx: AssetBuilderContext,
  cx: number,
  baseY: number,
  cz: number,
  scale: number = 1.0,
) {
  const { root, mats, trackGeo, animatables } = ctx;
  const grp = new THREE.Group();

  const base = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(1.1 * scale, 1.5 * scale, 1.2 * scale, 8)),
    mats.concreteBarrier,
  );
  base.position.y = 0.6 * scale;
  const mast = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.32 * scale, 0.55 * scale, 6.2 * scale, 8)),
    mats.steelDark,
  );
  mast.position.y = 4.2 * scale;
  grp.add(base, mast);

  const rotorGrp = new THREE.Group();
  rotorGrp.position.y = 7.4 * scale;

  const yoke = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.8 * scale, 0.9 * scale, 0.9 * scale)),
    mats.steelGrate,
  );
  const dish = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(2.1 * scale, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.36)),
    mats.concreteWall,
  );
  dish.rotation.x = Math.PI * 0.68;
  dish.position.set(0, 0.3 * scale, 0.55 * scale);
  const horn = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.08 * scale, 0.16 * scale, 1.25 * scale, 8)),
    mats.steelDark,
  );
  horn.rotation.x = -Math.PI * 0.32;
  horn.position.set(0, 0.65 * scale, 1.25 * scale);
  rotorGrp.add(yoke, dish, horn);
  grp.add(rotorGrp);

  animatables.push({
    kind: 'rotor',
    obj: rotorGrp,
    speed: 0.75,
    phase: Math.random() * Math.PI * 2,
  });

  grp.position.set(cx, baseY, cz);
  root.add(grp);
  ctx.registerBox(ctx.nextId('radar'), cx, baseY, cz, 2.4 * scale, 7.2 * scale, 2.4 * scale, 'metal');
}

export function addSubwayCar(
  ctx: AssetBuilderContext,
  cx: number,
  cz: number,
  yaw: number = 0,
) {
  const { root, mats, isSoftwareGl, trackGeo, trackMat } = ctx;
  const grp = new THREE.Group();

  // Bogies & Steel Rails underneath
  const railGeo = trackGeo(new THREE.BoxGeometry(0.12, 0.14, 15.5));
  [-0.75, 0.75].forEach((rx) => {
    const rail = new THREE.Mesh(railGeo, mats.steelDark);
    rail.position.set(rx, 0.07, 0);
    grp.add(rail);
  });

  [-4.2, 4.2].forEach((bz) => {
    const bogie = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(2.1, 0.38, 1.9)),
      mats.steelDark,
    );
    bogie.position.set(0, 0.34, bz);
    grp.add(bogie);
    [-0.65, 0.65].forEach((wz) => {
      [-0.95, 0.95].forEach((wx) => {
        const wheel = new THREE.Mesh(
          trackGeo(new THREE.CylinderGeometry(0.32, 0.32, 0.14, 12)),
          mats.steelGrate,
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.32, bz + wz);
        grp.add(wheel);
      });
    });
  });

  // Main Stainless Car Body
  const body = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(2.75, 2.65, 13.8)),
    mats.steelGrate,
  );
  body.position.y = 1.92;
  body.castShadow = !isSoftwareGl;
  body.receiveShadow = !isSoftwareGl;
  grp.add(body);

  // Curved Roof + HVAC Pods
  const roof = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(1.36, 1.38, 13.8, 12, 1, false, -Math.PI / 2, Math.PI)),
    mats.steelDark,
  );
  roof.rotation.z = Math.PI / 2;
  roof.rotation.y = Math.PI / 2;
  roof.position.y = 3.22;
  grp.add(roof);

  [-3.2, 3.2].forEach((hz) => {
    const hvac = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.4, 0.34, 2.1)),
      mats.polymerBlack,
    );
    hvac.position.set(0, 3.68, hz);
    grp.add(hvac);
  });

  // Transit Accent Stripe & Illuminated Passenger Windows
  const stripe = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(2.8, 0.24, 13.82)),
    mats.hazardStripe,
  );
  stripe.position.y = 1.32;
  grp.add(stripe);

  const winGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xfde68a,
      emissiveIntensity: 0.72,
      roughness: 0.2,
    }),
  );
  for (let wz = -5.2; wz <= 5.2; wz += 2.1) {
    const win = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(2.82, 0.85, 1.35)),
      winGlowMat,
    );
    win.position.set(0, 2.38, wz);
    grp.add(win);
  }

  // Headlights on front nose
  const headMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff8e7, emissiveIntensity: 2.0 }),
  );
  [-0.75, 0.75].forEach((hx) => {
    const lamp = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 10)), headMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(hx, 1.15, 6.92);
    grp.add(lamp);
  });

  grp.position.set(cx, 0, cz);
  grp.rotation.y = yaw;
  root.add(grp);

  const cos = Math.abs(Math.cos(yaw));
  const sin = Math.abs(Math.sin(yaw));
  const w = 2.85 * cos + 13.9 * sin;
  const d = 13.9 * cos + 2.85 * sin;
  ctx.registerBox(ctx.nextId('subway'), cx, 0, cz, w, 3.6, d, 'metal');
}

export function addTree(
  ctx: AssetBuilderContext,
  cx: number,
  cz: number,
  kind: 'pine' | 'snowPine' | 'palm' | 'cypress' | 'charred',
  scale: number = 1.0,
) {
  const { root, mats, isSoftwareGl, trackGeo, trackMat, animatables } = ctx;
  const grp = new THREE.Group();

  if (kind === 'pine' || kind === 'snowPine') {
    const trunkH = 3.2 * scale;
    const trunk = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.16 * scale, 0.28 * scale, trunkH, 8)),
      mats.treeBark,
    );
    trunk.position.y = trunkH / 2;
    trunk.castShadow = !isSoftwareGl;
    grp.add(trunk);

    const crown = new THREE.Group();
    crown.position.y = trunkH * 0.65;
    const foliageMat = kind === 'snowPine' ? mats.foliageGreen : mats.foliageGreen;
    for (let t = 0; t < 4; t++) {
      const r = (2.1 - t * 0.42) * scale;
      const coneH = (2.4 - t * 0.3) * scale;
      const cone = new THREE.Mesh(
        trackGeo(new THREE.ConeGeometry(r, coneH, 8)),
        foliageMat,
      );
      cone.position.y = t * 1.15 * scale;
      cone.castShadow = !isSoftwareGl;
      crown.add(cone);

      if (kind === 'snowPine') {
        const cap = new THREE.Mesh(
          trackGeo(new THREE.ConeGeometry(r * 0.88, coneH * 0.42, 8)),
          mats.snowGround,
        );
        cap.position.y = t * 1.15 * scale + coneH * 0.32;
        crown.add(cap);
      }
    }
    grp.add(crown);
    animatables.push({
      kind: 'sway',
      obj: crown,
      speed: 1.4,
      phase: cx * 0.3 + cz * 0.2,
    });
  } else if (kind === 'palm') {
    // Segmented slightly curved tropical palm trunk
    const segs = 5;
    let curY = 0;
    let curX = 0;
    const lean = ((Math.sin(cx + cz) > 0 ? 1 : -1) * 0.22) * scale;
    for (let s = 0; s < segs; s++) {
      const segH = 1.15 * scale;
      const seg = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry((0.2 - s * 0.022) * scale, (0.24 - s * 0.022) * scale, segH, 8)),
        mats.treeBark,
      );
      curX += lean * (s * 0.14);
      seg.position.set(curX, curY + segH / 2, 0);
      seg.rotation.z = -lean * 0.16 * s;
      seg.castShadow = !isSoftwareGl;
      grp.add(seg);
      curY += segH * 0.94;
    }

    const crown = new THREE.Group();
    crown.position.set(curX, curY, 0);
    for (let f = 0; f < 8; f++) {
      const ang = (f / 8) * Math.PI * 2;
      const frondPivot = new THREE.Group();
      frondPivot.rotation.y = ang;
      const frond = new THREE.Mesh(
        trackGeo(new THREE.ConeGeometry(0.42 * scale, 2.8 * scale, 4)),
        mats.foliagePalm,
      );
      frond.scale.set(1.0, 1.0, 0.22);
      frond.rotation.z = -Math.PI * 0.34;
      frond.position.set(1.25 * scale, -0.15 * scale, 0);
      frondPivot.add(frond);
      crown.add(frondPivot);
    }
    grp.add(crown);
    animatables.push({
      kind: 'sway',
      obj: crown,
      speed: 1.8,
      phase: cx * 0.4 + cz * 0.15,
    });
  } else if (kind === 'cypress') {
    const trunk = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.14 * scale, 0.22 * scale, 2.2 * scale, 8)),
      mats.treeBark,
    );
    trunk.position.y = 1.1 * scale;
    grp.add(trunk);

    const crown = new THREE.Group();
    crown.position.y = 1.8 * scale;
    const body = new THREE.Mesh(
      trackGeo(new THREE.ConeGeometry(1.05 * scale, 5.8 * scale, 10)),
      mats.foliageGreen,
    );
    body.position.y = 2.6 * scale;
    body.castShadow = !isSoftwareGl;
    crown.add(body);
    grp.add(crown);
    animatables.push({ kind: 'sway', obj: crown, speed: 1.1, phase: cx + cz });
  } else {
    // Charred volcanic dead tree
    const charredMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x1b1817, roughness: 0.95 }),
    );
    const trunk = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.1 * scale, 0.26 * scale, 4.2 * scale, 7)),
      charredMat,
    );
    trunk.position.y = 2.1 * scale;
    trunk.rotation.z = 0.08;
    const branchL = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.05 * scale, 0.11 * scale, 1.8 * scale, 6)),
      charredMat,
    );
    branchL.position.set(-0.55 * scale, 3.3 * scale, 0);
    branchL.rotation.z = 0.72;
    const branchR = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.04 * scale, 0.1 * scale, 1.5 * scale, 6)),
      charredMat,
    );
    branchR.position.set(0.45 * scale, 2.8 * scale, 0.2 * scale);
    branchR.rotation.z = -0.68;
    grp.add(trunk, branchL, branchR);
  }

  grp.position.set(cx, 0, cz);
  root.add(grp);
}

export function addBoulderCluster(
  ctx: AssetBuilderContext,
  cx: number,
  cz: number,
  radius: number,
  mat: THREE.Material,
  registerCollision: boolean = true,
) {
  const { root, mats, isSoftwareGl, trackGeo } = ctx;
  const grp = new THREE.Group();

  const shadow = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(radius * 1.4, 14)),
    mats.contactShadowMat,
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  grp.add(shadow);

  // Build angular multi-faceted craggy rock outcrop from overlapping jagged blocks
  const makeJaggedRockGeo = (r: number, seed: number) => {
    const g = new THREE.DodecahedronGeometry(r, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const n =
        0.78 +
        0.34 * Math.abs(Math.sin(vx * 2.1 + seed) * Math.cos(vz * 1.9 - seed * 0.7)) +
        (vy > 0 ? 0.12 * Math.sin(vy * 3.1 + seed) : -0.15);
      pos.setXYZ(i, vx * n, vy * (vy > 0 ? n * 0.85 : 0.65), vz * n);
    }
    g.computeVertexNormals();
    return trackGeo(g);
  };

  const mainRock = new THREE.Mesh(makeJaggedRockGeo(radius * 0.85, cx * 0.7 + cz), mat);
  mainRock.position.y = radius * 0.48;
  mainRock.rotation.set(0.18, cx * 0.45, 0.14);
  mainRock.castShadow = !isSoftwareGl;
  mainRock.receiveShadow = !isSoftwareGl;
  grp.add(mainRock);

  const shoulderRock = new THREE.Mesh(makeJaggedRockGeo(radius * 0.62, cz * 1.3 + 4.1), mat);
  shoulderRock.position.set(radius * 0.58, radius * 0.34, radius * 0.25);
  shoulderRock.rotation.set(0.32, cz * 0.5, -0.25);
  shoulderRock.castShadow = !isSoftwareGl;
  grp.add(shoulderRock);

  const chipRock = new THREE.Mesh(makeJaggedRockGeo(radius * 0.4, cx * 1.7 + 9.2), mat);
  chipRock.position.set(-radius * 0.52, radius * 0.2, -radius * 0.3);
  chipRock.rotation.set(-0.2, cx + cz, 0.4);
  grp.add(chipRock);

  grp.position.set(cx, 0, cz);
  root.add(grp);

  if (registerCollision) {
    ctx.registerBox(ctx.nextId('rock'), cx, 0, cz, radius * 1.9, radius * 1.3, radius * 1.8, 'stone');
  }
}

export function addChemicalVat(
  ctx: AssetBuilderContext,
  cx: number,
  cz: number,
  isToxic: boolean = true,
) {
  const { root, mats, isSoftwareGl, trackGeo } = ctx;
  const grp = new THREE.Group();

  const tank = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(1.45, 1.45, 3.8, 16)),
    mats.rustMetal,
  );
  tank.position.y = 2.4;
  tank.castShadow = !isSoftwareGl;
  tank.receiveShadow = !isSoftwareGl;
  grp.add(tank);

  const cap = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(1.45, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)),
    mats.steelDark,
  );
  cap.position.y = 4.3;
  grp.add(cap);

  // Support legs + anchor footpads
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const lx = Math.cos(a) * 1.15;
    const lz = Math.sin(a) * 1.15;
    const leg = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.14, 0.18, 0.9, 8)),
      mats.steelDark,
    );
    leg.position.set(lx, 0.45, lz);
    const pad = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.24, 0.26, 0.1, 8)),
      mats.concreteBarrier,
    );
    pad.position.set(lx, 0.05, lz);
    grp.add(leg, pad);
  }

  // Top vent collar & relief elbow pipe
  const ventStack = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.18, 0.22, 0.65, 10)),
    mats.steelDark,
  );
  ventStack.position.set(0, 5.72, 0);
  const ventElbow = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.16, 0.16, 0.55, 8)),
    mats.copperBrass,
  );
  ventElbow.rotation.z = Math.PI / 2;
  ventElbow.position.set(0.24, 5.98, 0);
  grp.add(ventStack, ventElbow);

  // Glowing sight-glass strip + hazard band
  const band = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(1.48, 1.48, 0.38, 16)),
    mats.hazardStripe,
  );
  band.position.y = 3.5;
  const sight = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.28, 2.2, 0.14)),
    isToxic ? mats.toxicSludge : mats.magmaGlow,
  );
  sight.position.set(0, 2.3, 1.44);
  grp.add(band, sight);

  grp.position.set(cx, 0, cz);
  root.add(grp);
  ctx.registerBox(ctx.nextId('vat'), cx, 0, cz, 2.9, 4.8, 2.9, 'metal');
}

export function addGantryCrane(
  ctx: AssetBuilderContext,
  cx: number,
  cz: number,
  spanX: number = 14,
  height: number = 12,
) {
  const { root, mats, trackGeo } = ctx;
  const grp = new THREE.Group();

  const legGeo = trackGeo(new THREE.BoxGeometry(0.65, height, 0.65));
  const sleeperGeo = trackGeo(new THREE.BoxGeometry(1.25, 0.42, 4.4));
  const braceGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.32, 3.2));
  [-spanX / 2, spanX / 2].forEach((lx) => {
    const sleeper = new THREE.Mesh(sleeperGeo, mats.concreteBarrier);
    sleeper.position.set(lx, 0.21, 0);
    const crossMid = new THREE.Mesh(braceGeo, mats.steelDark);
    crossMid.position.set(lx, height * 0.48, 0);
    const crossTop = new THREE.Mesh(braceGeo, mats.steelDark);
    crossTop.position.set(lx, height - 0.4, 0);
    grp.add(sleeper, crossMid, crossTop);
    [-1.6, 1.6].forEach((lz) => {
      const leg = new THREE.Mesh(legGeo, mats.containerCrimson);
      leg.position.set(lx, height / 2, lz);
      grp.add(leg);
    });
  });

  const beam = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(spanX + 6, 1.1, 2.2)),
    mats.containerCrimson,
  );
  beam.position.set(0, height + 0.4, 0);
  const trolley = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(2.6, 0.85, 2.5)),
    mats.hazardStripe,
  );
  trolley.position.set(1.5, height - 0.3, 0);
  const cable = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.05, 0.05, 4.2, 6)),
    mats.steelDark,
  );
  cable.position.set(1.5, height - 2.6, 0);
  const spreader = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(3.8, 0.35, 1.6)),
    mats.hazardStripe,
  );
  spreader.position.set(1.5, height - 4.7, 0);
  const lockClampL = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.28, 0.35, 1.5)),
    mats.steelDark,
  );
  lockClampL.position.set(-0.2, height - 4.95, 0);
  const lockClampR = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.28, 0.35, 1.5)),
    mats.steelDark,
  );
  lockClampR.position.set(3.2, height - 4.95, 0);
  grp.add(beam, trolley, cable, spreader, lockClampL, lockClampR);

  grp.position.set(cx, 0, cz);
  root.add(grp);
}

export function addFreighterShip(
  ctx: AssetBuilderContext,
  cx: number,
  cz: number,
) {
  const { root, mats, trackGeo, trackMat } = ctx;
  const grp = new THREE.Group();

  // Tapered ocean hull silhouette (ExtrudeGeometry vertically)
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-4.8, -24);
  hullShape.lineTo(4.8, -24);
  hullShape.lineTo(5.6, -18);
  hullShape.lineTo(5.6, 14);
  hullShape.lineTo(3.4, 22);
  hullShape.lineTo(0, 27);
  hullShape.lineTo(-3.4, 22);
  hullShape.lineTo(-5.6, 14);
  hullShape.lineTo(-5.6, -18);
  hullShape.closePath();

  const hullGeo = trackGeo(
    new THREE.ExtrudeGeometry(hullShape, {
      depth: 6.4,
      bevelEnabled: true,
      bevelThickness: 0.25,
      bevelSize: 0.2,
      bevelSegments: 2,
    }),
  );
  hullGeo.rotateX(-Math.PI / 2);
  const hull = new THREE.Mesh(hullGeo, mats.containerNavy);
  hull.position.y = -0.8;
  grp.add(hull);

  // Red waterline boot-top & dark steel deck coaming
  const deckPlate = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(10.2, 0.35, 42)),
    mats.steelDark,
  );
  deckPlate.position.set(0, 5.75, -1.5);
  grp.add(deckPlate);

  // Multi-tier Stern Bridge Superstructure + Glowing Navigation Windows
  const bridgeBase = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(9.2, 4.6, 8.8)),
    mats.concreteWall,
  );
  bridgeBase.position.set(0, 8.1, -17.5);
  const bridgeHouse = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(10.8, 2.2, 5.6)),
    mats.concreteWall,
  );
  bridgeHouse.position.set(0, 11.5, -16.8);
  const bridgeWinMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.4,
      roughness: 0.2,
    }),
  );
  const bridgeWin = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(10.9, 0.85, 4.2)),
    bridgeWinMat,
  );
  bridgeWin.position.set(0, 11.6, -16.2);
  const funnel = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(1.15, 1.45, 3.8, 12)),
    mats.containerCrimson,
  );
  funnel.position.set(0, 13.8, -19.5);
  const funnelRim = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(1.22, 1.22, 0.55, 12)),
    mats.polymerBlack,
  );
  funnelRim.position.set(0, 15.65, -19.5);
  const mast = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.16, 0.28, 5.6, 8)),
    mats.steelGrate,
  );
  mast.position.set(0, 15.2, -16.4);
  const mastBar = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(3.8, 0.2, 0.2)),
    mats.steelGrate,
  );
  mastBar.position.set(0, 16.4, -16.4);
  grp.add(bridgeBase, bridgeHouse, bridgeWin, funnel, funnelRim, mast, mastBar);

  // Stacked Shipping Containers on Cargo Deck
  const cargoCols: [number, number, number, THREE.Material][] = [
    [-2.5, 7.2, 6, mats.containerCrimson],
    [2.5, 7.2, 6, mats.containerOlive],
    [-2.5, 10.0, 6, mats.containerNavy],
    [2.5, 10.0, 6, mats.containerCrimson],
    [-2.5, 7.2, -3, mats.containerOlive],
    [2.5, 7.2, -3, mats.containerCrimson],
    [-2.5, 10.0, -3, mats.containerOlive],
    [0, 7.2, 14, mats.containerCrimson],
  ];
  cargoCols.forEach(([bx, by, bz, mat]) => {
    const c = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.2, 2.75, 6.8)), mat);
    c.position.set(bx, by, bz);
    grp.add(c);
  });

  grp.position.set(cx, 0, cz);
  root.add(grp);
}

export function addMissileSiloUnit(
  ctx: AssetBuilderContext,
  cx: number,
  cz: number,
) {
  const { root, mats, trackGeo, trackMat } = ctx;
  const grp = new THREE.Group();

  // Launch pit collar
  const pitCollar = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(3.4, 3.8, 1.1, 16)),
    mats.concreteBarrier,
  );
  pitCollar.position.y = 0.55;
  grp.add(pitCollar);

  // ICBM Multi-stage Missile Body
  const stage1 = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(1.15, 1.25, 10.5, 16)),
    mats.steelGrate,
  );
  stage1.position.y = 6.2;
  const band = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(1.22, 1.22, 0.8, 16)),
    mats.hazardDrum,
  );
  band.position.y = 10.2;
  const cone = new THREE.Mesh(
    trackGeo(new THREE.ConeGeometry(1.15, 3.8, 16)),
    mats.gunmetal,
  );
  cone.position.y = 13.35;
  grp.add(stage1, band, cone);

  // 4 Stabilizer Fins
  for (let f = 0; f < 4; f++) {
    const a = (f / 4) * Math.PI * 2;
    const fin = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.18, 2.1, 0.9)),
      mats.hazardDrum,
    );
    fin.position.set(Math.cos(a) * 1.45, 2.2, Math.sin(a) * 1.45);
    fin.rotation.y = -a + Math.PI / 2;
    grp.add(fin);
  }

  // Umbilical Steel Gantry Tower alongside rocket
  const gantry = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.4, 13.5, 1.4)),
    mats.steelDark,
  );
  gantry.position.set(-2.6, 6.75, 0);
  const arm = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(2.2, 0.45, 0.5)),
    mats.hazardStripe,
  );
  arm.position.set(-1.3, 9.6, 0);
  const beaconMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 2.0 }),
  );
  const beacon = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.28, 8, 8)), beaconMat);
  beacon.position.set(-2.6, 13.8, 0);
  grp.add(gantry, arm, beacon);

  grp.position.set(cx, 0, cz);
  root.add(grp);
  ctx.registerBox(ctx.nextId('silo'), cx, 0, cz, 4.8, 6.0, 4.8, 'metal');
}

export function addMountainPerimeter(
  ctx: AssetBuilderContext,
  biome: BiomeType,
) {
  const { root, mats, trackGeo, trackMat } = ctx;
  const cloneDouble = (m: THREE.MeshStandardMaterial) => {
    const c = m.clone();
    c.side = THREE.DoubleSide;
    c.flatShading = true;
    return trackMat(c);
  };
  const rockMat =
    biome === 'desert' || biome === 'mediterranean'
      ? cloneDouble(mats.sandstoneRock)
      : biome === 'arctic' || biome === 'bunker'
        ? trackMat(
            new THREE.MeshStandardMaterial({
              color: 0x5c7086,
              roughness: 0.9,
              flatShading: true,
              side: THREE.DoubleSide,
            }),
          )
        : biome === 'jungle'
          ? cloneDouble(mats.jungleMoss)
          : biome === 'volcanic'
            ? trackMat(
                new THREE.MeshStandardMaterial({
                  color: 0x1e1918,
                  roughness: 0.94,
                  flatShading: true,
                  side: THREE.DoubleSide,
                }),
              )
            : trackMat(
                new THREE.MeshStandardMaterial({
                  color: 0x262e38,
                  roughness: 0.92,
                  flatShading: true,
                  side: THREE.DoubleSide,
                }),
              );

  // Sculpted continuous natural mountain range ring (height-displaced cylindrical terrain skirt)
  const radialSegs = 96;
  const ringSegs = 5;
  const innerR = 54;
  const outerR = 114;
  const ridgeGeo = new THREE.PlaneGeometry(1, 1, radialSegs, ringSegs);
  const pos = ridgeGeo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    // u in [0..1] -> negative angle so vertex normals face +Y upward toward sun
    const u = pos.getX(i) + 0.5;
    const v = pos.getY(i) + 0.5; // 0 = inner base, 1 = outer skirt
    const angle = -u * Math.PI * 2;
    const radius = innerR + v * (outerR - innerR);

    // Asymmetric jagged alpine ridge crest profile
    const envelope = Math.sin(v * Math.PI);
    const n1 = Math.abs(Math.sin(angle * 3.0 + 0.9));
    const n2 = Math.abs(Math.cos(angle * 7.0 - 0.55));
    const n3 = Math.sin(angle * 15.0 + v * 5.0) * 0.5 + 0.5;
    const n4 = Math.cos(angle * 23.0 + 1.4) * 0.5 + 0.5;
    const baseAmp =
      biome === 'volcanic' || biome === 'arctic' || biome === 'desert'
        ? 25
        : 16;
    const h =
      envelope * (4 + baseAmp * (0.45 * n1 + 0.3 * n2 + 0.16 * n3 + 0.09 * n4)) - 0.8;

    const jitterR = radius + (n3 - 0.5) * 9 * envelope;
    pos.setXYZ(i, Math.cos(angle) * jitterR, h, Math.sin(angle) * jitterR);
  }
  ridgeGeo.computeVertexNormals();
  const ridgeMesh = new THREE.Mesh(trackGeo(ridgeGeo), rockMat);
  root.add(ridgeMesh);

  // Add snow-capped summit layer on arctic/bunker mountains
  if (biome === 'arctic' || biome === 'bunker') {
    const snowCapGeo = ridgeGeo.clone();
    const sPos = snowCapGeo.attributes.position;
    for (let i = 0; i < sPos.count; i++) {
      const y = sPos.getY(i);
      sPos.setY(i, y > 11.5 ? y + 0.32 : y - 3.5);
    }
    snowCapGeo.computeVertexNormals();
    const snowCap = new THREE.Mesh(trackGeo(snowCapGeo), cloneDouble(mats.snowGround));
    root.add(snowCap);
  }
}

export function addBirdFlock(
  ctx: AssetBuilderContext,
  count: number,
  birdColor: number,
) {
  const { root, trackGeo, trackMat, animatables } = ctx;
  const birdMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: birdColor,
      roughness: 0.8,
      side: THREE.DoubleSide,
    }),
  );

  for (let i = 0; i < count; i++) {
    const bird = new THREE.Group();
    const body = new THREE.Mesh(
      trackGeo(new THREE.ConeGeometry(0.12, 0.56, 6)),
      birdMat,
    );
    body.rotation.x = Math.PI / 2;
    bird.add(body);

    const wingGeo = trackGeo(new THREE.BoxGeometry(0.62, 0.025, 0.22));
    const wingL = new THREE.Group();
    const wingLMesh = new THREE.Mesh(wingGeo, birdMat);
    wingLMesh.position.x = -0.31;
    wingL.add(wingLMesh);

    const wingR = new THREE.Group();
    const wingRMesh = new THREE.Mesh(wingGeo, birdMat);
    wingRMesh.position.x = 0.31;
    wingR.add(wingRMesh);

    bird.add(wingL, wingR);

    const orbitRadius = 14 + (i % 4) * 5.5;
    const baseY = 12.5 + (i % 3) * 3.2;
    const phase = (i / count) * Math.PI * 2;
    bird.position.set(Math.cos(phase) * orbitRadius, baseY, Math.sin(phase) * orbitRadius);
    root.add(bird);

    animatables.push({
      kind: 'bird',
      obj: bird,
      wingL,
      wingR,
      speed: 0.35 + (i % 3) * 0.08,
      phase,
      orbitRadius,
      orbitCenter: new THREE.Vector3(0, 0, 2 - (i % 2) * 14),
      baseY,
    });
  }
}
