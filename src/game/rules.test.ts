import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildTacticalLevel } from './level';
import { getLevelConfig, LEVEL_ORDER, LEVELS } from './maps';
import {
  allocateAttackTokens,
  applyDamageToPlayer,
  applyRagdollImpulse,
  calculateBallisticDamage,
  calculateRunScore,
  computeDamageIndicatorAngle,
  computeLeanOffset,
  computeLightningPulse,
  computeTitleFlyoverPose,
  createRagdollState,
  DIFFICULTIES,
  DRONE_HALF_HEIGHT,
  DRONE_RADIUS,
  formatMissionTime,
  generateLightningBoltSegments,
  getRampHeightAt,
  normalizeTouchJoystick,
  PLAYER_HEIGHT_STANDING,
  PLAYER_RADIUS,
  raycastWorldColliders,
  resolveCameraCollision,
  resolveDroneCollision,
  resolveInfiniteStamina,
  resolvePlayerCollision,
  stepDebrisPiece,
  stepDroneCrash,
  stepRagdollBody,
  WEAPON_ORDER,
  WEAPONS,
} from './rules';
import type { MaterialLibrary } from './textures';
import type { ColliderBox, RampVolume } from './types';

function createStubMaterials(): MaterialLibrary {
  const std = new THREE.MeshStandardMaterial();
  const phys = new THREE.MeshPhysicalMaterial();
  const basic = new THREE.MeshBasicMaterial();
  return {
    asphaltWet: phys,
    concreteWall: std,
    concreteFloor: std,
    concreteBarrier: std,
    containerOlive: std,
    containerCrimson: std,
    containerNavy: std,
    steelDark: std,
    steelGrate: std,
    woodCrate: std,
    hazardDrum: std,
    hazardStripe: std,
    gunmetal: phys,
    anodizedTan: phys,
    polymerBlack: std,
    polymerGrip: std,
    chromeBarrel: phys,
    copperBrass: std,
    brassShell: std,
    bakeliteOrange: std,
    opticGlass: phys,
    kevlarDark: std,
    tacticalWeave: std,
    gloveFabric: std,
    leatherGlove: std,
    vehicleArmor: phys,
    vehicleDesert: phys,
    tireRubber: std,
    sandbagCloth: std,
    enemyUniform: std,
    enemyVest: std,
    enemyHelmet: std,
    juggernautArmor: phys,
    desertCamo: std,
    arcticCamo: std,
    woodlandCamo: std,
    hazmatSuit: std,
    skinTone: std,
    ghillieMat: std,
    contactShadowMat: basic,
    bloodDecalMat: std,
    rustMetal: std,
    sandGround: std,
    sandstoneRock: std,
    snowGround: std,
    iceSurface: phys,
    jungleMoss: std,
    treeBark: std,
    foliageGreen: std,
    foliagePalm: std,
    volcanicBasalt: std,
    magmaGlow: std,
    harborWater: phys,
    metroTile: std,
    terracottaWall: std,
    toxicSludge: std,
    heliOlive: phys,
    glassAtrium: phys,
    birdFeather: std,
    updateShaderTime: () => {},
    dispose: () => {
      std.dispose();
      phys.dispose();
      basic.dispose();
    },
  };
}

const sampleWall: ColliderBox = {
  id: 'wall-1',
  minX: 2,
  maxX: 4,
  minY: 0,
  maxY: 3.5,
  minZ: -5,
  maxZ: 5,
  surface: 'concrete',
  active: true,
};

const samplePlatform: ColliderBox = {
  id: 'catwalk-1',
  minX: -2,
  maxX: 2,
  minY: 1.8,
  maxY: 2.1,
  minZ: -2,
  maxZ: 2,
  surface: 'metal',
  walkable: true,
  active: true,
};

const sampleRamp: RampVolume = {
  id: 'ramp-1',
  minX: 5,
  maxX: 11,
  minZ: -1.5,
  maxZ: 1.5,
  axis: 'x',
  yStart: 0,
  yEnd: 2.1,
};

test('resolvePlayerCollision blocks wall penetration and slides smoothly', () => {
  const res = resolvePlayerCollision(1.75, 0, 0.5, 0.42, 1.82, [sampleWall], []);
  assert.ok(res.x <= 2 - 0.42 + 1e-6, `expected x <= 1.58, got ${res.x}`);
  assert.equal(res.z, 0.5);
  assert.equal(res.grounded, true);
});

