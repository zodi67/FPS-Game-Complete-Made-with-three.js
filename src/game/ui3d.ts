import * as THREE from 'three';
import { getLevelConfig, getNextLevelId, LEVEL_ORDER, LEVELS } from './maps';
import {
  calculateRunScore,
  DIFFICULTIES,
  formatMissionTime,
  normalizeTouchJoystick,
  WEAPON_ORDER,
  WEAPONS,
} from './rules';
import type {
  DifficultyLevel,
  GameMode,
  GameSettings,
  GameState,
  HudSnapshot,
  LevelId,
  WeaponId,
} from './types';

export interface Ui3dCallbacks {
  onSelectLevel: (id: LevelId) => void;
  onSelectMode: (mode: GameMode) => void;
  onSelectDifficulty: (diff: DifficultyLevel) => void;
  onDeploy: () => void;
  onNextLevel: () => void;
  onSelectWeapon: (id: WeaponId) => void;
  onToggleMute: () => void;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
  onUpdateSettings: (partial: Partial<GameSettings>) => void;
  onTouchMove: (x: number, y: number, sprint: boolean) => void;
  onTouchLook: (dx: number, dy: number) => void;
  onTouchFireChange: (active: boolean) => void;
  onToggleTouchAds: () => void;
  onToggleTouchLean: (dir: -1 | 1) => void;
  onTouchInteractChange: (active: boolean) => void;
  onTouchAction: (action: 'reload' | 'crouch' | 'jump' | 'flashlight' | 'grenade' | 'melee') => void;
}

export interface Ui3dState {
  gameState: GameState;
  selectedLevel: LevelId;
  mode: GameMode;
  difficulty: DifficultyLevel;
  hud: HudSnapshot;
  settings: GameSettings;
  isTouchDevice: boolean;
  showTouchControls: boolean;
  contextError: string | null;
}

export interface Ui3dSystem {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  resize: (width: number, height: number) => void;
  update: (dt: number, state: Ui3dState) => void;
  handlePointerDown: (e: PointerEvent, canvas: HTMLCanvasElement) => boolean;
  handlePointerMove: (e: PointerEvent, canvas: HTMLCanvasElement) => boolean;
  handlePointerUp: (e: PointerEvent, canvas: HTMLCanvasElement) => boolean;
  invalidateAll: () => void;
  dispose: () => void;
}

interface InteractiveTarget {
  mesh: THREE.Mesh;
  id: string;
  cursor?: string;
  onClick?: () => void;
  onDrag?: (normX: number) => void;
  bounds: { x: number; y: number; w: number; h: number };
}

interface CanvasPanel {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  lastKey: string;
  w: number;
  h: number;
}

