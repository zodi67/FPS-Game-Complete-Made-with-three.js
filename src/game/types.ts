export type GameState = 'title' | 'playing' | 'paused' | 'gameover';

export type GameMode = 'blackout' | 'surge';

export type DifficultyLevel = 'standard' | 'veteran' | 'hardcore';

export type WeaponId =
  | 'carbine'
  | 'shotgun'
  | 'smg'
  | 'sniper'
  | 'lmg'
  | 'ak'
  | 'sidearm';

export type HitZone = 'head' | 'torso' | 'limb';

export type SurfaceType =
  | 'concrete'
  | 'metal'
  | 'wood'
  | 'asphalt'
  | 'explosive'
  | 'glass'
  | 'sand'
  | 'snow'
  | 'stone'
  | 'foliage'
  | 'water';

export type EnemyArchetype =
  | 'flanker'
  | 'breacher'
  | 'marksman'
  | 'juggernaut'
  | 'rusher'
  | 'drone';

export type LevelId =
  | 'op01'
  | 'op02'
  | 'op03'
  | 'op04'
  | 'op05'
  | 'op06'
  | 'op07'
  | 'op08'
  | 'op09'
  | 'op10'
  | 'op11';

export type WeatherType =
  | 'storm'
  | 'rain'
  | 'sandstorm'
  | 'snow'
  | 'monsoon'
  | 'fog'
  | 'ash'
  | 'toxic'
  | 'clear'
  | 'underground';

export type BiomeType =
  | 'industrial'
  | 'desert'
  | 'arctic'
  | 'jungle'
  | 'harbor'
  | 'volcanic'
  | 'metro'
  | 'mediterranean'
  | 'chemical'
  | 'rooftop'
  | 'bunker';

export interface LevelConfig {
  id: LevelId;
  number: number;
  name: string;
  codename: string;
  climate: string;
  weatherLabel: string;
  location: string;
  briefing: string;
  weather: WeatherType;
  biome: BiomeType;
  hasLightning: boolean;
  lightningIntervalMin: number;
  lightningIntervalMax: number;
  windStrength: number;
  isIndoor: boolean;
  hasWater: boolean;
  hasBirds: boolean;
  birdColor: number;
  enemyCamo: 'urban' | 'desert' | 'arctic' | 'woodland' | 'hazmat' | 'specops';
  skyHorizon: number;
  skyZenith: number;
  cloudHighlight: number;
  fogColor: number;
  fogDensity: number;
  sunColor: number;
  sunIntensity: number;
  sunPos: [number, number, number];
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  rimColor: number;
  rimIntensity: number;
  accentLightColor: number;
  bossTitle: string;
}

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  shortName: string;
  role: string;
  slot: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  damage: number;
  pellets: number;
  rpm: number;
  auto: boolean;
  magSize: number;
  reserveMax: number;
  reloadTime: number;
  spreadHip: number;
  spreadAds: number;
  recoilPitch: number;
  recoilYaw: number;
  range: number;
  suppressed: boolean;
  adsFovDrop: number;
  isScoped?: boolean;
}

export interface DifficultyConfig {
  id: DifficultyLevel;
  label: string;
  summary: string;
  enemyHpMult: number;
  enemyDamageMult: number;
  reactionDelay: number;
  playerArmorStart: number;
  tokenPoolSize: number;
  scoreMult: number;
}

export interface ColliderBox {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  surface: SurfaceType;
  walkable?: boolean;
  blocksSight?: boolean;
  destructibleHp?: number;
  maxHp?: number;
  isExplosive?: boolean;
  sector?: number;
  active: boolean;
}

export interface RampVolume {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  axis: 'x' | 'z';
  yStart: number;
  yEnd: number;
}

export interface RayAABBHit {
  distance: number;
  nx: number;
  ny: number;
  nz: number;
  box: ColliderBox;
}

export interface AttackTokenCandidate {
  id: string;
  alive: boolean;
  distance: number;
  hasLineOfSight: boolean;
  wantsAttack: boolean;
  priority: number;
}

export interface GameSettings {
  sensitivity: number;
  masterVolume: number;
  fov: number;
  bodyCamFx: boolean;
  touchControls: 'auto' | 'on' | 'off';
}

export interface SavedRecord {
  bestScore: number;
  bestTimeSec: number | null;
  victories: number;
}

export interface WeaponRuntimeState {
  mag: number;
  reserve: number;
}

export interface HudSnapshot {
  hp: number;
  maxHp: number;
  armor: number;
  maxArmor: number;
  stamina: number;
  weaponId: WeaponId;
  weapons: Record<WeaponId, WeaponRuntimeState>;
  reloading: boolean;
  reloadProgress: number;
  grenades: number;
  flashlightOn: boolean;
  ads: boolean;
  scopedAds: boolean;
  crouch: boolean;
  lean: number;
  crosshairSpread: number;
  score: number;
  bestScore: number;
  kills: number;
  headshots: number;
  shotsFired: number;
  shotsHit: number;
  levelId: LevelId;
  levelNumber: number;
  levelName: string;
  climateLabel: string;
  weatherLabel: string;
  killStreak: number;
  sector: number;
  wave: number;
  objectiveTitle: string;
  objectiveSub: string;
  objectiveDist: number;
  hostilesLeft: number;
  bossName: string | null;
  bossHp: number;
  bossMaxHp: number;
  elapsedSec: number;
  outcome: 'victory' | 'defeat' | null;
  hitMarkerTimer: number;
  headshotMarker: boolean;
  damageDirAngle: number;
  damageFlash: number;
  flashbangTimer: number;
  lightningFlash: number;
  promptText: string | null;
  interactProgress: number;
  pointerLocked: boolean;
  muted: boolean;
  bodyCamTimecode: string;
}