test('getRampHeightAt and resolvePlayerCollision elevate player smoothly on ramp', () => {
  const midH = getRampHeightAt(8, 0, sampleRamp);
  assert.ok(midH !== null);
  assert.ok(Math.abs(midH - 1.05) < 1e-5);

  const res = resolvePlayerCollision(8, 1.0, 0, 0.42, 1.82, [], [sampleRamp]);
  assert.ok(Math.abs(res.y - 1.05) < 1e-5);
  assert.equal(res.grounded, true);
});

test('resolvePlayerCollision supports walking underneath elevated catwalk', () => {
  const under = resolvePlayerCollision(0, 0, 0, 0.42, 1.75, [samplePlatform], []);
  assert.equal(under.x, 0);
  assert.equal(under.z, 0);
  assert.equal(under.y, 0);
});

test('computeLeanOffset clamps camera lean before wall clipping', () => {
  // Player standing close to x=2 wall, facing -Z (yaw = 0 -> right is +X)
  const clamped = computeLeanOffset(1.65, 1.62, 0, 0, 1.0, [sampleWall], 0.42);
  assert.ok(clamped.offsetX < 0.2, `expected lean offset clamped near wall, got ${clamped.offsetX}`);

  const open = computeLeanOffset(-2, 1.62, 0, 0, 1.0, [sampleWall], 0.42);
  assert.ok(Math.abs(open.offsetX - 0.42) < 1e-5);
});

test('raycastWorldColliders blocks shots behind concrete cover', () => {
  const hit = raycastWorldColliders(0, 1.5, 0, 1, 0, 0, 50, [sampleWall]);
  assert.ok(hit !== null);
  assert.equal(hit.box.id, 'wall-1');
  assert.ok(Math.abs(hit.distance - 2) < 1e-5);
  assert.equal(hit.nx, -1);
});

test('calculateBallisticDamage applies head multiplier and distance falloff', () => {
  const closeHead = calculateBallisticDamage(29, 'head', 10, 95);
  const closeTorso = calculateBallisticDamage(29, 'torso', 10, 95);
  const farTorso = calculateBallisticDamage(29, 'torso', 95, 95);
  assert.equal(closeHead, 64);
  assert.equal(closeTorso, 29);
  assert.ok(farTorso < closeTorso && farTorso >= 13);
});

test('applyDamageToPlayer absorbs partial damage with armor vest', () => {
  const armored = applyDamageToPlayer(100, 100, 40);
  assert.ok(armored.armor < 100);
  assert.ok(armored.hp > 60 && armored.hp < 100);

  const unarmored = applyDamageToPlayer(100, 0, 40);
  assert.equal(unarmored.hp, 60);
});

test('allocateAttackTokens caps simultaneous firing enemies fairly', () => {
  const tokens = allocateAttackTokens(
    [
      { id: 'e1', alive: true, distance: 12, hasLineOfSight: true, wantsAttack: true, priority: 1 },
      { id: 'e2', alive: true, distance: 6, hasLineOfSight: true, wantsAttack: true, priority: 2 },
      { id: 'e3', alive: true, distance: 8, hasLineOfSight: true, wantsAttack: true, priority: 1 },
      { id: 'e4', alive: true, distance: 4, hasLineOfSight: false, wantsAttack: true, priority: 3 },
    ],
    2,
  );
  assert.equal(tokens.size, 2);
  assert.ok(tokens.has('e2'));
  assert.ok(tokens.has('e3'));
  assert.ok(!tokens.has('e4'));
});

test('calculateRunScore and formatMissionTime compute deterministic values', () => {
  const result = calculateRunScore({
    kills: 10,
    headshots: 4,
    shotsFired: 40,
    shotsHit: 20,
    elapsedSec: 120,
    difficulty: 'veteran',
    victory: true,
  });
  assert.equal(result.accuracyPct, 50);
  assert.ok(result.score > 4000);
  assert.equal(formatMissionTime(125), '02:05');
});

test('normalizeTouchJoystick applies deadzone, clamping, and forward auto-sprint', () => {
  const dead = normalizeTouchJoystick(3, -3, 50);
  assert.equal(dead.x, 0);
  assert.equal(dead.y, 0);
  assert.equal(dead.sprint, false);

  const fullFwd = normalizeTouchJoystick(0, -120, 50);
  assert.equal(fullFwd.x, 0);
  assert.equal(fullFwd.y, 1);
  assert.equal(fullFwd.sprint, true);
  assert.equal(fullFwd.knobY, -50);
});

