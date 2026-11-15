import type {
  AttackTokenCandidate,
  ColliderBox,
  DifficultyConfig,
  DifficultyLevel,
  HitZone,
  RampVolume,
  RayAABBHit,
  WeaponId,
  WeaponSpec,
} from './types';

export const WEAPON_ORDER: WeaponId[] = [
  'carbine',
  'shotgun',
  'smg',
  'sniper',
  'lmg',
  'ak',
  'sidearm',
];

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  carbine: {
    id: 'carbine',
    name: 'MK18 MOD-1',
    shortName: 'MK18',
    role: '5.56mm CQB Carbine',
    slot: 1,
    damage: 44,
    pellets: 1,
    rpm: 750,
    auto: true,
    magSize: 36,
    reserveMax: 252,
    reloadTime: 1.2,
    spreadHip: 0.012,
    spreadAds: 0.0012,
    recoilPitch: 0.009,
    recoilYaw: 0.0028,
    range: 105,
    suppressed: false,
    adsFovDrop: 18,
  },
  shotgun: {
    id: 'shotgun',
    name: 'M1014 BREACHER',
    shortName: 'M1014',
    role: '12G Tactical Semi-Auto',
    slot: 2,
    damage: 28,
    pellets: 8,
    rpm: 175,
    auto: false,
    magSize: 10,
    reserveMax: 60,
    reloadTime: 1.45,
    spreadHip: 0.056,
    spreadAds: 0.032,
    recoilPitch: 0.025,
    recoilYaw: 0.008,
    range: 44,
    suppressed: false,
    adsFovDrop: 14,
  },
  smg: {
    id: 'smg',
    name: 'MP7-A2 PDW',
    shortName: 'MP7',
    role: '4.6mm High-ROF Submachine Gun',
    slot: 3,
    damage: 30,
    pellets: 1,
    rpm: 950,
    auto: true,
    magSize: 40,
    reserveMax: 320,
    reloadTime: 1.05,
    spreadHip: 0.014,
    spreadAds: 0.0022,
    recoilPitch: 0.0065,
    recoilYaw: 0.0032,
    range: 75,
    suppressed: true,
    adsFovDrop: 15,
  },
  sniper: {
    id: 'sniper',
    name: 'M2010 ESR',
    shortName: 'M2010',
    role: '.300 WinMag Precision Rifle',
    slot: 4,
    damage: 145,
    pellets: 1,
    rpm: 62,
    auto: false,
    magSize: 6,
    reserveMax: 42,
    reloadTime: 1.75,
    spreadHip: 0.032,
    spreadAds: 0.0002,
    recoilPitch: 0.034,
    recoilYaw: 0.004,
    range: 170,
    suppressed: true,
    adsFovDrop: 46,
    isScoped: true,
  },
  lmg: {
    id: 'lmg',
    name: 'M249 SAW',
    shortName: 'M249',
    role: '5.56mm Belt-Fed LMG',
    slot: 5,
    damage: 38,
    pellets: 1,
    rpm: 780,
    auto: true,
    magSize: 100,
    reserveMax: 400,
    reloadTime: 2.15,
    spreadHip: 0.02,
    spreadAds: 0.0028,
    recoilPitch: 0.01,
    recoilYaw: 0.0045,
    range: 115,
    suppressed: false,
    adsFovDrop: 16,
  },
  ak: {
    id: 'ak',
    name: 'AK-105 ZENIT',
    shortName: 'AK105',
    role: '7.62mm Tactical Assault Rifle',
    slot: 6,
    damage: 54,
    pellets: 1,
    rpm: 620,
    auto: true,
    magSize: 30,
    reserveMax: 210,
    reloadTime: 1.35,
    spreadHip: 0.015,
    spreadAds: 0.0016,
    recoilPitch: 0.013,
    recoilYaw: 0.0038,
    range: 115,
    suppressed: false,
    adsFovDrop: 18,
  },
  sidearm: {
    id: 'sidearm',
    name: 'G19 TACTICAL',
    shortName: 'G19',
    role: '9mm Suppressed Sidearm',
    slot: 7,
    damage: 40,
    pellets: 1,
    rpm: 440,
    auto: false,
    magSize: 18,
    reserveMax: 108,
    reloadTime: 0.9,
    spreadHip: 0.01,
    spreadAds: 0.0012,
    recoilPitch: 0.008,
    recoilYaw: 0.0025,
    range: 72,
    suppressed: true,
    adsFovDrop: 12,
  },
};

export const DIFFICULTIES: Record<DifficultyLevel, DifficultyConfig> = {
  standard: {
    id: 'standard',
    label: 'Standard',
    summary: 'Accessible tactical pacing, heavy armor & auto-regen',
    enemyHpMult: 0.65,
    enemyDamageMult: 0.4,
    reactionDelay: 0.85,
    playerArmorStart: 100,
    tokenPoolSize: 1,
    scoreMult: 1.0,
  },
  veteran: {
    id: 'veteran',
    label: 'Veteran',
    summary: 'Balanced AI flankers & moderate burst pressure',
    enemyHpMult: 0.95,
    enemyDamageMult: 0.8,
    reactionDelay: 0.55,
    playerArmorStart: 90,
    tokenPoolSize: 2,
    scoreMult: 1.4,
  },
  hardcore: {
    id: 'hardcore',
    label: 'Realism',
    summary: 'High lethality, fast telegraph, maximum score',
    enemyHpMult: 1.1,
    enemyDamageMult: 1.25,
    reactionDelay: 0.35,
    playerArmorStart: 75,
    tokenPoolSize: 3,
    scoreMult: 2.0,
  },
};

export const PLAYER_RADIUS = 0.42;
export const PLAYER_EYE_STANDING = 1.62;
export const PLAYER_EYE_CROUCH = 1.02;
export const PLAYER_HEIGHT_STANDING = 1.82;
export const PLAYER_HEIGHT_CROUCH = 1.2;
export const STEP_UP_MAX = 0.48;

export function getRampHeightAt(x: number, z: number, ramp: RampVolume): number | null {
  if (x < ramp.minX || x > ramp.maxX || z < ramp.minZ || z > ramp.maxZ) {
    return null;
  }
  const span =
    ramp.axis === 'x'
      ? Math.max(0.001, ramp.maxX - ramp.minX)
      : Math.max(0.001, ramp.maxZ - ramp.minZ);
  const tRaw =
    ramp.axis === 'x'
      ? (x - ramp.minX) / span
      : (z - ramp.minZ) / span;
  const t = Math.max(0, Math.min(1, tRaw));
  return ramp.yStart + (ramp.yEnd - ramp.yStart) * t;
}

export function getSurfaceHeightAt(
  x: number,
  z: number,
  colliders: readonly ColliderBox[],
  ramps: readonly RampVolume[],
  currentFootY: number,
  radius: number = PLAYER_RADIUS * 0.72,
): number {
  let highest = 0;

  for (let i = 0; i < ramps.length; i++) {
    const h = getRampHeightAt(x, z, ramps[i]);
    if (h !== null && h <= currentFootY + STEP_UP_MAX + 0.35 && h > highest) {
      highest = h;
    }
  }

  for (let i = 0; i < colliders.length; i++) {
    const b = colliders[i];
    if (!b.active || !b.walkable) continue;
    const closestX = Math.max(b.minX, Math.min(x, b.maxX));
    const closestZ = Math.max(b.minZ, Math.min(z, b.maxZ));
    const dx = x - closestX;
    const dz = z - closestZ;
    if (dx * dx + dz * dz <= radius * radius) {
      if (b.maxY <= currentFootY + STEP_UP_MAX && b.maxY > highest) {
        highest = b.maxY;
      }
    }
  }

  return highest;
}

