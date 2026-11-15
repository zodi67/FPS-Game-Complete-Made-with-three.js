import * as THREE from 'three';
import type { MaterialLibrary } from './textures';
import type { RagdollState } from './rules';
import type { EnemyArchetype, HitZone, LevelConfig } from './types';

export type EnemyAIState =
  | 'patrol'
  | 'advance'
  | 'strafe'
  | 'telegraph'
  | 'fire'
  | 'flinch'
  | 'ko';

export interface EnemyHitbox {
  zone: HitZone;
  mesh: THREE.Mesh;
  enemyId: string;
}

export interface EnemyRig {
  id: string;
  archetype: EnemyArchetype;
  sector: number;
  scale: number;
  root: THREE.Group;
  pelvis: THREE.Group;
  torso: THREE.Group;
  headGroup: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  wpnGrp: THREE.Group;
  rotors: THREE.Object3D[];
  muzzlePoint: THREE.Object3D;
  laserLine: THREE.Line;
  laserMat: THREE.LineBasicMaterial;
  visorMat: THREE.MeshStandardMaterial;
  contactShadow: THREE.Mesh;
  hitboxes: EnemyHitbox[];
  hp: number;
  maxHp: number;
  armor: number;
  alive: boolean;
  isFlying: boolean;
  hoverAlt: number;
  aiState: EnemyAIState;
  stateTimer: number;
  fireCooldown: number;
  burstRemaining: number;
  walkPhase: number;
  strafeSign: number;
  flinchTimer: number;
  koTimer: number;
  koFallDir: number;
  koSettled: boolean;
  ragdoll: RagdollState | null;
  crashAngVel: THREE.Vector3;
  hitFlashTimer: number;
  spawnPos: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  dispose: () => void;
}

function makePlateShape(w: number, h: number): THREE.Shape {
  const s = new THREE.Shape();
  const hw = w / 2;
  const hh = h / 2;
  s.moveTo(-hw * 0.68, hh);
  s.lineTo(hw * 0.68, hh);
  s.lineTo(hw, hh * 0.42);
  s.lineTo(hw, -hh);
  s.lineTo(-hw, -hh);
  s.lineTo(-hw, hh * 0.42);
  s.closePath();
  return s;
}