test('resolveInfiniteStamina keeps stamina at 100 and permits continuous sprint', () => {
  const active = resolveInfiniteStamina(true);
  assert.equal(active.stamina, 100);
  assert.equal(active.canSprint, true);

  const idle = resolveInfiniteStamina(false);
  assert.equal(idle.stamina, 100);
  assert.equal(idle.canSprint, false);
});

test('resolveCameraCollision pushes camera cleanly out of walls, undersides, and ramp decks', () => {
  // Grazing/penetrating side wall
  const wallCam = resolveCameraCollision(1.9, 1.62, 0, 0.26, [sampleWall], []);
  assert.ok(wallCam.x <= 2 - 0.26 + 1e-5, `expected cam x <= 1.74, got ${wallCam.x}`);

  // Jumping underneath elevated catwalk underside (minY = 1.8)
  const ceilingCam = resolveCameraCollision(0, 1.72, 0, 0.26, [samplePlatform], []);
  assert.ok(ceilingCam.y <= 1.8 - 0.26 + 1e-5, `expected cam y <= 1.54, got ${ceilingCam.y}`);

  // Floor clamp prevents clipping below floorY
  const floorCam = resolveCameraCollision(0, -0.5, 0, 0.26, [], [], 0);
  assert.ok(floorCam.y >= 0.24 - 1e-5, `expected cam y >= 0.24, got ${floorCam.y}`);

  // Ramp surface clearance (mid ramp height is 1.05)
  const rampCam = resolveCameraCollision(8, 1.08, 0, 0.26, [], [sampleRamp], 0);
  assert.ok(rampCam.y >= 1.05 + 0.26 - 1e-5, `expected cam y >= 1.31, got ${rampCam.y}`);
});

test('standard difficulty & weapons provide forgiving damage & strong player firepower', () => {
  assert.ok(DIFFICULTIES.standard.enemyHpMult < 0.8);
  assert.ok(DIFFICULTIES.standard.enemyDamageMult <= 0.5);
  assert.equal(DIFFICULTIES.standard.tokenPoolSize, 1);
  assert.ok(WEAPONS.carbine.damage >= 40);
});

test('computeTitleFlyoverPose keeps camera strictly in obstruction-free courtyard airspace across full cycle', () => {
  const mats = createStubMaterials();
  const level = buildTacticalLevel(mats, true);
  try {
    for (let t = 0; t <= 120; t += 0.25) {
      const p = computeTitleFlyoverPose(t);
      assert.ok(Math.abs(p.camX) <= 7.85, `camX ${p.camX} approaches container corridor`);
      assert.ok(p.camZ >= 22.5 && p.camZ <= 33.1, `camZ ${p.camZ} leaves safe courtyard`);
      assert.ok(p.camY >= 3.9 && p.camY <= 5.3, `camY ${p.camY} risks ground prop or gantry`);

      const resolved = resolveCameraCollision(
        p.camX,
        p.camY,
        p.camZ,
        0.75,
        level.colliders,
        level.ramps,
        0.6,
      );
      const drift = Math.hypot(resolved.x - p.camX, resolved.y - p.camY, resolved.z - p.camZ);
      assert.ok(drift < 1e-4, `flyover clipped geometry at t=${t}: drift=${drift}`);
    }
  } finally {
    level.dispose();
    mats.dispose();
  }
});