export function resolvePlayerCollision(
  posX: number,
  posY: number,
  posZ: number,
  radius: number,
  playerHeight: number,
  colliders: readonly ColliderBox[],
  ramps: readonly RampVolume[],
  snapDownMax: number = 0.05,
): { x: number; y: number; z: number; grounded: boolean } {
  let x = posX;
  let z = posZ;
  let footY = posY;

  const supportY = getSurfaceHeightAt(x, z, colliders, ramps, footY, radius * 0.72);
  let grounded = false;
  if (footY <= supportY + snapDownMax) {
    footY = supportY;
    grounded = true;
  }

  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      if (!b.active) continue;

      if (b.maxY <= footY + 0.08) continue;
      if (b.minY >= footY + playerHeight - 0.05) continue;

      if (b.walkable && b.maxY <= footY + STEP_UP_MAX) {
        continue;
      }

      const closestX = Math.max(b.minX, Math.min(x, b.maxX));
      const closestZ = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - closestX;
      const dz = z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        if (distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const push = radius - dist;
          x += (dx / dist) * push;
          z += (dz / dist) * push;
        } else {
          const penLeft = Math.abs(x - b.minX);
          const penRight = Math.abs(b.maxX - x);
          const penFront = Math.abs(z - b.minZ);
          const penBack = Math.abs(b.maxZ - z);
          const minPen = Math.min(penLeft, penRight, penFront, penBack);
          if (minPen === penLeft) x = b.minX - radius;
          else if (minPen === penRight) x = b.maxX + radius;
          else if (minPen === penFront) z = b.minZ - radius;
          else z = b.maxZ + radius;
        }
      }
    }
  }

  const postSupportY = getSurfaceHeightAt(x, z, colliders, ramps, footY, radius * 0.72);
  if (footY <= postSupportY + snapDownMax) {
    footY = postSupportY;
    grounded = true;
  }

  return { x, y: footY, z, grounded };
}

export function rayIntersectsAABB(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  box: ColliderBox,
): RayAABBHit | null {
  if (!box.active) return null;

  let tMin = 0;
  let tMax = maxDist;
  let hitNx = 0;
  let hitNy = 0;
  let hitNz = 0;

  if (Math.abs(dx) < 1e-8) {
    if (ox < box.minX || ox > box.maxX) return null;
  } else {
    const invD = 1 / dx;
    let t1 = (box.minX - ox) * invD;
    let t2 = (box.maxX - ox) * invD;
    let nx = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      nx = 1;
    }
    if (t1 > tMin) {
      tMin = t1;
      hitNx = nx;
      hitNy = 0;
      hitNz = 0;
    }
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }

  if (Math.abs(dy) < 1e-8) {
    if (oy < box.minY || oy > box.maxY) return null;
  } else {
    const invD = 1 / dy;
    let t1 = (box.minY - oy) * invD;
    let t2 = (box.maxY - oy) * invD;
    let ny = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      ny = 1;
    }
    if (t1 > tMin) {
      tMin = t1;
      hitNx = 0;
      hitNy = ny;
      hitNz = 0;
    }
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }

  if (Math.abs(dz) < 1e-8) {
    if (oz < box.minZ || oz > box.maxZ) return null;
  } else {
    const invD = 1 / dz;
    let t1 = (box.minZ - oz) * invD;
    let t2 = (box.maxZ - oz) * invD;
    let nz = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      nz = 1;
    }
    if (t1 > tMin) {
      tMin = t1;
      hitNx = 0;
      hitNy = 0;
      hitNz = nz;
    }
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }

  if (tMin <= 0 || tMin > maxDist) return null;
  return { distance: tMin, nx: hitNx, ny: hitNy, nz: hitNz, box };
}

export function raycastWorldColliders(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  colliders: readonly ColliderBox[],
): RayAABBHit | null {
  let closest: RayAABBHit | null = null;
  let bestDist = maxDist;
  for (let i = 0; i < colliders.length; i++) {
    const hit = rayIntersectsAABB(ox, oy, oz, dx, dy, dz, bestDist, colliders[i]);
    if (hit && hit.distance < bestDist) {
      bestDist = hit.distance;
      closest = hit;
    }
  }
  return closest;
}

export function resolveCameraCollision(
  camX: number,
  camY: number,
  camZ: number,
  camRadius: number,
  colliders: readonly ColliderBox[],
  ramps: readonly RampVolume[],
  floorY: number = 0,
): { x: number; y: number; z: number } {
  let x = camX;
  let y = Math.max(floorY + 0.24, camY);
  let z = camZ;
  const rSq = camRadius * camRadius;

  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      if (!b.active) continue;

      const closestX = Math.max(b.minX, Math.min(x, b.maxX));
      const closestY = Math.max(b.minY, Math.min(y, b.maxY));
      const closestZ = Math.max(b.minZ, Math.min(z, b.maxZ));

      const dx = x - closestX;
      const dy = y - closestY;
      const dz = z - closestZ;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq < rSq) {
        if (distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const push = camRadius - dist;
          x += (dx / dist) * push;
          y += (dy / dist) * push;
          z += (dz / dist) * push;
        } else {
          const penMinX = Math.abs(x - b.minX);
          const penMaxX = Math.abs(b.maxX - x);
          const penMinY = Math.abs(y - b.minY);
          const penMaxY = Math.abs(b.maxY - y);
          const penMinZ = Math.abs(z - b.minZ);
          const penMaxZ = Math.abs(b.maxZ - z);
          const minPen = Math.min(
            penMinX,
            penMaxX,
            penMinY,
            penMaxY,
            penMinZ,
            penMaxZ,
          );
          if (minPen === penMinX) x = b.minX - camRadius;
          else if (minPen === penMaxX) x = b.maxX + camRadius;
          else if (minPen === penMinY) y = b.minY - camRadius;
          else if (minPen === penMaxY) y = b.maxY + camRadius;
          else if (minPen === penMinZ) z = b.minZ - camRadius;
          else z = b.maxZ + camRadius;
        }
      }
    }

    for (let i = 0; i < ramps.length; i++) {
      const ramp = ramps[i];
      const closestX = Math.max(ramp.minX, Math.min(x, ramp.maxX));
      const closestZ = Math.max(ramp.minZ, Math.min(z, ramp.maxZ));
      const dx = x - closestX;
      const dz = z - closestZ;
      if (dx * dx + dz * dz < rSq) {
        const rampH = getRampHeightAt(closestX, closestZ, ramp);
        if (rampH !== null) {
          if (y > rampH - 0.14 && y < rampH + camRadius) {
            y = rampH + camRadius;
          } else if (y <= rampH - 0.14 && y > rampH - 0.24 - camRadius) {
            y = Math.max(floorY + 0.24, rampH - 0.24 - camRadius);
          }
        }
      }
    }
  }

  return { x, y: Math.max(floorY + 0.24, y), z };
}

