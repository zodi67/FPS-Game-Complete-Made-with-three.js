import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { TacticalAudio } from './audio';
import { createEnemyRig, type EnemyHitbox, type EnemyRig } from './enemies';
import { buildTacticalLevel, type LevelData, type PickupDrop } from './level';
import { createHudOverlay, type HudOverlaySystem } from './hudOverlay';
import { createLightningSystem, type LightningSystem } from './lightning';
import { getLevelConfig, getNextLevelId, LEVELS } from './maps';
import { createUi3dSystem, type Ui3dSystem } from './ui3d';
import {
  allocateAttackTokens,
  applyDamageToPlayer,
  applyRagdollImpulse,
  calculateBallisticDamage,
  calculateRunScore,
  computeDamageIndicatorAngle,
  computeLeanOffset,
  computeTitleFlyoverPose,
  createRagdollState,
  DIFFICULTIES,
  DRONE_HALF_HEIGHT,
  DRONE_RADIUS,
  formatMissionTime,
  getSurfaceHeightAt,
  PLAYER_EYE_CROUCH,
  PLAYER_EYE_STANDING,
  PLAYER_HEIGHT_CROUCH,
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
  type DebrisPhysicsState,
} from './rules';
import { BodyCamShader, createWeatherSystem, type WeatherSystem } from './shaders';
import { createMaterialLibrary, type MaterialLibrary } from './textures';
import type {
  AttackTokenCandidate,
  DifficultyLevel,
  GameMode,
  GameSettings,
  GameState,
  HudSnapshot,
  LevelConfig,
  LevelId,
  SurfaceType,
  WeaponId,
  WeaponRuntimeState,
} from './types';
import { createViewmodelRig, type ViewmodelRig } from './viewmodel';

interface ParticleItem {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  r: number;
  g: number;
  b: number;
}

interface CasingItem {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  life: number;
}

interface TracerItem {
  active: boolean;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  length: number;
  life: number;
}

interface GrenadeItem {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  fuse: number;
  mesh: THREE.Mesh;
}

interface DebrisItem {
  mesh: THREE.Object3D;
  state: DebrisPhysicsState;
  isWeapon: boolean;
}

const STORAGE_SETTINGS_KEY = 'iron_sight_settings_v1';
const STORAGE_RECORD_KEY = 'iron_sight_record_v1';

// Zero-GC scratch objects
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _baseFogColor = new THREE.Color();
const _flashFogColor = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);

function detectSoftwareWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class GameEngine {
  private container: HTMLElement;
  private onHudUpdate: (hud: HudSnapshot) => void;
  private onStateChange: (state: GameState) => void;
  private onContextError: (msg: string | null) => void;

  private isSoftwareGl: boolean;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private viewmodelScene!: THREE.Scene;
  private viewmodelCamera!: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private bodyCamPass: ShaderPass | null = null;
  private bloomPass: UnrealBloomPass | null = null;

  private mats!: MaterialLibrary;
  private level!: LevelData;
  private viewmodel!: ViewmodelRig;
  private rain!: WeatherSystem;
  private audio = new TacticalAudio();

  private hemi!: THREE.HemisphereLight;
  private keyLight!: THREE.DirectionalLight;
  private rimLight!: THREE.DirectionalLight;
  private lightningLight!: THREE.DirectionalLight;
  private vmHemi!: THREE.HemisphereLight;
  private vmKey!: THREE.DirectionalLight;
  private vmRim!: THREE.DirectionalLight;
  private vmLightningLight!: THREE.DirectionalLight;
  private lightningSystem!: LightningSystem;
  private baseFogColor = new THREE.Color(0x424a54);
  private envMapTexture: THREE.Texture | null = null;
  private isFirstLightningStrike = true;

  private enemies: EnemyRig[] = [];
  private enemyHitMeshes: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();

  // Pooled InstancedMeshes (Zero-GC render loop)
  private particleCount = 180;
  private particles: ParticleItem[] = [];
  private particleCursor = 0;
  private particleMesh!: THREE.InstancedMesh;

  private casingCount = 48;
  private casings: CasingItem[] = [];
  private casingCursor = 0;
  private casingMesh!: THREE.InstancedMesh;

  private tracerCount = 24;
  private tracers: TracerItem[] = [];
  private tracerCursor = 0;
  private tracerMesh!: THREE.InstancedMesh;

  private grenades: GrenadeItem[] = [];
  private grenadeGeo!: THREE.BufferGeometry;
  private grenadeMat!: THREE.Material;

  private debrisItems: DebrisItem[] = [];
  private readonly maxDebrisItems = 36;
  private woodPlankGeo!: THREE.BufferGeometry;
  private shardGeo!: THREE.BufferGeometry;
  private charredShardMat!: THREE.MeshStandardMaterial;

  private hudOverlay!: HudOverlaySystem;
  private ui3d!: Ui3dSystem;
  private contextErrorMsg: string | null = null;
  private isTouchDevice = false;
  private uiConsumedPointerDown = false;
  private cachedHud: HudSnapshot | null = null;
  private onConfigChange?: (cfg: {
    levelId: LevelId;
    mode: GameMode;
    difficulty: DifficultyLevel;
    settings: GameSettings;
  }) => void;
  private objectiveBeacon!: THREE.Group;
  private objectiveBeaconDiamond!: THREE.Mesh;
  private objectiveBeaconRing!: THREE.Mesh;
  private objectiveBeaconMat!: THREE.MeshBasicMaterial;
  private objectiveBeaconGeo!: THREE.BufferGeometry;
  private objectiveBeaconRingGeo!: THREE.BufferGeometry;

  private explosionLight!: THREE.PointLight;
  private explosionSphereGeo!: THREE.BufferGeometry;
  private explosionRingGeo!: THREE.BufferGeometry;
  private explosionEffects: Array<{
    active: boolean;
    elapsed: number;
    duration: number;
    maxRadius: number;
    sphere: THREE.Mesh;
    sphereMat: THREE.MeshBasicMaterial;
    ring: THREE.Mesh;
    ringMat: THREE.MeshBasicMaterial;
  }> = [];

  private pickupGeos: THREE.BufferGeometry[] = [];
  private pickupMats: THREE.Material[] = [];

  // Game, Level & Mode State
  private gameState: GameState = 'title';
  private gameMode: GameMode = 'blackout';
  private difficulty: DifficultyLevel = 'standard';
  private currentLevelId: LevelId = 'op01';
  private currentLevelConfig: LevelConfig = LEVELS.op01;
  private lightningTimer = 1.8;
  private lightningFlash = 0;
  private killStreak = 0;
  private defeatCamVelY = 0;

  private settings: GameSettings = {
    sensitivity: 1.0,
    masterVolume: 0.75,
    fov: 82,
    bodyCamFx: true,
    touchControls: 'auto',
  };
  private muzzlePointLight!: THREE.PointLight;
  private vmMuzzleLight!: THREE.PointLight;
  private muzzleLightIntensity = 0;
  private bestScore = 0;

  // Player Physics & Combat State
  private playerPos = new THREE.Vector3(0, 0, 33.5);
  private playerVel = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private grounded = true;
  private crouch = false;
  private currentEyeHeight = PLAYER_EYE_STANDING;
  private leanTarget = 0;
  private leanValue = 0;
  private walkDist = 0;
  private stepDistAccum = 0;
  private weaponWallPull = 0;
  private timeSinceDamage = 10;

  private hp = 100;
  private maxHp = 100;
  private armor = 100;
  private maxArmor = 100;
  private stamina = 100;

  private activeWeapon: WeaponId = 'carbine';
  private weaponStates: Record<WeaponId, WeaponRuntimeState> = {
    carbine: { mag: WEAPONS.carbine.magSize, reserve: WEAPONS.carbine.reserveMax },
    shotgun: { mag: WEAPONS.shotgun.magSize, reserve: WEAPONS.shotgun.reserveMax },
    smg: { mag: WEAPONS.smg.magSize, reserve: WEAPONS.smg.reserveMax },
    sniper: { mag: WEAPONS.sniper.magSize, reserve: WEAPONS.sniper.reserveMax },
    lmg: { mag: WEAPONS.lmg.magSize, reserve: WEAPONS.lmg.reserveMax },
    ak: { mag: WEAPONS.ak.magSize, reserve: WEAPONS.ak.reserveMax },
    sidearm: { mag: WEAPONS.sidearm.magSize, reserve: WEAPONS.sidearm.reserveMax },
  };
  private fireTimer = 0;
  private reloading = false;
  private reloadTimer = 0;
  private reloadStagesFired = { out: false, in: false, rack: false };
  private swapTimer = 0;
  private meleeTimer = 0;
  private grenadeCount = 4;
  private flashlightOn = true;
  private adsBlend = 0;
  private prevHudAds = false;
  private prevHudScopedAds = false;
  private recoilKick = 0;
  private recoilPitchOffset = 0;
  private recoilYawOffset = 0;

  // Juice, Timers & Telemetry
  private trauma = 0;
  private hitstopTimer = 0;
  private hitMarkerTimer = 0;
  private headshotMarker = false;
  private damageFlash = 0;
  private damageDirAngle = 0;
  private flashbangTimer = 0;

  private score = 0;
  private kills = 0;
  private headshots = 0;
  private shotsFired = 0;
  private shotsHit = 0;
  private elapsedSec = 0;
  private outcome: 'victory' | 'defeat' | null = null;
  private defeatBeatTimer = 0;

  // Mission Progression
  private sector = 1;
  private wave = 1;
  private terminalDecrypted = false;
  private decryptProgress = 0;
  private extractProgress = 0;
  private waveBreakTimer = 0;

  // Input Hub
  private keysHeld = new Set<string>();
  private justPressed = new Set<string>();
  private mouseLeftDown = false;
  private mouseLeftJustPressed = false;
  private mouseRightDown = false;
  private pointerLocked = false;
  private skipNextLockMove = false;

  // Mobile Multi-Touch Input State
  private touchMoveX = 0;
  private touchMoveY = 0;
  private touchSprint = false;
  private touchFireDown = false;
  private touchFireJustPressed = false;
  private touchAdsActive = false;
  private touchLeanToggle: -1 | 0 | 1 = 0;
  private touchJumpQueued = false;
  private touchInteractHeld = false;

  // Loop & Throttling
  private frameId = 0;
  private disposed = false;
  private lastTime = performance.now();
  private totalTime = 0;
  private hudSyncAccum = 0;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    container: HTMLElement,
    onHudUpdate: (hud: HudSnapshot) => void,
    onStateChange: (state: GameState) => void,
    onContextError: (msg: string | null) => void,
    onConfigChange?: (cfg: {
      levelId: LevelId;
      mode: GameMode;
      difficulty: DifficultyLevel;
      settings: GameSettings;
    }) => void,
  ) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.onStateChange = onStateChange;
    this.onContextError = onContextError;
    this.onConfigChange = onConfigChange;
    this.isSoftwareGl = detectSoftwareWebGL();
    this.isTouchDevice = this.isCoarsePointer();

    this.loadStoredSettings();
    this.initScene();
    this.bindEvents();
    this.syncBodyState('title');
    this.pushHud(true);
    this.notifyConfigChange();

    this.lastTime = performance.now();
    this.loop();
  }

  private loadStoredSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<GameSettings>;
        this.settings = { ...this.settings, ...parsed };
      }
      const rec = localStorage.getItem(STORAGE_RECORD_KEY);
      if (rec) {
        const parsedRec = JSON.parse(rec) as { bestScore?: number };
        this.bestScore = parsedRec.bestScore ?? 0;
      }
    } catch {
      // ignore storage errors
    }
    this.audio.setVolume(this.settings.masterVolume);
  }

  private saveRecord(score: number) {
    if (score > this.bestScore) {
      this.bestScore = score;
      try {
        localStorage.setItem(
          STORAGE_RECORD_KEY,
          JSON.stringify({ bestScore: this.bestScore }),
        );
      } catch {
        // ignore
      }
    }
  }

  public getSettings(): GameSettings {
    return { ...this.settings };
  }

  private notifyConfigChange() {
    this.onConfigChange?.({
      levelId: this.currentLevelId,
      mode: this.gameMode,
      difficulty: this.difficulty,
      settings: { ...this.settings },
    });
  }

  public updateSettings(partial: Partial<GameSettings>) {
    this.settings = { ...this.settings, ...partial };
    this.audio.setVolume(this.settings.masterVolume);
    try {
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // ignore
    }
    this.notifyConfigChange();
    this.pushHud(true);
  }

  private initScene() {
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.domElement.tabIndex = 0;

    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const fogColor = new THREE.Color(0x455362);
    this.scene.background = fogColor;
    this.scene.fog = new THREE.FogExp2(0x455362, 0.0078);

    this.camera = new THREE.PerspectiveCamera(
      this.settings.fov,
      width / height,
      0.07,
      175,
    );
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // Dedicated depth-cleared overlay scene for first-person weapon & arms (zero world clipping!)
    this.viewmodelScene = new THREE.Scene();
    this.viewmodelCamera = new THREE.PerspectiveCamera(
      this.settings.fov,
      width / height,
      0.02,
      12,
    );
    this.viewmodelCamera.rotation.order = 'YXZ';
    this.viewmodelScene.add(this.viewmodelCamera);

    // Natural atmospheric Sky Environment via PMREMGenerator (rebuilt per-level for realistic grounded reflections)
    this.rebuildSkyEnvironment(this.currentLevelConfig);
    this.scene.environmentIntensity = 0.55;

    // Photorealistic Overcast / Climate Dynamic 3-Point Lighting
    this.hemi = new THREE.HemisphereLight(0xd8e4f0, 0x454b52, 1.55);
    this.scene.add(this.hemi);

    this.keyLight = new THREE.DirectionalLight(0xfaf3e8, 2.1);
    this.keyLight.position.set(24, 38, 20);
    this.keyLight.castShadow = !this.isSoftwareGl;
    const shadowSize = this.isSoftwareGl ? 512 : 2048;
    this.keyLight.shadow.mapSize.set(shadowSize, shadowSize);
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 125;
    this.keyLight.shadow.camera.left = -30;
    this.keyLight.shadow.camera.right = 30;
    this.keyLight.shadow.camera.top = 30;
    this.keyLight.shadow.camera.bottom = -30;
    this.keyLight.shadow.bias = -0.00025;
    this.keyLight.shadow.normalBias = 0.014;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    this.rimLight = new THREE.DirectionalLight(0xdce6f2, 0.95);
    this.rimLight.position.set(-24, 22, -26);
    this.scene.add(this.rimLight);

    this.lightningLight = new THREE.DirectionalLight(0xf4f7fb, 0);
    this.lightningLight.position.set(18, 42, -32);
    this.scene.add(this.lightningLight);

    // Match sky environment & directional key/rim/lightning lighting on viewmodel overlay scene
    this.viewmodelScene.environment = this.scene.environment;
    this.viewmodelScene.environmentIntensity = 0.65;
    this.vmHemi = new THREE.HemisphereLight(0xd8e4f0, 0x454b52, 1.55);
    this.vmKey = new THREE.DirectionalLight(0xfaf3e8, 2.1);
    this.vmKey.position.set(24, 38, 20);
    this.vmRim = new THREE.DirectionalLight(0xdce6f2, 0.95);
    this.vmRim.position.set(-24, 22, -26);
    this.vmLightningLight = new THREE.DirectionalLight(0xf4f7fb, 0);
    this.vmLightningLight.position.set(18, 42, -32);
    this.viewmodelScene.add(this.vmHemi, this.vmKey, this.vmRim, this.vmLightningLight);

    // Materials & Level
    this.mats = createMaterialLibrary(this.renderer, this.isSoftwareGl);
    this.level = buildTacticalLevel(this.mats, this.isSoftwareGl, this.currentLevelConfig);
    this.scene.add(this.level.root);

    // Volumetric 3D Sky Lightning & Climate Weather System
    this.lightningSystem = createLightningSystem();
    this.scene.add(this.lightningSystem.group);
    this.rain = createWeatherSystem(this.isSoftwareGl ? 220 : 520, this.currentLevelConfig.weather);
    this.scene.add(this.rain.mesh);
    this.applyLevelAtmosphere(this.currentLevelConfig);

    // 3D World Objective Waypoint Beacon (holographic diamond + pulse ring)
    this.objectiveBeacon = new THREE.Group();
    this.objectiveBeacon.visible = false;
    this.objectiveBeaconMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.objectiveBeaconGeo = new THREE.OctahedronGeometry(0.28, 0);
    this.objectiveBeaconDiamond = new THREE.Mesh(
      this.objectiveBeaconGeo,
      this.objectiveBeaconMat,
    );
    this.objectiveBeaconDiamond.position.y = 0.55;
    this.objectiveBeaconRingGeo = new THREE.RingGeometry(0.45, 0.56, 24);
    this.objectiveBeaconRing = new THREE.Mesh(
      this.objectiveBeaconRingGeo,
      this.objectiveBeaconMat,
    );
    this.objectiveBeaconRing.rotation.x = -Math.PI / 2;
    this.objectiveBeacon.add(this.objectiveBeaconDiamond, this.objectiveBeaconRing);
    this.scene.add(this.objectiveBeacon);

    // Three.js Orthographic WebGL HUD Overlay (crosshair, hitmarkers, damage arc, reload ring, 8x riflescope optic)
    this.hudOverlay = createHudOverlay();
    this.hudOverlay.resize(width, height);

    // Three.js Full-Game UI System (Title Screen, Tactical HUD, Pause/Debrief Modals, Mobile Controls)
    this.ui3d = createUi3dSystem(
      {
        onSelectLevel: (id) => this.setLevel(id),
        onSelectMode: (mode) => this.setModeAndDifficulty(mode, this.difficulty),
        onSelectDifficulty: (diff) => this.setModeAndDifficulty(this.gameMode, diff),
        onDeploy: () => this.startMission(this.gameMode, this.difficulty, true, this.currentLevelId),
        onNextLevel: () => {
          const nextId = getNextLevelId(this.currentLevelId);
          if (nextId) this.startMission(this.gameMode, this.difficulty, true, nextId);
        },
        onSelectWeapon: (id) => this.selectWeaponSlot(id),
        onToggleMute: () => this.toggleMute(),
        onPause: () => this.pauseMission(),
        onResume: () => this.resumeMission(),
        onRestart: () => this.startMission(this.gameMode, this.difficulty, true, this.currentLevelId),
        onReturnTitle: () => this.returnToTitle(),
        onUpdateSettings: (partial) => this.updateSettings(partial),
        onTouchMove: (x, y, sprint) => this.setTouchMove(x, y, sprint),
        onTouchLook: (dx, dy) => this.addTouchLook(dx, dy),
        onTouchFireChange: (active) => this.setTouchFire(active),
        onToggleTouchAds: () => this.toggleTouchAds(),
        onToggleTouchLean: (dir) => this.toggleTouchLean(dir),
        onTouchInteractChange: (active) => this.setTouchInteract(active),
        onTouchAction: (action) => this.triggerTouchAction(action),
      },
      this.isSoftwareGl,
    );
    this.ui3d.resize(width, height);

    // First-person Viewmodel mounted in depth-cleared overlay camera; Flashlight + Beam stay in world scene
    this.viewmodel = createViewmodelRig(this.mats, this.isSoftwareGl);
    this.viewmodelCamera.add(this.viewmodel.root);
    this.viewmodel.root.visible = false; // hidden during Title flyover
    this.camera.add(
      this.viewmodel.flashlight,
      this.viewmodel.flashlightTarget,
      this.viewmodel.flashCone,
    );

    this.muzzlePointLight = new THREE.PointLight(0xffaa44, 0, 9.5, 1.8);
    this.muzzlePointLight.position.set(0.22, -0.1, -0.85);
    this.camera.add(this.muzzlePointLight);

    this.vmMuzzleLight = new THREE.PointLight(0xffaa44, 0, 3.0, 1.8);
    this.vmMuzzleLight.position.set(0.22, -0.1, -0.85);
    this.viewmodelCamera.add(this.vmMuzzleLight);

    // GPU Post-Processing Composer (Skipped on software WebGL per Three.js budget)
    this.initPools();

    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      const worldPass = new RenderPass(this.scene, this.camera);
      const vmPass = new RenderPass(this.viewmodelScene, this.viewmodelCamera);
      vmPass.clear = false;
      vmPass.clearDepth = true;
      this.composer.addPass(worldPass);
      this.composer.addPass(vmPass);

      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.09,
        0.24,
        1.05,
      );
      this.composer.addPass(this.bloomPass);

      this.bodyCamPass = new ShaderPass(BodyCamShader);
      this.composer.addPass(this.bodyCamPass);
      this.renderer.compile(this.scene, this.camera);
      this.renderer.compile(this.viewmodelScene, this.viewmodelCamera);
    }
    this.renderer.autoClear = false;
  }

  private initPools() {
    // 1. Impact Sparks & Debris Pool
    const partGeo = new THREE.BoxGeometry(0.055, 0.055, 0.055);
    const partMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleMesh = new THREE.InstancedMesh(partGeo, partMat, this.particleCount);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;
    for (let i = 0; i < this.particleCount; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        scale: 0,
        r: 1,
        g: 1,
        b: 1,
      });
      _mat4.makeScale(0, 0, 0);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, _color.setRGB(1, 1, 1));
    }
    this.scene.add(this.particleMesh);

    // 2. Brass Shell Casings Pool
    const casingGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.036, 6);
    this.casingMesh = new THREE.InstancedMesh(casingGeo, this.mats.brassShell, this.casingCount);
    this.casingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.casingMesh.frustumCulled = false;
    for (let i = 0; i < this.casingCount; i++) {
      this.casings.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rx: 0,
        ry: 0,
        rz: 0,
        life: 0,
      });
      _mat4.makeScale(0, 0, 0);
      this.casingMesh.setMatrixAt(i, _mat4);
    }
    this.scene.add(this.casingMesh);

    // 3. Ballistic Tracers Pool
    const tracerGeo = new THREE.BoxGeometry(0.02, 0.02, 1.0);
    const tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffd27d,
      transparent: true,
      opacity: 0.85,
    });
    this.tracerMesh = new THREE.InstancedMesh(tracerGeo, tracerMat, this.tracerCount);
    this.tracerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tracerMesh.frustumCulled = false;
    for (let i = 0; i < this.tracerCount; i++) {
      this.tracers.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        dx: 0,
        dy: 0,
        dz: -1,
        length: 1,
        life: 0,
      });
      _mat4.makeScale(0, 0, 0);
      this.tracerMesh.setMatrixAt(i, _mat4);
    }
    this.scene.add(this.tracerMesh);

    // 4. Grenade & Physical Debris asset templates
    this.grenadeGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.13, 10);
    this.grenadeMat = new THREE.MeshStandardMaterial({
      color: 0x3f4f3c,
      roughness: 0.45,
      metalness: 0.55,
    });
    this.woodPlankGeo = new THREE.BoxGeometry(0.48, 0.048, 0.13);
    this.shardGeo = new THREE.BoxGeometry(0.26, 0.04, 0.16);
    this.charredShardMat = new THREE.MeshStandardMaterial({
      color: 0x3b2d28,
      roughness: 0.78,
      metalness: 0.45,
    });

    // 5. 3D Explosion Shockwaves & Blast Light Pool
    this.explosionLight = new THREE.PointLight(0xff8a30, 0, 18, 1.7);
    this.scene.add(this.explosionLight);
    this.explosionSphereGeo = new THREE.IcosahedronGeometry(1, 2);
    this.explosionRingGeo = new THREE.RingGeometry(0.76, 1.0, 28);
    for (let i = 0; i < 4; i++) {
      const sphereMat = new THREE.MeshBasicMaterial({
        color: 0xffb347,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xff7b29,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const sphere = new THREE.Mesh(this.explosionSphereGeo, sphereMat);
      const ring = new THREE.Mesh(this.explosionRingGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      sphere.visible = false;
      ring.visible = false;
      this.scene.add(sphere, ring);
      this.explosionEffects.push({
        active: false,
        elapsed: 0,
        duration: 0.42,
        maxRadius: 5,
        sphere,
        sphereMat,
        ring,
        ringMat,
      });
    }
  }

  private spawnParticles(
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    count: number,
    colorHex: number,
    speed: number = 5.5,
    scale: number = 1.0,
  ) {
    _color.setHex(colorHex);
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % this.particleCount;
      p.active = true;
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = (nx + (Math.random() - 0.5) * 1.4) * speed * (0.5 + Math.random() * 0.8);
      p.vy = (ny + Math.random() * 1.1) * speed * (0.4 + Math.random() * 0.8);
      p.vz = (nz + (Math.random() - 0.5) * 1.4) * speed * (0.5 + Math.random() * 0.8);
      p.maxLife = 0.28 + Math.random() * 0.35;
      p.life = p.maxLife;
      p.scale = scale * (0.6 + Math.random() * 0.8);
      p.r = _color.r;
      p.g = _color.g;
      p.b = _color.b;
    }
  }

  private spawnCasing() {
    this.viewmodelCamera.updateMatrixWorld(true);
    this.viewmodel.ejectionPoint.getWorldPosition(_v1);
    const c = this.casings[this.casingCursor];
    this.casingCursor = (this.casingCursor + 1) % this.casingCount;
    c.active = true;
    c.x = _v1.x;
    c.y = _v1.y;
    c.z = _v1.z;

    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    c.vx = rightX * (1.8 + Math.random() * 1.2) + this.playerVel.x * 0.35;
    c.vy = 1.9 + Math.random() * 0.8;
    c.vz = rightZ * (1.8 + Math.random() * 1.2) + this.playerVel.z * 0.35;
    c.rx = Math.random() * Math.PI;
    c.ry = Math.random() * Math.PI;
    c.rz = Math.random() * Math.PI;
    c.life = 1.6;
  }

  private spawnTracer(
    sx: number,
    sy: number,
    sz: number,
    ex: number,
    ey: number,
    ez: number,
  ) {
    const t = this.tracers[this.tracerCursor];
    this.tracerCursor = (this.tracerCursor + 1) % this.tracerCount;
    _v1.set(ex - sx, ey - sy, ez - sz);
    const dist = Math.max(0.5, _v1.length());
    _v1.divideScalar(dist);
    t.active = true;
    t.x = (sx + ex) * 0.5;
    t.y = (sy + ey) * 0.5;
    t.z = (sz + ez) * 0.5;
    t.dx = _v1.x;
    t.dy = _v1.y;
    t.dz = _v1.z;
    t.length = Math.min(dist, 22);
    t.life = 0.055;
  }

  private bindEvents() {
    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      if (!this.keysHeld.has(code)) {
        this.justPressed.add(code);
      }
      this.keysHeld.add(code);

      if (this.gameState === 'title' && (code === 'Enter' || code === 'Space')) {
        e.preventDefault();
        this.startMission(this.gameMode, this.difficulty);
        return;
      }

      if (code === 'KeyP' || (code === 'Escape' && !this.pointerLocked)) {
        if (this.gameState === 'playing') {
          this.pauseMission();
        } else if (this.gameState === 'paused') {
          this.resumeMission();
        }
      }

      if (code === 'KeyM' && this.gameState !== 'title') {
        this.toggleMute();
      }
      if (code === 'KeyR' && this.gameState === 'paused') {
        this.startMission(this.gameMode, this.difficulty);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.keysHeld.delete(e.code);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (this.gameState !== 'playing') return;
      if (this.pointerLocked) {
        if (this.skipNextLockMove) {
          this.skipNextLockMove = false;
          return;
        }
        // Guard against browser pointer-lock cursor-warp spikes
        if (Math.abs(e.movementX) > 160 || Math.abs(e.movementY) > 160) return;
        const sens = 0.0021 * this.settings.sensitivity * (this.adsBlend > 0.5 ? 0.6 : 1.0);
        this.yaw -= e.movementX * sens;
        this.pitch = THREE.MathUtils.clamp(
          this.pitch - e.movementY * sens,
          -Math.PI / 2.15,
          Math.PI / 2.15,
        );
      } else if (e.buttons === 1) {
        // Fallback drag look if pointer lock isn't active in headless testing
        if (Math.abs(e.movementX) > 160 || Math.abs(e.movementY) > 160) return;
        const sens = 0.0024 * this.settings.sensitivity;
        this.yaw -= e.movementX * sens;
        this.pitch = THREE.MathUtils.clamp(
          this.pitch - e.movementY * sens,
          -Math.PI / 2.15,
          Math.PI / 2.15,
        );
      }
    };

    const onCanvasPointerDown = (e: PointerEvent) => {
      this.audio.unlock();
      if (this.ui3d.handlePointerDown(e, this.renderer.domElement)) {
        this.uiConsumedPointerDown = true;
        return;
      }
      this.uiConsumedPointerDown = false;
    };

    const onCanvasPointerMove = (e: PointerEvent) => {
      this.ui3d.handlePointerMove(e, this.renderer.domElement);
    };

    const onCanvasPointerUp = (e: PointerEvent) => {
      this.uiConsumedPointerDown = false;
      this.ui3d.handlePointerUp(e, this.renderer.domElement);
    };

    const onFirstTouch = () => {
      this.isTouchDevice = true;
    };

    const onMouseDown = (e: MouseEvent) => {
      if (this.gameState !== 'playing') return;
      if (this.uiConsumedPointerDown) {
        this.uiConsumedPointerDown = false;
        return;
      }
      this.audio.unlock();
      const target = e.target as HTMLElement | null;
      if (target && target !== this.renderer.domElement && target.closest('button, input, select')) {
        return;
      }

      const showTouch =
        this.settings.touchControls === 'on' ||
        (this.settings.touchControls === 'auto' && this.isTouchDevice);
      if (showTouch) return;

      if (
        e.button === 0 &&
        !this.isCoarsePointer() &&
        !this.pointerLocked &&
        this.renderer.domElement.requestPointerLock
      ) {
        try {
          this.renderer.domElement.requestPointerLock();
        } catch {
          // Headless fallback
        }
      }
      if (e.button === 0 && !this.isCoarsePointer()) {
        this.mouseLeftDown = true;
        this.mouseLeftJustPressed = true;
      } else if (e.button === 2 && !this.isCoarsePointer()) {
        this.mouseRightDown = true;
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) this.mouseLeftDown = false;
      if (e.button === 2) this.mouseRightDown = false;
    };

    const onWheel = (e: WheelEvent) => {
      if (this.gameState !== 'playing') return;
      const idx = WEAPON_ORDER.indexOf(this.activeWeapon);
      const step = e.deltaY > 0 ? 1 : WEAPON_ORDER.length - 1;
      const next = WEAPON_ORDER[(idx + step) % WEAPON_ORDER.length];
      this.switchWeapon(next);
    };

    const onContextMenu = (e: MouseEvent) => {
      if (this.gameState === 'playing') e.preventDefault();
    };

    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      if (locked && !this.pointerLocked) {
        this.skipNextLockMove = true;
      }
      this.pointerLocked = locked;
      this.pushHud(true);
    };

    const onBlur = () => {
      this.keysHeld.clear();
      this.justPressed.clear();
      this.mouseLeftDown = false;
      this.mouseRightDown = false;
    };

    const onCanvasLost = (e: Event) => {
      e.preventDefault();
      this.contextErrorMsg = 'WebGL graphics context interrupted. Attempting recovery...';
      this.onContextError(this.contextErrorMsg);
    };
    const onCanvasRestored = () => {
      this.contextErrorMsg = null;
      this.onContextError(null);
    };

    const canvasEl = this.renderer.domElement;
    canvasEl.addEventListener('pointerdown', onCanvasPointerDown);
    canvasEl.addEventListener('pointermove', onCanvasPointerMove);
    canvasEl.addEventListener('pointerup', onCanvasPointerUp);
    canvasEl.addEventListener('pointercancel', onCanvasPointerUp);
    window.addEventListener('touchstart', onFirstTouch, { passive: true, once: true });

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onBlur);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    canvasEl.addEventListener('webglcontextlost', onCanvasLost);
    canvasEl.addEventListener('webglcontextrestored', onCanvasRestored);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
    window.addEventListener('resize', this.handleResize);

    // Store cleanup on instance
    this.unbindListeners = () => {
      canvasEl.removeEventListener('pointerdown', onCanvasPointerDown);
      canvasEl.removeEventListener('pointermove', onCanvasPointerMove);
      canvasEl.removeEventListener('pointerup', onCanvasPointerUp);
      canvasEl.removeEventListener('pointercancel', onCanvasPointerUp);
      window.removeEventListener('touchstart', onFirstTouch);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onBlur);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      canvasEl.removeEventListener('webglcontextlost', onCanvasLost);
      canvasEl.removeEventListener('webglcontextrestored', onCanvasRestored);
      window.removeEventListener('resize', this.handleResize);
      this.resizeObserver?.disconnect();
    };
  }

  private unbindListeners = () => {};

  private handleResize = () => {
    if (this.disposed) return;
    this.isTouchDevice = this.isCoarsePointer() || this.isTouchDevice;
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.viewmodelCamera.aspect = width / height;
    this.viewmodelCamera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    if (this.composer) {
      this.composer.setSize(width, height);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(width, height);
    }
    this.hudOverlay?.resize(width, height);
    this.ui3d?.resize(width, height);
    this.syncUi3d(0);
    this.renderSceneNow();
  };

  private syncBodyState(state: GameState) {
    this.gameState = state;
    document.body.dataset.state = state;
    this.onStateChange(state);
  }

  private rebuildSkyEnvironment(cfg: LevelConfig) {
    if (!this.renderer || !this.scene) return;
    const envScene = new THREE.Scene();
    const envDomeGeo = new THREE.SphereGeometry(40, 24, 16);
    const horizonCol = new THREE.Color(cfg.skyHorizon);
    const zenithCol = new THREE.Color(cfg.skyZenith);
    const groundCol = new THREE.Color(cfg.hemiGround).multiplyScalar(0.55);
    const sunDir = new THREE.Vector3(cfg.sunPos[0], cfg.sunPos[1], cfg.sunPos[2]).normalize();
    const envDomeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        uHorizon: { value: horizonCol },
        uZenith: { value: zenithCol },
        uGround: { value: groundCol },
        uSunDir: { value: sunDir },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uHorizon;
        uniform vec3 uZenith;
        uniform vec3 uGround;
        uniform vec3 uSunDir;
        varying vec3 vDir;
        void main() {
          float y = vDir.y;
          vec3 sky = y >= 0.0
            ? mix(uHorizon, uZenith, pow(y, 0.55))
            : mix(uHorizon, uGround, pow(-y, 0.45));
          // Soft diffuse skylight sun bounce (never sharp neon/white rectangles)
          float sunGlow = pow(max(0.0, dot(vDir, uSunDir)), 8.0);
          sky += vec3(0.32, 0.31, 0.29) * sunGlow;
          gl_FragColor = vec4(sky, 1.0);
        }
      `,
    });
    const envDome = new THREE.Mesh(envDomeGeo, envDomeMat);
    envScene.add(envDome);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const nextTex = pmrem.fromScene(envScene, 0.06).texture;
    pmrem.dispose();
    envDomeGeo.dispose();
    envDomeMat.dispose();

    const prevTex = this.envMapTexture;
    this.envMapTexture = nextTex;
    this.scene.environment = nextTex;
    if (this.viewmodelScene) {
      this.viewmodelScene.environment = nextTex;
    }
    prevTex?.dispose();
  }

  private applyLevelAtmosphere(cfg: LevelConfig) {
    this.rebuildSkyEnvironment(cfg);
    this.baseFogColor.setHex(cfg.fogColor);
    this.scene.background = this.baseFogColor.clone();
    this.scene.fog = new THREE.FogExp2(cfg.fogColor, cfg.fogDensity);

    this.hemi.color.setHex(cfg.hemiSky);
    this.hemi.groundColor.setHex(cfg.hemiGround);
    this.hemi.intensity = cfg.hemiIntensity;

    this.keyLight.color.setHex(cfg.sunColor);
    this.keyLight.intensity = cfg.sunIntensity;
    this.keyLight.position.set(cfg.sunPos[0], cfg.sunPos[1], cfg.sunPos[2]);

    this.rimLight.color.setHex(cfg.rimColor);
    this.rimLight.intensity = cfg.rimIntensity;

    this.vmHemi.color.setHex(cfg.hemiSky);
    this.vmHemi.groundColor.setHex(cfg.hemiGround);
    this.vmHemi.intensity = cfg.hemiIntensity;
    this.vmKey.color.setHex(cfg.sunColor);
    this.vmKey.intensity = cfg.sunIntensity;
    this.vmKey.position.set(cfg.sunPos[0], cfg.sunPos[1], cfg.sunPos[2]);
    this.vmRim.color.setHex(cfg.rimColor);
    this.vmRim.intensity = cfg.rimIntensity;

    this.lightningSystem?.clear();
    this.lightningLight.intensity = 0;
    this.vmLightningLight.intensity = 0;
    if (this.level?.skyDomeMat?.uniforms?.uLightning) {
      this.level.skyDomeMat.uniforms.uLightning.value = 0;
    }

    this.rain.setWeather(cfg.weather, cfg.windStrength);
    this.rain.setLightningFlash(0, 0xedf2f8);
    this.lightningFlash = 0;
    this.isFirstLightningStrike = true;
    this.lightningTimer = cfg.hasLightning ? 0.65 + Math.random() * 0.55 : 9999;
  }

  public loadLevel(levelId: LevelId) {
    const cfg = getLevelConfig(levelId);
    if (this.currentLevelId === cfg.id && this.level) return;

    this.clearDynamicEntities();
    if (this.level) {
      this.scene.remove(this.level.root);
      this.level.dispose();
    }
    this.currentLevelId = cfg.id;
    this.currentLevelConfig = cfg;
    this.level = buildTacticalLevel(this.mats, this.isSoftwareGl, cfg);
    this.scene.add(this.level.root);
    this.applyLevelAtmosphere(cfg);
    this.renderSceneNow();
    this.pushHud(true);
  }

  public setLevel(levelId: LevelId) {
    this.loadLevel(levelId);
    this.notifyConfigChange();
  }

  public setModeAndDifficulty(mode: GameMode, diff: DifficultyLevel) {
    this.gameMode = mode;
    this.difficulty = diff;
    this.notifyConfigChange();
    this.pushHud(true);
  }

  public startMission(
    mode: GameMode,
    difficulty: DifficultyLevel,
    fromUserGesture: boolean = true,
    levelId?: LevelId,
  ) {
    if (fromUserGesture) {
      this.audio.unlock();
    }
    if (levelId) {
      this.loadLevel(levelId);
    }
    this.gameMode = mode;
    this.difficulty = difficulty;
    const diffCfg = DIFFICULTIES[difficulty];

    // Clear previous enemies, grenades, pickups
    this.clearDynamicEntities();
    this.restoreDestructibles();

    // Reset player transform & stats cleanly
    this.playerPos.copy(this.level.playerSpawn);
    this.playerVel.set(0, 0, 0);
    this.yaw = 0; // Facing North (-Z) straight into open courtyard vista
    this.pitch = 0.02;
    this.grounded = true;
    this.crouch = false;
    this.currentEyeHeight = PLAYER_EYE_STANDING;
    this.leanTarget = 0;
    this.leanValue = 0;
    this.walkDist = 0;
    this.stepDistAccum = 0;
    this.weaponWallPull = 0;
    this.timeSinceDamage = 10;

    this.hp = 100;
    this.maxHp = 100;
    this.armor = diffCfg.playerArmorStart;
    this.maxArmor = 100;
    this.stamina = 100;

    this.activeWeapon = 'carbine';
    this.weaponStates = {
      carbine: { mag: WEAPONS.carbine.magSize, reserve: WEAPONS.carbine.reserveMax },
      shotgun: { mag: WEAPONS.shotgun.magSize, reserve: WEAPONS.shotgun.reserveMax },
      smg: { mag: WEAPONS.smg.magSize, reserve: WEAPONS.smg.reserveMax },
      sniper: { mag: WEAPONS.sniper.magSize, reserve: WEAPONS.sniper.reserveMax },
      lmg: { mag: WEAPONS.lmg.magSize, reserve: WEAPONS.lmg.reserveMax },
      ak: { mag: WEAPONS.ak.magSize, reserve: WEAPONS.ak.reserveMax },
      sidearm: { mag: WEAPONS.sidearm.magSize, reserve: WEAPONS.sidearm.reserveMax },
    };
    this.fireTimer = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.swapTimer = 0;
    this.meleeTimer = 0;
    this.grenadeCount = 4;
    this.flashlightOn = true;
    this.adsBlend = 0;
    this.recoilKick = 0;
    this.recoilPitchOffset = 0;
    this.recoilYawOffset = 0;

    this.trauma = 0;
    this.hitstopTimer = 0;
    this.hitMarkerTimer = 0;
    this.damageFlash = 0;
    this.flashbangTimer = 0;

    this.score = 0;
    this.kills = 0;
    this.killStreak = 0;
    this.headshots = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.elapsedSec = 0;
    this.outcome = null;
    this.defeatBeatTimer = 0;
    this.defeatCamVelY = 0;

    this.sector = 1;
    this.wave = 1;
    this.terminalDecrypted = false;
    this.decryptProgress = 0;
    this.extractProgress = 0;
    this.waveBreakTimer = 0;

    this.level.terminalScreenMat.emissive.setHex(0xf59e0b);
    this.level.extractionBeaconMat.emissive.setHex(0x10b981);
    this.level.extractionBeaconMat.emissiveIntensity = 0.25;

    // Spawn Initial Encounter
    if (mode === 'blackout') {
      this.spawnSectorSquad(1);
    } else {
      this.spawnSurgeWave(1);
    }

    this.viewmodel.root.visible = true;
    this.keysHeld.clear();
    this.justPressed.clear();
    this.mouseLeftDown = false;
    this.mouseRightDown = false;
    this.resetTouchInputs();

    if (fromUserGesture && !this.isCoarsePointer()) {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      try {
        this.renderer.domElement.focus();
        this.renderer.domElement.requestPointerLock?.();
      } catch {
        // ignore in headless
      }
    }

    this.syncBodyState('playing');
    this.pushHud(true);
  }

  public pauseMission() {
    if (this.gameState !== 'playing') return;
    this.keysHeld.clear();
    this.mouseLeftDown = false;
    this.mouseRightDown = false;
    this.resetTouchInputs();
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    this.syncBodyState('paused');
    this.pushHud(true);
  }

  public resumeMission() {
    if (this.gameState !== 'paused') return;
    this.audio.unlock();
    this.keysHeld.clear();
    this.resetTouchInputs();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (!this.isCoarsePointer()) {
      try {
        this.renderer.domElement.focus();
        this.renderer.domElement.requestPointerLock?.();
      } catch {
        // ignore
      }
    }
    this.syncBodyState('playing');
    this.pushHud(true);
  }

  public returnToTitle() {
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    this.resetTouchInputs();
    this.viewmodel.root.visible = false;
    if (Math.abs(this.camera.fov - this.settings.fov) > 0.05) {
      this.camera.fov = this.settings.fov;
      this.camera.updateProjectionMatrix();
      this.viewmodelCamera.fov = this.settings.fov;
      this.viewmodelCamera.updateProjectionMatrix();
    }
    this.syncBodyState('title');
    this.pushHud(true);
  }

  public toggleMute() {
    this.audio.setMuted(!this.audio.isMuted());
    this.pushHud(true);
  }

  private isCoarsePointer(): boolean {
    try {
      return (
        window.matchMedia('(pointer: coarse)').matches ||
        (navigator.maxTouchPoints > 0 && window.innerWidth <= 1024)
      );
    } catch {
      return false;
    }
  }

  private resetTouchInputs() {
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.touchSprint = false;
    this.touchFireDown = false;
    this.touchFireJustPressed = false;
    this.touchAdsActive = false;
    this.touchLeanToggle = 0;
    this.touchJumpQueued = false;
    this.touchInteractHeld = false;
  }

  public setTouchMove(x: number, y: number, sprint: boolean) {
    this.touchMoveX = Math.max(-1, Math.min(1, x));
    this.touchMoveY = Math.max(-1, Math.min(1, y));
    this.touchSprint = sprint;
  }

  public addTouchLook(dx: number, dy: number) {
    if (this.gameState !== 'playing') return;
    const sens = 0.0042 * this.settings.sensitivity * (this.adsBlend > 0.5 ? 0.55 : 1.0);
    this.yaw -= dx * sens;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - dy * sens,
      -Math.PI / 2.15,
      Math.PI / 2.15,
    );
  }

  public setTouchFire(active: boolean) {
    if (active) {
      this.audio.unlock();
      if (!this.touchFireDown) {
        this.touchFireJustPressed = true;
      }
    }
    this.touchFireDown = active;
  }

  public toggleTouchAds() {
    this.audio.unlock();
    this.touchAdsActive = !this.touchAdsActive;
    this.pushHud(true);
  }

  public toggleTouchLean(dir: -1 | 1) {
    this.audio.unlock();
    this.touchLeanToggle = this.touchLeanToggle === dir ? 0 : dir;
  }

  public setTouchInteract(active: boolean) {
    this.audio.unlock();
    this.touchInteractHeld = active;
  }

  public triggerTouchAction(
    action: 'reload' | 'crouch' | 'jump' | 'flashlight' | 'grenade' | 'melee',
  ) {
    if (this.gameState !== 'playing') return;
    this.audio.unlock();
    if (action === 'reload') this.triggerReload();
    else if (action === 'crouch') this.crouch = !this.crouch;
    else if (action === 'jump') this.touchJumpQueued = true;
    else if (action === 'flashlight') {
      this.flashlightOn = !this.flashlightOn;
      this.audio.playReloadClick('in');
    } else if (action === 'grenade') this.throwGrenade();
    else if (action === 'melee') this.justPressed.add('KeyV');
  }

  public selectWeaponSlot(id: WeaponId) {
    if (this.gameState !== 'playing') return;
    this.audio.unlock();
    this.switchWeapon(id);
  }

  private clearDynamicEntities() {
    this.lightningSystem?.clear();

    this.debrisItems.forEach((d) => this.scene.remove(d.mesh));
    this.debrisItems = [];

    this.enemies.forEach((e) => {
      this.scene.remove(e.root);
      this.scene.remove(e.laserLine);
      if (e.isFlying) {
        this.scene.remove(e.contactShadow);
      }
      e.dispose();
    });
    this.enemies = [];
    this.enemyHitMeshes = [];

    this.grenades.forEach((g) => this.scene.remove(g.mesh));
    this.grenades = [];

    if (this.explosionLight) this.explosionLight.intensity = 0;
    for (const fx of this.explosionEffects) {
      fx.active = false;
      fx.sphere.visible = false;
      fx.ring.visible = false;
    }

    this.level.pickups.forEach((p) => this.scene.remove(p.group));
    this.level.pickups = [];
  }

  private restoreDestructibles() {
    for (const c of this.level.colliders) {
      if (c.maxHp !== undefined) {
        c.destructibleHp = c.maxHp;
        c.active = true;
      }
    }
    for (const d of this.level.destructibles) {
      d.destroyed = false;
      d.group.visible = true;
    }
  }

  private spawnEnemy(
    archetype: EnemyRig['archetype'],
    sector: number,
    x: number,
    y: number,
    z: number,
  ) {
    const diffCfg = DIFFICULTIES[this.difficulty];
    const id = `enemy-${sector}-${this.enemies.length + 1}-${Math.floor(Math.random() * 999)}`;
    const enemy = createEnemyRig(
      id,
      archetype,
      sector,
      x,
      y,
      z,
      diffCfg.enemyHpMult,
      this.mats,
      this.isSoftwareGl,
      this.currentLevelConfig.enemyCamo,
    );
    this.scene.add(enemy.root);
    this.scene.add(enemy.laserLine);
    if (enemy.isFlying) {
      this.scene.add(enemy.contactShadow);
    }
    this.enemies.push(enemy);
    enemy.hitboxes.forEach((hb) => this.enemyHitMeshes.push(hb.mesh));
  }

  private spawnSectorSquad(sectorNum: number) {
    if (sectorNum === 1) {
      // Sector 1 Courtyard: diverse tactical squad + aerial hunter drone
      this.spawnEnemy('flanker', 1, -4.5, 0, 19.5);
      this.spawnEnemy('rusher', 1, 5.2, 0, 17.5);
      this.spawnEnemy('breacher', 1, 0.5, 0, 14.5);
      this.spawnEnemy('marksman', 1, -9.8, 0, 15.5);
      this.spawnEnemy('drone', 1, 0, 0, 17.0);
    } else if (sectorNum === 2) {
      // Sector 2 Interior & Catwalks
      this.spawnEnemy('flanker', 2, -2.5, 0, 1.5);
      this.spawnEnemy('breacher', 2, 3.2, 0, -2.0);
      this.spawnEnemy('marksman', 2, -18.0, 2.4, -3.5);
      this.spawnEnemy('marksman', 2, 18.0, 2.4, -6.5);
      this.spawnEnemy('rusher', 2, 0, 0, -10.5);
      this.spawnEnemy('drone', 2, 0, 0, -3.5);
    } else if (sectorNum === 3) {
      // Sector 3 Boss Encounter + Drone Escort
      this.spawnEnemy('juggernaut', 3, 0, 0, -24.5);
      this.spawnEnemy('flanker', 3, -7.8, 0, -21.0);
      this.spawnEnemy('breacher', 3, 7.8, 0, -21.0);
      this.spawnEnemy('rusher', 3, -4.5, 0, -25.5);
      this.spawnEnemy('drone', 3, 3.5, 0, -23.5);
    }
  }

  private spawnSurgeWave(waveNum: number) {
    const count = Math.min(12, 4 + waveNum * 2);
    const spawnPoints: [number, number, number][] = [
      [-5, 0, 18],
      [6, 0, 17],
      [-15, 0, 14],
      [15, 0, 14],
      [-3, 0, 2],
      [4, 0, -2],
      [-18, 2.4, -3],
      [18, 2.4, -5],
      [0, 0, -12],
      [-7, 0, -22],
    ];
    for (let i = 0; i < count; i++) {
      const sp = spawnPoints[(i + waveNum * 2) % spawnPoints.length];
      const arch: EnemyRig['archetype'] =
        waveNum >= 3 && i === 0
          ? 'juggernaut'
          : i % 5 === 4
            ? 'drone'
            : i % 4 === 3
              ? 'rusher'
              : i % 3 === 1
                ? 'breacher'
                : i % 4 === 2
                  ? 'marksman'
                  : 'flanker';
      this.spawnEnemy(arch, 1, sp[0], sp[1], sp[2]);
    }
  }

  private spawnPickupDrop(
    x: number,
    y: number,
    z: number,
    type: PickupDrop['type'],
  ) {
    const grp = new THREE.Group();
    const accentColor =
      type === 'ammo'
        ? 0xf59e0b
        : type === 'armor'
          ? 0x38bdf8
          : type === 'medkit'
            ? 0x10b981
            : 0xf43f5e;

    // Grounded contact shadow disc flush on floor
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 14),
      this.mats.contactShadowMat,
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    this.pickupGeos.push(shadow.geometry);

    // Molded tactical Pelican supply case sitting flush on floor (y = 0 .. 0.22)
    const baseGeo = new THREE.BoxGeometry(0.46, 0.16, 0.34);
    const lidGeo = new THREE.BoxGeometry(0.48, 0.06, 0.36);
    const latchGeo = new THREE.BoxGeometry(0.05, 0.08, 0.03);
    const handleGeo = new THREE.BoxGeometry(0.16, 0.03, 0.04);
    const stripGeo = new THREE.BoxGeometry(0.28, 0.018, 0.08);

    const accentMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 0.7,
      roughness: 0.28,
      metalness: 0.2,
    });
    this.pickupGeos.push(baseGeo, lidGeo, latchGeo, handleGeo, stripGeo);
    this.pickupMats.push(accentMat);

    const caseBase = new THREE.Mesh(baseGeo, this.mats.polymerBlack);
    caseBase.position.y = 0.08;
    const caseLid = new THREE.Mesh(lidGeo, this.mats.steelDark);
    caseLid.position.y = 0.19;
    const latchL = new THREE.Mesh(latchGeo, this.mats.steelGrate);
    latchL.position.set(-0.14, 0.16, 0.18);
    const latchR = new THREE.Mesh(latchGeo, this.mats.steelGrate);
    latchR.position.set(0.14, 0.16, 0.18);
    const handle = new THREE.Mesh(handleGeo, this.mats.polymerGrip);
    handle.position.set(0, 0.09, 0.19);
    const indicator = new THREE.Mesh(stripGeo, accentMat);
    indicator.position.set(0, 0.225, 0);

    grp.add(shadow, caseBase, caseLid, latchL, latchR, handle, indicator);
    grp.rotation.y = Math.random() * Math.PI * 2;
    grp.position.set(x, y, z);
    this.scene.add(grp);

    this.level.pickups.push({
      id: `pk-${Date.now()}-${Math.random()}`,
      type,
      group: grp,
      position: new THREE.Vector3(x, y, z),
      collected: false,
      bobPhase: Math.random() * Math.PI * 2,
    });
  }

  private switchWeapon(next: WeaponId) {
    if (this.activeWeapon === next || this.swapTimer > 0) return;
    this.activeWeapon = next;
    this.reloading = false;
    this.reloadTimer = 0;
    this.swapTimer = 0.18;
    this.audio.playReloadClick('out');
    this.pushHud(true);
  }

  private triggerReload() {
    if (this.reloading || this.swapTimer > 0) return;
    const spec = WEAPONS[this.activeWeapon];
    const st = this.weaponStates[this.activeWeapon];
    if (st.mag >= spec.magSize || st.reserve <= 0) return;
    this.reloading = true;
    this.reloadTimer = spec.reloadTime;
    this.reloadStagesFired = { out: false, in: false, rack: false };
    this.audio.playReloadClick('out');
    this.reloadStagesFired.out = true;
  }

  private throwGrenade() {
    if (this.grenadeCount <= 0) return;
    this.grenadeCount--;
    const mesh = new THREE.Mesh(this.grenadeGeo, this.grenadeMat);
    this.camera.getWorldPosition(_v1);
    this.camera.getWorldDirection(_v2);
    mesh.position.copy(_v1).addScaledVector(_v2, 0.6);
    this.scene.add(mesh);

    this.grenades.push({
      active: true,
      x: mesh.position.x,
      y: mesh.position.y,
      z: mesh.position.z,
      vx: _v2.x * 16 + this.playerVel.x * 0.4,
      vy: _v2.y * 16 + 4.2,
      vz: _v2.z * 16 + this.playerVel.z * 0.4,
      fuse: 1.55,
      mesh,
    });
    this.audio.playReloadClick('rack');
  }

  private pushDebrisItem(mesh: THREE.Object3D, state: DebrisPhysicsState, isWeapon: boolean) {
    if (this.debrisItems.length >= this.maxDebrisItems) {
      const idx = this.debrisItems.findIndex((d) => !d.isWeapon);
      const removeIdx = idx >= 0 ? idx : 0;
      const [removed] = this.debrisItems.splice(removeIdx, 1);
      if (removed) {
        this.scene.remove(removed.mesh);
      }
    }
    this.scene.add(mesh);
    this.debrisItems.push({ mesh, state, isWeapon });
  }

  private spawnWeaponDropDebris(
    enemy: EnemyRig,
    dirX: number,
    dirY: number,
    dirZ: number,
    force: number,
  ) {
    if (enemy.isFlying || !enemy.wpnGrp.parent) return;
    enemy.root.updateMatrixWorld(true);
    this.scene.attach(enemy.wpnGrp);
    const pos = enemy.wpnGrp.position;
    _euler.setFromQuaternion(enemy.wpnGrp.quaternion, 'YXZ');

    const kick = Math.max(2.0, force * 0.42);
    this.pushDebrisItem(
      enemy.wpnGrp,
      {
        x: pos.x,
        y: Math.max(0.12, pos.y),
        z: pos.z,
        vx: dirX * kick + (Math.random() - 0.5) * 2.4,
        vy: 1.9 + Math.max(0, dirY) * 1.4 + Math.random() * 1.1,
        vz: dirZ * kick + (Math.random() - 0.5) * 2.4,
        rx: _euler.x,
        ry: _euler.y,
        rz: _euler.z,
        avx: (Math.random() - 0.5) * 14,
        avy: (Math.random() - 0.5) * 10,
        avz: (Math.random() - 0.5) * 14,
        radius: 0.2,
        settled: false,
      },
      true,
    );
  }

  private spawnDestructibleDebris(cx: number, cy: number, cz: number, isExplosive: boolean) {
    const count = isExplosive ? 8 : 7;
    for (let i = 0; i < count; i++) {
      const geo = isExplosive ? this.shardGeo : this.woodPlankGeo;
      const mat = isExplosive
        ? i % 2 === 0
          ? this.charredShardMat
          : this.mats.hazardDrum
        : this.mats.woodCrate;
      const chunk = new THREE.Mesh(geo, mat);
      chunk.castShadow = !this.isSoftwareGl;
      const ang = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const spd = (isExplosive ? 6.8 : 4.2) + Math.random() * 3.8;
      const sx = cx + Math.cos(ang) * 0.28;
      const sy = cy + (Math.random() - 0.3) * 0.4;
      const sz = cz + Math.sin(ang) * 0.28;
      chunk.position.set(sx, sy, sz);
      chunk.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);

      this.pushDebrisItem(
        chunk,
        {
          x: sx,
          y: sy,
          z: sz,
          vx: Math.cos(ang) * spd,
          vy: (isExplosive ? 5.2 : 3.1) + Math.random() * 3.2,
          vz: Math.sin(ang) * spd,
          rx: chunk.rotation.x,
          ry: chunk.rotation.y,
          rz: chunk.rotation.z,
          avx: (Math.random() - 0.5) * 16,
          avy: (Math.random() - 0.5) * 14,
          avz: (Math.random() - 0.5) * 16,
          radius: 0.14,
          settled: false,
        },
        false,
      );
    }
  }

  private getWeaponImpulse(weaponId: WeaponId): number {
    switch (weaponId) {
      case 'sniper':
        return 12.0;
      case 'shotgun':
        return 11.2;
      case 'ak':
        return 7.4;
      case 'lmg':
        return 6.8;
      case 'carbine':
        return 5.8;
      default:
        return 4.6;
    }
  }

  private detonateExplosion(x: number, y: number, z: number, radius: number, maxDmg: number) {
    this.audio.playExplosion();
    this.spawnParticles(x, y + 0.3, z, 0, 1, 0, 26, 0xff7b29, 9.5, 1.8);
    this.spawnParticles(x, y + 0.3, z, 0, 1, 0, 14, 0xfef08a, 7.0, 1.3);

    const slot =
      this.explosionEffects.find((e) => !e.active) ?? this.explosionEffects[0];
    if (slot) {
      slot.active = true;
      slot.elapsed = 0;
      slot.duration = 0.44;
      slot.maxRadius = Math.max(2.8, radius * 0.72);
      slot.sphere.position.set(x, y + 0.25, z);
      slot.sphere.scale.setScalar(0.35);
      slot.sphere.visible = true;
      slot.ring.position.set(x, y + 0.08, z);
      slot.ring.scale.setScalar(0.45);
      slot.ring.visible = true;
      this.explosionLight.position.set(x, y + 1.1, z);
      this.explosionLight.intensity = 24;
    }

    const distToPlayer = Math.hypot(
      this.playerPos.x - x,
      this.playerPos.y + 1.0 - y,
      this.playerPos.z - z,
    );
    if (distToPlayer < radius * 1.5) {
      this.trauma = Math.min(1, this.trauma + (1 - distToPlayer / (radius * 1.5)) * 0.85);
    }
    if (distToPlayer < radius) {
      const dmg = Math.round(maxDmg * 0.55 * (1 - distToPlayer / radius));
      this.damagePlayer(dmg, x, z);
    }

    for (const enemy of this.enemies) {
      const ey = enemy.ragdoll ? enemy.ragdoll.y : enemy.root.position.y + 0.9;
      const ex = enemy.ragdoll ? enemy.ragdoll.x : enemy.root.position.x;
      const ez = enemy.ragdoll ? enemy.ragdoll.z : enemy.root.position.z;
      const dx = ex - x;
      const dy = ey - y;
      const dz = ez - z;
      const d = Math.hypot(dx, dy, dz);
      if (d < radius) {
        const inv = 1 / Math.max(0.25, d);
        const rx = dx * inv;
        const ry = Math.max(0.35, dy * inv + 0.45);
        const rz = dz * inv;
        const expForce = (1 - d / radius) * 14.5 + 4.5;

        if (enemy.alive) {
          const dmg = Math.round(maxDmg * (1 - (d / radius) * 0.65));
          this.damageEnemy(enemy, dmg, 'torso', ex, ey, ez, rx, ry, rz, expForce, true);
        } else if (!enemy.isFlying && enemy.ragdoll) {
          applyRagdollImpulse(enemy.ragdoll, {
            hitZone: 'torso',
            dirX: rx,
            dirY: ry,
            dirZ: rz,
            force: expForce,
            isExplosion: true,
          });
        } else if (enemy.isFlying) {
          enemy.koSettled = false;
          enemy.velocity.set(
            rx * expForce * 0.65,
            Math.max(3.6, ry * expForce * 0.72),
            rz * expForce * 0.65,
          );
          enemy.crashAngVel.set(
            (Math.random() - 0.5) * 14,
            (Math.random() - 0.5) * 12,
            (Math.random() - 0.5) * 14,
          );
        }
      }
    }

    // Blast nearby physical debris
    for (const deb of this.debrisItems) {
      const dx = deb.state.x - x;
      const dy = deb.state.y - y;
      const dz = deb.state.z - z;
      const d = Math.hypot(dx, dy, dz);
      if (d < radius) {
        const inv = 1 / Math.max(0.25, d);
        const spd = (1 - d / radius) * 11 + 3;
        deb.state.settled = false;
        deb.state.vx += dx * inv * spd;
        deb.state.vy += Math.max(2.8, (dy * inv + 0.55) * spd * 0.65);
        deb.state.vz += dz * inv * spd;
        deb.state.avx += (Math.random() - 0.5) * 16;
        deb.state.avz += (Math.random() - 0.5) * 16;
      }
    }

    // Chain-reaction nearby destructibles
    for (const prop of this.level.destructibles) {
      if (prop.destroyed) continue;
      const d = prop.position.distanceTo(_v3.set(x, y, z));
      if (d < radius * 0.75) {
        const col = this.level.colliders.find((c) => c.id === prop.colliderId);
        if (col && col.destructibleHp !== undefined) {
          this.damageDestructible(col, 999, x, y, z);
        }
      }
    }
  }

  private damageDestructible(
    box: LevelData['colliders'][number],
    dmg: number,
    hx: number,
    hy: number,
    hz: number,
  ) {
    if (box.destructibleHp === undefined || !box.active) return;
    box.destructibleHp -= dmg;
    if (box.destructibleHp <= 0) {
      box.active = false;
      const prop = this.level.destructibles.find((d) => d.colliderId === box.id);
      if (prop && !prop.destroyed) {
        prop.destroyed = true;
        prop.group.visible = false;
        this.spawnDestructibleDebris(
          prop.position.x,
          prop.position.y,
          prop.position.z,
          prop.isExplosive,
        );
        if (prop.isExplosive) {
          this.detonateExplosion(prop.position.x, prop.position.y, prop.position.z, 6.8, 175);
          this.hitstopTimer = Math.max(this.hitstopTimer, 0.045);
        } else {
          this.audio.playImpact('wood');
          this.spawnParticles(hx, hy, hz, 0, 1, 0, 14, 0x8b6743, 5.2, 1.2);
          const dropType: PickupDrop['type'] =
            Math.random() < 0.45 ? 'ammo' : Math.random() < 0.75 ? 'armor' : 'medkit';
          this.spawnPickupDrop(prop.position.x, box.minY, prop.position.z, dropType);
        }
      }
    }
  }

  private fireActiveWeapon() {
    const spec = WEAPONS[this.activeWeapon];
    const st = this.weaponStates[this.activeWeapon];
    if (st.mag <= 0) {
      this.triggerReload();
      return;
    }

    st.mag--;
    this.fireTimer = 60 / spec.rpm;
    this.shotsFired++;
    this.viewmodel.triggerFire();
    this.muzzleLightIntensity =
      this.activeWeapon === 'shotgun' || this.activeWeapon === 'sniper' ? 9.0 : 5.5;
    this.muzzlePointLight.intensity = this.muzzleLightIntensity;
    this.audio.playGunshot(this.activeWeapon, false, 1);
    this.spawnCasing();

    // Recoil kick & camera trauma
    const kickAmt =
      this.activeWeapon === 'shotgun' || this.activeWeapon === 'sniper' ? 0.92 : 0.42;
    this.recoilKick = Math.min(1.0, this.recoilKick + kickAmt);
    const adsScale = 1 - this.adsBlend * 0.35;
    this.recoilPitchOffset += spec.recoilPitch * adsScale;
    this.recoilYawOffset += (Math.random() - 0.5) * 2 * spec.recoilYaw * adsScale;
    this.trauma = Math.min(
      1,
      this.trauma + (this.activeWeapon === 'shotgun' || this.activeWeapon === 'sniper' ? 0.36 : 0.14),
    );

    const spread = THREE.MathUtils.lerp(spec.spreadHip, spec.spreadAds, this.adsBlend) *
      (this.crouch ? 0.72 : 1.0);

    this.camera.updateMatrixWorld(true);
    this.viewmodelCamera.updateMatrixWorld(true);
    this.camera.getWorldPosition(_v1);
    this.camera.getWorldDirection(_v2);
    this.viewmodel.muzzlePoint.getWorldPosition(_v3);

    let landedHitOnEnemy = false;
    let landedHeadshot = false;

    for (let p = 0; p < spec.pellets; p++) {
      const dx = _v2.x + (Math.random() - 0.5) * 2 * spread;
      const dy = _v2.y + (Math.random() - 0.5) * 2 * spread;
      const dz = _v2.z + (Math.random() - 0.5) * 2 * spread;
      const len = Math.hypot(dx, dy, dz) || 1;
      const ndx = dx / len;
      const ndy = dy / len;
      const ndz = dz / len;

      // 1. Raycast against solid world colliders first (guarantees cover blocks shots!)
      const worldHit = raycastWorldColliders(
        _v1.x,
        _v1.y,
        _v1.z,
        ndx,
        ndy,
        ndz,
        spec.range,
        this.level.colliders,
      );
      const maxRayDist = worldHit ? worldHit.distance : spec.range;

      // 2. Raycast against enemy hitboxes up to maxRayDist
      this.raycaster.set(_v1, new THREE.Vector3(ndx, ndy, ndz));
      this.raycaster.far = maxRayDist;
      const enemyHits = this.raycaster.intersectObjects(this.enemyHitMeshes, false);

      let hitEnemy = false;
      const weaponImpulse = this.getWeaponImpulse(this.activeWeapon);
      for (const eh of enemyHits) {
        let matchedEnemy: EnemyRig | null = null;
        let matchedZone: EnemyHitbox['zone'] = 'torso';
        for (const en of this.enemies) {
          const hb = en.hitboxes.find((h) => h.mesh === eh.object);
          if (hb) {
            matchedEnemy = en;
            matchedZone = hb.zone;
            break;
          }
        }
        if (matchedEnemy) {
          if (matchedEnemy.alive) {
            const dmg = calculateBallisticDamage(
              spec.damage,
              matchedZone,
              eh.distance,
              spec.range,
            );
            this.damageEnemy(
              matchedEnemy,
              dmg,
              matchedZone,
              eh.point.x,
              eh.point.y,
              eh.point.z,
              ndx,
              ndy,
              ndz,
              weaponImpulse,
              false,
            );
            this.spawnTracer(_v3.x, _v3.y, _v3.z, eh.point.x, eh.point.y, eh.point.z);
            landedHitOnEnemy = true;
            if (matchedZone === 'head') landedHeadshot = true;
            hitEnemy = true;
            break;
          } else if (!matchedEnemy.isFlying && matchedEnemy.ragdoll) {
            // Post-mortem ballistic ragdoll twitch & blood reaction
            applyRagdollImpulse(matchedEnemy.ragdoll, {
              hitZone: matchedZone,
              dirX: ndx,
              dirY: ndy,
              dirZ: ndz,
              force: weaponImpulse * 0.85,
              isExplosion: false,
            });
            this.spawnParticles(
              eh.point.x,
              eh.point.y,
              eh.point.z,
              -ndx,
              0.4,
              -ndz,
              5,
              0x991b1b,
              3.5,
              0.7,
            );
            this.spawnTracer(_v3.x, _v3.y, _v3.z, eh.point.x, eh.point.y, eh.point.z);
            hitEnemy = true;
            break;
          }
        }
      }

      if (!hitEnemy && worldHit) {
        const hx = _v1.x + ndx * worldHit.distance;
        const hy = _v1.y + ndy * worldHit.distance;
        const hz = _v1.z + ndz * worldHit.distance;
        this.spawnTracer(_v3.x, _v3.y, _v3.z, hx, hy, hz);
        const surf = worldHit.box.surface;
        const sparkColor =
          surf === 'metal' ? 0xfbbf24 : surf === 'wood' ? 0xa37b51 : 0x9ca3af;
        this.spawnParticles(
          hx,
          hy,
          hz,
          worldHit.nx,
          worldHit.ny,
          worldHit.nz,
          surf === 'metal' ? 8 : 5,
          sparkColor,
          surf === 'metal' ? 6.5 : 3.5,
          0.9,
        );
        this.audio.playImpact(surf);
        this.damageDestructible(worldHit.box, spec.damage, hx, hy, hz);
      } else if (!hitEnemy) {
        this.spawnTracer(
          _v3.x,
          _v3.y,
          _v3.z,
          _v1.x + ndx * spec.range,
          _v1.y + ndy * spec.range,
          _v1.z + ndz * spec.range,
        );
      }
    }

    if (landedHitOnEnemy) {
      this.shotsHit++;
      this.hitMarkerTimer = 0.14;
      this.headshotMarker = landedHeadshot;
      this.audio.playHitMarker(landedHeadshot);
    }

    if (st.mag === 0 && st.reserve > 0) {
      this.triggerReload();
    }
  }

  private damageEnemy(
    enemy: EnemyRig,
    dmg: number,
    zone: EnemyHitbox['zone'],
    hx: number,
    hy: number,
    hz: number,
    dirX: number = 0,
    dirY: number = 0.25,
    dirZ: number = 0,
    force: number = 6.0,
    isExplosion: boolean = false,
  ) {
    if (!enemy.alive) return;
    enemy.hp -= dmg;
    enemy.hitFlashTimer = 0.06;
    enemy.flinchTimer = 0.18;

    this.spawnParticles(
      hx || enemy.root.position.x,
      hy || enemy.root.position.y + 1.2,
      hz || enemy.root.position.z,
      -dirX * 0.4,
      0.55,
      -dirZ * 0.4,
      zone === 'head' ? 12 : 7,
      zone === 'head' ? 0xef4444 : 0xb91c1c,
      4.5,
      0.85,
    );

    if (enemy.hp <= 0) {
      enemy.hp = 0;
      enemy.alive = false;
      enemy.aiState = 'ko';
      enemy.koTimer = enemy.isFlying ? 2.6 : 0;
      enemy.koSettled = false;
      enemy.laserMat.opacity = 0;
      enemy.visorMat.emissiveIntensity = 0.05;
      this.kills++;
      this.killStreak++;
      if (zone === 'head') this.headshots++;
      this.score += enemy.archetype === 'juggernaut' ? 600 : zone === 'head' ? 250 : 150;
      this.hitstopTimer = Math.max(
        this.hitstopTimer,
        enemy.archetype === 'juggernaut' ? 0.065 : 0.032,
      );

      if (enemy.isFlying) {
        enemy.velocity.set(
          dirX * force * 0.48 + (Math.random() - 0.5) * 3.8,
          1.4 + Math.random() * 1.1,
          dirZ * force * 0.48 + (Math.random() - 0.5) * 3.8,
        );
        enemy.crashAngVel.set(
          (Math.random() > 0.5 ? 1 : -1) * (3.2 + Math.random() * 3.2),
          (Math.random() - 0.5) * 5.0,
          enemy.koFallDir * (4.6 + Math.random() * 3.2),
        );
        this.spawnParticles(
          enemy.root.position.x,
          enemy.root.position.y,
          enemy.root.position.z,
          0,
          1,
          0,
          18,
          0xff7b29,
          7.0,
          1.2,
        );
        this.audio.playImpact('metal');
      } else {
        // Transition into full 6-DOF articulated ragdoll + physical dropped weapon
        const supportY = getSurfaceHeightAt(
          enemy.root.position.x,
          enemy.root.position.z,
          this.level.colliders,
          this.level.ramps,
          enemy.root.position.y + 0.5,
          0.35,
        );
        this.spawnWeaponDropDebris(enemy, dirX, dirY, dirZ, force);
        enemy.ragdoll = createRagdollState(
          enemy.root.position.x,
          enemy.root.position.y,
          enemy.root.position.z,
          enemy.yaw,
          enemy.scale,
          {
            hitZone: zone,
            dirX,
            dirY,
            dirZ,
            force,
            isExplosion,
          },
        );
        enemy.root.rotation.set(0, 0, 0);
        enemy.pelvis.position.set(0, enemy.ragdoll.y, 0);
        enemy.pelvis.rotation.set(
          enemy.ragdoll.pelvisPitch,
          enemy.ragdoll.yaw + enemy.ragdoll.pelvisYaw,
          enemy.ragdoll.pelvisRoll,
          'YXZ',
        );
        enemy.contactShadow.position.set(0, supportY + 0.015, 0);
      }

      // Generous tactical supply drops always grounded cleanly on surface underneath
      if (Math.random() < 0.72) {
        const dropType: PickupDrop['type'] =
          this.hp < 75 ? 'medkit' : this.armor < 70 ? 'armor' : 'ammo';
        const dropY = getSurfaceHeightAt(
          enemy.root.position.x,
          enemy.root.position.z,
          this.level.colliders,
          this.level.ramps,
          enemy.root.position.y + 0.5,
          0.3,
        );
        this.spawnPickupDrop(
          enemy.root.position.x,
          dropY,
          enemy.root.position.z,
          dropType,
        );
      }
    }
  }

  private damagePlayer(rawDmg: number, srcX: number, srcZ: number) {
    if (this.gameState !== 'playing' || this.outcome !== null) return;
    this.timeSinceDamage = 0;
    const res = applyDamageToPlayer(this.hp, this.armor, rawDmg);
    this.hp = res.hp;
    this.armor = res.armor;
    this.damageFlash = Math.min(1, this.damageFlash + 0.55);
    this.trauma = Math.min(1, this.trauma + 0.32);
    this.audio.playPlayerHurt();

    // Compute screen-relative directional hit indicator relative to player facing yaw
    this.damageDirAngle = computeDamageIndicatorAngle(
      this.playerPos.x,
      this.playerPos.z,
      this.yaw,
      srcX,
      srcZ,
    );

    if (this.hp <= 0) {
      this.hp = 0;
      this.outcome = 'defeat';
      this.defeatBeatTimer = 0.75;
      this.defeatCamVelY = 1.2;
      this.audio.playOutcomeSting(false);
    }
  }

  private updatePlayer(dt: number) {
    // One-shot input actions
    if (this.justPressed.has('KeyR')) this.triggerReload();
    if (this.justPressed.has('KeyF')) {
      this.flashlightOn = !this.flashlightOn;
      this.audio.playReloadClick('in');
    }
    if (this.justPressed.has('KeyG')) this.throwGrenade();
    if (this.justPressed.has('Digit1')) this.switchWeapon(WEAPON_ORDER[0]);
    if (this.justPressed.has('Digit2')) this.switchWeapon(WEAPON_ORDER[1]);
    if (this.justPressed.has('Digit3')) this.switchWeapon(WEAPON_ORDER[2]);
    if (this.justPressed.has('Digit4')) this.switchWeapon(WEAPON_ORDER[3]);
    if (this.justPressed.has('Digit5')) this.switchWeapon(WEAPON_ORDER[4]);
    if (this.justPressed.has('Digit6')) this.switchWeapon(WEAPON_ORDER[5]);
    if (this.justPressed.has('Digit7')) this.switchWeapon(WEAPON_ORDER[6]);
    if (this.justPressed.has('KeyC') || this.justPressed.has('ControlLeft')) {
      this.crouch = !this.crouch;
    }
    if (this.justPressed.has('KeyV') && this.meleeTimer <= 0) {
      this.meleeTimer = 0.28;
      this.audio.playImpact('wood');
      // Check close melee hit
      this.camera.getWorldPosition(_v1);
      this.camera.getWorldDirection(_v2);
      for (const en of this.enemies) {
        if (!en.alive) continue;
        const dist = en.root.position.distanceTo(this.playerPos);
        if (dist < 2.2) {
          this.damageEnemy(
            en,
            55,
            'torso',
            en.root.position.x,
            en.root.position.y + 1.2,
            en.root.position.z,
            _v2.x,
            0.35,
            _v2.z,
            9.5,
            false,
          );
          this.hitMarkerTimer = 0.14;
          break;
        }
      }
    }

    // Lean target (Q = Left -1, E = Right +1, combined with touch lean toggle)
    const kbLean = (this.keysHeld.has('KeyE') ? 1 : 0) - (this.keysHeld.has('KeyQ') ? 1 : 0);
    this.leanTarget = kbLean !== 0 ? kbLean : this.touchLeanToggle;
    this.leanValue = THREE.MathUtils.damp(this.leanValue, this.leanTarget, 14, dt);

    // ADS blend
    const wantAds = this.mouseRightDown || this.keysHeld.has('KeyB') || this.touchAdsActive;
    this.adsBlend = THREE.MathUtils.damp(this.adsBlend, wantAds ? 1 : 0, 22, dt);

    // Movement Input (Keyboard + Mobile Virtual Joystick)
    const kbFwd =
      (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp') ? 1 : 0) -
      (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown') ? 1 : 0);
    const kbStrafe =
      (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight') ? 1 : 0) -
      (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft') ? 1 : 0);
    const fwdInput = Math.abs(kbFwd) > 0 ? kbFwd : this.touchMoveY;
    const strafeInput = Math.abs(kbStrafe) > 0 ? kbStrafe : this.touchMoveX;

    const isMoving = Math.abs(fwdInput) > 0.01 || Math.abs(strafeInput) > 0.01;
    const sprintIntent =
      (this.keysHeld.has('ShiftLeft') || this.keysHeld.has('ShiftRight') || this.touchSprint) &&
      fwdInput > 0.2 &&
      !this.crouch &&
      !wantAds;
    const staminaState = resolveInfiniteStamina(sprintIntent);
    this.stamina = staminaState.stamina;
    const wantSprint = staminaState.canSprint;

    const moveSpeed = this.crouch
      ? 2.85
      : wantAds
        ? 3.1
        : wantSprint
          ? 7.2
          : 5.0;

    // Facing -sin(yaw), -cos(yaw)
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const wishX = -sinY * fwdInput + cosY * strafeInput;
    const wishZ = -cosY * fwdInput - sinY * strafeInput;
    const wishLen = Math.hypot(wishX, wishZ);
    const nx = wishLen > 1 ? wishX / wishLen : wishX;
    const nz = wishLen > 1 ? wishZ / wishLen : wishZ;

    const accel = this.grounded ? 18 : 6;
    this.playerVel.x = THREE.MathUtils.damp(this.playerVel.x, nx * moveSpeed, accel, dt);
    this.playerVel.z = THREE.MathUtils.damp(this.playerVel.z, nz * moveSpeed, accel, dt);

    // Jump
    const wantsJump = this.justPressed.has('Space') || this.touchJumpQueued;
    this.touchJumpQueued = false;
    if (wantsJump && this.grounded) {
      // Only jump if not holding Space to interact with terminal/extraction
      const nearTerminal =
        this.gameMode === 'blackout' &&
        this.sector === 2 &&
        !this.terminalDecrypted &&
        this.playerPos.distanceTo(this.level.terminalPos) < 3.4;
      if (!nearTerminal) {
        this.playerVel.y = 5.4;
        this.grounded = false;
        this.crouch = false;
      }
    }

    // Gravity
    this.playerVel.y -= 16.5 * dt;

    // Proposed next position + Swept Collision Solver
    const nextX = this.playerPos.x + this.playerVel.x * dt;
    const nextY = this.playerPos.y + this.playerVel.y * dt;
    const nextZ = this.playerPos.z + this.playerVel.z * dt;
    const playerH = this.crouch ? PLAYER_HEIGHT_CROUCH : PLAYER_HEIGHT_STANDING;

    const snapDownMax = this.grounded && this.playerVel.y <= 0.1 ? 0.22 : 0.05;
    const resolved = resolvePlayerCollision(
      nextX,
      nextY,
      nextZ,
      PLAYER_RADIUS,
      playerH,
      this.level.colliders,
      this.level.ramps,
      snapDownMax,
    );

    const movedHoriz = Math.hypot(
      resolved.x - this.playerPos.x,
      resolved.z - this.playerPos.z,
    );
    this.playerPos.set(resolved.x, resolved.y, resolved.z);
    if (resolved.grounded && this.playerVel.y < 0) {
      this.playerVel.y = 0;
    }
    this.grounded = resolved.grounded;

    // Walk distance & biome-synced footsteps
    if (this.grounded && movedHoriz > 0.001) {
      this.walkDist += movedHoriz;
      this.stepDistAccum += movedHoriz;
      const stepStride = this.crouch ? 1.55 : wantSprint ? 1.95 : 1.75;
      if (this.stepDistAccum >= stepStride) {
        this.stepDistAccum = 0;
        const b = this.currentLevelConfig.biome;
        const surf: SurfaceType =
          this.playerPos.y > 0.4
            ? 'metal'
            : b === 'arctic' || b === 'bunker'
              ? 'snow'
              : b === 'desert' || b === 'mediterranean'
                ? 'sand'
                : this.playerPos.z < 10
                  ? 'concrete'
                  : 'asphalt';
        this.audio.playFootstep(surf, this.crouch);
      }
    }

    // Out-of-combat passive health regeneration for smooth accessible pacing
    this.timeSinceDamage += dt;
    if (this.timeSinceDamage > 3.5 && this.hp < this.maxHp && this.outcome === null) {
      this.hp = Math.min(this.maxHp, this.hp + 15 * dt);
    }

    // Eye height + Lean wall-safe camera positioning + 3D anti-clipping sphere pushout
    const targetEye = this.crouch ? PLAYER_EYE_CROUCH : PLAYER_EYE_STANDING;
    this.currentEyeHeight = THREE.MathUtils.damp(this.currentEyeHeight, targetEye, 14, dt);

    const leanRes = computeLeanOffset(
      this.playerPos.x,
      this.playerPos.y + this.currentEyeHeight,
      this.playerPos.z,
      this.yaw,
      this.leanValue,
      this.level.colliders,
    );

    // Recoil recovery & Trauma Camera Shake
    this.recoilKick = THREE.MathUtils.damp(this.recoilKick, 0, 16, dt);
    this.recoilPitchOffset = THREE.MathUtils.damp(this.recoilPitchOffset, 0, 12, dt);
    this.recoilYawOffset = THREE.MathUtils.damp(this.recoilYawOffset, 0, 12, dt);
    this.trauma = Math.max(0, this.trauma - 1.9 * dt);
    const shake = this.trauma * this.trauma;
    const shakeX = (Math.random() - 0.5) * 0.045 * shake;
    const shakeY = (Math.random() - 0.5) * 0.045 * shake;

    // Subtle body-cam gait bob
    const horizSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
    const speedRatio = Math.min(1, horizSpeed / 6.5);
    const camBobY = Math.sin(this.walkDist * 2.2) * 0.022 * speedRatio * (1 - this.adsBlend * 0.7);
    const camBobRoll = Math.cos(this.walkDist * 1.1) * 0.008 * speedRatio;

    const safeCam = resolveCameraCollision(
      this.playerPos.x + leanRes.offsetX,
      this.playerPos.y + this.currentEyeHeight + camBobY,
      this.playerPos.z + leanRes.offsetZ,
      0.26,
      this.level.colliders,
      this.level.ramps,
      this.playerPos.y,
    );

    this.camera.position.set(safeCam.x, safeCam.y, safeCam.z);
    this.camera.rotation.set(
      this.pitch + this.recoilPitchOffset + shakeX,
      this.yaw + this.recoilYawOffset + shakeY,
      leanRes.rollRad + camBobRoll,
      'YXZ',
    );
    this.viewmodelCamera.position.copy(this.camera.position);
    this.viewmodelCamera.rotation.copy(this.camera.rotation);

    // Dynamic FOV punch (Sprint widen / Weapon-specific ADS optical zoom) synced to viewmodel overlay camera
    const activeSpec = WEAPONS[this.activeWeapon];
    const targetFov =
      this.settings.fov -
      this.adsBlend * activeSpec.adsFovDrop +
      (wantSprint && isMoving ? 5 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 14, dt);
      this.camera.updateProjectionMatrix();
      this.viewmodelCamera.fov = this.camera.fov;
      this.viewmodelCamera.updateProjectionMatrix();
    }

    // Forward CQB obstacle check for realistic rifle wall-compression pullback
    this.camera.getWorldDirection(_v2);
    const wallAhead = raycastWorldColliders(
      safeCam.x,
      safeCam.y,
      safeCam.z,
      _v2.x,
      _v2.y,
      _v2.z,
      0.9,
      this.level.colliders,
    );
    const targetWallPull = wallAhead
      ? THREE.MathUtils.clamp((0.9 - wallAhead.distance) / 0.55, 0, 1)
      : 0;
    this.weaponWallPull = THREE.MathUtils.damp(this.weaponWallPull, targetWallPull, 16, dt);

    // Weapon Timers & Firing
    if (this.fireTimer > 0) this.fireTimer -= dt;
    if (this.swapTimer > 0) this.swapTimer = Math.max(0, this.swapTimer - dt);
    if (this.meleeTimer > 0) this.meleeTimer = Math.max(0, this.meleeTimer - dt);

    if (this.reloading) {
      this.reloadTimer -= dt;
      const spec = WEAPONS[this.activeWeapon];
      const prog = 1 - Math.max(0, this.reloadTimer) / spec.reloadTime;
      if (prog > 0.45 && !this.reloadStagesFired.in) {
        this.audio.playReloadClick('in');
        this.reloadStagesFired.in = true;
      }
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        const st = this.weaponStates[this.activeWeapon];
        const needed = spec.magSize - st.mag;
        const taken = Math.min(needed, st.reserve);
        st.mag += taken;
        st.reserve -= taken;
        this.audio.playReloadClick('rack');
      }
    }

    const spec = WEAPONS[this.activeWeapon];
    const wantsFire = spec.auto
      ? this.mouseLeftDown || this.touchFireDown
      : this.mouseLeftJustPressed || this.touchFireJustPressed;
    if (
      wantsFire &&
      this.fireTimer <= 0 &&
      !this.reloading &&
      this.swapTimer <= 0 &&
      this.meleeTimer <= 0
    ) {
      this.fireActiveWeapon();
    }

    // Update Viewmodel Rig
    const reloadRatio = this.reloading
      ? 1 - Math.max(0, this.reloadTimer) / spec.reloadTime
      : 0;
    this.viewmodel.update(dt, {
      weaponId: this.activeWeapon,
      ads: this.adsBlend,
      walkDist: this.walkDist,
      moveSpeedRatio: speedRatio,
      sprintRatio: wantSprint && isMoving ? 1 : 0,
      recoilKick: this.recoilKick,
      recoilRot: this.recoilKick * 0.14,
      reloadRatio,
      meleeRatio: this.meleeTimer > 0 ? 1 - this.meleeTimer / 0.28 : 0,
      swapDrop: this.swapTimer > 0 ? Math.sin((this.swapTimer / 0.18) * Math.PI) : 0,
      wallPull: this.weaponWallPull,
      flashlightOn: this.flashlightOn,
    });
    this.viewmodel.flashCone.visible = this.flashlightOn && this.viewmodel.root.visible;

    // Check grounded supply pickups (no floating/hovering boxes)
    for (const pk of this.level.pickups) {
      if (pk.collected) continue;

      if (pk.position.distanceTo(this.playerPos) < 2.15) {
        pk.collected = true;
        pk.group.visible = false;
        this.audio.playPickup();
        if (pk.type === 'ammo') {
          for (const wid of WEAPON_ORDER) {
            const wSpec = WEAPONS[wid];
            this.weaponStates[wid].reserve = Math.min(
              wSpec.reserveMax,
              this.weaponStates[wid].reserve + Math.ceil(wSpec.magSize * 1.5),
            );
          }
          this.grenadeCount = Math.min(6, this.grenadeCount + 1);
        } else if (pk.type === 'armor') {
          this.armor = Math.min(this.maxArmor, this.armor + 50);
        } else if (pk.type === 'medkit') {
          this.hp = Math.min(this.maxHp, this.hp + 50);
        }
      }
    }
  }

  private updateEnemies(dt: number) {
    const diffCfg = DIFFICULTIES[this.difficulty];
    const pEyeX = this.playerPos.x;
    const pEyeY = this.playerPos.y + this.currentEyeHeight * 0.85;
    const pEyeZ = this.playerPos.z;

    // 1. Gather Line-of-Sight & build Attack Token Pool
    const candidates: AttackTokenCandidate[] = [];
    const losCache = new Map<string, boolean>();

    for (const en of this.enemies) {
      if (!en.alive) continue;
      const ex = en.root.position.x;
      const ey = en.isFlying ? en.root.position.y : en.root.position.y + 1.45;
      const ez = en.root.position.z;
      const dx = pEyeX - ex;
      const dy = pEyeY - ey;
      const dz = pEyeZ - ez;
      const dist = Math.hypot(dx, dy, dz) || 1;

      const blocker = raycastWorldColliders(
        ex,
        ey,
        ez,
        dx / dist,
        dy / dist,
        dz / dist,
        dist - 0.3,
        this.level.colliders,
      );
      const hasLOS = blocker === null && dist < 44;
      losCache.set(en.id, hasLOS);

      candidates.push({
        id: en.id,
        alive: true,
        distance: dist,
        hasLineOfSight: hasLOS,
        wantsAttack: en.fireCooldown <= 0 || en.aiState === 'telegraph' || en.aiState === 'fire',
        priority: en.archetype === 'juggernaut' ? 3 : en.archetype === 'marksman' ? 2 : 1,
      });
    }

    const grantedTokens = allocateAttackTokens(candidates, diffCfg.tokenPoolSize);
    const maxDroneY = this.currentLevelConfig.isIndoor ? 6.0 : 12.0;

    // 2. Update each Enemy AI, Kinematics & Skeletal Gait (including Drones & Rushers)
    for (const en of this.enemies) {
      if (!en.alive) {
        if (en.isFlying) {
          // Spin rotors down naturally during crash
          if (en.koTimer > 0) {
            en.koTimer = Math.max(0, en.koTimer - dt);
            const rotorSpeed = 28 * (en.koTimer / 2.6);
            for (let r = 0; r < en.rotors.length; r++) {
              en.rotors[r].rotation.y += dt * rotorSpeed;
            }
          }
          if (!en.koSettled) {
            const crashRes = stepDroneCrash(
              {
                x: en.root.position.x,
                y: en.root.position.y,
                z: en.root.position.z,
                vx: en.velocity.x,
                vy: en.velocity.y,
                vz: en.velocity.z,
                settled: en.koSettled,
              },
              dt,
              DRONE_RADIUS,
              DRONE_HALF_HEIGHT,
              this.level.colliders,
              this.level.ramps,
              { maxY: maxDroneY },
            );
            en.root.position.set(crashRes.x, crashRes.y, crashRes.z);
            en.velocity.set(crashRes.vx, crashRes.vy, crashRes.vz);
            en.koSettled = crashRes.settled;

            if (!crashRes.settled) {
              en.root.rotation.x += en.crashAngVel.x * dt;
              en.root.rotation.y += en.crashAngVel.y * dt;
              en.root.rotation.z += en.crashAngVel.z * dt;
              if (crashRes.bounced || crashRes.hitWall) {
                en.crashAngVel.multiplyScalar(-0.55);
                en.crashAngVel.y += (Math.random() - 0.5) * 4.0;
              }
              if (Math.random() < dt * 16) {
                this.spawnParticles(
                  crashRes.x,
                  crashRes.y,
                  crashRes.z,
                  0,
                  0.6,
                  0,
                  2,
                  0xff7b29,
                  2.4,
                  0.7,
                );
              }
            } else {
              en.crashAngVel.set(0, 0, 0);
              en.root.rotation.x = THREE.MathUtils.clamp(
                Math.sin(en.root.rotation.x) * 0.35,
                -0.38,
                0.38,
              );
              en.root.rotation.z = THREE.MathUtils.clamp(
                Math.sin(en.root.rotation.z) * 0.42,
                -0.44,
                0.44,
              );
            }

            if (crashRes.hitWall || crashRes.bounced || crashRes.landed) {
              this.audio.playImpact('metal');
              this.spawnParticles(
                crashRes.x,
                crashRes.y - 0.1,
                crashRes.z,
                0,
                1,
                0,
                crashRes.landed ? 14 : 8,
                0xfbbf24,
                5.5,
                0.9,
              );
            }

            const surfY = getSurfaceHeightAt(
              crashRes.x,
              crashRes.z,
              this.level.colliders,
              this.level.ramps,
              crashRes.y + 0.5,
              0.4,
            );
            en.contactShadow.position.set(crashRes.x, surfY + 0.02, crashRes.z);
            const hRatio = Math.max(0.55, 1 - (crashRes.y - surfY) * 0.1);
            en.contactShadow.scale.set(hRatio, hRatio, 1);
          }
        } else if (en.ragdoll) {
          const ragRes = stepRagdollBody(
            en.ragdoll,
            dt,
            this.level.colliders,
            this.level.ramps,
          );
          const r = en.ragdoll;
          en.root.position.set(r.x, 0, r.z);
          en.root.rotation.set(0, 0, 0);
          en.pelvis.position.set(0, r.y, 0);
          en.pelvis.rotation.set(r.pelvisPitch, r.yaw + r.pelvisYaw, r.pelvisRoll, 'YXZ');
          en.torso.rotation.set(r.torsoPitch, r.torsoYaw, r.torsoRoll, 'YXZ');
          en.headGroup.rotation.set(r.headPitch, r.headYaw, r.headRoll, 'YXZ');
          en.armL.rotation.set(r.armLPitch, 0, r.armLRoll, 'XYZ');
          en.armR.rotation.set(r.armRPitch, 0, r.armRRoll, 'XYZ');
          en.legL.rotation.set(r.legLPitch, 0, r.legLRoll, 'XYZ');
          en.legR.rotation.set(r.legRPitch, 0, r.legRRoll, 'XYZ');
          en.kneeL.rotation.set(r.kneeLPitch, 0, 0);
          en.kneeR.rotation.set(r.kneeRPitch, 0, 0);
          en.contactShadow.position.set(0, ragRes.supportY + 0.015, 0);

          if (ragRes.floorImpact > 1.2) {
            this.audio.playBodyImpact(Math.min(1, ragRes.floorImpact / 7.5));
            this.spawnParticles(
              r.x,
              ragRes.supportY + 0.06,
              r.z,
              0,
              1,
              0,
              5,
              0x6b7280,
              2.6,
              0.7,
            );
          } else if (ragRes.wallImpact) {
            this.audio.playBodyImpact(0.7);
          }
        }
        continue;
      }

      // Spin quad-rotor blades continuously on airborne hunter drones
      if (en.rotors.length > 0) {
        for (let r = 0; r < en.rotors.length; r++) {
          en.rotors[r].rotation.y += dt * 34;
        }
      }

      if (en.hitFlashTimer > 0) {
        en.hitFlashTimer -= dt;
        en.visorMat.emissiveIntensity = 4.5;
      } else {
        en.visorMat.emissiveIntensity = en.aiState === 'telegraph' ? 3.2 : 1.6;
      }
      if (en.flinchTimer > 0) {
        en.flinchTimer -= dt;
        en.torso.rotation.x = -0.26 * (en.flinchTimer / 0.18);
      } else {
        const breathe = Math.sin(this.totalTime * 2.2 + en.walkPhase) * 0.025;
        en.torso.rotation.x = THREE.MathUtils.damp(
          en.torso.rotation.x,
          en.isFlying ? 0.14 : 0.06 + breathe,
          12,
          dt,
        );
      }

      const ex = en.root.position.x;
      const ez = en.root.position.z;
      const toPlayerX = pEyeX - ex;
      const toPlayerZ = pEyeZ - ez;
      const horizDist = Math.hypot(toPlayerX, toPlayerZ) || 1;
      const hasLOS = losCache.get(en.id) ?? false;

      // Smooth yaw toward player when aware
      const targetYaw = Math.atan2(toPlayerX, toPlayerZ);
      let diffYaw = targetYaw - en.yaw;
      while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
      while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;
      en.yaw += diffYaw * Math.min(1, dt * 7.5);
      en.root.rotation.y = en.yaw;

      if (en.fireCooldown > 0) en.fireCooldown -= dt;

      let moveX = 0;
      let moveZ = 0;
      let speed = 0;

      // Distinct Movement Policies per Archetype
      if (en.archetype === 'marksman') {
        if (horizDist < 9) {
          moveX = -toPlayerX / horizDist;
          moveZ = -toPlayerZ / horizDist;
          speed = 2.6;
        }
      } else if (en.archetype === 'breacher') {
        if (horizDist > 5.5) {
          moveX = toPlayerX / horizDist;
          moveZ = toPlayerZ / horizDist;
          speed = 4.1;
        }
      } else if (en.archetype === 'rusher') {
        if (horizDist > 3.6) {
          moveX = toPlayerX / horizDist;
          moveZ = toPlayerZ / horizDist;
          speed = 5.1;
        }
      } else if (en.archetype === 'drone') {
        en.stateTimer -= dt;
        if (en.stateTimer <= 0) {
          en.strafeSign *= -1;
          en.stateTimer = 1.6 + Math.random() * 1.4;
        }
        if (horizDist > 12) {
          moveX = toPlayerX / horizDist;
          moveZ = toPlayerZ / horizDist;
          speed = 4.2;
        } else {
          moveX = (-toPlayerZ / horizDist) * en.strafeSign;
          moveZ = (toPlayerX / horizDist) * en.strafeSign;
          speed = 3.4;
        }
      } else if (en.archetype === 'juggernaut') {
        if (horizDist > 8.0) {
          moveX = toPlayerX / horizDist;
          moveZ = toPlayerZ / horizDist;
          speed = 2.05;
        }
      } else {
        if (!hasLOS || horizDist > 15) {
          moveX = toPlayerX / horizDist;
          moveZ = toPlayerZ / horizDist;
          speed = 3.2;
        } else {
          en.stateTimer -= dt;
          if (en.stateTimer <= 0) {
            en.strafeSign *= -1;
            en.stateTimer = 1.4 + Math.random() * 1.2;
          }
          moveX = (-toPlayerZ / horizDist) * en.strafeSign;
          moveZ = (toPlayerX / horizDist) * en.strafeSign;
          speed = 2.4;
        }
      }

      if (en.isFlying) {
        const surfUnder = getSurfaceHeightAt(
          ex,
          ez,
          this.level.colliders,
          this.level.ramps,
          en.root.position.y + 0.5,
          0.5,
        );
        const targetHoverY = Math.min(
          maxDroneY - DRONE_HALF_HEIGHT - 0.1,
          Math.max(en.spawnPos.y, surfUnder) +
            en.hoverAlt +
            Math.sin(this.totalTime * 3.1 + en.walkPhase) * 0.2,
        );
        const smoothedY = THREE.MathUtils.damp(en.root.position.y, targetHoverY, 6.5, dt);
        let nextX = ex + moveX * speed * dt;
        let nextZ = ez + moveZ * speed * dt;

        // Avoid clipping through player or sibling entities
        const pdx = nextX - this.playerPos.x;
        const pdz = nextZ - this.playerPos.z;
        const pDist = Math.hypot(pdx, pdz);
        const minPlayerSep = DRONE_RADIUS + PLAYER_RADIUS + 0.15;
        if (pDist > 1e-4 && pDist < minPlayerSep && Math.abs(smoothedY - (this.playerPos.y + 1.1)) < 1.3) {
          const push = minPlayerSep - pDist;
          nextX += (pdx / pDist) * push;
          nextZ += (pdz / pDist) * push;
        }
        for (const other of this.enemies) {
          if (other === en || !other.alive) continue;
          const odx = nextX - other.root.position.x;
          const odz = nextZ - other.root.position.z;
          const oDist = Math.hypot(odx, odz);
          if (oDist > 1e-4 && oDist < 1.3 && Math.abs(smoothedY - other.root.position.y) < 1.2) {
            const push = (1.3 - oDist) * 0.5;
            nextX += (odx / oDist) * push;
            nextZ += (odz / oDist) * push;
          }
        }

        const droneCol = resolveDroneCollision(
          nextX,
          smoothedY,
          nextZ,
          DRONE_RADIUS,
          DRONE_HALF_HEIGHT,
          this.level.colliders,
          this.level.ramps,
          { minClearance: 1.05, maxY: maxDroneY },
        );
        if (droneCol.hitWall) {
          en.strafeSign *= -1;
        }
        en.root.position.set(droneCol.x, droneCol.y, droneCol.z);

        // Banking roll into strafe velocity + keep world contactShadow glued flat on surface underneath
        en.root.rotation.z = THREE.MathUtils.damp(
          en.root.rotation.z,
          -en.strafeSign * (speed > 0.5 ? 0.16 : 0),
          8,
          dt,
        );
        const groundBelow = getSurfaceHeightAt(
          droneCol.x,
          droneCol.z,
          this.level.colliders,
          this.level.ramps,
          droneCol.y + 0.5,
          0.4,
        );
        en.contactShadow.position.set(droneCol.x, groundBelow + 0.02, droneCol.z);
        const altRatio = THREE.MathUtils.clamp(1.05 - (droneCol.y - groundBelow) * 0.11, 0.48, 0.95);
        en.contactShadow.scale.set(altRatio, altRatio, 1);
      } else if (speed > 0 && en.aiState !== 'telegraph') {
        const nextX = ex + moveX * speed * dt;
        const nextZ = ez + moveZ * speed * dt;
        const res = resolvePlayerCollision(
          nextX,
          en.root.position.y,
          nextZ,
          0.45,
          1.8,
          this.level.colliders,
          this.level.ramps,
        );
        const stepDist = Math.hypot(res.x - ex, res.z - ez);
        en.root.position.set(res.x, res.y, res.z);
        en.walkPhase += stepDist * 3.8;
      }

      // Distance-synced skeletal gait animation (support hand stays anchored on rifle handguard)
      if (!en.isFlying) {
        const gaitSwing = speed > 0 && en.aiState !== 'telegraph' ? Math.sin(en.walkPhase) * 0.52 : 0;
        en.legL.rotation.x = THREE.MathUtils.damp(en.legL.rotation.x, gaitSwing, 14, dt);
        en.legR.rotation.x = THREE.MathUtils.damp(en.legR.rotation.x, -gaitSwing, 14, dt);
        en.armL.rotation.x = THREE.MathUtils.damp(en.armL.rotation.x, 0, 14, dt);
      }

      // Telegraph -> Fire State Machine with Attack Token Gate
      if (en.aiState === 'telegraph') {
        en.stateTimer -= dt;
        en.muzzlePoint.getWorldPosition(_v1);
        const attr = en.laserLine.geometry.attributes.position as THREE.BufferAttribute;
        attr.setXYZ(0, _v1.x, _v1.y, _v1.z);
        attr.setXYZ(1, pEyeX, pEyeY - 0.12, pEyeZ);
        attr.needsUpdate = true;
        en.laserMat.opacity = en.archetype === 'marksman' ? 0.85 : 0.45;

        if (en.stateTimer <= 0) {
          en.laserMat.opacity = 0;
          en.aiState = 'fire';
          en.burstRemaining =
            en.archetype === 'juggernaut'
              ? 5
              : en.archetype === 'flanker'
                ? 3
                : 1;
          en.stateTimer = 0.01;
        }
      } else if (en.aiState === 'fire') {
        en.stateTimer -= dt;
        if (en.stateTimer <= 0 && en.burstRemaining > 0) {
          en.burstRemaining--;
          en.stateTimer = en.archetype === 'juggernaut' ? 0.12 : 0.14;

          en.muzzlePoint.getWorldPosition(_v1);
          const inaccuracy =
            en.archetype === 'marksman'
              ? 0.03
              : en.archetype === 'breacher'
                ? 0.09
                : 0.065;
          _v2.set(
            pEyeX - _v1.x + (Math.random() - 0.5) * horizDist * inaccuracy,
            pEyeY - _v1.y + (Math.random() - 0.5) * horizDist * inaccuracy,
            pEyeZ - _v1.z + (Math.random() - 0.5) * horizDist * inaccuracy,
          ).normalize();

          const enemyHitDist = Math.hypot(pEyeX - _v1.x, pEyeY - _v1.y, pEyeZ - _v1.z);
          const blocker = raycastWorldColliders(
            _v1.x,
            _v1.y,
            _v1.z,
            _v2.x,
            _v2.y,
            _v2.z,
            enemyHitDist,
            this.level.colliders,
          );

          const gunType =
            en.archetype === 'breacher' ? 'shotgun' : 'carbine';
          const atten = Math.max(0.15, 1 - horizDist / 45);
          this.audio.playGunshot(gunType, true, atten);

          if (blocker) {
            const bx = _v1.x + _v2.x * blocker.distance;
            const by = _v1.y + _v2.y * blocker.distance;
            const bz = _v1.z + _v2.z * blocker.distance;
            this.spawnTracer(_v1.x, _v1.y, _v1.z, bx, by, bz);
            this.spawnParticles(bx, by, bz, blocker.nx, blocker.ny, blocker.nz, 4, 0xfbbf24, 3.5, 0.7);
          } else {
            this.spawnTracer(_v1.x, _v1.y, _v1.z, pEyeX, pEyeY - 0.15, pEyeZ);
            // Hit chance calibrated for fair, forgiving tactical gunplay
            const hitProb =
              en.archetype === 'marksman'
                ? 0.56
                : en.archetype === 'breacher'
                  ? Math.max(0.28, 0.85 - horizDist / 16)
                  : 0.42;
            if (Math.random() < hitProb * (this.crouch ? 0.68 : 0.78)) {
              const baseDmg =
                en.archetype === 'marksman'
                  ? 22
                  : en.archetype === 'breacher'
                    ? 18
                    : en.archetype === 'juggernaut'
                      ? 12
                      : 10;
              this.damagePlayer(Math.round(baseDmg * diffCfg.enemyDamageMult), ex, ez);
            }
          }
        }
        if (en.burstRemaining <= 0) {
          en.aiState = 'advance';
          en.fireCooldown =
            en.archetype === 'marksman'
              ? 2.8
              : en.archetype === 'juggernaut'
                ? 1.45
                : 1.85 + Math.random() * 0.9;
        }
      } else if (grantedTokens.has(en.id) && en.fireCooldown <= 0 && hasLOS) {
        en.aiState = 'telegraph';
        const windup =
          en.archetype === 'marksman'
            ? 0.72
            : Math.max(0.26, diffCfg.reactionDelay);
        en.stateTimer = windup;
        this.audio.playTelegraphChirp(en.archetype === 'marksman');
      }
    }
  }

  private updateMissionFlow(dt: number) {
    if (this.outcome !== null) return;

    const aliveEnemies = this.enemies.filter((e) => e.alive);

    if (this.gameMode === 'blackout') {
      if (this.sector === 1) {
        if (aliveEnemies.length === 0 || this.playerPos.z < 9.5) {
          this.sector = 2;
          this.spawnSectorSquad(2);
          this.audio.playPickup();
        }
      } else if (this.sector === 2) {
        // Must clear Turbine Hall squad and decrypt Intel Server Terminal
        const distTerm = this.playerPos.distanceTo(this.level.terminalPos);
        if (!this.terminalDecrypted && distTerm < 3.4) {
          const holdingInteract =
            this.keysHeld.has('Space') ||
            this.keysHeld.has('KeyT') ||
            this.touchInteractHeld ||
            aliveEnemies.length === 0;
          if (holdingInteract) {
            this.decryptProgress = Math.min(1, this.decryptProgress + dt * 0.48);
            if (this.decryptProgress >= 1) {
              this.terminalDecrypted = true;
              this.level.terminalScreenMat.emissive.setHex(0x10b981);
              this.score += 500;
              this.audio.playPickup();
              this.sector = 3;
              this.spawnSectorSquad(3);
            }
          }
        }
      } else if (this.sector === 3) {
        const distExtract = Math.hypot(
          this.playerPos.x - this.level.extractionPos.x,
          this.playerPos.z - this.level.extractionPos.z,
        );
        if (aliveEnemies.length === 0) {
          this.level.extractionBeaconMat.emissiveIntensity = 2.4;
          if (distExtract < 4.5) {
            this.extractProgress = Math.min(1, this.extractProgress + dt * 0.65);
            if (this.extractProgress >= 1) {
              this.finishVictory();
            }
          }
        }
      }
    } else {
      // Hostile Surge Endless Wave Survival
      if (aliveEnemies.length === 0) {
        if (this.waveBreakTimer <= 0) {
          this.waveBreakTimer = 3.0;
          this.audio.playPickup();
          // Bonus armor/ammo resupply between waves
          this.armor = Math.min(100, this.armor + 25);
          for (const wid of WEAPON_ORDER) {
            const wSpec = WEAPONS[wid];
            this.weaponStates[wid].reserve = Math.min(
              wSpec.reserveMax,
              this.weaponStates[wid].reserve + Math.ceil(wSpec.magSize * 1.5),
            );
          }
        } else {
          this.waveBreakTimer -= dt;
          if (this.waveBreakTimer <= 0) {
            this.wave++;
            this.spawnSurgeWave(this.wave);
          }
        }
      }
    }
  }

  private finishVictory() {
    this.outcome = 'victory';
    const finalRes = calculateRunScore({
      kills: this.kills,
      headshots: this.headshots,
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
      elapsedSec: this.elapsedSec,
      difficulty: this.difficulty,
      victory: true,
    });
    this.score = finalRes.score;
    this.saveRecord(this.score);
    this.audio.playOutcomeSting(true);
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.syncBodyState('gameover');
    this.pushHud(true);
  }

  private updatePools(dt: number) {
    // Particles
    let partDirty = false;
    for (let i = 0; i < this.particleCount; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      partDirty = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _mat4.makeScale(0, 0, 0);
        this.particleMesh.setMatrixAt(i, _mat4);
        continue;
      }
      p.vy -= 12 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.03) {
        p.y = 0.03;
        p.vy *= -0.35;
      }
      const s = p.scale * (p.life / p.maxLife);
      _mat4.compose(_v1.set(p.x, p.y, p.z), _quat.identity(), _scale.set(s, s, s));
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, _color.setRGB(p.r, p.g, p.b));
    }
    if (partDirty) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    }

    // Brass Casings
    let casingDirty = false;
    for (let i = 0; i < this.casingCount; i++) {
      const c = this.casings[i];
      if (!c.active) continue;
      casingDirty = true;
      c.life -= dt;
      if (c.life <= 0) {
        c.active = false;
        _mat4.makeScale(0, 0, 0);
        this.casingMesh.setMatrixAt(i, _mat4);
        continue;
      }
      c.vy -= 14 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      c.rx += 12 * dt;
      c.ry += 9 * dt;
      if (c.y < 0.02) {
        c.y = 0.02;
        c.vy = Math.abs(c.vy) * 0.42;
        c.vx *= 0.65;
        c.vz *= 0.65;
      }
      _euler.set(c.rx, c.ry, c.rz);
      _quat.setFromEuler(_euler);
      _mat4.compose(_v1.set(c.x, c.y, c.z), _quat, _scale.set(1, 1, 1));
      this.casingMesh.setMatrixAt(i, _mat4);
    }
    if (casingDirty) this.casingMesh.instanceMatrix.needsUpdate = true;

    // Tracers
    let tracerDirty = false;
    for (let i = 0; i < this.tracerCount; i++) {
      const t = this.tracers[i];
      if (!t.active) continue;
      tracerDirty = true;
      t.life -= dt;
      if (t.life <= 0) {
        t.active = false;
        _mat4.makeScale(0, 0, 0);
        this.tracerMesh.setMatrixAt(i, _mat4);
        continue;
      }
      _v2.set(t.dx, t.dy, t.dz);
      _quat.setFromUnitVectors(_v3.set(0, 0, 1), _v2);
      _mat4.compose(
        _v1.set(t.x, t.y, t.z),
        _quat,
        _scale.set(1, 1, t.length),
      );
      this.tracerMesh.setMatrixAt(i, _mat4);
    }
    if (tracerDirty) this.tracerMesh.instanceMatrix.needsUpdate = true;

    // Grenades
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= dt;
      g.vy -= 15.5 * dt;
      const nx = g.x + g.vx * dt;
      const ny = g.y + g.vy * dt;
      const nz = g.z + g.vz * dt;

      const floorY = getSurfaceHeightAt(nx, nz, this.level.colliders, this.level.ramps, g.y, 0.15);
      g.x = nx;
      g.z = nz;
      if (ny <= floorY + 0.08) {
        g.y = floorY + 0.08;
        g.vy = Math.abs(g.vy) * 0.45;
        g.vx *= 0.65;
        g.vz *= 0.65;
      } else {
        g.y = ny;
      }
      g.mesh.position.set(g.x, g.y, g.z);
      g.mesh.rotation.x += dt * 8;
      g.mesh.rotation.z += dt * 6;

      if (g.fuse <= 0) {
        this.scene.remove(g.mesh);
        this.grenades.splice(i, 1);
        this.detonateExplosion(g.x, g.y, g.z, 6.2, 165);
      }
    }

    // Physical Debris & Dropped Weapons
    for (let i = 0; i < this.debrisItems.length; i++) {
      const deb = this.debrisItems[i];
      if (deb.state.settled) continue;
      stepDebrisPiece(deb.state, dt, this.level.colliders, this.level.ramps);
      deb.mesh.position.set(deb.state.x, deb.state.y, deb.state.z);
      deb.mesh.rotation.set(deb.state.rx, deb.state.ry, deb.state.rz, 'YXZ');
    }

    // 3D Explosion Shockwaves & Blast Light Decay
    if (this.explosionLight.intensity > 0.05) {
      this.explosionLight.intensity = THREE.MathUtils.damp(
        this.explosionLight.intensity,
        0,
        14,
        dt,
      );
    } else if (this.explosionLight.intensity !== 0) {
      this.explosionLight.intensity = 0;
    }
    for (let i = 0; i < this.explosionEffects.length; i++) {
      const fx = this.explosionEffects[i];
      if (!fx.active) continue;
      fx.elapsed += dt;
      const p = fx.elapsed / fx.duration;
      if (p >= 1) {
        fx.active = false;
        fx.sphere.visible = false;
        fx.ring.visible = false;
        continue;
      }
      const easeOut = 1 - Math.pow(1 - p, 2.4);
      const fade = 1 - p;
      const sRad = Math.max(0.25, fx.maxRadius * 0.48 * easeOut);
      const rRad = Math.max(0.4, fx.maxRadius * easeOut);
      fx.sphere.scale.setScalar(sRad);
      fx.sphereMat.opacity = fade * fade * 0.72;
      fx.ring.scale.setScalar(rRad);
      fx.ringMat.opacity = fade * 0.85;
    }
  }

  private updateTitleFlyover(elapsed: number) {
    // Live animated tactical surveillance camera glide strictly inside open courtyard airspace
    const pose = computeTitleFlyoverPose(elapsed);
    const safeFly = resolveCameraCollision(
      pose.camX,
      pose.camY,
      pose.camZ,
      0.75,
      this.level.colliders,
      this.level.ramps,
      0.6,
    );
    this.camera.position.set(safeFly.x, safeFly.y, safeFly.z);
    this.camera.lookAt(pose.lookX, pose.lookY, pose.lookZ);
    this.camera.rotation.z = 0;
    this.viewmodel.flashCone.visible = false;
  }

  private getHudSnapshot(): HudSnapshot {
    const alive = this.enemies.filter((e) => e.alive);
    const boss = alive.find((e) => e.archetype === 'juggernaut');

    let objectiveTitle = 'Breach Outer Courtyard';
    let objectiveSub = 'Eliminate perimeter hostiles and advance into Turbine Hall';
    let objPos = new THREE.Vector3(0, 0, 10);
    let promptText: string | null = null;
    let interactProgress = 0;

    if (this.gameMode === 'blackout') {
      if (this.sector === 1) {
        objectiveTitle = 'Sector 01 · Courtyard Breach';
        objectiveSub = `Neutralize courtyard squad (${alive.length} remaining)`;
        objPos.set(0, 1.5, 16);
      } else if (this.sector === 2) {
        objectiveTitle = 'Sector 02 · Intel Server';
        objectiveSub = this.terminalDecrypted
          ? 'Intel decrypted — advance to Vault'
          : 'Locate & decrypt Intel Terminal in north hall';
        objPos = this.level.terminalPos;
        if (
          !this.terminalDecrypted &&
          this.playerPos.distanceTo(this.level.terminalPos) < 3.4
        ) {
          promptText =
            alive.length > 0
              ? 'Hold [SPACE] to Decrypt Intel Terminal'
              : 'Decrypting Intel Terminal...';
          interactProgress = this.decryptProgress;
        }
      } else {
        objectiveTitle = 'Sector 03 · Extraction Helipad';
        objectiveSub =
          alive.length > 0
            ? `Eliminate Juggernaut & Vault Guard (${alive.length} left)`
            : 'Move onto Helipad Beacon for extraction';
        objPos = this.level.extractionPos;
        if (
          alive.length === 0 &&
          Math.hypot(
            this.playerPos.x - this.level.extractionPos.x,
            this.playerPos.z - this.level.extractionPos.z,
          ) < 4.5
        ) {
          promptText = 'Extracting Squad... Hold Position';
          interactProgress = this.extractProgress;
        }
      }
    } else {
      objectiveTitle = `Hostile Surge · Wave ${String(this.wave).padStart(2, '0')}`;
      objectiveSub =
        alive.length > 0
          ? `${alive.length} hostiles active in compound`
          : `Next wave incoming in ${Math.ceil(this.waveBreakTimer)}s`;
      objPos.set(0, 1.5, 0);
    }

    const objectiveDist = Math.round(
      Math.hypot(objPos.x - this.playerPos.x, objPos.z - this.playerPos.z),
    );
    const spec = WEAPONS[this.activeWeapon];
    const reloadProgress = this.reloading
      ? 1 - Math.max(0, this.reloadTimer) / spec.reloadTime
      : 0;

    const totalSec = Math.floor(this.elapsedSec);
    const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');

    return {
      levelId: this.currentLevelId,
      levelNumber: this.currentLevelConfig.number,
      levelName: this.currentLevelConfig.name,
      climateLabel: this.currentLevelConfig.climate,
      weatherLabel: this.currentLevelConfig.weatherLabel,
      hp: Math.round(this.hp),
      maxHp: this.maxHp,
      armor: Math.round(this.armor),
      maxArmor: this.maxArmor,
      stamina: Math.round(this.stamina),
      weaponId: this.activeWeapon,
      weapons: {
        carbine: { ...this.weaponStates.carbine },
        shotgun: { ...this.weaponStates.shotgun },
        smg: { ...this.weaponStates.smg },
        sniper: { ...this.weaponStates.sniper },
        lmg: { ...this.weaponStates.lmg },
        ak: { ...this.weaponStates.ak },
        sidearm: { ...this.weaponStates.sidearm },
      },
      reloading: this.reloading,
      reloadProgress,
      grenades: this.grenadeCount,
      flashlightOn: this.flashlightOn,
      ads: this.adsBlend > 0.45,
      scopedAds: Boolean(spec.isScoped && this.adsBlend > 0.68),
      crouch: this.crouch,
      lean: this.leanValue,
      crosshairSpread:
        (1 - this.adsBlend) *
        (spec.spreadHip * 420 + this.recoilKick * 18),
      score: this.score,
      bestScore: Math.max(this.bestScore, this.score),
      kills: this.kills,
      killStreak: this.killStreak,
      headshots: this.headshots,
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
      sector: this.sector,
      wave: this.wave,
      objectiveTitle,
      objectiveSub,
      objectiveDist,
      hostilesLeft: alive.length,
      bossName: boss ? this.currentLevelConfig.bossTitle : null,
      bossHp: boss ? Math.round(boss.hp) : 0,
      bossMaxHp: boss ? boss.maxHp : 1,
      elapsedSec: this.elapsedSec,
      outcome: this.outcome,
      hitMarkerTimer: this.hitMarkerTimer,
      headshotMarker: this.headshotMarker,
      damageDirAngle: this.damageDirAngle,
      damageFlash: this.damageFlash,
      flashbangTimer: this.flashbangTimer,
      lightningFlash: this.lightningFlash,
      promptText,
      interactProgress,
      pointerLocked: this.pointerLocked,
      muted: this.audio.isMuted(),
      bodyCamTimecode: `REC · 2026-11-13 · ${hh}:${mm}:${ss}`,
    };
  }

  private pushHud(force: boolean = false) {
    if (force || this.hudSyncAccum >= 0.08) {
      this.hudSyncAccum = 0;
      this.cachedHud = this.getHudSnapshot();
      this.onHudUpdate(this.cachedHud);
    }
  }

  private syncUi3d(dt: number) {
    if (!this.ui3d) return;
    const hud =
      this.gameState === 'playing' || !this.cachedHud
        ? this.getHudSnapshot()
        : this.cachedHud;
    this.cachedHud = hud;
    const showTouch =
      this.settings.touchControls === 'on' ||
      (this.settings.touchControls === 'auto' && this.isTouchDevice);
    this.ui3d.update(dt, {
      gameState: this.gameState,
      selectedLevel: this.currentLevelId,
      mode: this.gameMode,
      difficulty: this.difficulty,
      hud,
      settings: this.settings,
      isTouchDevice: this.isTouchDevice,
      showTouchControls: showTouch,
      contextError: this.contextErrorMsg,
    });
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || !gl.fenceSync) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private loop = () => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const maxDt = this.isSoftwareGl ? 0.1 : 0.05;
    const dt = Math.min(Math.max(rawDt, 0.001), maxDt);
    this.totalTime += dt;

    this.mats.updateShaderTime(this.totalTime);

    // Animate living & mechanical world props (helicopter rotors, radar dishes, wind-swaying trees, orbiting birds)
    for (let i = 0; i < this.level.animatables.length; i++) {
      const a = this.level.animatables[i];
      if (a.kind === 'rotor' || a.kind === 'radar') {
        a.obj.rotation.y += dt * a.speed;
      } else if (a.kind === 'sway') {
        a.obj.rotation.z =
          Math.sin(this.totalTime * a.speed + a.phase) *
          0.045 *
          this.currentLevelConfig.windStrength;
      } else if (a.kind === 'hover') {
        a.obj.position.y =
          (a.baseY ?? 8) + Math.sin(this.totalTime * a.speed + a.phase) * 0.24;
      } else if (a.kind === 'bird') {
        const ang = this.totalTime * a.speed + a.phase;
        const r = a.orbitRadius ?? 18;
        const cx = a.orbitCenter ? a.orbitCenter.x : 0;
        const cz = a.orbitCenter ? a.orbitCenter.z : 0;
        a.obj.position.set(
          cx + Math.cos(ang) * r,
          (a.baseY ?? 14) + Math.sin(this.totalTime * 1.4 + a.phase) * 0.75,
          cz + Math.sin(ang) * r,
        );
        a.obj.rotation.y = -ang;
        const flap = Math.sin(this.totalTime * 11 + a.phase * 3) * 0.55;
        if (a.wingL) a.wingL.rotation.z = flap;
        if (a.wingR) a.wingR.rotation.z = -flap;
      }
    }

    // Keep shadow frustum crisply centered around active camera/player sector
    const focusX = this.gameState === 'title' ? 0 : Math.round(this.playerPos.x);
    const focusZ = this.gameState === 'title' ? 1.5 : Math.round(this.playerPos.z);
    const cfg = this.currentLevelConfig;
    this.keyLight.target.position.set(focusX, 0, focusZ);
    this.keyLight.position.set(focusX + cfg.sunPos[0], cfg.sunPos[1], focusZ + cfg.sunPos[2]);

    // Dynamic Volumetric 3D Sky Lightning & Thunder Controller
    if (cfg.hasLightning) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.camera.getWorldDirection(_v1);
        const activeCamYaw =
          this.gameState === 'title' ? Math.atan2(-_v1.x, -_v1.z) : this.yaw;
        this.lightningSystem.triggerStrike(
          this.camera.position,
          activeCamYaw,
          cfg.biome,
          this.isFirstLightningStrike,
        );
        this.isFirstLightningStrike = false;
        this.lightningTimer =
          cfg.lightningIntervalMin +
          Math.random() * (cfg.lightningIntervalMax - cfg.lightningIntervalMin);
        this.audio.playThunder();
      }
    }
    const lFrame = this.lightningSystem.update(dt);
    this.lightningFlash = lFrame.flashIntensity;
    this.level.skyDomeMat.uniforms.uLightning.value = lFrame.flashIntensity;
    this.level.skyDomeMat.uniforms.uBoltDir.value.set(
      lFrame.boltDirX,
      lFrame.boltDirY,
      lFrame.boltDirZ,
    );
    this.level.skyDomeMat.uniforms.uLightningColor.value.setHex(lFrame.lightColor);

    this.lightningLight.color.setHex(lFrame.lightColor);
    this.lightningLight.intensity = lFrame.flashIntensity * 2.5;
    this.lightningLight.position.set(
      this.playerPos.x + lFrame.boltDirX * 45,
      Math.max(18, lFrame.boltDirY * 55),
      this.playerPos.z + lFrame.boltDirZ * 45,
    );
    this.vmLightningLight.color.setHex(lFrame.lightColor);
    this.vmLightningLight.intensity = lFrame.flashIntensity * 1.8;
    this.vmLightningLight.position.copy(this.lightningLight.position);

    this.hemi.intensity = cfg.hemiIntensity + lFrame.flashIntensity * 0.65;
    this.vmHemi.intensity = this.hemi.intensity;

    _flashFogColor.setHex(lFrame.fogTint);
    _baseFogColor.copy(this.baseFogColor).lerp(_flashFogColor, lFrame.flashIntensity * 0.22);
    if (this.scene.fog) {
      this.scene.fog.color.copy(_baseFogColor);
    }
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(_baseFogColor);
    }
    this.rain.setLightningFlash(lFrame.flashIntensity, lFrame.lightColor);

    if (this.gameState === 'title') {
      this.updateTitleFlyover(this.totalTime);
      this.rain.update(dt, this.camera.position.x, this.camera.position.z);
    } else if (this.gameState === 'playing') {
      this.hudSyncAccum += dt;
      if (this.hitMarkerTimer > 0) this.hitMarkerTimer = Math.max(0, this.hitMarkerTimer - dt);
      if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 1.4);
      if (this.flashbangTimer > 0) this.flashbangTimer = Math.max(0, this.flashbangTimer - dt);

      if (this.outcome === 'defeat') {
        this.defeatBeatTimer -= dt;
        this.trauma = Math.min(1, this.trauma + dt * 0.4);
        this.defeatCamVelY -= 19.6 * dt;
        const groundY = getSurfaceHeightAt(
          this.camera.position.x,
          this.camera.position.z,
          this.level.colliders,
          this.level.ramps,
          this.playerPos.y + 0.5,
          0.3,
        );
        let nextCamY = this.camera.position.y + this.defeatCamVelY * dt;
        if (nextCamY <= groundY + 0.28) {
          nextCamY = groundY + 0.28;
          if (this.defeatCamVelY < -1.5) {
            this.defeatCamVelY = -this.defeatCamVelY * 0.28;
            this.audio.playBodyImpact(0.75);
          } else {
            this.defeatCamVelY = 0;
          }
        }
        this.camera.rotation.z = THREE.MathUtils.damp(this.camera.rotation.z, 0.88, 6.5, dt);
        this.camera.rotation.x = THREE.MathUtils.damp(this.camera.rotation.x, -0.35, 5.5, dt);
        const safeFall = resolveCameraCollision(
          this.camera.position.x,
          nextCamY,
          this.camera.position.z,
          0.26,
          this.level.colliders,
          this.level.ramps,
          this.playerPos.y,
        );
        this.camera.position.set(safeFall.x, safeFall.y, safeFall.z);
        this.viewmodelCamera.position.copy(this.camera.position);
        this.viewmodelCamera.rotation.copy(this.camera.rotation);
        this.updateEnemies(dt);
        this.updatePools(dt);
        if (this.defeatBeatTimer <= 0) {
          const res = calculateRunScore({
            kills: this.kills,
            headshots: this.headshots,
            shotsFired: this.shotsFired,
            shotsHit: this.shotsHit,
            elapsedSec: this.elapsedSec,
            difficulty: this.difficulty,
            victory: false,
          });
          this.score = res.score;
          this.saveRecord(this.score);
          if (document.pointerLockElement) document.exitPointerLock?.();
          this.syncBodyState('gameover');
          this.pushHud(true);
        }
      } else if (this.hitstopTimer > 0) {
        this.hitstopTimer -= dt;
      } else {
        this.elapsedSec += dt;
        this.updatePlayer(dt);
        this.updateEnemies(dt);
        this.updateMissionFlow(dt);
        this.updatePools(dt);
        this.rain.update(dt, this.playerPos.x, this.playerPos.z);
      }

      const activeSpecHud = WEAPONS[this.activeWeapon];
      const curAds = this.adsBlend > 0.45;
      const curScoped = Boolean(activeSpecHud.isScoped && this.adsBlend > 0.68);
      const adsChanged = curAds !== this.prevHudAds || curScoped !== this.prevHudScopedAds;
      this.prevHudAds = curAds;
      this.prevHudScopedAds = curScoped;
      this.pushHud(adsChanged);
    }

    if (this.muzzleLightIntensity > 0.01) {
      this.muzzleLightIntensity = THREE.MathUtils.damp(this.muzzleLightIntensity, 0, 42, dt);
      this.muzzlePointLight.intensity = this.muzzleLightIntensity;
      this.vmMuzzleLight.intensity = this.muzzleLightIntensity * 0.75;
    } else if (this.muzzlePointLight.intensity !== 0) {
      this.muzzlePointLight.intensity = 0;
      this.vmMuzzleLight.intensity = 0;
    }

    // Clear single-frame edge triggers
    this.justPressed.clear();
    this.mouseLeftJustPressed = false;
    this.touchFireJustPressed = false;

    // Update Body-Cam Post-Processing Uniforms on GPU
    if (this.bodyCamPass) {
      this.bodyCamPass.uniforms.uTime.value = this.totalTime;
      this.bodyCamPass.uniforms.uDistortion.value =
        this.gameState === 'title' || !this.settings.bodyCamFx ? 0.025 : 0.075;
      this.bodyCamPass.uniforms.uGrain.value = this.settings.bodyCamFx ? 0.028 : 0.008;
      const lowHpPulse = this.hp < 32 ? (1 - this.hp / 32) * 0.42 : 0;
      this.bodyCamPass.uniforms.uDamage.value = Math.max(this.damageFlash, lowHpPulse);
      this.bodyCamPass.uniforms.uFlash.value = this.flashbangTimer;
    }

    // Update 3D Objective Beacon & Three.js Orthographic HUD Overlay
    if (this.gameState === 'playing' && this.outcome === null) {
      let showBeacon = false;
      let bx = 0;
      let by = 2.2;
      let bz = 0;
      let bColor = 0xf59e0b;

      if (this.gameMode === 'blackout') {
        if (this.sector === 1) {
          showBeacon = true;
          bx = 0;
          by = 4.2;
          bz = 11.8;
          bColor = 0xf59e0b;
        } else if (this.sector === 2 && !this.terminalDecrypted) {
          showBeacon = true;
          bx = this.level.terminalPos.x;
          by = this.level.terminalPos.y + 1.85;
          bz = this.level.terminalPos.z;
          bColor = this.decryptProgress > 0 ? 0x10b981 : 0xf59e0b;
        } else if (this.sector === 3) {
          const aliveCount = this.enemies.some((e) => e.alive);
          showBeacon = true;
          bx = this.level.extractionPos.x;
          by = this.level.extractionPos.y + 2.3;
          bz = this.level.extractionPos.z;
          bColor = aliveCount ? 0xf59e0b : 0x10b981;
        }
      }

      if (showBeacon) {
        this.objectiveBeacon.visible = true;
        this.objectiveBeacon.position.set(
          bx,
          by + Math.sin(this.totalTime * 2.8) * 0.16,
          bz,
        );
        this.objectiveBeaconDiamond.rotation.y += dt * 1.9;
        const pulse = 1 + Math.sin(this.totalTime * 4.5) * 0.14;
        this.objectiveBeaconRing.scale.setScalar(pulse);
        this.objectiveBeaconMat.color.setHex(bColor);
      } else {
        this.objectiveBeacon.visible = false;
      }

      const activeSpecHud = WEAPONS[this.activeWeapon];
      const lowHpRatio = this.hp < 35 ? 1 - this.hp / 35 : 0;
      const reloadRatio = this.reloading
        ? 1 - Math.max(0, this.reloadTimer) / activeSpecHud.reloadTime
        : 0;
      this.hudOverlay.update({
        visible: true,
        spreadPx:
          (1 - this.adsBlend) *
          (activeSpecHud.spreadHip * 420 + this.recoilKick * 18),
        adsBlend: this.adsBlend,
        scopedAds: Boolean(activeSpecHud.isScoped && this.adsBlend > 0.68),
        hitMarkerTimer: this.hitMarkerTimer,
        headshotMarker: this.headshotMarker,
        damageFlash: this.damageFlash,
        damageDirAngle: this.damageDirAngle,
        lowHpRatio,
        flashbangTimer: this.flashbangTimer,
        lightningFlash: this.lightningFlash,
        reloadProgress: reloadRatio,
      });
    } else {
      this.objectiveBeacon.visible = false;
      this.hudOverlay.update({
        visible: false,
        spreadPx: 0,
        adsBlend: 0,
        scopedAds: false,
        hitMarkerTimer: 0,
        headshotMarker: false,
        damageFlash: 0,
        damageDirAngle: 0,
        lowHpRatio: 0,
        flashbangTimer: 0,
        lightningFlash: 0,
        reloadProgress: 0,
      });
    }

    this.syncUi3d(dt);
    this.renderSceneNow();

    if (this.isSoftwareGl) {
      this.afterDraw(this.loop);
    } else {
      this.frameId = requestAnimationFrame(this.loop);
    }
  };

  private renderSceneNow() {
    if (this.disposed || !this.renderer) return;
    if (this.composer && !this.isSoftwareGl) {
      this.composer.render();
      if (this.hudOverlay.scene.visible) {
        this.renderer.clearDepth();
        this.renderer.render(this.hudOverlay.scene, this.hudOverlay.camera);
      }
      if (this.ui3d) {
        this.renderer.clearDepth();
        this.renderer.render(this.ui3d.scene, this.ui3d.camera);
      }
    } else {
      this.renderer.autoClear = false;
      this.renderer.clear(true, true, true);
      this.renderer.render(this.scene, this.camera);
      if (this.viewmodel.root.visible) {
        this.renderer.clearDepth();
        this.renderer.render(this.viewmodelScene, this.viewmodelCamera);
      }
      if (this.hudOverlay.scene.visible) {
        this.renderer.clearDepth();
        this.renderer.render(this.hudOverlay.scene, this.hudOverlay.camera);
      }
      if (this.ui3d) {
        this.renderer.clearDepth();
        this.renderer.render(this.ui3d.scene, this.ui3d.camera);
      }
    }
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.unbindListeners();
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    this.clearDynamicEntities();
    this.lightningSystem.dispose();
    this.hudOverlay.dispose();
    this.ui3d?.dispose();
    this.objectiveBeaconGeo.dispose();
    this.objectiveBeaconRingGeo.dispose();
    this.objectiveBeaconMat.dispose();
    this.explosionSphereGeo.dispose();
    this.explosionRingGeo.dispose();
    for (const fx of this.explosionEffects) {
      fx.sphereMat.dispose();
      fx.ringMat.dispose();
    }
    this.level.dispose();
    this.viewmodel.dispose();
    this.rain.dispose();
    this.mats.dispose();
    this.grenadeGeo.dispose();
    this.grenadeMat.dispose();
    this.woodPlankGeo.dispose();
    this.shardGeo.dispose();
    this.charredShardMat.dispose();
    this.pickupGeos.forEach((g) => g.dispose());
    this.pickupMats.forEach((m) => m.dispose());
    this.particleMesh.geometry.dispose();
    (this.particleMesh.material as THREE.Material).dispose();
    this.casingMesh.geometry.dispose();
    this.tracerMesh.geometry.dispose();
    (this.tracerMesh.material as THREE.Material).dispose();
    this.composer?.dispose();
    this.envMapTexture?.dispose();
    this.renderer.dispose();
    this.audio.dispose();
  }
}

export { formatMissionTime };