test('player can walk through all sectors, elevated catwalks, rooftops, terminal, and helipad', () => {
  const mats = createStubMaterials();
  const level = buildTacticalLevel(mats, true);

  const walkAlong = (waypoints: [number, number][]) => {
    let x = waypoints[0][0];
    let z = waypoints[0][1];
    let y = resolvePlayerCollision(
      x,
      0,
      z,
      PLAYER_RADIUS,
      PLAYER_HEIGHT_STANDING,
      level.colliders,
      level.ramps,
      0.22,
    ).y;

    for (let i = 1; i < waypoints.length; i++) {
      const [tx, tz] = waypoints[i];
      for (let step = 0; step < 300; step++) {
        const dx = tx - x;
        const dz = tz - z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.16) break;
        const stride = Math.min(0.16, dist);
        const res = resolvePlayerCollision(
          x + (dx / dist) * stride,
          y - 0.05,
          z + (dz / dist) * stride,
          PLAYER_RADIUS,
          PLAYER_HEIGHT_STANDING,
          level.colliders,
          level.ramps,
          0.22,
        );
        x = res.x;
        y = res.y;
        z = res.z;
      }
      const rem = Math.hypot(tx - x, tz - z);
      assert.ok(rem < 0.3, `Failed to reach waypoint (${tx}, ${tz}) — stopped at (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}), rem=${rem.toFixed(2)}`);
    }
    return { x, y, z };
  };

  try {
    // 1. Courtyard spawn -> Sector 1 East Container Roof (y = 2.79m)
    const eastRoof = walkAlong([
      [0, 33.5],
      [11.5, 32.0],
      [11.5, 22.0],
    ]);
    assert.ok(eastRoof.y > 2.7, `Expected on East Container roof (>=2.7m), got y=${eastRoof.y}`);

    // 2. Courtyard spawn -> Sector 1 West Stacked Container Roof (y = 5.555m) via 2-flight switchback
    const westRoof = walkAlong([
      [0, 33.5],
      [-14.3, 34.5],
      [-14.3, 26.5],
      [-17.2, 26.5],
      [-17.2, 19.9],
      [-11.5, 19.9],
      [-11.5, 22.0],
    ]);
    assert.ok(westRoof.y > 5.4, `Expected on West Stacked Container roof (>=5.4m), got y=${westRoof.y}`);

    // 3. Courtyard -> Sector 2 West Doorway -> West Catwalk (y = 2.4m)
    const westCat = walkAlong([
      [0, 33.5],
      [-11.4, 12.0],
      [-11.4, 8.1],
      [-18.2, 8.1],
      [-18.2, -3.5],
    ]);
    assert.ok(Math.abs(westCat.y - 2.4) < 0.05, `Expected on West Catwalk (2.4m), got y=${westCat.y}`);

    // 4. Courtyard -> Sector 2 East Doorway -> East Catwalk (y = 2.4m)
    const eastCat = walkAlong([
      [0, 33.5],
      [11.4, 12.0],
      [11.4, 8.1],
      [18.2, 8.1],
      [18.2, -4.5],
    ]);
    assert.ok(Math.abs(eastCat.y - 2.4) < 0.05, `Expected on East Catwalk (2.4m), got y=${eastCat.y}`);

    // 5. Sector 2 underneath West Catwalk + unobstructed path directly to Intel Terminal screen
    const atTerm = walkAlong([
      [-11.4, 8.1],
      [-11.4, 0.0],
      [-18.2, 0.0],
      [-18.2, -7.0],
      [-11.4, -7.0],
      [0, -10.5],
    ]);
    assert.ok(Math.hypot(atTerm.x - level.terminalPos.x, atTerm.z - level.terminalPos.z) < 1.6);

    // 6. Sector 2 -> Sector 3 Blast Door -> Sector 3 West & East Container Roofs (y = 2.79m)
    const sec3WestRoof = walkAlong([
      [0, -13.0],
      [0, -19.0],
      [-13.5, -32.2],
      [-13.5, -24.5],
    ]);
    assert.ok(sec3WestRoof.y > 2.7, `Expected on Sector 3 West Container roof, got y=${sec3WestRoof.y}`);

    const sec3EastRoof = walkAlong([
      [0, -19.0],
      [13.5, -32.2],
      [13.5, -24.5],
    ]);
    assert.ok(sec3EastRoof.y > 2.7, `Expected on Sector 3 East Container roof, got y=${sec3EastRoof.y}`);

    // 7. Sector 3 -> Dead center of Extraction Helipad (0, 0, -29.5)
    const atPad = walkAlong([
      [0, -19.0],
      [0, -29.5],
    ]);
    assert.ok(Math.hypot(atPad.x - level.extractionPos.x, atPad.z - level.extractionPos.z) < 0.3);
  } finally {
    level.dispose();
    mats.dispose();
  }
});