export function computeLeanOffset(
  eyeX: number,
  eyeY: number,
  eyeZ: number,
  yaw: number,
  leanValue: number,
  colliders: readonly ColliderBox[],
  maxLeanDist: number = 0.42,
): { offsetX: number; offsetZ: number; rollRad: number } {
  if (Math.abs(leanValue) < 0.001) {
    return { offsetX: 0, offsetZ: 0, rollRad: 0 };
  }

  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  const sign = leanValue > 0 ? 1 : -1;
  const dirX = rightX * sign;
  const dirZ = rightZ * sign;
  const desiredDist = Math.abs(leanValue) * maxLeanDist;

  const probeClearance = 0.3;
  const probeDist = desiredDist + probeClearance;
  const hit = raycastWorldColliders(
    eyeX,
    eyeY,
    eyeZ,
    dirX,
    0,
    dirZ,
    probeDist,
    colliders,
  );
  const safeDist = hit ? Math.max(0, Math.min(desiredDist, hit.distance - probeClearance)) : desiredDist;
  const effectiveRatio = maxLeanDist > 0 ? safeDist / maxLeanDist : 0;

  return {
    offsetX: dirX * safeDist,
    offsetZ: dirZ * safeDist,
    rollRad: -sign * effectiveRatio * 0.19,
  };
}

export function calculateBallisticDamage(
  baseDamage: number,
  hitZone: HitZone,
  distance: number,
  effectiveRange: number,
): number {
  const zoneMult = hitZone === 'head' ? 2.2 : hitZone === 'torso' ? 1.0 : 0.75;
  const falloffRatio = distance <= effectiveRange * 0.5
    ? 1.0
    : Math.max(0.45, 1.0 - ((distance - effectiveRange * 0.5) / (effectiveRange * 0.8)) * 0.55);
  return Math.round(baseDamage * zoneMult * falloffRatio);
}

export function applyDamageToPlayer(
  hp: number,
  armor: number,
  incomingDamage: number,
): { hp: number; armor: number } {
  if (incomingDamage <= 0 || hp <= 0) {
    return { hp: Math.max(0, hp), armor: Math.max(0, armor) };
  }
  const absorbed = armor > 0 ? Math.min(armor, incomingDamage * 0.72) : 0;
  const nextArmor = Math.max(0, armor - absorbed);
  const hpDmg = incomingDamage - absorbed * 0.9;
  const nextHp = Math.max(0, hp - hpDmg);
  return { hp: nextHp, armor: nextArmor };
}

export function allocateAttackTokens(
  candidates: readonly AttackTokenCandidate[],
  maxConcurrentTokens: number,
): Set<string> {
  const eligible = candidates
    .filter((c) => c.alive && c.hasLineOfSight && c.wantsAttack)
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.distance - b.distance;
    });

  const granted = new Set<string>();
  const limit = Math.max(1, maxConcurrentTokens);
  for (let i = 0; i < Math.min(limit, eligible.length); i++) {
    granted.add(eligible[i].id);
  }
  return granted;
}

export function calculateRunScore(params: {
  kills: number;
  headshots: number;
  shotsFired: number;
  shotsHit: number;
  elapsedSec: number;
  difficulty: DifficultyLevel;
  victory: boolean;
}): { score: number; accuracyPct: number } {
  const accuracyPct =
    params.shotsFired > 0
      ? Math.min(100, Math.round((params.shotsHit / params.shotsFired) * 100))
      : 0;
  const diffMult = DIFFICULTIES[params.difficulty].scoreMult;
  const combatPts = params.kills * 150 + params.headshots * 100;
  const accuracyBonus = accuracyPct * 8;
  const victoryBonus = params.victory
    ? Math.max(400, Math.round(1800 - params.elapsedSec * 4))
    : 0;
  const score = Math.round((combatPts + accuracyBonus + victoryBonus) * diffMult);
  return { score, accuracyPct };
}

export function formatMissionTime(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function normalizeTouchJoystick(
  dx: number,
  dy: number,
  maxRadius: number,
  deadzone: number = 0.14,
): { x: number; y: number; sprint: boolean; knobX: number; knobY: number } {
  const radius = Math.max(1, maxRadius);
  const dist = Math.hypot(dx, dy);
  if (dist === 0) {
    return { x: 0, y: 0, sprint: false, knobX: 0, knobY: 0 };
  }
  const clampedDist = Math.min(dist, radius);
  const nx = dx / dist;
  const ny = dy / dist;
  const ratio = clampedDist / radius;

  if (ratio <= deadzone) {
    return {
      x: 0,
      y: 0,
      sprint: false,
      knobX: nx * clampedDist,
      knobY: ny * clampedDist,
    };
  }

  const scaled = (ratio - deadzone) / (1 - deadzone);
  const moveX = nx * scaled;
  const moveY = -ny * scaled;
  const sprint = ratio > 0.82 && moveY > 0.55;

  return {
    x: Math.max(-1, Math.min(1, moveX)),
    y: Math.max(-1, Math.min(1, moveY)),
    sprint,
    knobX: nx * clampedDist,
    knobY: ny * clampedDist,
  };
}

export function resolveInfiniteStamina(wantSprintIntent: boolean): {
  stamina: number;
  canSprint: boolean;
} {
  return {
    stamina: 100,
    canSprint: wantSprintIntent,
  };
}

export const DRONE_RADIUS = 0.62;
export const DRONE_HALF_HEIGHT = 0.24;

export interface DroneCollisionOptions {
  minX?: number;
  maxX?: number;
  minZ?: number;
  maxZ?: number;
  minClearance?: number;
  maxY?: number;
}

export function resolveDroneCollision(
  posX: number,
  posY: number,
  posZ: number,
  radius: number,
  halfHeight: number,
  colliders: readonly ColliderBox[],
  ramps: readonly RampVolume[],
  opts?: DroneCollisionOptions,
): { x: number; y: number; z: number; hitWall: boolean; hitFloor: boolean; hitCeiling: boolean } {
  const minBoundX = opts?.minX ?? -21.65;
  const maxBoundX = opts?.maxX ?? 21.65;
  const minBoundZ = opts?.minZ ?? -33.65;
  const maxBoundZ = opts?.maxZ ?? 36.65;
  const minClearance = opts?.minClearance ?? halfHeight;
  const maxYLimit = opts?.maxY ?? 18.0;

  let x = posX;
  let y = posY;
  let z = posZ;
  let hitWall = false;
  let hitFloor = false;
  let hitCeiling = false;

  if (x < minBoundX) {
    x = minBoundX;
    hitWall = true;
  } else if (x > maxBoundX) {
    x = maxBoundX;
    hitWall = true;
  }
  if (z < minBoundZ) {
    z = minBoundZ;
    hitWall = true;
  } else if (z > maxBoundZ) {
    z = maxBoundZ;
    hitWall = true;
  }

  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      if (!b.active) continue;

      if (y + halfHeight <= b.minY || y - halfHeight >= b.maxY) continue;

      const closestX = Math.max(b.minX, Math.min(x, b.maxX));
      const closestZ = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - closestX;
      const dz = z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        const horizPush = distSq > 1e-8 ? radius - Math.sqrt(distSq) : radius;
        const penTop = b.maxY + halfHeight - y;
        const penBot = y - (b.minY - halfHeight);
        const vertPush = Math.min(penTop, penBot);

        if (vertPush < horizPush * 0.72 && vertPush >= 0) {
          if (penTop <= penBot) {
            y = b.maxY + halfHeight;
            hitFloor = true;
          } else {
            y = b.minY - halfHeight;
            hitCeiling = true;
          }
        } else if (distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          x += (dx / dist) * horizPush;
          z += (dz / dist) * horizPush;
          hitWall = true;
        } else {
          const penLeft = Math.abs(x - b.minX);
          const penRight = Math.abs(b.maxX - x);
          const penFront = Math.abs(z - b.minZ);
          const penBack = Math.abs(b.maxZ - z);
          const minPen = Math.min(penLeft, penRight, penFront, penBack);
          if (minPen === penLeft) x = b.minX - radius;
          else if (minPen === penRight) x = b.maxX + radius;
          else if (minPen === penFront) z = b.minZ - radius;
          else z = b.maxZ + radius;
          hitWall = true;
        }
      }
    }

    // Clamp against ramp decks so drones never pass underneath/through ramp geometry
    for (let i = 0; i < ramps.length; i++) {
      const ramp = ramps[i];
      const closestX = Math.max(ramp.minX, Math.min(x, ramp.maxX));
      const closestZ = Math.max(ramp.minZ, Math.min(z, ramp.maxZ));
      const dx = x - closestX;
      const dz = z - closestZ;
      if (dx * dx + dz * dz < radius * radius) {
        const rampH = getRampHeightAt(closestX, closestZ, ramp);
        if (rampH !== null && y - halfHeight < rampH && y + halfHeight > rampH - 0.24) {
          y = rampH + halfHeight;
          hitFloor = true;
        }
      }
    }
  }

  const floorY = getSurfaceHeightAt(x, z, colliders, ramps, Math.max(0, y) + 0.4, radius * 0.65);
  if (y < floorY + minClearance) {
    y = floorY + minClearance;
    hitFloor = true;
  }
  if (y > maxYLimit - halfHeight) {
    y = maxYLimit - halfHeight;
    hitCeiling = true;
  }

  return { x, y, z, hitWall, hitFloor, hitCeiling };
}

