import { useEffect, useRef, useState } from 'react';
import { GameEngine } from './game/Engine';
import { getLevelConfig, getNextLevelId, LEVEL_ORDER, LEVELS } from './game/maps';
import { WEAPON_ORDER, WEAPONS } from './game/rules';
import type {
  DifficultyLevel,
  GameMode,
  GameSettings,
  GameState,
  HudSnapshot,
  LevelId,
} from './game/types';

const INITIAL_HUD: HudSnapshot = {
  hp: 100,
  maxHp: 100,
  armor: 100,
  maxArmor: 100,
  stamina: 100,
  weaponId: 'carbine',
  weapons: {
    carbine: { mag: 36, reserve: 252 },
    shotgun: { mag: 10, reserve: 60 },
    smg: { mag: 40, reserve: 320 },
    sniper: { mag: 6, reserve: 42 },
    lmg: { mag: 100, reserve: 400 },
    ak: { mag: 30, reserve: 210 },
    sidearm: { mag: 18, reserve: 108 },
  },
  reloading: false,
  reloadProgress: 0,
  grenades: 3,
  flashlightOn: true,
  ads: false,
  scopedAds: false,
  crouch: false,
  lean: 0,
  crosshairSpread: 9,
  score: 0,
  bestScore: 0,
  kills: 0,
  headshots: 0,
  shotsFired: 0,
  shotsHit: 0,
  levelId: 'op01',
  levelNumber: 1,
  levelName: 'Iron Refinery',
  climateLabel: 'North Atlantic Storm',
  weatherLabel: 'THUNDERSTORM · HEAVY RAIN',
  killStreak: 0,
  sector: 1,
  wave: 1,
  objectiveTitle: 'Sector 01 · Courtyard Breach',
  objectiveSub: 'Neutralize courtyard squad',
  objectiveDist: 18,
  hostilesLeft: 4,
  bossName: null,
  bossHp: 0,
  bossMaxHp: 1,
  elapsedSec: 0,
  outcome: null,
  hitMarkerTimer: 0,
  headshotMarker: false,
  damageDirAngle: 0,
  damageFlash: 0,
  flashbangTimer: 0,
  lightningFlash: 0,
  promptText: null,
  interactProgress: 0,
  pointerLocked: false,
  muted: false,
  bodyCamTimecode: 'REC · 2026-11-13 · 00:00:00',
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [gameState, setGameState] = useState<GameState>('title');
  const [selectedLevel, setSelectedLevel] = useState<LevelId>(() => {
    if (typeof window === 'undefined') return 'op01';
    const param = new URLSearchParams(window.location.search).get('level');
    return getLevelConfig(param).id;
  });
  const [mode, setMode] = useState<GameMode>('blackout');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('standard');
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [settings, setSettings] = useState<GameSettings>({
    sensitivity: 1.0,
    masterVolume: 0.75,
    fov: 82,
    bodyCamFx: true,
    touchControls: 'auto',
  });
  const [contextError, setContextError] = useState<string | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new GameEngine(
      container,
      (nextHud) => setHud(nextHud),
      (nextState) => setGameState(nextState),
      (errMsg) => setContextError(errMsg),
      (cfg) => {
        setSelectedLevel(cfg.levelId);
        setMode(cfg.mode);
        setDifficulty(cfg.difficulty);
        setSettings(cfg.settings);
      },
    );
    engineRef.current = engine;
    setSettings(engine.getSettings());

    // Support ?level=opXX and ?autostart=1 for direct theater entry
    const params = new URLSearchParams(window.location.search);
    const levelParam = params.get('level');
    const resolvedLevel = getLevelConfig(levelParam).id;
    if (resolvedLevel !== 'op01') {
      setSelectedLevel(resolvedLevel);
      engine.setLevel(resolvedLevel);
    }
    if (params.get('autostart') === '1') {
      engine.startMission('blackout', 'standard', false, resolvedLevel);
    }

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleDeploy = () => {
    engineRef.current?.startMission(mode, difficulty, true, selectedLevel);
  };

  const handleNextLevel = () => {
    const nextId = getNextLevelId(hud.levelId);
    if (!nextId) return;
    setSelectedLevel(nextId);
    engineRef.current?.startMission(mode, difficulty, true, nextId);
  };

  const activeLevelCfg = getLevelConfig(selectedLevel);
  const nextId = getNextLevelId(hud.levelId);
  const nextCfg = nextId ? getLevelConfig(nextId) : null;
  const activeRuntime = hud.weapons[hud.weaponId];

  return (
    <main
      data-state={gameState}
      data-level={hud.levelId}
      className="relative w-screen h-screen overflow-hidden bg-[#090c10]"
    >
      {/* Full-Game Three.js WebGL Canvas (World + Viewmodel + Optical FX + All UI/HUD/Menus) */}
      <div
        ref={mountRef}
        data-testid="game-viewport"
        className="absolute inset-0 w-full h-full"
      />

      {/* Screen-Reader & Semantic Accessibility Mirror (Zero visual occlusion over Three.js) */}
      <div className="sr-only pointer-events-none" aria-live="polite">
        {contextError && <div role="alert">{contextError}</div>}

        {gameState === 'title' && (
          <section aria-label="Operation Iron Sight Briefing">
            <h1>OPERATION IRON SIGHT</h1>
            <p>{activeLevelCfg.briefing}</p>
            {LEVEL_ORDER.map((id) => {
              const cfg = LEVELS[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => engineRef.current?.setLevel(id)}
                >
                  OP {String(cfg.number).padStart(2, '0')} {cfg.biome} {cfg.name}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => engineRef.current?.setModeAndDifficulty('blackout', difficulty)}
            >
              3-Sector Raid
            </button>
            <button
              type="button"
              onClick={() => engineRef.current?.setModeAndDifficulty('surge', difficulty)}
            >
              Hostile Surge
            </button>
            <button
              type="button"
              data-start="true"
              onClick={handleDeploy}
            >
              Deploy Op {String(activeLevelCfg.number).padStart(2, '0')} · {activeLevelCfg.name}
            </button>
          </section>
        )}

        {gameState === 'playing' && (
          <section data-testid="tactical-hud" aria-label="Tactical HUD">
            <div>
              OP {String(hud.levelNumber).padStart(2, '0')} · {hud.levelName}
            </div>
            <div>{hud.objectiveTitle}</div>
            <div>{hud.objectiveSub} · {hud.objectiveDist}m</div>
            <div>HP {hud.hp} ARM {hud.armor}</div>
            <div data-testid="ammo-mag">{activeRuntime.mag}</div>
            {hud.scopedAds && (
              <div data-testid="sniper-scope-overlay">
                M2010 · 8.0X MIL-DOT · {hud.objectiveDist}M
              </div>
            )}
            {WEAPON_ORDER.map((wId) => {
              const spec = WEAPONS[wId];
              return (
                <button
                  key={wId}
                  type="button"
                  onClick={() => engineRef.current?.selectWeaponSlot(wId)}
                >
                  [{spec.slot}] {spec.shortName}
                </button>
              );
            })}
            <button type="button" onClick={() => engineRef.current?.toggleMute()}>
              {hud.muted ? 'Unmute audio' : 'Mute audio'}
            </button>
            <button type="button" onClick={handleDeploy}>
              Restart mission
            </button>
            <button type="button" onClick={() => engineRef.current?.pauseMission()}>
              Pause mission
            </button>
          </section>
        )}

        {gameState === 'paused' && (
          <section role="dialog" aria-label="Mission Paused">
            <h2>TACTICAL PAUSE</h2>
            <button type="button" onClick={() => engineRef.current?.resumeMission()}>
              Resume Operation
            </button>
            <button type="button" onClick={handleDeploy}>
              Restart Sector
            </button>
            <button type="button" onClick={() => engineRef.current?.returnToTitle()}>
              Briefing Screen
            </button>
          </section>
        )}

        {gameState === 'gameover' && (
          <section
            role="dialog"
            aria-label={hud.outcome === 'victory' ? 'Operation Complete' : 'Operator Down'}
          >
            <h2>{hud.outcome === 'victory' ? 'OPERATION COMPLETE' : 'OPERATOR DOWN'}</h2>
            <div>SCORE {hud.score} KILLS {hud.kills}</div>
            {hud.outcome === 'victory' && nextCfg && (
              <button type="button" onClick={handleNextLevel}>
                Next: Op {String(nextCfg.number).padStart(2, '0')} · {nextCfg.name}
              </button>
            )}
            <button type="button" data-start="true" onClick={handleDeploy}>
              {hud.outcome === 'victory' ? 'Deploy Again' : 'Try Again'}
            </button>
            <button type="button" onClick={() => engineRef.current?.returnToTitle()}>
              Return to Briefing
            </button>
          </section>
        )}
      </div>
    </main>
  );
}