test('all 7 weapons in WEAPON_ORDER have unique slots, ADS zoom specs, and valid ballistics', () => {
  assert.equal(WEAPON_ORDER.length, 7);
  const slots = new Set<number>();
  for (const id of WEAPON_ORDER) {
    const spec = WEAPONS[id];
    assert.ok(spec, `Missing weapon spec for ${id}`);
    assert.ok(spec.shortName.length > 0);
    assert.ok(spec.damage > 0 && spec.magSize > 0 && spec.range > 0);
    assert.ok(spec.adsFovDrop >= 10);
    assert.ok(!slots.has(spec.slot), `Duplicate weapon slot ${spec.slot}`);
    slots.add(spec.slot);
  }
  assert.equal(WEAPONS.sniper.isScoped, true);
});

test('all 11 levels (op01..op11) build cleanly with unobstructed spawn, terminal, and extraction routes', () => {
  assert.equal(LEVEL_ORDER.length, 11);
  const mats = createStubMaterials();
  try {
    for (const id of LEVEL_ORDER) {
      const cfg = getLevelConfig(id);
      assert.equal(cfg.id, id);
      assert.equal(LEVELS[id].number, LEVEL_ORDER.indexOf(id) + 1);
      const lvl = buildTacticalLevel(mats, true, cfg);
      try {
        assert.ok(lvl.colliders.length > 20, `${id} has too few colliders`);
        assert.ok(lvl.destructibles.length >= 2, `${id} missing destructible cover`);
        // Spawn must not penetrate any solid collider
        const spawnRes = resolvePlayerCollision(
          lvl.playerSpawn.x,
          lvl.playerSpawn.y,
          lvl.playerSpawn.z,
          PLAYER_RADIUS,
          PLAYER_HEIGHT_STANDING,
          lvl.colliders,
          lvl.ramps,
          0.22,
        );
        const drift = Math.hypot(
          spawnRes.x - lvl.playerSpawn.x,
          spawnRes.z - lvl.playerSpawn.z,
        );
        assert.ok(drift < 0.05, `${id} playerSpawn collided with geometry (drift=${drift})`);
        assert.ok(lvl.terminalPos.z < 0 && lvl.extractionPos.z < lvl.terminalPos.z);
      } finally {
        lvl.dispose();
      }
    }
  } finally {
    mats.dispose();
  }
});

test('resolveDroneCollision blocks walls, containers, and indoor ceiling while keeping clearance', () => {
  const wall: ColliderBox = {
    id: 'wall',
    minX: -5,
    maxX: 5,
    minY: 0,
    maxY: 6.2,
    minZ: 9.3,
    maxZ: 10.7,
    surface: 'concrete',
    active: true,
  };
  const container: ColliderBox = {
    id: 'container',
    minX: 10.2,
    maxX: 12.8,
    minY: 0,
    maxY: 2.79,
    minZ: 18.4,
    maxZ: 24.6,
    surface: 'metal',
    walkable: true,
    active: true,
  };

  // Horizontal pushout from interior transition wall at hover height 2.45m
  const wallRes = resolveDroneCollision(
    0,
    2.45,
    10.9,
    DRONE_RADIUS,
    DRONE_HALF_HEIGHT,
    [wall],
    [],
    { maxY: 6.0 },
  );
  assert.equal(wallRes.hitWall, true);
  assert.ok(wallRes.z >= 10.7 + DRONE_RADIUS - 0.001, `Drone penetrated wall: z=${wallRes.z}`);

  // Indoor ceiling clamp
  const ceilRes = resolveDroneCollision(
    0,
    7.5,
    20,
    DRONE_RADIUS,
    DRONE_HALF_HEIGHT,
    [wall],
    [],
    { maxY: 6.0 },
  );
  assert.equal(ceilRes.hitCeiling, true);
  assert.ok(ceilRes.y <= 6.0 - DRONE_HALF_HEIGHT + 0.001);

  // Skimming over container pushes cleanly above roof
  const roofRes = resolveDroneCollision(
    11.5,
    2.8,
    21.5,
    DRONE_RADIUS,
    DRONE_HALF_HEIGHT,
    [container],
    [],
  );
  assert.ok(roofRes.y >= 2.79 + DRONE_HALF_HEIGHT - 0.001);
});