export function createEnemyRig(
  id: string,
  archetype: EnemyArchetype,
  sector: number,
  spawnX: number,
  spawnY: number,
  spawnZ: number,
  hpMult: number,
  mats: MaterialLibrary,
  isSoftwareGl: boolean,
  camo: LevelConfig['enemyCamo'] = 'urban',
): EnemyRig {
  const root = new THREE.Group();
  const isDrone = archetype === 'drone';
  const hoverAlt = isDrone ? 2.45 : 0;
  root.position.set(spawnX, spawnY + hoverAlt, spawnZ);

  const geometries: THREE.BufferGeometry[] = [];
  const localMaterials: THREE.Material[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    localMaterials.push(m);
    return m;
  };

  const isBoss = archetype === 'juggernaut';
  const scale = isBoss ? 1.24 : archetype === 'breacher' ? 1.05 : archetype === 'rusher' ? 0.96 : 1.0;

  const baseHp =
    archetype === 'juggernaut'
      ? 500
      : archetype === 'breacher'
        ? 125
        : archetype === 'marksman'
          ? 85
          : archetype === 'drone'
            ? 75
            : archetype === 'rusher'
              ? 80
              : 100;
  const maxHp = Math.round(baseHp * hpMult);

  const visorColor =
    archetype === 'marksman' || archetype === 'juggernaut' || archetype === 'drone'
      ? 0xef4444
      : archetype === 'rusher'
        ? 0x38bdf8
        : 0x10b981;
  const visorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0b1412,
      emissive: visorColor,
      emissiveIntensity: 0.5,
      roughness: 0.14,
      metalness: 0.35,
    }),
  );

  // =====================================================================
  // ARCHETYPE 6: AUTONOMOUS FLYING QUAD-ROTOR COMBAT DRONE
  // =====================================================================
  if (isDrone) {
    const rotors: THREE.Object3D[] = [];
    const pelvis = new THREE.Group();
    const torso = new THREE.Group();
    const headGroup = new THREE.Group();
    const armL = new THREE.Group();
    const armR = new THREE.Group();
    const legL = new THREE.Group();
    const legR = new THREE.Group();
    const kneeL = new THREE.Group();
    const kneeR = new THREE.Group();
    const wpnGrp = new THREE.Group();
    root.add(pelvis);
    pelvis.add(torso);
    torso.add(headGroup, armL, armR);
    pelvis.add(legL, legR);

    // Ground-projected contact shadow (positioned in world space at surfaceY + 0.02 in Engine.ts)
    const contactShadow = new THREE.Mesh(
      trackGeo(new THREE.CircleGeometry(0.66, 16)),
      mats.contactShadowMat,
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.set(spawnX, spawnY + 0.02, spawnZ);

    // Central armored chassis + top avionics deck + twin GPS whip antennas + glowing optic turret
    const coreHull = new THREE.Mesh(
      trackGeo(new THREE.OctahedronGeometry(0.28, 1)),
      mats.gunmetal,
    );
    coreHull.scale.set(1.22, 0.7, 1.38);
    coreHull.castShadow = !isSoftwareGl;
    torso.add(coreHull);

    const avionicsDeck = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.32, 0.045, 0.42)),
      mats.polymerBlack,
    );
    avionicsDeck.position.set(0, 0.145, -0.02);
    torso.add(avionicsDeck);

    [-0.1, 0.1].forEach((ax) => {
      const ant = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.006, 0.009, 0.19, 6)),
        mats.steelDark,
      );
      ant.position.set(ax, 0.25, -0.18);
      torso.add(ant);
    });

    const eyeShroud = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.115, 0.125, 0.1, 12)),
      mats.steelDark,
    );
    eyeShroud.rotation.x = Math.PI / 2;
    eyeShroud.position.set(0, -0.01, 0.29);
    const eyePod = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.095, 10, 8)),
      visorMat,
    );
    eyePod.position.set(0, -0.01, 0.34);
    headGroup.add(eyeShroud, eyePod);

    // Underslung twin-mount SMG turret pod + dual carbon landing skids (rest at y = -0.24)
    const podBracket = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.11, 0.09, 0.16)),
      mats.gunmetal,
    );
    podBracket.position.set(0, -0.12, 0.06);
    const pod = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.14, 0.11, 0.34)),
      mats.steelDark,
    );
    pod.position.set(0, -0.185, 0.08);
    const barrel = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 8)),
      mats.chromeBarrel,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, -0.185, 0.34);
    torso.add(podBracket, pod, barrel);

    [-0.24, 0.24].forEach((sx) => {
      const skidStrutF = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 6)),
        mats.polymerBlack,
      );
      skidStrutF.position.set(sx * 0.85, -0.16, 0.16);
      skidStrutF.rotation.z = sx > 0 ? -0.35 : 0.35;
      const skidStrutB = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 6)),
        mats.polymerBlack,
      );
      skidStrutB.position.set(sx * 0.85, -0.16, -0.16);
      skidStrutB.rotation.z = sx > 0 ? -0.35 : 0.35;
      const skidRunner = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.016, 0.016, 0.56, 8)),
        mats.steelDark,
      );
      skidRunner.rotation.x = Math.PI / 2;
      skidRunner.position.set(sx, -0.225, 0);
      torso.add(skidStrutF, skidStrutB, skidRunner);
    });

    // 4 Carbon-Fiber Rotor Arms + Connected Stator Struts + Ducted Shrouds + Non-Clipping Propellers
    const bladeGeo = trackGeo(new THREE.BoxGeometry(0.39, 0.012, 0.044));
    const statorStrutGeo = trackGeo(new THREE.BoxGeometry(0.47, 0.016, 0.024));
    [
      [-0.45, 0.45],
      [0.45, 0.45],
      [-0.45, -0.45],
      [0.45, -0.45],
    ].forEach(([ax, az]) => {
      const armLen = Math.hypot(ax, az) - 0.18;
      const armAngle = Math.atan2(ax, az);
      const arm = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.056, 0.042, armLen)),
        mats.polymerBlack,
      );
      arm.position.set(ax * 0.46, 0.06, az * 0.46);
      arm.rotation.y = armAngle;
      torso.add(arm);

      const duct = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(0.255, 0.022, 8, 18)),
        mats.steelDark,
      );
      duct.rotation.x = Math.PI / 2;
      duct.position.set(ax, 0.085, az);

      // Cross stator struts physically anchoring motor housing to outer duct ring
      const strutA = new THREE.Mesh(statorStrutGeo, mats.polymerGrip);
      strutA.position.set(ax, 0.072, az);
      strutA.rotation.y = armAngle;
      const strutB = new THREE.Mesh(statorStrutGeo, mats.polymerGrip);
      strutB.position.set(ax, 0.072, az);
      strutB.rotation.y = armAngle + Math.PI / 2;

      const motor = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.062, 0.066, 0.09, 10)),
        mats.gunmetal,
      );
      motor.position.set(ax, 0.082, az);
      const hubCone = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.02, 0.036, 0.032, 8)),
        mats.chromeBarrel,
      );
      hubCone.position.set(ax, 0.135, az);
      torso.add(duct, strutA, strutB, motor, hubCone);

      const rotorPivot = new THREE.Group();
      rotorPivot.position.set(ax, 0.122, az);
      const b1 = new THREE.Mesh(bladeGeo, mats.steelGrate);
      const b2 = new THREE.Mesh(bladeGeo, mats.steelGrate);
      b2.rotation.y = Math.PI / 2;
      rotorPivot.add(b1, b2);
      torso.add(rotorPivot);
      rotors.push(rotorPivot);
    });

    const muzzlePoint = new THREE.Object3D();
    muzzlePoint.position.set(0, -0.185, 0.5);
    torso.add(muzzlePoint);

    const laserGeo = trackGeo(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(0, 0, 1),
      ]),
    );
    const laserMat = trackMat(
      new THREE.LineBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0 }),
    );
    const laserLine = new THREE.Line(laserGeo, laserMat);
    laserLine.frustumCulled = false;

    const hitBoxMat = trackMat(new THREE.MeshBasicMaterial({ visible: false }));
    const bodyHitbox = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.15, 0.62, 1.15)),
      hitBoxMat,
    );
    torso.add(bodyHitbox);

    return {
      id,
      archetype,
      sector,
      scale: 1,
      root,
      pelvis,
      torso,
      headGroup,
      armL,
      armR,
      legL,
      legR,
      kneeL,
      kneeR,
      wpnGrp,
      rotors,
      muzzlePoint,
      laserLine,
      laserMat,
      visorMat,
      contactShadow,
      hitboxes: [{ zone: 'torso', mesh: bodyHitbox, enemyId: id }],
      hp: maxHp,
      maxHp,
      armor: 0,
      alive: true,
      isFlying: true,
      hoverAlt,
      aiState: 'patrol',
      stateTimer: 0.4 + Math.random() * 0.6,
      fireCooldown: 0.6 + Math.random() * 0.5,
      burstRemaining: 0,
      walkPhase: Math.random() * Math.PI * 2,
      strafeSign: Math.random() > 0.5 ? 1 : -1,
      flinchTimer: 0,
      koTimer: 0,
      koFallDir: Math.random() > 0.5 ? 1 : -1,
      koSettled: false,
      ragdoll: null,
      crashAngVel: new THREE.Vector3(),
      hitFlashTimer: 0,
      spawnPos: new THREE.Vector3(spawnX, spawnY, spawnZ),
      velocity: new THREE.Vector3(),
      yaw: 0,
      dispose: () => {
        geometries.forEach((g) => g.dispose());
        localMaterials.forEach((m) => m.dispose());
      },
    };
  }

  // =====================================================================
  // HUMANOID TACTICAL OPERATIVES (Climate-adapted Camo + Faces + Gear)
  // =====================================================================
  const baseUniformMat =
    camo === 'desert'
      ? mats.desertCamo
      : camo === 'arctic'
        ? mats.arcticCamo
        : camo === 'woodland'
          ? mats.woodlandCamo
          : camo === 'hazmat'
            ? mats.hazmatSuit
            : mats.enemyUniform;

  const bodyMat = trackMat((isBoss ? mats.juggernautArmor : baseUniformMat).clone());
  const vestMat = trackMat(
    (isBoss
      ? mats.juggernautArmor
      : camo === 'desert'
        ? mats.anodizedTan
        : camo === 'arctic'
          ? mats.steelGrate
          : mats.enemyVest
    ).clone(),
  );
  const helmetMat = trackMat(
    (camo === 'desert'
      ? mats.anodizedTan
      : camo === 'arctic'
        ? mats.arcticCamo
        : mats.enemyHelmet
    ).clone(),
  );

  // Grounded soft contact shadow disc
  const contactShadow = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(0.68 * scale, 18)),
    mats.contactShadowMat,
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.015;
  root.add(contactShadow);

  const pelvis = new THREE.Group();
  pelvis.position.y = 0.94 * scale;
  root.add(pelvis);

  const pelvisMesh = new THREE.Mesh(
    trackGeo(
      new THREE.ExtrudeGeometry(makePlateShape(0.36 * scale, 0.2 * scale), {
        depth: 0.22 * scale,
        bevelEnabled: true,
        bevelThickness: 0.02 * scale,
        bevelSize: 0.02 * scale,
        bevelSegments: 2,
      }),
    ),
    bodyMat,
  );
  pelvisMesh.position.set(0, 0, -0.11 * scale);
  pelvisMesh.castShadow = !isSoftwareGl;
  pelvis.add(pelvisMesh);

  const belt = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.425 * scale, 0.068 * scale, 0.285 * scale)),
    mats.polymerBlack,
  );
  belt.position.y = 0.08 * scale;
  pelvis.add(belt);

  const makeLeg = (side: -1 | 1) => {
    const legGrp = new THREE.Group();
    legGrp.position.set(side * 0.115 * scale, -0.05 * scale, 0);

    const hipJoint = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.088 * scale, 10, 8)),
      bodyMat,
    );
    legGrp.add(hipJoint);

    const thigh = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.088 * scale, 0.072 * scale, 0.44 * scale, 10)),
      bodyMat,
    );
    thigh.position.y = -0.22 * scale;
    thigh.castShadow = !isSoftwareGl;
    legGrp.add(thigh);

    if (side === 1) {
      const holster = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.05 * scale, 0.16 * scale, 0.11 * scale)),
        mats.polymerGrip,
      );
      holster.position.set(0.078 * scale, -0.22 * scale, 0.01 * scale);
      legGrp.add(holster);
    }

    const kneeGrp = new THREE.Group();
    kneeGrp.position.y = -0.44 * scale;
    legGrp.add(kneeGrp);

    const kneeJoint = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.07 * scale, 10, 8)),
      bodyMat,
    );
    kneeGrp.add(kneeJoint);

    const kneePad = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.068 * scale, 0.064 * scale, 0.1 * scale, 8)),
      mats.polymerGrip,
    );
    kneePad.position.set(0, 0, 0.032 * scale);
    kneeGrp.add(kneePad);

    const shin = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.068 * scale, 0.054 * scale, 0.42 * scale, 10)),
      bodyMat,
    );
    shin.position.y = -0.2 * scale;
    shin.castShadow = !isSoftwareGl;
    kneeGrp.add(shin);

    const bootUpper = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.11 * scale, 0.11 * scale, 0.22 * scale)),
      mats.leatherGlove,
    );
    bootUpper.position.set(0, -0.38 * scale, 0.038 * scale);
    const bootSole = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.12 * scale, 0.032 * scale, 0.24 * scale)),
      mats.polymerBlack,
    );
    bootSole.position.set(0, -0.44 * scale, 0.038 * scale);
    kneeGrp.add(bootUpper, bootSole);

    return { legGrp, kneeGrp };
  };

  const legLBuild = makeLeg(-1);
  const legRBuild = makeLeg(1);
  const legL = legLBuild.legGrp;
  const legR = legRBuild.legGrp;
  const kneeL = legLBuild.kneeGrp;
  const kneeR = legRBuild.kneeGrp;
  pelvis.add(legL, legR);

  const torso = new THREE.Group();
  torso.position.y = 0.1 * scale;
  pelvis.add(torso);

  const chestMesh = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.22 * scale, 0.18 * scale, 0.48 * scale, 10)),
    bodyMat,
  );
  chestMesh.scale.set(1.05, 1.0, 0.66);
  chestMesh.position.y = 0.24 * scale;
  chestMesh.castShadow = !isSoftwareGl;
  torso.add(chestMesh);

  const plateGeo = trackGeo(
    new THREE.ExtrudeGeometry(makePlateShape(0.34 * scale, 0.36 * scale), {
      depth: 0.048 * scale,
      bevelEnabled: true,
      bevelThickness: 0.012 * scale,
      bevelSize: 0.012 * scale,
      bevelSegments: 2,
    }),
  );
  const frontPlate = new THREE.Mesh(plateGeo, vestMat);
  frontPlate.position.set(0, 0.26 * scale, 0.11 * scale);
  const backPlate = new THREE.Mesh(plateGeo, vestMat);
  backPlate.position.set(0, 0.26 * scale, -0.155 * scale);
  torso.add(frontPlate, backPlate);

  const pouchGeo = trackGeo(new THREE.BoxGeometry(0.072 * scale, 0.14 * scale, 0.055 * scale));
  [-0.095, 0, 0.095].forEach((px) => {
    const pouch = new THREE.Mesh(pouchGeo, mats.kevlarDark);
    pouch.position.set(px * scale, 0.18 * scale, 0.17 * scale);
    torso.add(pouch);
  });

  // Shoulder Tactical Radio + Whip Antenna
  const radio = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.05 * scale, 0.12 * scale, 0.042 * scale)),
    mats.polymerBlack,
  );
  radio.position.set(-0.18 * scale, 0.36 * scale, 0.09 * scale);
  const whip = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.004, 0.006, 0.24 * scale, 6)),
    mats.steelDark,
  );
  whip.position.set(-0.18 * scale, 0.52 * scale, 0.09 * scale);
  torso.add(radio, whip);

  const pack = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.26 * scale, 0.34 * scale, 0.11 * scale)),
    mats.kevlarDark,
  );
  pack.position.set(0, 0.28 * scale, -0.2 * scale);
  torso.add(pack);

  // Ghillie shoulder camouflage mantle for Marksman snipers
  if (archetype === 'marksman') {
    const mantle = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.25, 0.31, 0.22, 10)),
      mats.ghillieMat,
    );
    mantle.scale.set(1.15, 1.0, 0.78);
    mantle.position.set(0, 0.44, -0.02);
    torso.add(mantle);
  }

  if (isBoss) {
    const collar = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.24, 0.28, 0.14, 12, 1, true)),
      vestMat,
    );
    collar.position.set(0, 0.54, 0);
    torso.add(collar);

    [-1, 1].forEach((side) => {
      const pauldron = new THREE.Mesh(
        trackGeo(
          new THREE.ExtrudeGeometry(makePlateShape(0.2, 0.24), {
            depth: 0.24,
            bevelEnabled: true,
            bevelThickness: 0.015,
            bevelSize: 0.015,
            bevelSegments: 2,
          }),
        ),
        vestMat,
      );
      pauldron.position.set(side * 0.33, 0.42, -0.12);
      torso.add(pauldron);
    });
  }

  // Head Group with Realistic Facial Skin Eye-Strip / Shemagh / Goggles / Helmet
  const headGroup = new THREE.Group();
  headGroup.position.y = 0.51 * scale;
  torso.add(headGroup);

  const neckCollar = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.088 * scale, 0.11 * scale, 0.14 * scale, 10)),
    camo === 'desert' ? mats.sandbagCloth : mats.kevlarDark,
  );
  neckCollar.position.y = 0.02 * scale;
  headGroup.add(neckCollar);

  const headMesh = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.122 * scale, 14, 12)),
    mats.gloveFabric,
  );
  headMesh.position.y = 0.125 * scale;
  headGroup.add(headMesh);

  // Realistic human facial eye-strip + ballistic goggles (unless armored boss or hazmat)
  if (!isBoss && camo !== 'hazmat') {
    const faceStrip = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.127 * scale, 0.127 * scale, 0.052 * scale, 12, 1, false, -0.8, 1.6)),
      mats.skinTone,
    );
    faceStrip.position.y = 0.132 * scale;
    headGroup.add(faceStrip);
  }

  // Respirator Mask or Tactical Shemagh Scarf
  const maskSnout = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.044 * scale, 0.056 * scale, 0.08 * scale, 10)),
    camo === 'desert' ? mats.sandbagCloth : mats.polymerBlack,
  );
  maskSnout.rotation.x = Math.PI / 2.2;
  maskSnout.position.set(0, 0.078 * scale, 0.11 * scale);
  headGroup.add(maskSnout);

  if (archetype === 'breacher' || camo === 'hazmat') {
    [-0.068, 0.068].forEach((fx) => {
      const filter = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.032 * scale, 0.035 * scale, 0.046 * scale, 10)),
        mats.steelDark,
      );
      filter.rotation.x = Math.PI / 2.2;
      filter.rotation.z = fx > 0 ? -0.42 : 0.42;
      filter.position.set(fx * scale, 0.072 * scale, 0.105 * scale);
      headGroup.add(filter);
    });
  }

  const helmet = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.148 * scale, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.62)),
    archetype === 'marksman' ? mats.ghillieMat : helmetMat,
  );
  helmet.position.y = 0.145 * scale;
  helmet.castShadow = !isSoftwareGl;
  headGroup.add(helmet);

  [-0.135, 0.135].forEach((ex) => {
    const rail = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.022 * scale, 0.038 * scale, 0.11 * scale)),
      mats.polymerGrip,
    );
    rail.position.set(ex * 0.96 * scale, 0.148 * scale, -0.01 * scale);
    const cup = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.044 * scale, 0.044 * scale, 0.034 * scale, 10)),
      mats.polymerBlack,
    );
    cup.rotation.z = Math.PI / 2;
    cup.position.set(ex * scale, 0.115 * scale, -0.01 * scale);
    headGroup.add(rail, cup);
  });

  const strap = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.153 * scale, 0.153 * scale, 0.026 * scale, 14, 1, true)),
    mats.polymerGrip,
  );
  strap.position.set(0, 0.145 * scale, 0);
  const cwPouch = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.11 * scale, 0.065 * scale, 0.048 * scale)),
    mats.kevlarDark,
  );
  cwPouch.position.set(0, 0.13 * scale, -0.146 * scale);
  headGroup.add(strap, cwPouch);

  if (isBoss) {
    const shield = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.155, 0.15, 0.16, 12, 1, false, -Math.PI * 0.42, Math.PI * 0.84)),
      vestMat,
    );
    shield.position.set(0, 0.11, 0.01);
    const visorSlit = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.19, 0.032, 0.06)),
      visorMat,
    );
    visorSlit.position.set(0, 0.13, 0.14);
    headGroup.add(shield, visorSlit);
  } else {
    const nvgMount = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.055 * scale, 0.055 * scale, 0.048 * scale)),
      mats.gunmetal,
    );
    nvgMount.position.set(0, 0.19 * scale, 0.14 * scale);
    const nvgArm = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.026 * scale, 0.055 * scale, 0.032 * scale)),
      mats.steelDark,
    );
    nvgArm.position.set(0, 0.165 * scale, 0.156 * scale);
    const nvgBridge = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.13 * scale, 0.018 * scale, 0.026 * scale)),
      mats.steelDark,
    );
    nvgBridge.position.set(0, 0.145 * scale, 0.152 * scale);
    headGroup.add(nvgMount, nvgArm, nvgBridge);

    const offsets =
      archetype === 'marksman' || archetype === 'rusher'
        ? [-0.042, 0.042]
        : [-0.056, -0.022, 0.022, 0.056];
    offsets.forEach((nx) => {
      const tube = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.017 * scale, 0.018 * scale, 0.075 * scale, 8)),
        mats.gunmetal,
      );
      tube.rotation.x = Math.PI / 2;
      tube.position.set(nx * scale, 0.145 * scale, 0.155 * scale);
      const lens = new THREE.Mesh(
        trackGeo(new THREE.CircleGeometry(0.014 * scale, 8)),
        visorMat,
      );
      lens.position.set(nx * scale, 0.145 * scale, 0.194 * scale);
      headGroup.add(tube, lens);
    });
  }

  const buildLimbSegment = (
    parent: THREE.Group,
    a: THREE.Vector3,
    b: THREE.Vector3,
    rTop: number,
    rBot: number,
    mat: THREE.Material,
  ) => {
    const len = a.distanceTo(b);
    const mesh = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(rBot, rTop, len, 10)),
      mat,
    );
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    mesh.position.copy(mid);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    mesh.castShadow = !isSoftwareGl;
    parent.add(mesh);
  };

  const armL = new THREE.Group();
  armL.position.set(-0.24 * scale, 0.42 * scale, 0);
  const shL = new THREE.Vector3(0, 0, 0);
  const elL = new THREE.Vector3(0.06 * scale, -0.21 * scale, 0.18 * scale);
  const wrL = new THREE.Vector3(0.415 * scale, -0.145 * scale, 0.6 * scale);

  const shCapL = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.072 * scale, 10, 8)), bodyMat);
  const elCapL = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.056 * scale, 10, 8)), mats.polymerGrip);
  elCapL.position.copy(elL);
  buildLimbSegment(armL, shL, elL, 0.064 * scale, 0.056 * scale, bodyMat);
  buildLimbSegment(armL, elL, wrL, 0.054 * scale, 0.042 * scale, bodyMat);

  const gloveL = new THREE.Mesh(
    trackGeo(new THREE.CapsuleGeometry(0.036 * scale, 0.06 * scale, 4, 8)),
    mats.leatherGlove,
  );
  gloveL.rotation.x = Math.PI / 2;
  gloveL.position.copy(wrL);
  armL.add(shCapL, elCapL, gloveL);
  torso.add(armL);

  const armR = new THREE.Group();
  armR.position.set(0.24 * scale, 0.42 * scale, 0);
  const shR = new THREE.Vector3(0, 0, 0);
  const elR = new THREE.Vector3(0.02 * scale, -0.22 * scale, 0.06 * scale);
  const wrR = new THREE.Vector3(-0.06 * scale, -0.2 * scale, 0.31 * scale);

  const shCapR = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.072 * scale, 10, 8)), bodyMat);
  const elCapR = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.056 * scale, 10, 8)), mats.polymerGrip);
  elCapR.position.copy(elR);
  buildLimbSegment(armR, shR, elR, 0.064 * scale, 0.056 * scale, bodyMat);
  buildLimbSegment(armR, elR, wrR, 0.054 * scale, 0.042 * scale, bodyMat);

  const gloveR = new THREE.Mesh(
    trackGeo(new THREE.CapsuleGeometry(0.036 * scale, 0.06 * scale, 4, 8)),
    mats.leatherGlove,
  );
  gloveR.rotation.x = Math.PI / 2;
  gloveR.position.copy(wrR);
  armR.add(shCapR, elCapR, gloveR);

  // Archetype Weapon Model
  const wpnGrp = new THREE.Group();
  wpnGrp.position.set(-0.06 * scale, -0.14 * scale, 0.42 * scale);

  const gunLen =
    archetype === 'marksman'
      ? 0.96
      : isBoss
        ? 0.92
        : archetype === 'rusher'
          ? 0.56
          : archetype === 'breacher'
            ? 0.72
            : 0.76;
  const stockMesh = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.044, 0.092, 0.22)),
    mats.polymerGrip,
  );
  stockMesh.position.set(0, -0.005, -0.26);

  const recMesh = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.054, 0.082, 0.38)),
    mats.gunmetal,
  );
  const wGrip = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.038, 0.11, 0.05)),
    mats.polymerBlack,
  );
  wGrip.rotation.x = -0.32;
  wGrip.position.set(0, -0.065, -0.11);

  const handguardMesh = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.03, 0.032, 0.24, 8)),
    mats.polymerGrip,
  );
  handguardMesh.rotation.x = Math.PI / 2;
  handguardMesh.position.set(0, 0.01, 0.2);

  const barrelMesh = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.015, 0.017, gunLen * 0.65, 10)),
    mats.steelDark,
  );
  barrelMesh.rotation.x = Math.PI / 2;
  barrelMesh.position.set(0, 0.018, gunLen * 0.34);

  const muzzleBrake = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.021, 0.019, 0.075, 10)),
    mats.gunmetal,
  );
  muzzleBrake.rotation.x = Math.PI / 2;
  muzzleBrake.position.set(0, 0.018, gunLen * 0.67);

  const magMesh = new THREE.Mesh(
    trackGeo(
      isBoss
        ? new THREE.BoxGeometry(0.11, 0.15, 0.14)
        : new THREE.BoxGeometry(0.032, 0.14, 0.065),
    ),
    isBoss ? mats.kevlarDark : mats.polymerBlack,
  );
  magMesh.position.set(0, -0.09, 0.06);
  wpnGrp.add(stockMesh, recMesh, wGrip, handguardMesh, barrelMesh, muzzleBrake, magMesh);

  if (archetype === 'marksman') {
    const scope = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.02, 0.018, 0.24, 10)),
      mats.steelDark,
    );
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.066, -0.02);
    wpnGrp.add(scope);
  } else {
    const optic = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.04, 0.04, 0.075)),
      mats.gunmetal,
    );
    optic.position.set(0, 0.06, -0.02);
    wpnGrp.add(optic);
  }

  armR.add(wpnGrp);

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(-0.06 * scale, -0.12 * scale, 0.42 * scale + gunLen * 0.68);
  armR.add(muzzlePoint);
  torso.add(armR);

  const laserGeo = trackGeo(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, 1),
    ]),
  );
  const laserMat = trackMat(
    new THREE.LineBasicMaterial({
      color: archetype === 'marksman' ? 0xef4444 : 0xf59e0b,
      transparent: true,
      opacity: 0,
    }),
  );
  const laserLine = new THREE.Line(laserGeo, laserMat);
  laserLine.frustumCulled = false;

  const hitBoxMat = trackMat(new THREE.MeshBasicMaterial({ visible: false }));
  const hitboxes: EnemyHitbox[] = [];

  const headBox = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.38 * scale, 0.38 * scale, 0.38 * scale)),
    hitBoxMat,
  );
  headBox.position.y = 0.14 * scale;
  headGroup.add(headBox);
  hitboxes.push({ zone: 'head', mesh: headBox, enemyId: id });

  const torsoBox = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.52 * scale, 0.58 * scale, 0.36 * scale)),
    hitBoxMat,
  );
  torsoBox.position.y = 0.25 * scale;
  torso.add(torsoBox);
  hitboxes.push({ zone: 'torso', mesh: torsoBox, enemyId: id });

  const limbBox = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.46 * scale, 0.88 * scale, 0.32 * scale)),
    hitBoxMat,
  );
  limbBox.position.y = -0.44 * scale;
  pelvis.add(limbBox);
  hitboxes.push({ zone: 'limb', mesh: limbBox, enemyId: id });

  return {
    id,
    archetype,
    sector,
    scale,
    root,
    pelvis,
    torso,
    headGroup,
    armL,
    armR,
    legL,
    legR,
    kneeL,
    kneeR,
    wpnGrp,
    rotors: [],
    muzzlePoint,
    laserLine,
    laserMat,
    visorMat,
    contactShadow,
    hitboxes,
    hp: maxHp,
    maxHp,
    armor: isBoss ? 150 : 0,
    alive: true,
    isFlying: false,
    hoverAlt: 0,
    aiState: 'patrol',
    stateTimer: 0.4 + Math.random() * 0.8,
    fireCooldown: 0.6 + Math.random() * 0.6,
    burstRemaining: 0,
    walkPhase: Math.random() * Math.PI * 2,
    strafeSign: Math.random() > 0.5 ? 1 : -1,
    flinchTimer: 0,
    koTimer: 0,
    koFallDir: Math.random() > 0.5 ? 1 : -1,
    koSettled: false,
    ragdoll: null,
    crashAngVel: new THREE.Vector3(),
    hitFlashTimer: 0,
    spawnPos: new THREE.Vector3(spawnX, spawnY, spawnZ),
    velocity: new THREE.Vector3(),
    yaw: 0,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      localMaterials.forEach((m) => m.dispose());
    },
  };
}