export interface DroneCrashState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  settled: boolean;
}

export function stepDroneCrash(
  state: DroneCrashState,
  dt: number,
  radius: number,
  halfHeight: number,
  colliders: readonly ColliderBox[],
  ramps: readonly RampVolume[],
  opts?: { gravity?: number; bounceRestitution?: number; maxY?: number },
): DroneCrashState & { bounced: boolean; landed: boolean; hitWall: boolean } {
  if (state.settled) {
    return { ...state, bounced: false, landed: false, hitWall: false };
  }

  const gravity = opts?.gravity ?? 19.0;
  const restitution = opts?.bounceRestitution ?? 0.24;
  const maxY = opts?.maxY ?? 18.0;

  let vx = state.vx * Math.exp(-1.6 * dt);
  let vy = state.vy - gravity * dt;
  let vz = state.vz * Math.exp(-1.6 * dt);

  const nx = state.x + vx * dt;
  const ny = state.y + vy * dt;
  const nz = state.z + vz * dt;

  const col = resolveDroneCollision(nx, ny, nz, radius, halfHeight, colliders, ramps, {
    minClearance: halfHeight,
    maxY,
  });

  if (col.hitWall) {
    vx *= -0.35;
    vz *= -0.35;
  }
  if (col.hitCeiling && vy > 0) {
    vy = -Math.abs(vy) * 0.25;
  }

  const surfaceY = getSurfaceHeightAt(
    col.x,
    col.z,
    colliders,
    ramps,
    Math.max(state.y, col.y) + 0.4,
    radius * 0.65,
  );
  const restY = surfaceY + halfHeight;

  let x = col.x;
  let y = col.y;
  let z = col.z;
  let bounced = false;
  let landed = false;
  let settled = false;

  if (y <= restY + 0.015 && vy <= 0) {
    y = restY;
    if (Math.abs(vy) > 2.6) {
      vy = Math.abs(vy) * restitution;
      vx *= 0.48;
      vz *= 0.48;
      bounced = true;
    } else {
      vx = 0;
      vy = 0;
      vz = 0;
      settled = true;
      landed = true;
    }
  }

  return { x, y, z, vx, vy, vz, settled, bounced, landed, hitWall: col.hitWall };
}

export function computeTitleFlyoverPose(elapsed: number): {
  camX: number;
  camY: number;
  camZ: number;
  lookX: number;
  lookY: number;
  lookZ: number;
} {
  const angle = elapsed * 0.16;
  return {
    camX: Math.sin(angle) * 7.8,
    camY: 4.6 + Math.sin(angle * 1.3) * 0.65,
    camZ: 27.8 + Math.cos(angle * 0.75) * 5.2,
    lookX: Math.sin(angle * 0.5) * 2.2,
    lookY: 2.0,
    lookZ: 13.5,
  };
}

// =========================================================================
// ARTICULATED MULTI-LIMB RAGDOLL PHYSICS SOLVER (PURE DETERMINISTIC MATH)
// =========================================================================

export interface RagdollImpulse {
  dirX: number;
  dirY: number;
  dirZ: number;
  force: number;
  hitZone: HitZone;
  isExplosion?: boolean;
  seed?: number;
}

export interface RagdollState {
  x: number;
  y: number; // world Y of pelvis center-of-mass
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  scale: number;
  fallForward: 1 | -1; // -1 = thrown onto back, 1 = thrown face-forward
  pelvisPitch: number;
  pelvisRoll: number;
  pelvisYaw: number;
  angVelPitch: number;
  angVelRoll: number;
  angVelYaw: number;
  torsoPitch: number;
  torsoYaw: number;
  torsoRoll: number;
  torsoVelPitch: number;
  torsoVelYaw: number;
  torsoVelRoll: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  headVelPitch: number;
  headVelYaw: number;
  headVelRoll: number;
  armLPitch: number;
  armLRoll: number;
  armRPitch: number;
  armRRoll: number;
  armLVelPitch: number;
  armLVelRoll: number;
  armRVelPitch: number;
  armRVelRoll: number;
  legLPitch: number;
  legLRoll: number;
  legRPitch: number;
  legRRoll: number;
  legLVelPitch: number;
  legLVelRoll: number;
  legRVelPitch: number;
  legRVelRoll: number;
  kneeLPitch: number;
  kneeRPitch: number;
  kneeLVel: number;
  kneeRVel: number;
  targetPelvisPitch: number;
  targetPelvisRoll: number;
  targetTorsoPitch: number;
  targetTorsoRoll: number;
  targetHeadPitch: number;
  targetHeadYaw: number;
  targetArmLPitch: number;
  targetArmLRoll: number;
  targetArmRPitch: number;
  targetArmRRoll: number;
  targetLegLPitch: number;
  targetLegLRoll: number;
  targetLegRPitch: number;
  targetLegRRoll: number;
  targetKneeLPitch: number;
  targetKneeRPitch: number;
  settled: boolean;
  sleepTimer: number;
  impactBounceCount: number;
}