test('stepDroneCrash simulates gravity fall and settles on ground or elevated surfaces without floating', () => {
  const container: ColliderBox = {
    id: 'container',
    minX: -12.8,
    maxX: -10.2,
    minY: 0,
    maxY: 2.79,
    minZ: 18.9,
    maxZ: 25.1,
    surface: 'metal',
    walkable: true,
    active: true,
  };

  // 1. Destroyed drone over open courtyard falls from y=2.6m all the way to ground
  let state = {
    x: 0,
    y: 2.6,
    z: 17.0,
    vx: 2.0,
    vy: 1.2,
    vz: -1.5,
    settled: false,
  };
  let bouncedCount = 0;
  for (let i = 0; i < 180 && !state.settled; i++) {
    const next = stepDroneCrash(state, 1 / 60, DRONE_RADIUS, DRONE_HALF_HEIGHT, [container], []);
    if (next.bounced) bouncedCount++;
    state = next;
  }
  assert.equal(state.settled, true, 'Drone failed to settle onto ground');
  assert.ok(bouncedCount >= 1, 'Expected initial crash bounce');
  assert.ok(
    Math.abs(state.y - DRONE_HALF_HEIGHT) < 0.02,
    `Expected drone resting on ground at y=${DRONE_HALF_HEIGHT}, got ${state.y}`,
  );

  // 2. Destroyed drone above container roof falls onto roof top cleanly
  let roofState = {
    x: -11.5,
    y: 5.0,
    z: 22.0,
    vx: 0,
    vy: 0,
    vz: 0,
    settled: false,
  };
  for (let i = 0; i < 180 && !roofState.settled; i++) {
    roofState = stepDroneCrash(roofState, 1 / 60, DRONE_RADIUS, DRONE_HALF_HEIGHT, [container], []);
  }
  assert.equal(roofState.settled, true);
  assert.ok(
    Math.abs(roofState.y - (2.79 + DRONE_HALF_HEIGHT)) < 0.02,
    `Expected drone resting on container roof at ${2.79 + DRONE_HALF_HEIGHT}, got ${roofState.y}`,
  );
});

test('stepRagdollBody collapses humanoid with articulated limbs, bounces off walls, and falls off elevated catwalks', () => {
  // 1. Frontal shotgun kill near a wall throws body backward onto back and deflects off wall
  const rag = createRagdollState(0.8, 0, 0, Math.PI / 2, 1.0, {
    dirX: 1,
    dirY: 0.2,
    dirZ: 0,
    force: 9.5,
    hitZone: 'torso',
    seed: 42,
  });
  // Facing +X (yaw = PI/2), shot traveling +X -> hit from behind (dot > 0 -> fallForward = 1)
  assert.equal(rag.fallForward, 1);

  const wallAhead: ColliderBox = {
    id: 'w-rag',
    minX: 2.0,
    maxX: 4.0,
    minY: 0,
    maxY: 3.5,
    minZ: -5,
    maxZ: 5,
    surface: 'concrete',
    active: true,
  };

  let wallHitSeen = false;
  let floorHitSeen = false;
  for (let i = 0; i < 240 && !rag.settled; i++) {
    const res = stepRagdollBody(rag, 1 / 60, [wallAhead], []);
    if (res.wallImpact) wallHitSeen = true;
    if (res.floorImpact > 0) floorHitSeen = true;
  }
  assert.equal(rag.settled, true, 'Ragdoll failed to settle on floor');
  assert.equal(wallHitSeen, true, 'Expected ragdoll to bounce off concrete wall');
  assert.equal(floorHitSeen, true, 'Expected ragdoll floor impact event');
  assert.ok(rag.x <= 2.0 - 0.42 + 0.05, `Ragdoll penetrated wall: x=${rag.x}`);
  assert.ok(Math.abs(rag.y - 0.16) < 0.05, `Ragdoll pelvis rest height wrong: y=${rag.y}`);
  assert.ok(Math.abs(rag.pelvisPitch) > 1.1, 'Expected pelvis to rotate flat to ground');
  assert.ok(Math.abs(rag.armLRoll) > 0.3 && Math.abs(rag.armRRoll) > 0.3, 'Expected arms splayed out');

  // 2. Elevated humanoid knocked off catwalk falls cleanly onto lower ground (y=0)
  const catwalk: ColliderBox = {
    id: 'cat',
    minX: -2,
    maxX: 2,
    minY: 2.1,
    maxY: 2.4,
    minZ: -2,
    maxZ: 2,
    surface: 'metal',
    walkable: true,
    active: true,
  };
  const edgeRag = createRagdollState(1.7, 2.4, 0, 0, 1.0, {
    dirX: 1,
    dirY: 0.15,
    dirZ: 0,
    force: 7.5,
    hitZone: 'head',
    seed: 9,
  });
  for (let i = 0; i < 260 && !edgeRag.settled; i++) {
    stepRagdollBody(edgeRag, 1 / 60, [catwalk], []);
  }
  assert.equal(edgeRag.settled, true);
  assert.ok(edgeRag.x > 2.2, `Expected ragdoll knocked off catwalk edge, got x=${edgeRag.x}`);
  assert.ok(Math.abs(edgeRag.y - 0.16) < 0.05, `Expected catwalk ragdoll to fall down to y=0.16, got ${edgeRag.y}`);

  // 3. Explosion impulse wakes settled ragdoll and launches it upward
  applyRagdollImpulse(edgeRag, {
    dirX: -0.6,
    dirY: 0.7,
    dirZ: 0.4,
    force: 12.0,
    hitZone: 'torso',
    isExplosion: true,
  });
  assert.equal(edgeRag.settled, false);
  assert.ok(edgeRag.vy > 4.0);
});