const JOYSTICK_RADIUS = 46;

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function createUi3dSystem(
  callbacks: Ui3dCallbacks,
  isSoftwareGl: boolean,
): Ui3dSystem {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-720, 720, 450, -450, -20, 20);
  camera.position.set(0, 0, 10);

  let viewW = 1440;
  let viewH = 900;
  const getDpr = () => (isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const allPanels: CanvasPanel[] = [];

  const unitPlaneGeo = new THREE.PlaneGeometry(1, 1);
  geometries.push(unitPlaneGeo);

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const createPanel = (parent: THREE.Object3D, renderOrder: number, z: number = 0): CanvasPanel => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    textures.push(tex);

    const mat = trackMat(
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    const mesh = new THREE.Mesh(unitPlaneGeo, mat);
    mesh.position.z = z;
    mesh.renderOrder = renderOrder;
    parent.add(mesh);
    const panel: CanvasPanel = { mesh, mat, canvas, ctx, tex, lastKey: '', w: 64, h: 64 };
    allPanels.push(panel);
    return panel;
  };

  const createSolidRect = (
    parent: THREE.Object3D,
    colorHex: number,
    opacity: number,
    renderOrder: number,
    z: number = 0,
  ) => {
    const mat = trackMat(
      new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity,
        depthTest: false,
        depthWrite: false,
      }),
    );
    const mesh = new THREE.Mesh(unitPlaneGeo, mat);
    mesh.position.z = z;
    mesh.renderOrder = renderOrder;
    parent.add(mesh);
    return { mesh, mat };
  };

  // Convert top-left CSS pixel box to Three.js orthographic center position
  const setBoxTopLeft = (
    obj: THREE.Object3D,
    x: number,
    y: number,
    w: number,
    h: number,
    z?: number,
  ) => {
    obj.position.x = x + w * 0.5 - viewW * 0.5;
    obj.position.y = viewH * 0.5 - y - h * 0.5;
    if (z !== undefined) obj.position.z = z;
    obj.scale.set(Math.max(1, w), Math.max(1, h), 1);
  };

  const drawPanelIfChanged = (
    panel: CanvasPanel,
    key: string,
    x: number,
    y: number,
    w: number,
    h: number,
    drawFn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  ) => {
    const rw = Math.max(2, Math.round(w));
    const rh = Math.max(2, Math.round(h));
    setBoxTopLeft(panel.mesh, x, y, rw, rh);
    panel.w = rw;
    panel.h = rh;

    const dpr = getDpr();
    const fullKey = `${key}|${rw}x${rh}@${dpr}`;
    if (panel.lastKey === fullKey) return;
    panel.lastKey = fullKey;

    const pw = Math.max(2, Math.round(rw * dpr));
    const ph = Math.max(2, Math.round(rh * dpr));
    if (panel.canvas.width !== pw || panel.canvas.height !== ph) {
      panel.canvas.width = pw;
      panel.canvas.height = ph;
      const oldIdx = textures.indexOf(panel.tex);
      if (oldIdx !== -1) textures.splice(oldIdx, 1);
      panel.tex.dispose();
      const nextTex = new THREE.CanvasTexture(panel.canvas);
      nextTex.colorSpace = THREE.SRGBColorSpace;
      nextTex.minFilter = THREE.LinearFilter;
      nextTex.magFilter = THREE.LinearFilter;
      nextTex.generateMipmaps = false;
      textures.push(nextTex);
      panel.tex = nextTex;
      panel.mat.map = nextTex;
      panel.mat.needsUpdate = true;
    }
    const ctx = panel.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rw, rh);
    drawFn(ctx, rw, rh);
    panel.tex.needsUpdate = true;
  };

  // Interactive Raycasting Registry
  const raycaster = new THREE.Raycaster();
  const ndcMouse = new THREE.Vector2();
  let activeTargets: InteractiveTarget[] = [];
  let hoveredId: string | null = null;
  let activeDragTarget: InteractiveTarget | null = null;
  let activeDragPointerId: number | null = null;
  let latestState: Ui3dState | null = null;

  const registerTarget = (
    id: string,
    mesh: THREE.Mesh,
    x: number,
    y: number,
    w: number,
    h: number,
    opts: { cursor?: string; onClick?: () => void; onDrag?: (normX: number) => void },
  ) => {
    mesh.userData.uiId = id;
    activeTargets.push({
      mesh,
      id,
      cursor: opts.cursor ?? 'pointer',
      onClick: opts.onClick,
      onDrag: opts.onDrag,
      bounds: { x, y, w, h },
    });
  };

  // =========================================================================
  // 1. TITLE SCREEN THREE.JS GROUP
  // =========================================================================
  const titleGroup = new THREE.Group();
  titleGroup.visible = false;
  scene.add(titleGroup);

  const titleScrimMat = trackMat(
    new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        void main() {
          float x = vUv.x;
          float a = mix(0.90, 0.62, smoothstep(0.0, 0.44, x));
          a = mix(a, 0.12, smoothstep(0.44, 1.0, x));
          gl_FragColor = vec4(0.031, 0.043, 0.059, a);
        }
      `,
    }),
  );
  const titleScrimMesh = new THREE.Mesh(unitPlaneGeo, titleScrimMat);
  titleScrimMesh.position.z = -1;
  titleScrimMesh.renderOrder = 10;
  titleGroup.add(titleScrimMesh);

  const titleTopBar = createPanel(titleGroup, 12, 1);
  const titleHeaderPanel = createPanel(titleGroup, 12, 1);
  const titleOpsLabelPanel = createPanel(titleGroup, 12, 1);
  const titleOpPanels = LEVEL_ORDER.map(() => createPanel(titleGroup, 13, 1.5));
  const titleModeLabelPanel = createPanel(titleGroup, 12, 1);
  const titleModePanels = [createPanel(titleGroup, 13, 1.5), createPanel(titleGroup, 13, 1.5)];
  const titleDiffLabelPanel = createPanel(titleGroup, 12, 1);
  const titleDiffPanels = [
    createPanel(titleGroup, 13, 1.5),
    createPanel(titleGroup, 13, 1.5),
    createPanel(titleGroup, 13, 1.5),
  ];
  const titleDiffSummaryPanel = createPanel(titleGroup, 12, 1);
  const titleDeployBtn = createPanel(titleGroup, 14, 2);
  const titleHintPanel = createPanel(titleGroup, 12, 1);

  // =========================================================================
  // 2. ACTIVE TACTICAL HUD THREE.JS GROUP
  // =========================================================================
  const hudGroup = new THREE.Group();
  hudGroup.visible = false;
  scene.add(hudGroup);

  const hudTopLeftPanel = createPanel(hudGroup, 12, 1);
  const hudBossPanel = createPanel(hudGroup, 12, 1);
  const hudBossBarBg = createSolidRect(hudGroup, 0x1e293b, 0.95, 13, 1.3);
  const hudBossBarFill = createSolidRect(hudGroup, 0xef4444, 1.0, 14, 1.6);

  const hudScorePanel = createPanel(hudGroup, 12, 1);
  const hudMuteBtn = createPanel(hudGroup, 13, 1.5);
  const hudRestartBtn = createPanel(hudGroup, 13, 1.5);
  const hudPauseBtn = createPanel(hudGroup, 13, 1.5);

  const hudScopeReadout = createPanel(hudGroup, 15, 2.5);
  const hudPromptPanel = createPanel(hudGroup, 14, 2);
  const hudPromptBarBg = createSolidRect(hudGroup, 0x1e293b, 0.95, 15, 2.3);
  const hudPromptBarFill = createSolidRect(hudGroup, 0x34d399, 1.0, 16, 2.6);

  // Bottom-Left Vitality Panel + Native 60fps Animated Three.js Bars
  const hudVitalPanel = createPanel(hudGroup, 12, 1);
  const hudHpBarBg = createSolidRect(hudGroup, 0x1e293b, 0.95, 13, 1.2);
  const hudGhostBarFill = createSolidRect(hudGroup, 0xfbbf24, 0.72, 14, 1.4);
  const hudHpBarFill = createSolidRect(hudGroup, 0x34d399, 1.0, 15, 1.6);
  const hudArmBarBg = createSolidRect(hudGroup, 0x1e293b, 0.95, 13, 1.2);
  const hudArmBarFill = createSolidRect(hudGroup, 0x38bdf8, 1.0, 15, 1.6);

  // Bottom-Right Arsenal Panel + 7 Interactive Three.js Weapon Slot Meshes
  const hudArsenalBgPanel = createPanel(hudGroup, 12, 1);
  const hudWeaponSlotPanels = WEAPON_ORDER.map(() => createPanel(hudGroup, 14, 1.8));
  const hudReloadBarBg = createSolidRect(hudGroup, 0x1e293b, 0.95, 13, 1.3);
  const hudReloadBarFill = createSolidRect(hudGroup, 0xfbbf24, 1.0, 15, 1.6);

  // Ghost HP smooth trailing value
  let ghostHp = 100;
  let ghostHoldTimer = 0;
  let prevHp = 100;

  // =========================================================================
  // 3. THREE.JS MOBILE TOUCH CONTROLS GROUP
  // =========================================================================
  const touchGroup = new THREE.Group();
  touchGroup.visible = false;
  scene.add(touchGroup);

  // Right-side invisible look surface
  const touchLookZone = createSolidRect(touchGroup, 0x000000, 0.001, 10, 0.2);

  // Joystick (Three.js Ring + Circle + Inner Dashed Ring + Movable Knob)
  const joyBaseBg = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(58, 36)),
    trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x0b0e12,
        transparent: true,
        opacity: 0.68,
        depthTest: false,
        depthWrite: false,
      }),
    ),
  );
  joyBaseBg.renderOrder = 12;
  joyBaseBg.position.z = 1;

  const joyBaseBorder = new THREE.Mesh(
    trackGeo(new THREE.RingGeometry(56.5, 58.5, 36)),
    trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.24,
        depthTest: false,
        depthWrite: false,
      }),
    ),
  );
  joyBaseBorder.renderOrder = 13;
  joyBaseBorder.position.z = 1.1;

  const joyInnerRing = new THREE.Mesh(
    trackGeo(new THREE.RingGeometry(44.5, 45.8, 32)),
    trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.14,
        depthTest: false,
        depthWrite: false,
      }),
    ),
  );
  joyInnerRing.renderOrder = 13;
  joyInnerRing.position.z = 1.1;

  const joyKnobMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xe2e8f0,
      transparent: true,
      opacity: 0.35,
      depthTest: false,
      depthWrite: false,
    }),
  );
  const joyKnobMesh = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(24, 28)), joyKnobMat);
  joyKnobMesh.renderOrder = 14;
  joyKnobMesh.position.z = 1.4;

  const joyKnobRingMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
      depthTest: false,
      depthWrite: false,
    }),
  );
  const joyKnobRing = new THREE.Mesh(trackGeo(new THREE.RingGeometry(22.5, 24.5, 28)), joyKnobRingMat);
  joyKnobRing.renderOrder = 15;
  joyKnobRing.position.z = 1.5;

  const joySprintPanel = createPanel(touchGroup, 15, 1.6);
  touchGroup.add(joyBaseBg, joyBaseBorder, joyInnerRing, joyKnobMesh, joyKnobRing);

  const touchLeanLBtn = createPanel(touchGroup, 14, 1.5);
  const touchLeanRBtn = createPanel(touchGroup, 14, 1.5);
  const touchLightBtn = createPanel(touchGroup, 14, 1.5);
  const touchFragBtn = createPanel(touchGroup, 14, 1.5);
  const touchCrouchBtn = createPanel(touchGroup, 14, 1.5);
  const touchJumpBtn = createPanel(touchGroup, 14, 1.5);
  const touchReloadBtn = createPanel(touchGroup, 14, 1.5);
  const touchAdsBtn = createPanel(touchGroup, 14, 1.5);
  const touchFireBtn = createPanel(touchGroup, 14, 1.5);
  const touchDecryptBtn = createPanel(touchGroup, 15, 1.8);

  // Touch multi-pointer state
  let joyPointerId: number | null = null;
  let joyCenter = { x: 74, y: 766 };
  let joyKnob = { x: 0, y: 0, sprint: false, active: false };
  let lookPointerId: number | null = null;
  let lookLast = { x: 0, y: 0 };
  let firePointerId: number | null = null;
  let decryptPointerId: number | null = null;
  let lookZoneRect = { x: 0, y: 0, w: 0, h: 0 };
  let joyZoneRect = { x: 0, y: 0, w: 0, h: 0 };
  let fireZoneRect = { x: 0, y: 0, w: 0, h: 0 };
  let decryptZoneRect = { x: 0, y: 0, w: 0, h: 0 };

  // =========================================================================
  // 4. PAUSE MODAL THREE.JS GROUP
  // =========================================================================
  const pauseGroup = new THREE.Group();
  pauseGroup.visible = false;
  scene.add(pauseGroup);

  const pauseBackdrop = createSolidRect(pauseGroup, 0x000000, 0.76, 20, 4);
  const pauseCardPanel = createPanel(pauseGroup, 21, 4.5);
  const pauseSensLabel = createPanel(pauseGroup, 22, 5);
  const pauseSensTrackBg = createSolidRect(pauseGroup, 0x1e293b, 1.0, 22, 5.1);
  const pauseSensTrackFill = createSolidRect(pauseGroup, 0xf59e0b, 1.0, 23, 5.2);
  const pauseSensKnob = createSolidRect(pauseGroup, 0xfbbf24, 1.0, 24, 5.4);
  const pauseSensHit = createSolidRect(pauseGroup, 0x000000, 0.001, 25, 5.5);

  const pauseVolLabel = createPanel(pauseGroup, 22, 5);
  const pauseVolTrackBg = createSolidRect(pauseGroup, 0x1e293b, 1.0, 22, 5.1);
  const pauseVolTrackFill = createSolidRect(pauseGroup, 0xf59e0b, 1.0, 23, 5.2);
  const pauseVolKnob = createSolidRect(pauseGroup, 0xfbbf24, 1.0, 24, 5.4);
  const pauseVolHit = createSolidRect(pauseGroup, 0x000000, 0.001, 25, 5.5);

  const pauseBodyCamRow = createPanel(pauseGroup, 22, 5);
  const pauseTouchBtns = [
    createPanel(pauseGroup, 22, 5),
    createPanel(pauseGroup, 22, 5),
    createPanel(pauseGroup, 22, 5),
  ];
  const pauseResumeBtn = createPanel(pauseGroup, 22, 5);
  const pauseRestartBtn = createPanel(pauseGroup, 22, 5);
  const pauseTitleBtn = createPanel(pauseGroup, 22, 5);

  // =========================================================================
  // 5. DEBRIEF (VICTORY / GAMEOVER) MODAL THREE.JS GROUP
  // =========================================================================
  const debriefGroup = new THREE.Group();
  debriefGroup.visible = false;
  scene.add(debriefGroup);

  const debriefBackdrop = createSolidRect(debriefGroup, 0x000000, 0.82, 20, 4);
  const debriefCardPanel = createPanel(debriefGroup, 21, 4.5);
  const debriefNextBtn = createPanel(debriefGroup, 22, 5);
  const debriefReplayBtn = createPanel(debriefGroup, 22, 5);
  const debriefTitleBtn = createPanel(debriefGroup, 22, 5);

  // =========================================================================
  // 6. WEBGL CONTEXT ERROR BANNER
  // =========================================================================
  const errorBannerPanel = createPanel(scene, 30, 8);
  errorBannerPanel.mesh.visible = false;

  // =========================================================================
  // CANVAS DRAWING HELPERS
  // =========================================================================
  const drawBox = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    fill: string,
    stroke: string,
    lineWidth = 1,
  ) => {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, w, h);
    if (lineWidth > 0) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    }
  };

  const renderTitleGroup = (state: Ui3dState) => {
    titleScrimMesh.position.set(0, 0, -1);
    titleScrimMesh.scale.set(viewW, viewH, 1);

    const cfg = getLevelConfig(state.selectedLevel);
    const isMobile = viewW < 640;
    const padX = isMobile ? 16 : viewW < 1024 ? 28 : 40;
    const padY = isMobile ? 14 : 28;
    const panelW = Math.min(isMobile ? viewW - padX * 2 : 576, viewW - padX * 2);

    // 1. Top Header Bar
    drawPanelIfChanged(
      titleTopBar,
      `ttop|${cfg.id}|${state.hud.bestScore}|${isMobile}`,
      padX,
      padY,
      viewW - padX * 2,
      24,
      (ctx, w, h) => {
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(0, Math.round(h / 2) - 4, 8, 8);
        ctx.font = `500 ${isMobile ? 11 : 12}px "JetBrains Mono", monospace`;
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#cbd5e1';
        const leftTxt = `CAM-${String(cfg.number).padStart(2, '0')} · ${cfg.location.toUpperCase()}`;
        ctx.fillText(leftTxt, 16, h / 2);
        if (!isMobile) {
          const lw = ctx.measureText(leftTxt).width;
          ctx.fillStyle = '#64748b';
          ctx.fillText('/', 16 + lw + 10, h / 2);
          ctx.fillStyle = 'rgba(252, 211, 77, 0.92)';
          ctx.fillText(cfg.weatherLabel, 16 + lw + 26, h / 2);
        }
        if (state.hud.bestScore > 0) {
          const bestLabel = `BEST ${state.hud.bestScore}`;
          ctx.textAlign = 'right';
          ctx.fillStyle = '#cbd5e1';
          ctx.fillText('BEST ', w - ctx.measureText(String(state.hud.bestScore)).width, h / 2);
          ctx.fillStyle = '#fbbf24';
          ctx.font = `700 ${isMobile ? 11 : 12}px "JetBrains Mono", monospace`;
          ctx.fillText(String(state.hud.bestScore), w, h / 2);
          void bestLabel;
          ctx.textAlign = 'left';
        }
      },
    );

    // Vertical layout calculation so left-third block stays centered vertically
    const headerH = isMobile ? 108 : 112;
    const opCols = isMobile ? 3 : 4;
    const opRows = Math.ceil(LEVEL_ORDER.length / opCols);
    const opGap = isMobile ? 5 : 6;
    const opH = isMobile ? 38 : 42;
    const opGridH = opRows * opH + (opRows - 1) * opGap;
    const modeH = isMobile ? 44 : 52;
    const diffH = isMobile ? 36 : 40;
    const deployH = isMobile ? 44 : 48;
    const totalBlockH =
      headerH +
      10 +
      20 +
      opGridH +
      14 +
      20 +
      modeH +
      14 +
      20 +
      diffH +
      20 +
      12 +
      deployH;

    const topBound = padY + 30;
    const bottomBound = viewH - padY - 26;
    const startY = Math.max(
      topBound,
      Math.round(topBound + Math.max(0, (bottomBound - topBound - totalBlockH) * 0.5)),
    );
    let cy = startY;

    // 2. Emblem + Title + Briefing
    drawPanelIfChanged(
      titleHeaderPanel,
      `thead|${cfg.id}|${isMobile}`,
      padX,
      cy,
      panelW,
      headerH,
      (ctx, w) => {
        const emSize = isMobile ? 40 : 48;
        // Tactical reticle emblem
        ctx.save();
        const s = emSize / 64;
        ctx.scale(s, s);
        ctx.fillStyle = 'rgba(16, 20, 27, 0.92)';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.roundRect(4, 4, 56, 56, 6);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(32, 32, 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(32, 32, 8, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(32, 32, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(32, 10);
        ctx.lineTo(32, 18);
        ctx.moveTo(32, 46);
        ctx.lineTo(32, 54);
        ctx.moveTo(10, 32);
        ctx.lineTo(18, 32);
        ctx.moveTo(46, 32);
        ctx.lineTo(54, 32);
        ctx.stroke();
        ctx.restore();

        const tx = emSize + 14;
        ctx.font = `500 ${isMobile ? 10 : 12}px "JetBrains Mono", monospace`;
        ctx.fillStyle = '#fbbf24';
        ctx.textBaseline = 'top';
        ctx.fillText(`${cfg.codename} · ${cfg.climate.toUpperCase()}`, tx, 2);

        ctx.font = `700 ${isMobile ? 28 : 44}px "Barlow Condensed", sans-serif`;
        ctx.strokeStyle = 'rgba(7,9,12,0.88)';
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.strokeText('OPERATION IRON SIGHT', tx, isMobile ? 16 : 16);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('OPERATION IRON SIGHT', tx, isMobile ? 16 : 16);

        ctx.font = `400 ${isMobile ? 11.5 : 13.5}px "Plus Jakarta Sans", sans-serif`;
        ctx.fillStyle = '#cbd5e1';
        const lines = wrapLines(ctx, cfg.briefing, Math.min(w, 512));
        const bY = emSize + (isMobile ? 10 : 16);
        lines.slice(0, isMobile ? 3 : 2).forEach((ln, idx) => {
          ctx.fillText(ln, 0, bY + idx * (isMobile ? 15 : 18));
        });
      },
    );
    cy += headerH + 10;

    // 3. Theater of Operations Label + 11 Operation Cards
    drawPanelIfChanged(
      titleOpsLabelPanel,
      `topslbl|${cfg.number}`,
      padX,
      cy,
      panelW,
      18,
      (ctx, w) => {
        ctx.font = '500 12px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.textBaseline = 'middle';
        ctx.fillText('Theater of Operations (11 Climates)', 0, 9);
        ctx.textAlign = 'right';
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.fillStyle = '#fbbf24';
        ctx.fillText(`OP ${String(cfg.number).padStart(2, '0')} / ${LEVEL_ORDER.length}`, w, 9);
        ctx.textAlign = 'left';
      },
    );
    cy += 20;

    const opW = Math.floor((panelW - opGap * (opCols - 1)) / opCols);
    LEVEL_ORDER.forEach((id, idx) => {
      const col = idx % opCols;
      const row = Math.floor(idx / opCols);
      const bx = padX + col * (opW + opGap);
      const by = cy + row * (opH + opGap);
      const c = LEVELS[id];
      const active = state.selectedLevel === id;
      const hovered = hoveredId === `op:${id}`;
      const p = titleOpPanels[idx];
      drawPanelIfChanged(
        p,
        `op|${id}|${active}|${hovered}|${isMobile}`,
        bx,
        by,
        opW,
        opH,
        (ctx, w, h) => {
          drawBox(
            ctx,
            w,
            h,
            active ? '#1a222d' : 'rgba(14, 18, 24, 0.90)',
            active ? '#f59e0b' : hovered ? '#94a3b8' : 'rgba(51, 65, 85, 0.85)',
            active ? 1.5 : 1,
          );
          ctx.textBaseline = 'top';
          ctx.font = `${active ? 700 : 500} 9px "JetBrains Mono", monospace`;
          ctx.fillStyle = active ? '#fbbf24' : '#94a3b8';
          ctx.fillText(`OP ${String(c.number).padStart(2, '0')}`, 7, 5);
          ctx.textAlign = 'right';
          ctx.font = '500 9px "JetBrains Mono", monospace';
          ctx.fillStyle = '#94a3b8';
          ctx.fillText(c.biome.toUpperCase(), w - 7, 5);
          ctx.textAlign = 'left';

          ctx.font = `600 ${isMobile ? 11.5 : 13}px "Barlow Condensed", sans-serif`;
          ctx.fillStyle = active ? '#ffffff' : '#cbd5e1';
          ctx.fillText(c.name, 7, isMobile ? 19 : 20, w - 14);
        },
      );
      registerTarget(`op:${id}`, p.mesh, bx, by, opW, opH, {
        onClick: () => callbacks.onSelectLevel(id),
      });
    });
    cy += opGridH + 14;

    // 4. Operation Mode Label + 2 Mode Cards
    drawPanelIfChanged(
      titleModeLabelPanel,
      `tmodelbl`,
      padX,
      cy,
      panelW,
      18,
      (ctx) => {
        ctx.font = '500 12px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.textBaseline = 'middle';
        ctx.fillText('Operation Mode', 0, 9);
      },
    );
    cy += 20;

    const modeW = Math.floor((panelW - 8) / 2);
    const modes: Array<{ id: GameMode; title: string; sub: string }> = [
      { id: 'blackout', title: '3-Sector Raid', sub: 'Breach · Decrypt · Extract' },
      { id: 'surge', title: 'Hostile Surge', sub: 'Escalating Squad Waves' },
    ];
    modes.forEach((m, idx) => {
      const bx = padX + idx * (modeW + 8);
      const active = state.mode === m.id;
      const hovered = hoveredId === `mode:${m.id}`;
      const p = titleModePanels[idx];
      drawPanelIfChanged(
        p,
        `mode|${m.id}|${active}|${hovered}|${isMobile}`,
        bx,
        cy,
        modeW,
        modeH,
        (ctx, w, h) => {
          drawBox(
            ctx,
            w,
            h,
            active ? '#171d26' : 'rgba(14, 18, 24, 0.90)',
            active ? '#f59e0b' : hovered ? '#94a3b8' : 'rgba(51, 65, 85, 0.85)',
            active ? 1.5 : 1,
          );
          ctx.textBaseline = 'top';
          ctx.font = `600 ${isMobile ? 14 : 16}px "Barlow Condensed", sans-serif`;
          ctx.fillStyle = active ? '#ffffff' : '#cbd5e1';
          ctx.fillText(m.title, 12, isMobile ? 6 : 8);
          ctx.font = '400 11px "Plus Jakarta Sans", sans-serif';
          ctx.fillStyle = '#94a3b8';
          ctx.fillText(m.sub, 12, isMobile ? 24 : 29);
        },
      );
      registerTarget(`mode:${m.id}`, p.mesh, bx, cy, modeW, modeH, {
        onClick: () => callbacks.onSelectMode(m.id),
      });
    });
    cy += modeH + 14;

    // 5. Difficulty Selector + Summary
    drawPanelIfChanged(
      titleDiffLabelPanel,
      `tdifflbl`,
      padX,
      cy,
      panelW,
      18,
      (ctx) => {
        ctx.font = '500 12px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.textBaseline = 'middle';
        ctx.fillText('Rules of Engagement', 0, 9);
      },
    );
    cy += 20;

    const diffOrder: DifficultyLevel[] = ['standard', 'veteran', 'hardcore'];
    const diffW = Math.floor((panelW - 16) / 3);
    diffOrder.forEach((d, idx) => {
      const bx = padX + idx * (diffW + 8);
      const dCfg = DIFFICULTIES[d];
      const active = state.difficulty === d;
      const hovered = hoveredId === `diff:${d}`;
      const p = titleDiffPanels[idx];
      drawPanelIfChanged(
        p,
        `diff|${d}|${active}|${hovered}|${isMobile}`,
        bx,
        cy,
        diffW,
        diffH,
        (ctx, w, h) => {
          drawBox(
            ctx,
            w,
            h,
            active ? '#1c232e' : 'rgba(14, 18, 24, 0.90)',
            active ? '#f59e0b' : hovered ? '#94a3b8' : 'rgba(51, 65, 85, 0.85)',
            active ? 1.5 : 1,
          );
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'center';
          ctx.font = `${active ? 600 : 500} ${isMobile ? 12 : 13.5}px "Plus Jakarta Sans", sans-serif`;
          ctx.fillStyle = active ? '#fcd34d' : '#cbd5e1';
          ctx.fillText(dCfg.label, w / 2, h / 2);
          ctx.textAlign = 'left';
        },
      );
      registerTarget(`diff:${d}`, p.mesh, bx, cy, diffW, diffH, {
        onClick: () => callbacks.onSelectDifficulty(d),
      });
    });
    cy += diffH + 5;

    drawPanelIfChanged(
      titleDiffSummaryPanel,
      `tdiffsum|${state.difficulty}`,
      padX,
      cy,
      panelW,
      16,
      (ctx) => {
        ctx.font = '400 11px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.textBaseline = 'middle';
        ctx.fillText(DIFFICULTIES[state.difficulty].summary, 0, 8);
      },
    );
    cy += 24;

    // 6. Primary Deploy CTA Button
    const deployLabel = `DEPLOY OP ${String(cfg.number).padStart(2, '0')} · ${cfg.name.toUpperCase()}`;
    const deployW = isMobile ? panelW : Math.min(panelW, Math.max(290, deployLabel.length * 10.5 + 72));
    const deployHovered = hoveredId === 'deploy';
    drawPanelIfChanged(
      titleDeployBtn,
      `tdeploy|${cfg.id}|${deployHovered}`,
      padX,
      cy,
      deployW,
      deployH,
      (ctx, w, h) => {
        ctx.fillStyle = deployHovered ? '#fbbf24' : '#f59e0b';
        ctx.fillRect(0, 0, w, h);
        ctx.font = '700 20px "Barlow Condensed", sans-serif';
        ctx.fillStyle = '#020617';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(deployLabel, w / 2, h / 2 + 1);
        ctx.textAlign = 'left';
      },
    );
    registerTarget('deploy', titleDeployBtn.mesh, padX, cy, deployW, deployH, {
      onClick: () => callbacks.onDeploy(),
    });

    // 7. Bottom Control Hint Line
    const hintText = isMobile
      ? state.isTouchDevice
        ? 'Left Stick Move · Drag Right Aim · Touch Fire / ADS / Lean / Reload'
        : 'Tap Op · WASD Move · Mouse Aim/Fire · 1-7 Weapons · P Pause'
      : state.isTouchDevice
        ? 'Left Stick Move · Drag Right Side Aim · Touch Fire / ADS / Lean / Reload / Frag · Tap [1-7] Switch Weapon'
        : 'WASD Move · Shift Sprint · C Crouch · Q/E Lean · LMB Fire · RMB Aim/Scope · R Reload · 1-7 Weapons · F Light · G Frag · P Pause';
    drawPanelIfChanged(
      titleHintPanel,
      `thint|${state.isTouchDevice}|${isMobile}`,
      padX,
      viewH - padY - 18,
      viewW - padX * 2,
      18,
      (ctx, w) => {
        ctx.font = `400 ${isMobile ? 9.5 : 12}px "JetBrains Mono", monospace`;
        ctx.fillStyle = '#cbd5e1';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.92)';
        ctx.shadowBlur = 4;
        ctx.fillText(hintText, 0, 9, w);
        ctx.shadowBlur = 0;
      },
    );
  };

  // =========================================================================
  // TACTICAL HUD RENDERER (100% Three.js)
  // =========================================================================
  const renderHudGroup = (dt: number, state: Ui3dState) => {
    const { hud, showTouchControls } = state;
    const isMobile = viewW < 640;
    const pad = isMobile ? 12 : viewW < 1024 ? 16 : 24;

    // Ghost HP trailing bar logic
    if (hud.hp < prevHp) {
      ghostHoldTimer = 0.36;
    }
    prevHp = hud.hp;
    if (ghostHoldTimer > 0) {
      ghostHoldTimer = Math.max(0, ghostHoldTimer - dt);
    } else {
      ghostHp = THREE.MathUtils.damp(ghostHp, hud.hp, 7, dt);
    }
    if (hud.hp > ghostHp) ghostHp = hud.hp;

    // 1. Top-Left Body-Cam Telemetry & Objective Panel
    const tlW = isMobile ? Math.min(225, viewW - pad * 2 - 140) : Math.min(384, viewW * 0.34);
    const tlH = isMobile ? 66 : 86;
    drawPanelIfChanged(
      hudTopLeftPanel,
      `htl|${hud.levelNumber}|${hud.levelName}|${hud.bodyCamTimecode}|${hud.weatherLabel}|${hud.objectiveTitle}|${hud.objectiveSub}|${hud.objectiveDist}|${hud.killStreak}|${isMobile}`,
      pad,
      pad,
      tlW,
      tlH,
      (ctx, w, h) => {
        drawBox(ctx, w, h, 'rgba(11, 14, 18, 0.78)', 'rgba(255, 255, 255, 0.12)', 1);
        const px = isMobile ? 10 : 14;
        const py = isMobile ? 8 : 10;

        // Red REC square
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(px, py + 2, 8, 8);

        ctx.textBaseline = 'top';
        ctx.font = `500 ${isMobile ? 10 : 11}px "JetBrains Mono", monospace`;
        ctx.fillStyle = '#cbd5e1';
        const opTxt = `OP ${String(hud.levelNumber).padStart(2, '0')} · ${hud.levelName.toUpperCase()}`;
        ctx.fillText(opTxt, px + 14, py, w - px * 2 - (hud.killStreak >= 2 ? 42 : 16));

        if (hud.killStreak >= 2) {
          ctx.textAlign = 'right';
          ctx.font = `700 ${isMobile ? 10 : 11}px "JetBrains Mono", monospace`;
          ctx.fillStyle = '#fbbf24';
          ctx.fillText(`x${hud.killStreak}`, w - px, py);
          ctx.textAlign = 'left';
        }

        let curY = py + (isMobile ? 16 : 16);
        if (!isMobile) {
          ctx.font = '400 10px "JetBrains Mono", monospace';
          ctx.fillStyle = '#94a3b8';
          ctx.fillText(`${hud.bodyCamTimecode} · ${hud.weatherLabel}`, px, curY, w - px * 2);
          curY += 15;
        }

        ctx.font = `700 ${isMobile ? 14 : 18}px "Barlow Condensed", sans-serif`;
        ctx.fillStyle = '#fbbf24';
        ctx.fillText(hud.objectiveTitle, px, curY, w - px * 2);
        curY += isMobile ? 18 : 22;

        ctx.font = `600 ${isMobile ? 11 : 12}px "JetBrains Mono", monospace`;
        const distTxt = `· ${hud.objectiveDist}m`;
        const distW = ctx.measureText(distTxt).width;
        ctx.textAlign = 'right';
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(distTxt, w - px, curY);
        ctx.textAlign = 'left';

        ctx.font = `400 ${isMobile ? 11 : 12}px "Plus Jakarta Sans", sans-serif`;
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(hud.objectiveSub, px, curY, w - px * 2 - distW - 8);
      },
    );

    // 2. Top-Right Score & Square Utility Buttons (Mute, Restart, Pause)
    const btnSz = 40;
    const btnGap = isMobile ? 6 : 8;
    const trRight = viewW - pad;
    const pauseX = trRight - btnSz;
    const restartX = pauseX - btnGap - btnSz;
    const muteX = restartX - btnGap - btnSz;

    if (!isMobile) {
      const scoreW = 86;
      const scoreX = muteX - btnGap - 4 - scoreW;
      drawPanelIfChanged(
        hudScorePanel,
        `hscore|${hud.score}`,
        scoreX,
        pad,
        scoreW,
        btnSz + 2,
        (ctx, w, h) => {
          drawBox(ctx, w, h, 'rgba(11, 14, 18, 0.78)', 'rgba(255, 255, 255, 0.12)', 1);
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          ctx.font = '500 10px "JetBrains Mono", monospace';
          ctx.fillStyle = '#94a3b8';
          ctx.fillText('SCORE', w - 10, 5);
          ctx.font = '700 16px "JetBrains Mono", monospace';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(String(hud.score), w - 10, 18);
          ctx.textAlign = 'left';
        },
      );
      hudScorePanel.mesh.visible = true;
    } else {
      hudScorePanel.mesh.visible = false;
    }

    const drawUtilBtn = (
      panel: CanvasPanel,
      id: string,
      x: number,
      key: string,
      drawIcon: (ctx: CanvasRenderingContext2D) => void,
      onClick: () => void,
    ) => {
      const hov = hoveredId === id;
      drawPanelIfChanged(panel, `${key}|${hov}`, x, pad, btnSz, btnSz, (ctx, w, h) => {
        drawBox(
          ctx,
          w,
          h,
          'rgba(11, 14, 18, 0.85)',
          hov ? '#fbbf24' : 'rgba(255, 255, 255, 0.16)',
          1,
        );
        ctx.save();
        ctx.translate(12, 12);
        ctx.scale(16 / 24, 16 / 24);
        ctx.strokeStyle = '#e2e8f0';
        ctx.fillStyle = '#e2e8f0';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        drawIcon(ctx);
        ctx.restore();
      });
      registerTarget(id, panel.mesh, x, pad, btnSz, btnSz, { onClick });
    };

    drawUtilBtn(
      hudMuteBtn,
      'hud:mute',
      muteX,
      `hmute|${hud.muted}`,
      (ctx) => {
        ctx.beginPath();
        ctx.moveTo(11, 5);
        ctx.lineTo(6, 9);
        ctx.lineTo(2, 9);
        ctx.lineTo(2, 15);
        ctx.lineTo(6, 15);
        ctx.lineTo(11, 19);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        if (hud.muted) {
          ctx.moveTo(22, 9);
          ctx.lineTo(16, 15);
          ctx.moveTo(16, 9);
          ctx.lineTo(22, 15);
        } else {
          ctx.arc(11, 12, 5.5, -0.7, 0.7);
          ctx.moveTo(18.5, 5.5);
          ctx.arc(11, 12, 9.5, -0.7, 0.7);
        }
        ctx.stroke();
      },
      () => callbacks.onToggleMute(),
    );

    drawUtilBtn(
      hudRestartBtn,
      'hud:restart',
      restartX,
      'hrestart',
      (ctx) => {
        ctx.beginPath();
        ctx.arc(12, 12, 8.5, Math.PI, Math.PI * 2.75);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(3, 3);
        ctx.lineTo(3, 9);
        ctx.lineTo(9, 9);
        ctx.stroke();
      },
      () => callbacks.onRestart(),
    );

    drawUtilBtn(
      hudPauseBtn,
      'hud:pause',
      pauseX,
      'hpause',
      (ctx) => {
        ctx.fillRect(6, 5, 4, 14);
        ctx.fillRect(14, 5, 4, 14);
      },
      () => callbacks.onPause(),
    );

    // 3. Boss Health Strip
    if (hud.bossName) {
      hudBossPanel.mesh.visible = true;
      hudBossBarBg.mesh.visible = true;
      hudBossBarFill.mesh.visible = true;
      const bw = isMobile ? viewW - pad * 2 : Math.min(310, viewW * 0.3);
      const bx = isMobile ? pad : (viewW - bw) * 0.5;
      const by = isMobile ? pad + tlH + 8 : pad;
      const bh = isMobile ? 42 : 48;
      drawPanelIfChanged(
        hudBossPanel,
        `hboss|${hud.bossName}|${hud.bossHp}|${hud.bossMaxHp}|${isMobile}`,
        bx,
        by,
        bw,
        bh,
        (ctx, w, h) => {
          drawBox(ctx, w, h, 'rgba(11, 14, 18, 0.84)', 'rgba(239, 68, 68, 0.45)', 1);
          ctx.textBaseline = 'top';
          ctx.font = `700 ${isMobile ? 11 : 12}px "JetBrains Mono", monospace`;
          ctx.fillStyle = '#f87171';
          ctx.fillText(hud.bossName!, 14, 8);
          ctx.textAlign = 'right';
          ctx.font = `500 ${isMobile ? 11 : 12}px "JetBrains Mono", monospace`;
          ctx.fillStyle = '#e2e8f0';
          ctx.fillText(`${hud.bossHp} / ${hud.bossMaxHp}`, w - 14, 8);
          ctx.textAlign = 'left';
        },
      );
      const barW = bw - 28;
      const barY = by + bh - 15;
      const frac = Math.max(0, Math.min(1, hud.bossHp / Math.max(1, hud.bossMaxHp)));
      setBoxTopLeft(hudBossBarBg.mesh, bx + 14, barY, barW, 7);
      setBoxTopLeft(hudBossBarFill.mesh, bx + 14, barY, Math.max(0.01, barW * frac), 7);
    } else {
      hudBossPanel.mesh.visible = false;
      hudBossBarBg.mesh.visible = false;
      hudBossBarFill.mesh.visible = false;
    }

    // 4. M2010 Optical Range Readout
    if (hud.scopedAds) {
      hudScopeReadout.mesh.visible = true;
      const sw = 280;
      const sx = (viewW - sw) * 0.5;
      const sy = viewH - 112;
      drawPanelIfChanged(
        hudScopeReadout,
        `hscope|${hud.objectiveDist}`,
        sx,
        sy,
        sw,
        22,
        (ctx, w, h) => {
          ctx.font = '500 11px "JetBrains Mono", monospace';
          ctx.fillStyle = 'rgba(203, 213, 225, 0.85)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`M2010 · 8.0X MIL-DOT · ${hud.objectiveDist}M`, w / 2, h / 2);
          ctx.textAlign = 'left';
        },
      );
    } else {
      hudScopeReadout.mesh.visible = false;
    }

    // 5. Center Context Interaction / Decryption Prompt
    if (hud.promptText) {
      hudPromptPanel.mesh.visible = true;
      const hasProg = hud.interactProgress > 0;
      const pw = Math.max(210, hud.promptText.length * 8 + 36);
      const ph = hasProg ? 46 : 32;
      const px = (viewW - pw) * 0.5;
      const py = viewH * 0.5 + 48;
      drawPanelIfChanged(
        hudPromptPanel,
        `hprompt|${hud.promptText}|${hasProg}`,
        px,
        py,
        pw,
        ph,
        (ctx, w, h) => {
          drawBox(ctx, w, h, 'rgba(11, 14, 18, 0.88)', 'rgba(245, 158, 11, 0.6)', 1);
          ctx.font = '600 12px "JetBrains Mono", monospace';
          ctx.fillStyle = '#fcd34d';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(hud.promptText!, w / 2, 8);
          ctx.textAlign = 'left';
        },
      );
      if (hasProg) {
        hudPromptBarBg.mesh.visible = true;
        hudPromptBarFill.mesh.visible = true;
        const bw = pw - 32;
        setBoxTopLeft(hudPromptBarBg.mesh, px + 16, py + 30, bw, 6);
        setBoxTopLeft(
          hudPromptBarFill.mesh,
          px + 16,
          py + 30,
          Math.max(0.01, bw * Math.min(1, hud.interactProgress)),
          6,
        );
      } else {
        hudPromptBarBg.mesh.visible = false;
        hudPromptBarFill.mesh.visible = false;
      }
    } else {
      hudPromptPanel.mesh.visible = false;
      hudPromptBarBg.mesh.visible = false;
      hudPromptBarFill.mesh.visible = false;
    }

    // 6. Bottom-Left Vitality Panel & Bottom-Right Arsenal Panel
    const activeSpec = WEAPONS[hud.weaponId];
    const activeRuntime = hud.weapons[hud.weaponId];

    const bottomLift = showTouchControls ? (isMobile ? 198 : 16) : 0;
    const blW = showTouchControls
      ? isMobile
        ? Math.floor((viewW - pad * 2 - 8) * 0.44)
        : 175
      : isMobile
        ? Math.floor((viewW - pad * 2 - 8) * 0.44)
        : 235;
    const blH = isMobile ? 96 : 104;
    const blX = showTouchControls && !isMobile ? pad + 144 : pad;
    const blY = viewH - pad - bottomLift - blH;

    const stanceRight =
      Math.abs(hud.lean) > 0.25 ? (hud.lean < 0 ? 'LEAN L' : 'LEAN R') : 'STM INF';
    const stanceLeft = hud.crouch ? 'CROUCH' : 'STAND';

    drawPanelIfChanged(
      hudVitalPanel,
      `hvital|${hud.hp}|${hud.armor}|${stanceLeft}|${stanceRight}|${isMobile}`,
      blX,
      blY,
      blW,
      blH,
      (ctx, w, h) => {
        drawBox(ctx, w, h, 'rgba(11, 14, 18, 0.78)', 'rgba(255, 255, 255, 0.12)', 1);
        const px = isMobile ? 10 : 16;
        const py = isMobile ? 8 : 11;

        ctx.textBaseline = 'alphabetic';
        ctx.font = `700 ${isMobile ? 22 : 30}px "JetBrains Mono", monospace`;
        ctx.fillStyle = '#ffffff';
        const hpStr = String(Math.max(0, Math.round(hud.hp)));
        ctx.fillText(hpStr, px, py + (isMobile ? 20 : 27));
        const hpNumW = ctx.measureText(hpStr).width;
        ctx.font = `500 ${isMobile ? 10 : 11}px "JetBrains Mono", monospace`;
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('HP', px + hpNumW + 5, py + (isMobile ? 20 : 27));

        ctx.textAlign = 'right';
        ctx.font = `500 ${isMobile ? 10 : 11}px "JetBrains Mono", monospace`;
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('ARM', w - px, py + (isMobile ? 20 : 27));
        const armLblW = ctx.measureText('ARM').width;
        ctx.font = `700 ${isMobile ? 14 : 18}px "JetBrains Mono", monospace`;
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(String(Math.max(0, Math.round(hud.armor))), w - px - armLblW - 4, py + (isMobile ? 20 : 27));
        ctx.textAlign = 'left';

        ctx.font = `500 ${isMobile ? 10 : 11}px "JetBrains Mono", monospace`;
        ctx.fillStyle = '#cbd5e1';
        ctx.textBaseline = 'bottom';
        ctx.fillText(stanceLeft, px, h - (isMobile ? 8 : 11));
        ctx.textAlign = 'right';
        ctx.fillText(stanceRight, w - px, h - (isMobile ? 8 : 11));
        ctx.textAlign = 'left';
      },
    );

    const vBarPad = isMobile ? 10 : 16;
    const vBarW = blW - vBarPad * 2;
    const hpBarY = blY + (isMobile ? 38 : 48);
    const armBarY = hpBarY + 12;
    const hpPct = Math.max(0, Math.min(1, hud.hp / Math.max(1, hud.maxHp)));
    const ghostPct = Math.max(hpPct, Math.min(1, ghostHp / Math.max(1, hud.maxHp)));
    const armPct = Math.max(0, Math.min(1, hud.armor / Math.max(1, hud.maxArmor)));

    setBoxTopLeft(hudHpBarBg.mesh, blX + vBarPad, hpBarY, vBarW, 8);
    setBoxTopLeft(hudGhostBarFill.mesh, blX + vBarPad, hpBarY, Math.max(0.01, vBarW * ghostPct), 8);
    hudHpBarFill.mat.color.setHex(hud.hp < 35 ? 0xef4444 : 0x34d399);
    setBoxTopLeft(hudHpBarFill.mesh, blX + vBarPad, hpBarY, Math.max(0.01, vBarW * hpPct), 8);
    setBoxTopLeft(hudArmBarBg.mesh, blX + vBarPad, armBarY, vBarW, 6);
    setBoxTopLeft(hudArmBarFill.mesh, blX + vBarPad, armBarY, Math.max(0.01, vBarW * armPct), 6);

    // 7. Bottom-Right 7-Weapon Arsenal Strip + Magazine Telemetry
    const brW = showTouchControls
      ? isMobile
        ? Math.floor((viewW - pad * 2 - 8) * 0.56)
        : Math.min(340, viewW - pad * 2 - 360)
      : isMobile
        ? Math.floor((viewW - pad * 2 - 8) * 0.56)
        : Math.min(454, viewW * 0.38);
    const brH = isMobile ? 114 : 122;
    const brX = showTouchControls && !isMobile ? viewW - pad - 200 - brW : viewW - pad - brW;
    const brY = viewH - pad - bottomLift - brH;

    const slotCols = isMobile ? 4 : 7;
    const slotPad = isMobile ? 8 : 14;
    const slotGap = 4;
    const slotAreaW = brW - slotPad * 2;
    const slotW = Math.floor((slotAreaW - slotGap * (slotCols - 1)) / slotCols);
    const slotH = isMobile ? 18 : 20;
    const slotRows = Math.ceil(WEAPON_ORDER.length / slotCols);

    drawPanelIfChanged(
      hudArsenalBgPanel,
      `hars|${hud.weaponId}|${activeRuntime.mag}|${activeRuntime.reserve}|${hud.reloading}|${hud.flashlightOn}|${hud.grenades}|${showTouchControls}|${isMobile}`,
      brX,
      brY,
      brW,
      brH,
      (ctx, w, h) => {
        drawBox(ctx, w, h, 'rgba(11, 14, 18, 0.78)', 'rgba(255, 255, 255, 0.12)', 1);
        const px = slotPad;
        const ammoY = 10 + slotRows * (slotH + slotGap) + (isMobile ? 22 : 28);

        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.font = `500 ${isMobile ? 12 : 16}px "JetBrains Mono", monospace`;
        ctx.fillStyle = '#94a3b8';
        const resTxt = `/ ${activeRuntime.reserve}`;
        ctx.fillText(resTxt, w - px, ammoY);
        const resW = ctx.measureText(resTxt).width;

        const lowMag = activeRuntime.mag <= Math.ceil(activeSpec.magSize * 0.25);
        ctx.font = `700 ${isMobile ? 22 : 30}px "JetBrains Mono", monospace`;
        ctx.fillStyle = lowMag ? '#f87171' : '#ffffff';
        ctx.fillText(String(activeRuntime.mag), w - px - resW - 6, ammoY);

        if (!hud.reloading) {
          ctx.font = `400 ${isMobile ? 10 : 11}px "JetBrains Mono", monospace`;
          ctx.fillStyle = '#cbd5e1';
          ctx.fillText(`${activeSpec.name} · ${activeSpec.role}`, w - px, ammoY + 17, w - px * 2);
        }

        if (!showTouchControls && !isMobile) {
          ctx.font = '500 11px "JetBrains Mono", monospace';
          const fragTxt = `[G] FRAG x${hud.grenades}`;
          ctx.fillStyle = '#cbd5e1';
          ctx.fillText(fragTxt, w - px, h - 11);
          const fragW = ctx.measureText(fragTxt).width;
          ctx.fillStyle = '#64748b';
          ctx.fillText('·', w - px - fragW - 8, h - 11);
          ctx.fillStyle = hud.flashlightOn ? '#fcd34d' : '#64748b';
          ctx.fillText(
            `[F] LIGHT ${hud.flashlightOn ? 'ON' : 'OFF'}`,
            w - px - fragW - 20,
            h - 11,
          );
        }
        ctx.textAlign = 'left';
      },
    );

    // 7 Interactive Weapon Slot Buttons in Three.js
    WEAPON_ORDER.forEach((wId, idx) => {
      const spec = WEAPONS[wId];
      const col = idx % slotCols;
      const row = Math.floor(idx / slotCols);
      const sx = brX + slotPad + col * (slotW + slotGap);
      const sy = brY + 9 + row * (slotH + slotGap);
      const isSel = hud.weaponId === wId;
      const hovered = hoveredId === `wpn:${wId}`;
      const p = hudWeaponSlotPanels[idx];
      drawPanelIfChanged(
        p,
        `wpn|${wId}|${isSel}|${hovered}|${isMobile}`,
        sx,
        sy,
        slotW,
        slotH,
        (ctx, w, h) => {
          drawBox(
            ctx,
            w,
            h,
            isSel ? 'rgba(245, 158, 11, 0.22)' : 'rgba(15, 23, 42, 0.35)',
            isSel ? '#fbbf24' : hovered ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.12)',
            1,
          );
          ctx.font = `${isSel ? 700 : 500} ${isMobile ? 9 : 10}px "JetBrains Mono", monospace`;
          ctx.fillStyle = isSel ? '#fcd34d' : '#94a3b8';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`[${spec.slot}] ${spec.shortName}`, w / 2, h / 2, w - 6);
          ctx.textAlign = 'left';
        },
      );
      registerTarget(`wpn:${wId}`, p.mesh, sx, sy, slotW, slotH, {
        onClick: () => callbacks.onSelectWeapon(wId),
      });
    });

    if (hud.reloading) {
      hudReloadBarBg.mesh.visible = true;
      hudReloadBarFill.mesh.visible = true;
      const rbw = brW - slotPad * 2;
      const rby = brY + 10 + slotRows * (slotH + slotGap) + (isMobile ? 32 : 38);
      setBoxTopLeft(hudReloadBarBg.mesh, brX + slotPad, rby, rbw, 6);
      setBoxTopLeft(
        hudReloadBarFill.mesh,
        brX + slotPad,
        rby,
        Math.max(0.01, rbw * Math.min(1, hud.reloadProgress)),
        6,
      );
    } else {
      hudReloadBarBg.mesh.visible = false;
      hudReloadBarFill.mesh.visible = false;
    }
  };

  // =========================================================================
  // THREE.JS MOBILE TOUCH CONTROLS RENDERER
  // =========================================================================
  const drawTouchButton = (
    panel: CanvasPanel,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    active: boolean,
    keyPrefix: string,
  ) => {
    drawPanelIfChanged(panel, `${keyPrefix}|${active}|${label}`, x, y, w, h, (ctx, bw, bh) => {
      drawBox(
        ctx,
        bw,
        bh,
        active ? '#f59e0b' : 'rgba(11, 14, 18, 0.78)',
        active ? '#fbbf24' : 'rgba(255, 255, 255, 0.22)',
        1.5,
      );
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.fillStyle = active ? '#020617' : '#e2e8f0';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bw / 2, bh / 2);
      ctx.textAlign = 'left';
    });
  };

  const renderTouchGroup = (state: Ui3dState) => {
    const { hud } = state;
    // Right-side look surface
    const lx = viewW * 0.42;
    const ly = 64;
    const lw = viewW - lx;
    const lh = viewH - ly;
    lookZoneRect = { x: lx, y: ly, w: lw, h: lh };
    setBoxTopLeft(touchLookZone.mesh, lx, ly, lw, lh);

    // Joystick center at (left: 16..132, bottom: 20..136)
    const jx = 16 + 58;
    const jy = viewH - 20 - 58;
    joyCenter = { x: jx, y: jy };
    joyZoneRect = { x: 16, y: viewH - 20 - 116, w: 116, h: 116 };

    const ox = jx - viewW * 0.5;
    const oy = viewH * 0.5 - jy;
    joyBaseBg.position.set(ox, oy, 1);
    joyBaseBorder.position.set(ox, oy, 1.1);
    joyInnerRing.position.set(ox, oy, 1.1);
    joyKnobMesh.position.set(ox + joyKnob.x, oy - joyKnob.y, 1.4);
    joyKnobRing.position.set(ox + joyKnob.x, oy - joyKnob.y, 1.5);
    joyKnobMat.color.setHex(joyKnob.active ? 0xf59e0b : 0xe2e8f0);
    joyKnobMat.opacity = joyKnob.active ? 0.78 : 0.30;
    joyKnobRingMat.color.setHex(joyKnob.active ? 0xfcd34d : 0xffffff);

    if (joyKnob.sprint) {
      joySprintPanel.mesh.visible = true;
      drawPanelIfChanged(joySprintPanel, 'jsprint', jx - 30, jy - 80, 60, 16, (ctx, w, h) => {
        ctx.font = '700 10px "JetBrains Mono", monospace';
        ctx.fillStyle = '#fbbf24';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SPRINT', w / 2, h / 2);
        ctx.textAlign = 'left';
      });
    } else {
      joySprintPanel.mesh.visible = false;
    }

    // Left lean/light bar above joystick
    const barY = viewH - 148 - 44;
    drawTouchButton(touchLeanLBtn, 16, barY, 44, 44, 'L', hud.lean < -0.25, 'tll');
    registerTarget('touch:leanL', touchLeanLBtn.mesh, 16, barY, 44, 44, {
      onClick: () => callbacks.onToggleTouchLean(-1),
    });

    drawTouchButton(touchLeanRBtn, 68, barY, 44, 44, 'R', hud.lean > 0.25, 'tlr');
    registerTarget('touch:leanR', touchLeanRBtn.mesh, 68, barY, 44, 44, {
      onClick: () => callbacks.onToggleTouchLean(1),
    });

    drawTouchButton(touchLightBtn, 120, barY, 44, 44, 'LIT', hud.flashlightOn, 'tlit');
    registerTarget('touch:light', touchLightBtn.mesh, 120, barY, 44, 44, {
      onClick: () => callbacks.onTouchAction('flashlight'),
    });

    // Right action cluster
    const rPad = 16;
    const fireSz = 68;
    const fireX = viewW - rPad - fireSz;
    const fireY = viewH - 20 - fireSz;
    fireZoneRect = { x: fireX, y: fireY, w: fireSz, h: fireSz };

    drawPanelIfChanged(touchFireBtn, 'tfire', fireX, fireY, fireSz, fireSz, (ctx, w, h) => {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(245, 158, 11, 0.90)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fcd34d';
      ctx.stroke();
      ctx.font = '700 15px "Barlow Condensed", sans-serif';
      ctx.fillStyle = '#020617';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FIRE', w / 2, h / 2 + 1);
      ctx.textAlign = 'left';
    });

    const adsX = fireX - 10 - 48;
    const adsY = viewH - 20 - 48;
    drawTouchButton(touchAdsBtn, adsX, adsY, 48, 48, 'ADS', hud.ads, 'tads');
    registerTarget('touch:ads', touchAdsBtn.mesh, adsX, adsY, 48, 48, {
      onClick: () => callbacks.onToggleTouchAds(),
    });

    const rldX = adsX - 10 - 48;
    drawTouchButton(touchReloadBtn, rldX, adsY, 48, 48, 'RLD', false, 'trld');
    registerTarget('touch:rld', touchReloadBtn.mesh, rldX, adsY, 48, 48, {
      onClick: () => callbacks.onTouchAction('reload'),
    });

    const topRowY = fireY - 10 - 44;
    const jumpX = viewW - rPad - 44;
    const crchX = jumpX - 8 - 44;
    const fragX = crchX - 8 - 44;
    drawTouchButton(touchFragBtn, fragX, topRowY, 44, 44, 'FRAG', false, 'tfrag');
    registerTarget('touch:frag', touchFragBtn.mesh, fragX, topRowY, 44, 44, {
      onClick: () => callbacks.onTouchAction('grenade'),
    });

    drawTouchButton(touchCrouchBtn, crchX, topRowY, 44, 44, 'CRCH', hud.crouch, 'tcrch');
    registerTarget('touch:crch', touchCrouchBtn.mesh, crchX, topRowY, 44, 44, {
      onClick: () => callbacks.onTouchAction('crouch'),
    });

    drawTouchButton(touchJumpBtn, jumpX, topRowY, 44, 44, 'JUMP', false, 'tjump');
    registerTarget('touch:jump', touchJumpBtn.mesh, jumpX, topRowY, 44, 44, {
      onClick: () => callbacks.onTouchAction('jump'),
    });

    // Context Hold Decrypt Button
    if (hud.promptText && hud.promptText.includes('Decrypt')) {
      touchDecryptBtn.mesh.visible = true;
      const dw = 152;
      const dh = 44;
      const dx = (viewW - dw) * 0.5;
      const dy = viewH - 180 - dh;
      decryptZoneRect = { x: dx, y: dy, w: dw, h: dh };
      drawPanelIfChanged(touchDecryptBtn, 'tdec', dx, dy, dw, dh, (ctx, w, h) => {
        drawBox(ctx, w, h, '#10b981', '#6ee7b7', 1.5);
        ctx.font = '700 16px "Barlow Condensed", sans-serif';
        ctx.fillStyle = '#020617';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('HOLD DECRYPT', w / 2, h / 2);
        ctx.textAlign = 'left';
      });
    } else {
      touchDecryptBtn.mesh.visible = false;
      decryptZoneRect = { x: 0, y: 0, w: 0, h: 0 };
    }
  };

  // =========================================================================
  // PAUSE MODAL RENDERER (100% Three.js with Interactive Sliders)
  // =========================================================================
  const renderPauseGroup = (state: Ui3dState) => {
    setBoxTopLeft(pauseBackdrop.mesh, 0, 0, viewW, viewH);

    const mw = Math.min(448, viewW - 32);
    const mh = 468;
    const mx = Math.round((viewW - mw) * 0.5);
    const my = Math.round((viewH - mh) * 0.5);

    drawPanelIfChanged(pauseCardPanel, `pcard|${mw}`, mx, my, mw, mh, (ctx, w, h) => {
      drawBox(ctx, w, h, '#0e1218', '#334155', 1.5);
      ctx.textBaseline = 'top';
      ctx.font = '500 12px "JetBrains Mono", monospace';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('SIMULATION SUSPENDED', 24, 22);
      ctx.font = '700 30px "Barlow Condensed", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('TACTICAL PAUSE', 24, 40);

      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(24, 82);
      ctx.lineTo(w - 24, 82);
      ctx.moveTo(24, 316);
      ctx.lineTo(w - 24, 316);
      ctx.stroke();

      ctx.font = '500 12px "JetBrains Mono", monospace';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText('Touch Controls Overlay', 24, 244);
    });

    const innerX = mx + 24;
    const innerW = mw - 48;

    // Slider 1: Sensitivity
    const s1Y = my + 96;
    const sensNorm = Math.max(0, Math.min(1, (state.settings.sensitivity - 0.3) / (2.2 - 0.3)));
    drawPanelIfChanged(
      pauseSensLabel,
      `psens|${state.settings.sensitivity.toFixed(2)}`,
      innerX,
      s1Y,
      innerW,
      18,
      (ctx, w) => {
        ctx.font = '500 12px "JetBrains Mono", monospace';
        ctx.fillStyle = '#cbd5e1';
        ctx.textBaseline = 'top';
        ctx.fillText('Mouse Sensitivity', 0, 0);
        ctx.textAlign = 'right';
        ctx.fillText(`${state.settings.sensitivity.toFixed(2)}x`, w, 0);
        ctx.textAlign = 'left';
      },
    );
    setBoxTopLeft(pauseSensTrackBg.mesh, innerX, s1Y + 24, innerW, 6);
    setBoxTopLeft(pauseSensTrackFill.mesh, innerX, s1Y + 24, Math.max(2, innerW * sensNorm), 6);
    setBoxTopLeft(pauseSensKnob.mesh, innerX + innerW * sensNorm - 7, s1Y + 19, 14, 16);
    setBoxTopLeft(pauseSensHit.mesh, innerX, s1Y + 14, innerW, 26);
    registerTarget('pause:sens', pauseSensHit.mesh, innerX, s1Y + 14, innerW, 26, {
      cursor: 'ew-resize',
      onDrag: (normX) => {
        const val = Math.round((0.3 + normX * (2.2 - 0.3)) * 20) / 20;
        callbacks.onUpdateSettings({ sensitivity: Math.max(0.3, Math.min(2.2, val)) });
      },
    });

    // Slider 2: Audio Volume
    const s2Y = my + 148;
    const volNorm = Math.max(0, Math.min(1, state.settings.masterVolume));
    drawPanelIfChanged(
      pauseVolLabel,
      `pvol|${Math.round(volNorm * 100)}`,
      innerX,
      s2Y,
      innerW,
      18,
      (ctx, w) => {
        ctx.font = '500 12px "JetBrains Mono", monospace';
        ctx.fillStyle = '#cbd5e1';
        ctx.textBaseline = 'top';
        ctx.fillText('Audio Volume', 0, 0);
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(volNorm * 100)}%`, w, 0);
        ctx.textAlign = 'left';
      },
    );
    setBoxTopLeft(pauseVolTrackBg.mesh, innerX, s2Y + 24, innerW, 6);
    setBoxTopLeft(pauseVolTrackFill.mesh, innerX, s2Y + 24, Math.max(2, innerW * volNorm), 6);
    setBoxTopLeft(pauseVolKnob.mesh, innerX + innerW * volNorm - 7, s2Y + 19, 14, 16);
    setBoxTopLeft(pauseVolHit.mesh, innerX, s2Y + 14, innerW, 26);
    registerTarget('pause:vol', pauseVolHit.mesh, innerX, s2Y + 14, innerW, 26, {
      cursor: 'ew-resize',
      onDrag: (normX) => {
        const val = Math.round(normX * 20) / 20;
        callbacks.onUpdateSettings({ masterVolume: Math.max(0, Math.min(1, val)) });
      },
    });

    // Toggle: Body-Cam Lens Optics & Grain
    const bcamY = my + 202;
    const bcamHov = hoveredId === 'pause:bodycam';
    drawPanelIfChanged(
      pauseBodyCamRow,
      `pbcam|${state.settings.bodyCamFx}|${bcamHov}`,
      innerX,
      bcamY,
      innerW,
      30,
      (ctx, w, h) => {
        ctx.font = '400 14px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = bcamHov ? '#ffffff' : '#e2e8f0';
        ctx.textBaseline = 'middle';
        ctx.fillText('Body-Cam Lens Optics & Grain', 0, h / 2);

        const bx = w - 20;
        const by = h / 2 - 9;
        ctx.fillStyle = state.settings.bodyCamFx ? '#f59e0b' : '#1e293b';
        ctx.fillRect(bx, by, 18, 18);
        ctx.strokeStyle = state.settings.bodyCamFx ? '#fbbf24' : '#64748b';
        ctx.strokeRect(bx + 0.5, by + 0.5, 17, 17);
        if (state.settings.bodyCamFx) {
          ctx.strokeStyle = '#020617';
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(bx + 4, by + 9);
          ctx.lineTo(bx + 8, by + 13);
          ctx.lineTo(bx + 14, by + 5);
          ctx.stroke();
        }
      },
    );
    registerTarget('pause:bodycam', pauseBodyCamRow.mesh, innerX, bcamY, innerW, 30, {
      onClick: () => callbacks.onUpdateSettings({ bodyCamFx: !state.settings.bodyCamFx }),
    });

    // Touch Controls Overlay 3-Button Row
    const tLabelY = my + 244;
    const touchOpts: Array<'auto' | 'on' | 'off'> = ['auto', 'on', 'off'];
    const tBtnW = Math.floor((innerW - 16) / 3);
    touchOpts.forEach((opt, idx) => {
      const bx = innerX + idx * (tBtnW + 8);
      const by = tLabelY + 20;
      const active = state.settings.touchControls === opt;
      const hov = hoveredId === `pause:touch:${opt}`;
      const p = pauseTouchBtns[idx];
      drawPanelIfChanged(p, `ptouch|${opt}|${active}|${hov}`, bx, by, tBtnW, 38, (ctx, w, h) => {
        drawBox(
          ctx,
          w,
          h,
          active ? '#1c232e' : '#141922',
          active ? '#f59e0b' : hov ? '#94a3b8' : '#334155',
          active ? 1.5 : 1,
        );
        ctx.font = `${active ? 700 : 500} 12px "JetBrains Mono", monospace`;
        ctx.fillStyle = active ? '#fcd34d' : '#cbd5e1';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(opt.toUpperCase(), w / 2, h / 2);
        ctx.textAlign = 'left';
      });
      registerTarget(`pause:touch:${opt}`, p.mesh, bx, by, tBtnW, 38, {
        onClick: () => callbacks.onUpdateSettings({ touchControls: opt }),
      });
    });

    // Action Buttons
    const resY = my + 336;
    const resHov = hoveredId === 'pause:resume';
    drawPanelIfChanged(pauseResumeBtn, `presume|${resHov}`, innerX, resY, innerW, 44, (ctx, w, h) => {
      ctx.fillStyle = resHov ? '#fbbf24' : '#f59e0b';
      ctx.fillRect(0, 0, w, h);
      ctx.font = '700 18px "Barlow Condensed", sans-serif';
      ctx.fillStyle = '#020617';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('RESUME OPERATION', w / 2, h / 2 + 1);
      ctx.textAlign = 'left';
    });
    registerTarget('pause:resume', pauseResumeBtn.mesh, innerX, resY, innerW, 44, {
      onClick: () => callbacks.onResume(),
    });

    const secBtnW = Math.floor((innerW - 10) / 2);
    const secY = resY + 54;
    const rstHov = hoveredId === 'pause:restart';
    drawPanelIfChanged(pauseRestartBtn, `prestart|${rstHov}`, innerX, secY, secBtnW, 40, (ctx, w, h) => {
      drawBox(ctx, w, h, rstHov ? '#334155' : '#1e293b', '#475569', 1);
      ctx.font = '500 13px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Restart Sector', w / 2, h / 2);
      ctx.textAlign = 'left';
    });
    registerTarget('pause:restart', pauseRestartBtn.mesh, innerX, secY, secBtnW, 40, {
      onClick: () => callbacks.onRestart(),
    });

    const ttlHov = hoveredId === 'pause:title';
    drawPanelIfChanged(
      pauseTitleBtn,
      `ptitle|${ttlHov}`,
      innerX + secBtnW + 10,
      secY,
      secBtnW,
      40,
      (ctx, w, h) => {
        drawBox(ctx, w, h, ttlHov ? '#1e293b' : '#0f172a', '#334155', 1);
        ctx.font = '500 13px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#cbd5e1';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Briefing Screen', w / 2, h / 2);
        ctx.textAlign = 'left';
      },
    );
    registerTarget('pause:title', pauseTitleBtn.mesh, innerX + secBtnW + 10, secY, secBtnW, 40, {
      onClick: () => callbacks.onReturnTitle(),
    });
  };

  // =========================================================================
  // DEBRIEF MODAL RENDERER (100% Three.js)
  // =========================================================================
  const renderDebriefGroup = (state: Ui3dState) => {
    setBoxTopLeft(debriefBackdrop.mesh, 0, 0, viewW, viewH);

    const { hud, difficulty } = state;
    const victory = hud.outcome === 'victory';
    const nextId = getNextLevelId(hud.levelId);
    const nextCfg = victory && nextId ? getLevelConfig(nextId) : null;
    const summary = calculateRunScore({
      kills: hud.kills,
      headshots: hud.headshots,
      shotsFired: hud.shotsFired,
      shotsHit: hud.shotsHit,
      elapsedSec: hud.elapsedSec,
      difficulty,
      victory,
    });

    const mw = Math.min(512, viewW - 32);
    const mh = nextCfg ? 390 : 334;
    const mx = Math.round((viewW - mw) * 0.5);
    const my = Math.round((viewH - mh) * 0.5);

    drawPanelIfChanged(
      debriefCardPanel,
      `dcard|${hud.levelId}|${victory}|${hud.score}|${hud.elapsedSec.toFixed(1)}|${summary.accuracyPct}|${hud.kills}|${hud.headshots}|${hud.bestScore}|${mw}|${mh}`,
      mx,
      my,
      mw,
      mh,
      (ctx, w) => {
        drawBox(ctx, w, mh, '#0e1218', '#334155', 1.5);
        const px = 26;
        ctx.textBaseline = 'top';
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.fillStyle = victory ? '#34d399' : '#f87171';
        ctx.fillText(
          `OP ${String(hud.levelNumber).padStart(2, '0')} · ${hud.levelName.toUpperCase()} · ${
            victory ? 'EXTRACTION CONFIRMED' : 'SIGNAL LOST'
          }`,
          px,
          24,
        );

        ctx.font = '700 36px "Barlow Condensed", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(victory ? 'OPERATION COMPLETE' : 'OPERATOR DOWN', px, 42);

        ctx.font = '400 12px "JetBrains Mono", monospace';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`${hud.climateLabel} · ${hud.weatherLabel}`, px, 84);

        const tileGap = 12;
        const tileW = Math.floor((w - px * 2 - tileGap * 2) / 3);
        const tiles = [
          { lbl: 'SCORE', val: String(hud.score), col: '#fbbf24' },
          { lbl: 'ELAPSED', val: formatMissionTime(hud.elapsedSec), col: '#ffffff' },
          { lbl: 'ACCURACY', val: `${summary.accuracyPct}%`, col: '#ffffff' },
        ];
        tiles.forEach((t, i) => {
          const tx = px + i * (tileW + tileGap);
          const ty = 114;
          ctx.fillStyle = '#151b24';
          ctx.fillRect(tx, ty, tileW, 68);
          ctx.strokeStyle = '#1e293b';
          ctx.strokeRect(tx + 0.5, ty + 0.5, tileW - 1, 67);

          ctx.font = '500 11px "JetBrains Mono", monospace';
          ctx.fillStyle = '#94a3b8';
          ctx.fillText(t.lbl, tx + 12, ty + 11);

          ctx.font = '700 24px "JetBrains Mono", monospace';
          ctx.fillStyle = t.col;
          ctx.fillText(t.val, tx + 12, ty + 31);
        });

        ctx.strokeStyle = '#1e293b';
        ctx.beginPath();
        ctx.moveTo(px, 204);
        ctx.lineTo(w - px, 204);
        ctx.stroke();

        ctx.font = '500 12px "JetBrains Mono", monospace';
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(`HOSTILES NEUTRALIZED: ${hud.kills}`, px, 218);
        ctx.textAlign = 'center';
        ctx.fillText(`HEADSHOTS: ${hud.headshots}`, w / 2 + 24, 218);
        ctx.textAlign = 'right';
        ctx.fillText(`BEST: ${hud.bestScore}`, w - px, 218);
        ctx.textAlign = 'left';
      },
    );

    const innerX = mx + 26;
    const innerW = mw - 52;
    let btnY = my + 254;

    if (nextCfg) {
      debriefNextBtn.mesh.visible = true;
      const hov = hoveredId === 'debrief:next';
      drawPanelIfChanged(
        debriefNextBtn,
        `dnext|${nextCfg.id}|${hov}`,
        innerX,
        btnY,
        innerW,
        46,
        (ctx, w, h) => {
          ctx.fillStyle = hov ? '#34d399' : '#10b981';
          ctx.fillRect(0, 0, w, h);
          ctx.font = '700 18px "Barlow Condensed", sans-serif';
          ctx.fillStyle = '#020617';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            `NEXT: OP ${String(nextCfg.number).padStart(2, '0')} · ${nextCfg.name.toUpperCase()}`,
            w / 2,
            h / 2 + 1,
          );
          ctx.textAlign = 'left';
        },
      );
      registerTarget('debrief:next', debriefNextBtn.mesh, innerX, btnY, innerW, 46, {
        onClick: () => callbacks.onNextLevel(),
      });
      btnY += 56;
    } else {
      debriefNextBtn.mesh.visible = false;
    }

    const halfW = Math.floor((innerW - 12) / 2);
    const repHov = hoveredId === 'debrief:replay';
    drawPanelIfChanged(
      debriefReplayBtn,
      `drep|${victory}|${repHov}`,
      innerX,
      btnY,
      halfW,
      46,
      (ctx, w, h) => {
        ctx.fillStyle = repHov ? '#fbbf24' : '#f59e0b';
        ctx.fillRect(0, 0, w, h);
        ctx.font = '700 18px "Barlow Condensed", sans-serif';
        ctx.fillStyle = '#020617';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(victory ? 'DEPLOY AGAIN' : 'TRY AGAIN', w / 2, h / 2 + 1);
        ctx.textAlign = 'left';
      },
    );
    registerTarget('debrief:replay', debriefReplayBtn.mesh, innerX, btnY, halfW, 46, {
      onClick: () => callbacks.onRestart(),
    });

    const ttlHov = hoveredId === 'debrief:title';
    drawPanelIfChanged(
      debriefTitleBtn,
      `dttl|${ttlHov}`,
      innerX + halfW + 12,
      btnY,
      halfW,
      46,
      (ctx, w, h) => {
        drawBox(ctx, w, h, ttlHov ? '#334155' : '#1e293b', '#475569', 1);
        ctx.font = '500 14px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Return to Briefing', w / 2, h / 2);
        ctx.textAlign = 'left';
      },
    );
    registerTarget('debrief:title', debriefTitleBtn.mesh, innerX + halfW + 12, btnY, halfW, 46, {
      onClick: () => callbacks.onReturnTitle(),
    });
  };

  // =========================================================================
  // POINTER / RAYCAST INPUT HANDLING IN THREE.JS
  // =========================================================================
  const getCanvasLocalCoords = (e: PointerEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    ndcMouse.x = (x / Math.max(1, rect.width)) * 2 - 1;
    ndcMouse.y = -(y / Math.max(1, rect.height)) * 2 + 1;
    return { x, y };
  };

  const inRect = (x: number, y: number, r: { x: number; y: number; w: number; h: number }) =>
    r.w > 0 && r.h > 0 && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  const raycastTargets = (): InteractiveTarget | null => {
    if (activeTargets.length === 0) return null;
    raycaster.setFromCamera(ndcMouse, camera);
    const meshes = activeTargets.map((t) => t.mesh);
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return null;
    const hitId = hits[0].object.userData.uiId;
    return activeTargets.find((t) => t.id === hitId) ?? null;
  };

  const computeDragNorm = (x: number, t: InteractiveTarget) =>
    Math.max(0, Math.min(1, (x - t.bounds.x) / Math.max(1, t.bounds.w)));

  const handlePointerDown = (e: PointerEvent, canvas: HTMLCanvasElement): boolean => {
    const { x, y } = getCanvasLocalCoords(e, canvas);

    // 1. Mobile Touch Controls during gameplay
    if (latestState?.gameState === 'playing' && latestState.showTouchControls) {
      if (inRect(x, y, joyZoneRect) && joyPointerId === null) {
        joyPointerId = e.pointerId;
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        const norm = normalizeTouchJoystick(x - joyCenter.x, y - joyCenter.y, JOYSTICK_RADIUS);
        joyKnob = { x: norm.knobX, y: norm.knobY, sprint: norm.sprint, active: true };
        callbacks.onTouchMove(norm.x, norm.y, norm.sprint);
        return true;
      }
      if (inRect(x, y, fireZoneRect) && firePointerId === null) {
        firePointerId = e.pointerId;
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        callbacks.onTouchFireChange(true);
        return true;
      }
      if (inRect(x, y, decryptZoneRect) && decryptPointerId === null) {
        decryptPointerId = e.pointerId;
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        callbacks.onTouchInteractChange(true);
        return true;
      }
    }

    // 2. Raycast Three.js Interactive UI Meshes (Buttons, Sliders, Weapon Slots)
    const hit = raycastTargets();
    if (hit) {
      if (hit.onDrag) {
        activeDragTarget = hit;
        activeDragPointerId = e.pointerId;
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        hit.onDrag(computeDragNorm(x, hit));
        return true;
      }
      if (hit.onClick) {
        hit.onClick();
        return true;
      }
    }

    // 3. Touch Look Zone (only if no button on top of look pad was hit)
    if (
      latestState?.gameState === 'playing' &&
      latestState.showTouchControls &&
      inRect(x, y, lookZoneRect) &&
      lookPointerId === null
    ) {
      lookPointerId = e.pointerId;
      lookLast = { x, y };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      return true;
    }

    return latestState?.gameState !== 'playing';
  };

  const handlePointerMove = (e: PointerEvent, canvas: HTMLCanvasElement): boolean => {
    const { x, y } = getCanvasLocalCoords(e, canvas);

    if (activeDragTarget && activeDragPointerId === e.pointerId) {
      activeDragTarget.onDrag?.(computeDragNorm(x, activeDragTarget));
      return true;
    }

    if (latestState?.gameState === 'playing' && latestState.showTouchControls) {
      if (joyPointerId === e.pointerId) {
        const norm = normalizeTouchJoystick(x - joyCenter.x, y - joyCenter.y, JOYSTICK_RADIUS);
        joyKnob = { x: norm.knobX, y: norm.knobY, sprint: norm.sprint, active: true };
        callbacks.onTouchMove(norm.x, norm.y, norm.sprint);
        return true;
      }
      if (lookPointerId === e.pointerId) {
        const dx = x - lookLast.x;
        const dy = y - lookLast.y;
        lookLast = { x, y };
        callbacks.onTouchLook(dx, dy);
        return true;
      }
    }

    const hit = raycastTargets();
    hoveredId = hit ? hit.id : null;
    canvas.style.cursor = hit ? hit.cursor ?? 'pointer' : 'default';
    return Boolean(hit) || latestState?.gameState !== 'playing';
  };

  const handlePointerUp = (e: PointerEvent): boolean => {
    if (activeDragPointerId === e.pointerId) {
      activeDragTarget = null;
      activeDragPointerId = null;
      return true;
    }
    if (joyPointerId === e.pointerId) {
      joyPointerId = null;
      joyKnob = { x: 0, y: 0, sprint: false, active: false };
      callbacks.onTouchMove(0, 0, false);
      return true;
    }
    if (lookPointerId === e.pointerId) {
      lookPointerId = null;
      return true;
    }
    if (firePointerId === e.pointerId) {
      firePointerId = null;
      callbacks.onTouchFireChange(false);
      return true;
    }
    if (decryptPointerId === e.pointerId) {
      decryptPointerId = null;
      callbacks.onTouchInteractChange(false);
      return true;
    }
    return false;
  };

  const resize = (width: number, height: number) => {
    viewW = Math.max(1, width);
    viewH = Math.max(1, height);
    const halfW = viewW * 0.5;
    const halfH = viewH * 0.5;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
  };

  const invalidateAll = () => {
    for (const p of allPanels) {
      p.lastKey = '';
    }
  };

  if (typeof document !== 'undefined' && document.fonts?.ready) {
    document.fonts.ready.then(() => invalidateAll());
  }

  resize(1440, 900);

  return {
    scene,
    camera,
    resize,
    invalidateAll,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    update: (dt: number, state: Ui3dState) => {
      latestState = state;
      activeTargets = [];

      titleGroup.visible = state.gameState === 'title';
      hudGroup.visible = state.gameState === 'playing';
      touchGroup.visible = state.gameState === 'playing' && state.showTouchControls;
      pauseGroup.visible = state.gameState === 'paused';
      debriefGroup.visible = state.gameState === 'gameover';

      if (state.contextError) {
        errorBannerPanel.mesh.visible = true;
        const bw = Math.min(540, viewW - 32);
        drawPanelIfChanged(
          errorBannerPanel,
          `err|${state.contextError}`,
          (viewW - bw) * 0.5,
          16,
          bw,
          34,
          (ctx, w, h) => {
            drawBox(ctx, w, h, '#450a0a', '#ef4444', 1);
            ctx.font = '500 12px "JetBrains Mono", monospace';
            ctx.fillStyle = '#fee2e2';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(state.contextError!, w / 2, h / 2, w - 20);
            ctx.textAlign = 'left';
          },
        );
      } else {
        errorBannerPanel.mesh.visible = false;
      }

      if (state.gameState === 'title') {
        renderTitleGroup(state);
      } else if (state.gameState === 'playing') {
        renderHudGroup(dt, state);
        if (state.showTouchControls) {
          renderTouchGroup(state);
        }
      } else if (state.gameState === 'paused') {
        renderPauseGroup(state);
      } else if (state.gameState === 'gameover') {
        renderDebriefGroup(state);
      }
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