function clampVal(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function deterministicRand(seed: number): number {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export function createRagdollState(
  rootX: number,
  rootY: number,
  rootZ: number,
  yaw: number,
  scale: number,
  impulse: RagdollImpulse,
): RagdollState {
  const seed = impulse.seed ?? rootX * 3.1 + rootZ * 7.3;
  const r1 = deterministicRand(seed + 1.1) - 0.5;
  const r2 = deterministicRand(seed + 2.3) - 0.5;
  const r3 = deterministicRand(seed + 3.7) - 0.5;
  const r4 = deterministicRand(seed + 4.9) - 0.5;

  const dLen = Math.hypot(impulse.dirX, impulse.dirY, impulse.dirZ) || 1;
  const dx = impulse.dirX / dLen;
  const dy = impulse.dirY / dLen;
  const dz = impulse.dirZ / dLen;

  // Enemy facing vector in world XZ: (sin(yaw), cos(yaw))
  const fwdX = Math.sin(yaw);
  const fwdZ = Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);

  // Dot > 0 means shot traveling same direction enemy faces -> hit from behind -> fall forward (+1)
  // Dot <= 0 means shot hit enemy's chest/face -> fall backward onto back (-1)
  const impactDotFwd = dx * fwdX + dz * fwdZ;
  const impactDotRight = dx * rightX + dz * rightZ;
  const fallForward: 1 | -1 = impactDotFwd > 0.25 ? 1 : -1;

  const force = clampVal(impulse.force, 1.8, 18.0);
  const isExp = Boolean(impulse.isExplosion);
  const isHead = impulse.hitZone === 'head';
  const isLeg = impulse.hitZone === 'limb';

  const lift = isExp
    ? 4.6 + force * 0.36
    : isHead
      ? 1.5 + Math.max(0, dy) * 1.4
      : isLeg
        ? 1.1
        : 1.4 + Math.max(0, dy) * 1.2 + (force > 7 ? 1.4 : 0);

  const pelvisH = 0.94 * scale;

  const targetPelvisPitch =
    fallForward === -1 ? -Math.PI * 0.48 : Math.PI * 0.48;
  const targetPelvisRoll = clampVal(impactDotRight * 0.55 + r1 * 0.45, -0.68, 0.68);

  // Natural asymmetric ground rest pose angles (in radians)
  const targetTorsoPitch = fallForward === -1 ? -0.14 + r2 * 0.14 : 0.18 + r2 * 0.12;
  const targetTorsoRoll = r3 * 0.22;
  const targetHeadPitch = fallForward === -1 ? -0.22 + r1 * 0.25 : 0.25 + r1 * 0.2;
  const targetHeadYaw = clampVal(impactDotRight * 0.65 + r2 * 0.7, -0.85, 0.85);

  const targetArmLPitch = fallForward === -1 ? -0.35 + r1 * 0.65 : -0.85 + r1 * 0.5;
  const targetArmLRoll = -0.65 - Math.abs(r2) * 0.75;
  const targetArmRPitch = fallForward === -1 ? -0.25 + r3 * 0.65 : -0.75 + r3 * 0.5;
  const targetArmRRoll = 0.65 + Math.abs(r4) * 0.75;

  const targetLegLPitch = fallForward === -1 ? -0.18 + r1 * 0.32 : 0.14 + r1 * 0.28;
  const targetLegRPitch = fallForward === -1 ? -0.06 + r2 * 0.34 : 0.22 + r2 * 0.26;
  const targetLegLRoll = -0.18 - Math.abs(r3) * 0.22;
  const targetLegRRoll = 0.18 + Math.abs(r4) * 0.22;

  const targetKneeLPitch = fallForward === -1 ? 0.25 + Math.abs(r1) * 0.65 : -0.35 - Math.abs(r1) * 0.5;
  const targetKneeRPitch = fallForward === -1 ? 0.15 + Math.abs(r2) * 0.75 : -0.22 - Math.abs(r2) * 0.6;

  return {
    x: rootX,
    y: rootY + pelvisH,
    z: rootZ,
    vx: dx * force * (isLeg ? 0.65 : 1.0) + r1 * 1.1,
    vy: lift,
    vz: dz * force * (isLeg ? 0.65 : 1.0) + r2 * 1.1,
    yaw,
    scale,
    fallForward,
    pelvisPitch: 0,
    pelvisRoll: 0,
    pelvisYaw: 0,
    angVelPitch: fallForward * (isExp ? 7.5 : isHead ? 5.2 : 5.8 + force * 0.32),
    angVelRoll: impactDotRight * 4.2 + r1 * 3.2,
    angVelYaw: r2 * (isExp ? 6.5 : 2.8) + impactDotRight * 1.8,
    torsoPitch: 0.06,
    torsoYaw: 0,
    torsoRoll: 0,
    torsoVelPitch: fallForward * (isHead ? -5.8 : 4.2) + r3 * 2.2,
    torsoVelYaw: impactDotRight * 5.0 + r2 * 2.5,
    torsoVelRoll: impactDotRight * 3.4,
    headPitch: 0,
    headYaw: 0,
    headRoll: 0,
    headVelPitch: isHead ? -12.5 * fallForward : -5.5 * fallForward + r1 * 3.0,
    headVelYaw: (isHead ? 9.5 : 4.2) * (impactDotRight >= 0 ? 1 : -1) + r4 * 4.5,
    headVelRoll: r3 * 6.0,
    armLPitch: 0,
    armLRoll: 0,
    armRPitch: 0,
    armRRoll: 0,
    armLVelPitch: -4.5 + r1 * 5.0,
    armLVelRoll: -6.5 - Math.abs(r2) * 5.0,
    armRVelPitch: -4.0 + r3 * 5.0,
    armRVelRoll: 6.5 + Math.abs(r4) * 5.0,
    legLPitch: 0,
    legLRoll: 0,
    legRPitch: 0,
    legRRoll: 0,
    legLVelPitch: isLeg ? 6.5 : fallForward * -3.8 + r1 * 2.5,
    legLVelRoll: -2.6 + r2 * 1.8,
    legRVelPitch: isLeg ? -4.2 : fallForward * -2.2 + r3 * 2.5,
    legRVelRoll: 2.6 + r4 * 1.8,
    kneeLPitch: 0,
    kneeRPitch: 0,
    kneeLVel: isLeg ? 8.5 : 4.5 + Math.abs(r1) * 4.0,
    kneeRVel: isLeg ? 6.5 : 3.5 + Math.abs(r2) * 4.0,
    targetPelvisPitch,
    targetPelvisRoll,
    targetTorsoPitch,
    targetTorsoRoll,
    targetHeadPitch,
    targetHeadYaw,
    targetArmLPitch,
    targetArmLRoll,
    targetArmRPitch,
    targetArmRRoll,
    targetLegLPitch,
    targetLegLRoll,
    targetLegRPitch,
    targetLegRRoll,
    targetKneeLPitch,
    targetKneeRPitch,
    settled: false,
    sleepTimer: 0,
    impactBounceCount: 0,
  };
}

export function applyRagdollImpulse(
  state: RagdollState,
  impulse: RagdollImpulse,
): void {
  const dLen = Math.hypot(impulse.dirX, impulse.dirY, impulse.dirZ) || 1;
  const dx = impulse.dirX / dLen;
  const dy = impulse.dirY / dLen;
  const dz = impulse.dirZ / dLen;
  const force = clampVal(impulse.force, 1.5, 22.0);
  const r1 = deterministicRand(state.x * 5.1 + state.z * 3.7 + force) - 0.5;
  const r2 = deterministicRand(state.z * 8.3 - state.x * 2.9 + force) - 0.5;

  state.settled = false;
  state.sleepTimer = 0;
  state.vx += dx * force;
  state.vy += Math.max(impulse.isExplosion ? 4.8 : 1.1, dy * force * 0.7 + (impulse.isExplosion ? 3.5 : 0.8));
  state.vz += dz * force;

  const mult = impulse.isExplosion ? 1.4 : 0.55;
  state.angVelPitch += (r1 * 8.0 - 3.5) * mult;
  state.angVelRoll += r2 * 9.0 * mult;
  state.angVelYaw += (r1 - r2) * 7.5 * mult;
  state.torsoVelPitch += r2 * 7.0 * mult;
  state.headVelPitch += r1 * 10.0 * mult;
  state.headVelYaw += r2 * 9.0 * mult;
  state.armLVelPitch += -4.0 * mult + r1 * 6.0;
  state.armLVelRoll += -5.0 * mult;
  state.armRVelPitch += -3.5 * mult + r2 * 6.0;
  state.armRVelRoll += 5.0 * mult;
  state.kneeLVel += 4.5 * mult;
  state.kneeRVel += 3.8 * mult;
}

export function stepRagdollBody(
  state: RagdollState,
  dt: number,
  colliders: readonly ColliderBox[],
  ramps: readonly RampVolume[],
): { floorImpact: number; wallImpact: boolean; supportY: number } {
  if (state.settled) {
    return { floorImpact: 0, wallImpact: false, supportY: Math.max(0, state.y - 0.16 * state.scale) };
  }

  const clampedDt = Math.min(dt, 0.05);
  const gravity = 19.6;
  const bodyRadius = 0.42 * state.scale;
  const restThickness = 0.16 * state.scale;

  // 1. Linear acceleration & integration
  const drag = Math.exp(-1.15 * clampedDt);
  state.vx *= drag;
  state.vz *= drag;
  state.vy -= gravity * clampedDt;

  const prevX = state.x;
  const prevZ = state.z;
  const nx = state.x + state.vx * clampedDt;
  const ny = state.y + state.vy * clampedDt;
  const nz = state.z + state.vz * clampedDt;

  // Resolve horizontal obstacle collisions against walls, containers, barriers
  const colRes = resolvePlayerCollision(
    nx,
    Math.max(0, ny - restThickness),
    nz,
    bodyRadius,
    0.58 * state.scale,
    colliders,
    ramps,
    0.04,
  );

  // Detect wall collision deflection
  let wallImpact = false;
  const pushX = colRes.x - nx;
  const pushZ = colRes.z - nz;
  const pushDist = Math.hypot(pushX, pushZ);
  if (pushDist > 0.015) {
    const pnx = pushX / pushDist;
    const pnz = pushZ / pushDist;
    const vn = state.vx * pnx + state.vz * pnz;
    if (vn < -1.2) {
      wallImpact = true;
      state.vx -= 1.32 * vn * pnx;
      state.vz -= 1.32 * vn * pnz;
      state.angVelYaw += (pnx * state.vz - pnz * state.vx) * 0.65;
      state.torsoVelYaw += pnx * 3.2;
      state.headVelYaw -= pnx * 4.5;
    } else {
      state.vx *= 0.65;
      state.vz *= 0.65;
    }
  }

  state.x = colRes.x;
  state.z = colRes.z;

  // Support surface directly underneath pelvis AND along upper torso direction for slope fitting
  const supportCenter = getSurfaceHeightAt(
    state.x,
    state.z,
    colliders,
    ramps,
    Math.max(state.y, 0.2) + 0.35,
    bodyRadius * 0.72,
  );

  const worldYaw = state.yaw + state.pelvisYaw;
  const spineDirX = Math.sin(worldYaw) * state.fallForward;
  const spineDirZ = Math.cos(worldYaw) * state.fallForward;
  const probeDist = 0.55 * state.scale;
  const supportHeadEnd = getSurfaceHeightAt(
    state.x + spineDirX * probeDist,
    state.z + spineDirZ * probeDist,
    colliders,
    ramps,
    Math.max(state.y, 0.2) + 0.45,
    0.22 * state.scale,
  );

  // If torso probe is on the same connected slope/deck (within 0.45m), conform slope pitch smoothly
  const deltaH = clampVal(supportHeadEnd - supportCenter, -0.45, 0.45);
  const slopeTilt = Math.atan2(deltaH, probeDist) * -state.fallForward;
  const floorRestY = supportCenter + restThickness;

  let floorImpact = 0;
  if (ny <= floorRestY + 0.015) {
    state.y = floorRestY;
    const impactSpeed = -state.vy;
    if (impactSpeed > 1.85 && state.impactBounceCount < 3) {
      floorImpact = impactSpeed;
      state.impactBounceCount++;
      state.vy = impactSpeed * 0.22;
      state.vx *= 0.52;
      state.vz *= 0.52;
      // Ground slam transmits kinetic whip into head, limbs, and knees
      state.headVelPitch += (state.fallForward === -1 ? -4.5 : 4.2) * Math.min(2, impactSpeed * 0.25);
      state.armLVelRoll -= 3.2;
      state.armRVelRoll += 3.2;
      state.kneeLVel += 3.6;
      state.kneeRVel += 2.9;
    } else {
      state.vy = 0;
      const groundFriction = Math.exp(-9.5 * clampedDt);
      state.vx *= groundFriction;
      state.vz *= groundFriction;
    }
  } else {
    state.y = ny;
  }

  // Re-evaluate speed after floor friction
  const onGround = state.y <= floorRestY + 0.06;
  const fallRatio = clampVal(Math.abs(state.pelvisPitch) / (Math.PI * 0.48), 0, 1);

  // 2. Angular spring-damper integration for pelvis + all articulated limbs
  const integrateJoint = (
    angle: number,
    vel: number,
    target: number,
    stiffness: number,
    damping: number,
    minAng: number,
    maxAng: number,
  ): [number, number] => {
    const accel = (target - angle) * stiffness - vel * damping;
    let nextVel = vel + accel * clampedDt;
    let nextAng = angle + nextVel * clampedDt;
    if (nextAng < minAng) {
      nextAng = minAng;
      if (nextVel < 0) nextVel *= -0.25;
    } else if (nextAng > maxAng) {
      nextAng = maxAng;
      if (nextVel > 0) nextVel *= -0.25;
    }
    return [nextAng, nextVel];
  };

  // Pelvis tips naturally toward ground-conforming pitch + roll once close to resting height
  const pelvisGoalPitch = onGround
    ? state.targetPelvisPitch + slopeTilt * 0.7
    : state.targetPelvisPitch;
  const pelvisStiff = onGround ? 28.0 : 12.0;
  const pelvisDamp = onGround ? 7.8 : 2.6;

  [state.pelvisPitch, state.angVelPitch] = integrateJoint(
    state.pelvisPitch,
    state.angVelPitch,
    pelvisGoalPitch,
    pelvisStiff,
    pelvisDamp,
    -Math.PI * 0.62,
    Math.PI * 0.62,
  );
  [state.pelvisRoll, state.angVelRoll] = integrateJoint(
    state.pelvisRoll,
    state.angVelRoll,
    state.targetPelvisRoll,
    onGround ? 24.0 : 8.0,
    onGround ? 7.4 : 2.2,
    -0.85,
    0.85,
  );
  state.angVelYaw *= Math.exp((onGround ? -8.5 : -2.2) * clampedDt);
  state.pelvisYaw += state.angVelYaw * clampedDt;

  // Torso spine flexion
  const jointStiff = onGround ? 22.0 : 9.0;
  const jointDamp = onGround ? 6.8 : 2.8;
  [state.torsoPitch, state.torsoVelPitch] = integrateJoint(
    state.torsoPitch,
    state.torsoVelPitch,
    state.targetTorsoPitch * fallRatio,
    jointStiff,
    jointDamp,
    -0.55,
    0.65,
  );
  [state.torsoYaw, state.torsoVelYaw] = integrateJoint(
    state.torsoYaw,
    state.torsoVelYaw,
    state.targetPelvisRoll * 0.35,
    jointStiff * 0.85,
    jointDamp,
    -0.65,
    0.65,
  );
  [state.torsoRoll, state.torsoVelRoll] = integrateJoint(
    state.torsoRoll,
    state.torsoVelRoll,
    state.targetTorsoRoll,
    jointStiff * 0.85,
    jointDamp,
    -0.45,
    0.45,
  );

  // Neck / Head whiplash & drape
  [state.headPitch, state.headVelPitch] = integrateJoint(
    state.headPitch,
    state.headVelPitch,
    state.targetHeadPitch,
    jointStiff * 1.1,
    jointDamp,
    -0.75,
    0.75,
  );
  [state.headYaw, state.headVelYaw] = integrateJoint(
    state.headYaw,
    state.headVelYaw,
    state.targetHeadYaw,
    jointStiff,
    jointDamp,
    -1.05,
    1.05,
  );
  [state.headRoll, state.headVelRoll] = integrateJoint(
    state.headRoll,
    state.headVelRoll,
    state.targetPelvisRoll * 0.45,
    jointStiff,
    jointDamp,
    -0.55,
    0.55,
  );

  // Arms fling out and rest beside torso
  [state.armLPitch, state.armLVelPitch] = integrateJoint(
    state.armLPitch,
    state.armLVelPitch,
    state.targetArmLPitch,
    jointStiff * 0.9,
    jointDamp * 0.9,
    -1.65,
    0.85,
  );
  [state.armLRoll, state.armLVelRoll] = integrateJoint(
    state.armLRoll,
    state.armLVelRoll,
    state.targetArmLRoll,
    jointStiff * 0.9,
    jointDamp * 0.9,
    -1.55,
    0.35,
  );
  [state.armRPitch, state.armRVelPitch] = integrateJoint(
    state.armRPitch,
    state.armRVelPitch,
    state.targetArmRPitch,
    jointStiff * 0.9,
    jointDamp * 0.9,
    -1.65,
    0.85,
  );
  [state.armRRoll, state.armRVelRoll] = integrateJoint(
    state.armRRoll,
    state.armRVelRoll,
    state.targetArmRRoll,
    jointStiff * 0.9,
    jointDamp * 0.9,
    -0.35,
    1.55,
  );

  // Hips & Knees buckle and splay naturally
  [state.legLPitch, state.legLVelPitch] = integrateJoint(
    state.legLPitch,
    state.legLVelPitch,
    state.targetLegLPitch,
    jointStiff,
    jointDamp,
    -1.1,
    1.1,
  );
  [state.legLRoll, state.legLVelRoll] = integrateJoint(
    state.legLRoll,
    state.legLVelRoll,
    state.targetLegLRoll,
    jointStiff,
    jointDamp,
    -0.65,
    0.2,
  );
  [state.legRPitch, state.legRVelPitch] = integrateJoint(
    state.legRPitch,
    state.legRVelPitch,
    state.targetLegRPitch,
    jointStiff,
    jointDamp,
    -1.1,
    1.1,
  );
  [state.legRRoll, state.legRVelRoll] = integrateJoint(
    state.legRRoll,
    state.legRVelRoll,
    state.targetLegRRoll,
    jointStiff,
    jointDamp,
    -0.2,
    0.65,
  );
  [state.kneeLPitch, state.kneeLVel] = integrateJoint(
    state.kneeLPitch,
    state.kneeLVel,
    state.targetKneeLPitch,
    jointStiff * 1.1,
    jointDamp,
    -0.95,
    1.45,
  );
  [state.kneeRPitch, state.kneeRVel] = integrateJoint(
    state.kneeRPitch,
    state.kneeRVel,
    state.targetKneeRPitch,
    jointStiff * 1.1,
    jointDamp,
    -0.95,
    1.45,
  );

  // 3. Sleep check when settled on ground
  const movedSq =
    (state.x - prevX) * (state.x - prevX) + (state.z - prevZ) * (state.z - prevZ);
  const linSpeed = Math.hypot(state.vx, state.vy, state.vz);
  const angEnergy =
    Math.abs(state.angVelPitch) +
    Math.abs(state.angVelRoll) +
    Math.abs(state.angVelYaw) +
    Math.abs(state.torsoVelPitch) +
    Math.abs(state.headVelPitch) +
    Math.abs(state.armLVelRoll) +
    Math.abs(state.armRVelRoll) +
    Math.abs(state.kneeLVel);

  if (onGround && linSpeed < 0.14 && angEnergy < 0.35 && movedSq < 1e-4) {
    state.sleepTimer += clampedDt;
    if (state.sleepTimer > 0.25) {
      state.settled = true;
      state.vx = 0;
      state.vy = 0;
      state.vz = 0;
    }
  } else {
    state.sleepTimer = 0;
  }

  return { floorImpact, wallImpact, supportY: supportCenter };
}

// =========================================================================
// PHYSICAL DROPPED WEAPON & DESTRUCTIBLE DEBRIS SOLVER
// =========================================================================

export interface DebrisPhysicsState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  avx: number;
  avy: number;
  avz: number;
  radius: number;
  settled: boolean;
}