test('stepDebrisPiece simulates bouncing dropped weapons and crate debris onto floors cleanly', () => {
  const debris = {
    x: 0,
    y: 1.5,
    z: 0,
    vx: 3.2,
    vy: 2.4,
    vz: -1.8,
    rx: 0,
    ry: 0,
    rz: 0,
    avx: 8.0,
    avy: -5.0,
    avz: 6.0,
    radius: 0.12,
    settled: false,
  };
  let bounced = false;
  for (let i = 0; i < 240 && !debris.settled; i++) {
    const res = stepDebrisPiece(debris, 1 / 60, [sampleWall], []);
    if (res.bounced) bounced = true;
  }
  assert.equal(debris.settled, true);
  assert.equal(bounced, true);
  assert.ok(Math.abs(debris.y - 0.12) < 0.02);
  assert.ok(debris.x <= 2 - 0.12 + 0.02, 'Debris penetrated wall');
});

test('computeLightningPulse produces multi-stroke flashes and generateLightningBoltSegments creates connected branches', () => {
  assert.equal(computeLightningPulse(-0.1, 0.7), 0);
  assert.equal(computeLightningPulse(0.75, 0.7), 0);
  const leader = computeLightningPulse(0.05, 0.7);
  const mainPeak = computeLightningPulse(0.18, 0.7);
  const tail = computeLightningPulse(0.65, 0.7);
  assert.ok(leader > 0.3 && mainPeak > 0.85, `Expected strong leader (${leader}) & main peak (${mainPeak})`);
  assert.ok(tail > 0 && tail < 0.25);

  const segs = generateLightningBoltSegments(10, 56, -40, 14, 4, -42, 12, 17.5);
  assert.ok(segs.length >= 20, `Expected trunk + branches, got ${segs.length}`);
  const branches = segs.filter((s) => s.isBranch);
  assert.ok(branches.length >= 8, `Expected forked secondary branches, got ${branches.length}`);
  for (const s of segs) {
    assert.ok(
      Number.isFinite(s.ax) && Number.isFinite(s.ay) && Number.isFinite(s.az) &&
      Number.isFinite(s.bx) && Number.isFinite(s.by) && Number.isFinite(s.bz),
      'Bolt segment contains NaN',
    );
  }
});

test('computeDamageIndicatorAngle maps incoming fire relative to player yaw accurately', () => {
  // Facing north (-Z, yaw=0): attacker ahead -> 0
  assert.ok(Math.abs(computeDamageIndicatorAngle(0, 0, 0, 0, -10)) < 1e-5);
  // Attacker to player's right (+X, yaw=0) -> -PI/2
  assert.ok(Math.abs(computeDamageIndicatorAngle(0, 0, 0, 10, 0) - -Math.PI / 2) < 1e-5);
  // Attacker to player's left (-X, yaw=0) -> +PI/2
  assert.ok(Math.abs(computeDamageIndicatorAngle(0, 0, 0, -10, 0) - Math.PI / 2) < 1e-5);
  // Attacker directly behind (+Z, yaw=0) -> +/-PI
  assert.ok(Math.abs(Math.abs(computeDamageIndicatorAngle(0, 0, 0, 0, 10)) - Math.PI) < 1e-5);
  // Turned 90 deg left (yaw=+PI/2, facing -X): attacker at (-10, 0) is now directly ahead -> 0
  assert.ok(Math.abs(computeDamageIndicatorAngle(0, 0, Math.PI / 2, -10, 0)) < 1e-5);
});