export function stepDebrisPiece(
  state: DebrisPhysicsState,
  dt: number,
  colliders: readonly ColliderBox[],
  ramps: readonly RampVolume[],
): { bounced: boolean; hitWall: boolean } {
  if (state.settled) return { bounced: false, hitWall: false };

  const clampedDt = Math.min(dt, 0.05);
  const gravity = 19.2;
  const drag = Math.exp(-0.9 * clampedDt);
  state.vx *= drag;
  state.vz *= drag;
  state.vy -= gravity * clampedDt;

  const nx = state.x + state.vx * clampedDt;
  const ny = state.y + state.vy * clampedDt;
  const nz = state.z + state.vz * clampedDt;

  const col = resolveDroneCollision(
    nx,
    ny,
    nz,
    state.radius,
    state.radius,
    colliders,
    ramps,
    { minClearance: state.radius, maxY: 22 },
  );

  let hitWall = col.hitWall;
  if (col.hitWall) {
    state.vx *= -0.45;
    state.vz *= -0.45;
    state.avx *= -0.6;
    state.avz *= -0.6;
  }

  state.x = col.x;
  state.z = col.z;

  const surfY = getSurfaceHeightAt(
    state.x,
    state.z,
    colliders,
    ramps,
    Math.max(state.y, col.y) + 0.35,
    state.radius * 0.85,
  );
  const restY = surfY + state.radius;

  let bounced = false;
  if (ny <= restY + 0.01 && state.vy <= 0) {
    state.y = restY;
    const impact = -state.vy;
    if (impact > 1.7) {
      bounced = true;
      state.vy = impact * 0.36;
      state.vx *= 0.62;
      state.vz *= 0.62;
      state.avx *= 0.55;
      state.avy *= 0.55;
      state.avz *= 0.55;
    } else {
      state.vy = 0;
      const fric = Math.exp(-11 * clampedDt);
      state.vx *= fric;
      state.vz *= fric;
      state.avx *= fric;
      state.avy *= fric;
      state.avz *= fric;
      if (Math.hypot(state.vx, state.vz) < 0.09) {
        state.vx = 0;
        state.vz = 0;
        state.avx = 0;
        state.avy = 0;
        state.avz = 0;
        state.settled = true;
      }
    }
  } else {
    state.y = ny;
  }

  state.rx += state.avx * clampedDt;
  state.ry += state.avy * clampedDt;
  state.rz += state.avz * clampedDt;

  return { bounced, hitWall };
}

// =========================================================================
// STORM LIGHTNING MULTI-STROKE ENVELOPE & FORKED BOLT GEOMETRY MATH
// =========================================================================

export function computeLightningPulse(elapsed: number, duration: number): number {
  if (duration <= 0 || elapsed < 0 || elapsed >= duration) return 0;
  const u = elapsed / duration;
  // Authentic multi-stroke natural discharge: leader -> dip -> fierce main return -> dip -> secondary restrike -> exponential decay
  if (u < 0.1) {
    return (u / 0.1) * 0.72;
  }
  if (u < 0.18) {
    return 0.15 + ((0.18 - u) / 0.08) * 0.2;
  }
  if (u < 0.34) {
    const p = (u - 0.18) / 0.16;
    return 0.4 + Math.sin(p * Math.PI) * 0.6;
  }
  if (u < 0.44) {
    return 0.24;
  }
  if (u < 0.6) {
    const p = (u - 0.44) / 0.16;
    return 0.24 + Math.sin(p * Math.PI) * 0.54;
  }
  const tail = (u - 0.6) / 0.4;
  return 0.34 * Math.pow(1 - tail, 1.85);
}

export interface LightningSegment {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  thickness: number;
  isBranch: boolean;
}

export function generateLightningBoltSegments(
  startX: number,
  startY: number,
  startZ: number,
  endX: number,
  endY: number,
  endZ: number,
  jitter: number,
  seed: number,
): LightningSegment[] {
  interface RawSeg {
    ax: number;
    ay: number;
    az: number;
    bx: number;
    by: number;
    bz: number;
  }

  let mainSegs: RawSeg[] = [
    { ax: startX, ay: startY, az: startZ, bx: endX, by: endY, bz: endZ },
  ];

  // 4 midpoint-displacement subdivisions -> 16 jagged main-trunk segments
  let offsetScale = jitter;
  let randCounter = 1;
  const nextRand = () => {
    randCounter += 1.37;
    return deterministicRand(seed + randCounter) - 0.5;
  };

  for (let gen = 0; gen < 4; gen++) {
    const nextSegs: RawSeg[] = [];
    for (let i = 0; i < mainSegs.length; i++) {
      const s = mainSegs[i];
      const mx = (s.ax + s.bx) * 0.5 + nextRand() * offsetScale;
      const my = (s.ay + s.by) * 0.5 + nextRand() * offsetScale * 0.32;
      const mz = (s.az + s.bz) * 0.5 + nextRand() * offsetScale;
      nextSegs.push({ ax: s.ax, ay: s.ay, az: s.az, bx: mx, by: my, bz: mz });
      nextSegs.push({ ax: mx, ay: my, az: mz, bx: s.bx, by: s.by, bz: s.bz });
    }
    mainSegs = nextSegs;
    offsetScale *= 0.52;
  }

  const output: LightningSegment[] = [];
  for (let i = 0; i < mainSegs.length; i++) {
    const s = mainSegs[i];
    const t = i / mainSegs.length;
    output.push({
      ...s,
      thickness: 1.0 - t * 0.28,
      isBranch: false,
    });

    // Spawn 4 forked jagged branches splitting outward and downward from upper/mid main trunk
    if (i >= 2 && i <= mainSegs.length - 4 && i % 3 === 0) {
      const branchLen = Math.hypot(endX - startX, endY - startY, endZ - startZ) * (0.24 + Math.abs(nextRand()) * 0.32);
      const bdx = nextRand() * 1.4;
      const bdy = -0.7 - Math.abs(nextRand()) * 0.5;
      const bdz = nextRand() * 1.4;
      const bNorm = Math.hypot(bdx, bdy, bdz) || 1;
      const bex = s.bx + (bdx / bNorm) * branchLen;
      const bey = s.by + (bdy / bNorm) * branchLen;
      const bez = s.bz + (bdz / bNorm) * branchLen;

      let bSegs: RawSeg[] = [{ ax: s.bx, ay: s.by, az: s.bz, bx: bex, by: bey, bz: bez }];
      let bJit = jitter * 0.38;
      for (let g = 0; g < 2; g++) {
        const nb: RawSeg[] = [];
        for (let k = 0; k < bSegs.length; k++) {
          const bs = bSegs[k];
          const mx = (bs.ax + bs.bx) * 0.5 + nextRand() * bJit;
          const my = (bs.ay + bs.by) * 0.5 + nextRand() * bJit * 0.3;
          const mz = (bs.az + bs.bz) * 0.5 + nextRand() * bJit;
          nb.push({ ax: bs.ax, ay: bs.ay, az: bs.az, bx: mx, by: my, bz: mz });
          nb.push({ ax: mx, ay: my, az: mz, bx: bs.bx, by: bs.by, bz: bs.bz });
        }
        bSegs = nb;
        bJit *= 0.5;
      }
      for (let k = 0; k < bSegs.length; k++) {
        const bs = bSegs[k];
        output.push({
          ...bs,
          thickness: 0.45 * (1 - k / (bSegs.length + 1)),
          isBranch: true,
        });
      }
    }
  }

  return output;
}

export function computeDamageIndicatorAngle(
  playerX: number,
  playerZ: number,
  playerYaw: number,
  srcX: number,
  srcZ: number,
): number {
  const dx = srcX - playerX;
  const dz = srcZ - playerZ;
  if (dx * dx + dz * dz < 1e-6) return 0;
  // Player forward unit vector in world XZ is (-sin(yaw), -cos(yaw)); right is (cos(yaw), -sin(yaw))
  const localForward = dx * -Math.sin(playerYaw) + dz * -Math.cos(playerYaw);
  const localRight = dx * Math.cos(playerYaw) + dz * -Math.sin(playerYaw);
  // Screen-space rotation.z around +Z where 0 = top (+Y), -PI/2 = right (+X), +PI/2 = left (-X)
  return -Math.atan2(localRight, localForward);
}


