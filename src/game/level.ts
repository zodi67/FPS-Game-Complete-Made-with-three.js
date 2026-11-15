import * as THREE from 'three';
import {
  addBirdFlock,
  addBlackhawkHelicopter,
  addBoulderCluster,
  addChemicalVat,
  addCoolingTower,
  addFreighterShip,
  addGantryCrane,
  addMissileSiloUnit,
  addMountainPerimeter,
  addRadarDish,
  addSubwayCar,
  addTree,
  type AnimatedPropRef,
  type AssetBuilderContext,
} from './assets';
import { LEVELS } from './maps';
import type { MaterialLibrary } from './textures';
import type { ColliderBox, LevelConfig, RampVolume, SurfaceType } from './types';

export interface DestructibleProp {
  id: string;
  colliderId: string;
  group: THREE.Group;
  position: THREE.Vector3;
  isExplosive: boolean;
  destroyed: boolean;
}

export interface PickupDrop {
  id: string;
  type: 'ammo' | 'armor' | 'medkit' | 'grenade';
  group: THREE.Group;
  position: THREE.Vector3;
  collected: boolean;
  bobPhase: number;
}

export interface LevelData {
  root: THREE.Group;
  config: LevelConfig;
  colliders: ColliderBox[];
  ramps: RampVolume[];
  destructibles: DestructibleProp[];
  pickups: PickupDrop[];
  animatables: AnimatedPropRef[];
  terminalPos: THREE.Vector3;
  extractionPos: THREE.Vector3;
  extractionBeaconMat: THREE.MeshStandardMaterial;
  terminalScreenMat: THREE.MeshStandardMaterial;
  skyDomeMat: THREE.ShaderMaterial;
  securityLights: THREE.PointLight[];
  playerSpawn: THREE.Vector3;
  dispose: () => void;
}

export function buildTacticalLevel(
  mats: MaterialLibrary,
  isSoftwareGl: boolean,
  levelConfig: LevelConfig = LEVELS.op01,
): LevelData {
  const root = new THREE.Group();
  const colliders: ColliderBox[] = [];
  const ramps: RampVolume[] = [];
  const destructibles: DestructibleProp[] = [];
  const pickups: PickupDrop[] = [];
  const animatables: AnimatedPropRef[] = [];
  const securityLights: THREE.PointLight[] = [];
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

  let cidCounter = 0;
  const nextId = (prefix: string) => `${prefix}-${++cidCounter}`;

  const registerBox = (
    id: string,
    cx: number,
    baseY: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    surface: SurfaceType,
    opts?: {
      walkable?: boolean;
      destructibleHp?: number;
      isExplosive?: boolean;
      sector?: number;
    },
  ): ColliderBox => {
    const box: ColliderBox = {
      id,
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minY: baseY,
      maxY: baseY + h,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
      surface,
      walkable: opts?.walkable ?? false,
      destructibleHp: opts?.destructibleHp,
      maxHp: opts?.destructibleHp,
      isExplosive: opts?.isExplosive ?? false,
      sector: opts?.sector,
      active: true,
    };
    colliders.push(box);
    return box;
  };

  const assetCtx: AssetBuilderContext = {
    root,
    mats,
    isSoftwareGl,
    trackGeo,
    trackMat,
    registerBox: (id, cx, baseY, cz, w, h, d, surface, opts) => {
      registerBox(id, cx, baseY, cz, w, h, d, surface, opts);
    },
    nextId,
    animatables,
  };

  // --- 0. DYNAMIC CLIMATE SKY DOME WITH LIGHTNING CLOUD ILLUMINATION ---
  const skyGeo = trackGeo(new THREE.SphereGeometry(155, 32, 20));
  const skyDomeMat = trackMat(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uHorizon: { value: new THREE.Color(levelConfig.skyHorizon) },
        uZenith: { value: new THREE.Color(levelConfig.skyZenith) },
        uCloudHighlight: { value: new THREE.Color(levelConfig.cloudHighlight) },
        uBoltDir: { value: new THREE.Vector3(0.3, 0.7, -0.6) },
        uLightningColor: { value: new THREE.Color(0xf4f7fb) },
        uLightning: { value: 0.0 },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uHorizon;
        uniform vec3 uZenith;
        uniform vec3 uCloudHighlight;
        uniform vec3 uBoltDir;
        uniform vec3 uLightningColor;
        uniform float uLightning;
        varying vec3 vWorldPos;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float noise2(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
            mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        float fbmCloud(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * noise2(p);
            p *= 2.04;
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec3 dir = normalize(vWorldPos);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 baseSky = mix(uHorizon, uZenith, pow(h, 0.52));

          vec2 cloudUv = dir.xz / (h + 0.24) * 1.35;
          float c = fbmCloud(cloudUv);
          float cloudBand = smoothstep(0.32, 0.76, c) * smoothstep(0.01, 0.26, h);
          vec3 col = mix(baseSky, uCloudHighlight, cloudBand * 0.52) * 1.05;

          float boltAlign = max(0.0, dot(dir, normalize(uBoltDir)));
          float boltFocus = pow(boltAlign, 7.5);
          float haloGlow = pow(boltAlign, 2.2);
          float cloudRim = (0.08 + 0.36 * haloGlow + 0.92 * boltFocus) * (0.22 + 0.85 * cloudBand);
          col += uLightningColor * uLightning * cloudRim * 0.78;

          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    }),
  );
  const skyDome = new THREE.Mesh(skyGeo, skyDomeMat);
  root.add(skyDome);

  // --- 1. BIOME-SPECIFIC TERRAIN, WATER, LAVA & GROUND SURFACES ---
  const biome = levelConfig.biome;
  const outerGroundMat: THREE.Material =
    biome === 'desert' || biome === 'mediterranean'
      ? mats.sandGround
      : biome === 'arctic' || biome === 'bunker'
        ? mats.snowGround
        : biome === 'jungle'
          ? mats.jungleMoss
          : biome === 'volcanic'
            ? mats.volcanicBasalt
            : biome === 'harbor'
              ? mats.harborWater
              : trackMat(
                  new THREE.MeshStandardMaterial({
                    color: biome === 'rooftop' ? 0x101620 : 0x2a313a,
                    roughness: 0.92,
                    metalness: 0.04,
                  }),
                );

  const outerGround = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(260, 260)),
    outerGroundMat,
  );
  outerGround.rotation.x = -Math.PI / 2;
  outerGround.position.y = biome === 'rooftop' ? -26.0 : -0.09;
  outerGround.receiveShadow = !isSoftwareGl;
  root.add(outerGround);

  if (levelConfig.hasWater && biome !== 'harbor') {
    const waterMat = trackMat(mats.harborWater.clone());
    waterMat.polygonOffset = true;
    waterMat.polygonOffsetFactor = -1;
    waterMat.polygonOffsetUnits = -1;
    if (biome === 'mediterranean') {
      // Sunlit Mediterranean coastal bay along east/north seafront
      const seaEast = new THREE.Mesh(
        trackGeo(new THREE.PlaneGeometry(140, 260)),
        waterMat,
      );
      seaEast.rotation.x = -Math.PI / 2;
      seaEast.position.set(96, -0.05, 0);
      const seaWall = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(1.4, 0.9, 130)),
        mats.sandstoneRock,
      );
      seaWall.position.set(26.5, -0.32, 0);
      root.add(seaEast, seaWall);
    } else {
      // Jungle river channels flanking compound outside perimeter walls
      [-34, 34].forEach((rx) => {
        const river = new THREE.Mesh(
          trackGeo(new THREE.PlaneGeometry(12, 160)),
          waterMat,
        );
        river.rotation.x = -Math.PI / 2;
        river.position.set(rx, -0.05, 0);
        root.add(river);
      });
    }
  }

  if (biome === 'volcanic') {
    // Glowing lava river fissures flanking outside compound
    [-34, 34].forEach((lx) => {
      const lava = new THREE.Mesh(
        trackGeo(new THREE.PlaneGeometry(14, 150)),
        mats.magmaGlow,
      );
      lava.rotation.x = -Math.PI / 2;
      lava.position.set(lx, -0.06, -5);
      root.add(lava);
    });
  } else if (biome === 'chemical') {
    // Glowing toxic lagoons outside compound
    [-33, 33].forEach((tx) => {
      const pool = new THREE.Mesh(
        trackGeo(new THREE.PlaneGeometry(12, 110)),
        mats.toxicSludge,
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(tx, -0.05, 0);
      root.add(pool);
    });
  }

  // Courtyard Floor Material
  const courtyardMat: THREE.Material =
    biome === 'desert' || biome === 'mediterranean'
      ? mats.sandGround
      : biome === 'arctic'
        ? mats.snowGround
        : biome === 'jungle'
          ? mats.jungleMoss
          : biome === 'volcanic'
            ? mats.volcanicBasalt
            : biome === 'metro'
              ? mats.metroTile
              : biome === 'chemical' || biome === 'bunker'
                ? mats.concreteFloor
                : mats.asphaltWet;

  // Compound deck matched cleanly to perimeter wall footprint (47.4 x 74.4 centered at z=1.5)
  const courtyardFloor = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(47.4, 74.4)),
    courtyardMat,
  );
  courtyardFloor.rotation.x = -Math.PI / 2;
  courtyardFloor.position.set(0, 0, 1.5);
  courtyardFloor.receiveShadow = !isSoftwareGl;
  root.add(courtyardFloor);

  // Solid concrete foundation plinth underneath deck so edges never appear paper-thin
  const deckFoundation = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(47.8, 0.38, 74.8)),
    mats.concreteBarrier,
  );
  deckFoundation.position.set(0, -0.2, 1.5);
  root.add(deckFoundation);

  if (biome === 'harbor') {
    // Concrete harbor quay walls + dockside mooring bollards & pilings
    const quayBase = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(48.4, 1.4, 75.4)),
      mats.concreteBarrier,
    );
    quayBase.position.set(0, -0.72, 1.5);
    root.add(quayBase);
    for (let pz = -32; pz <= 34; pz += 11) {
      const piling = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.28, 0.32, 1.8, 8)),
        mats.treeBark,
      );
      piling.position.set(24.5, -0.35, pz);
      root.add(piling);
    }
  }

  if (biome === 'rooftop') {
    // Full 26m-tall Meridian Tower skyscraper facade connecting rooftop deck down to street ground (y = -26)
    const towerCore = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(47.4, 26.0, 74.4)),
      mats.steelDark,
    );
    towerCore.position.set(0, -13.38, 1.5);
    root.add(towerCore);
    const towerWinMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1e2530,
        emissive: 0x64748b,
        emissiveIntensity: 0.22,
        roughness: 0.28,
      }),
    );
    for (let fy = -22; fy <= -4; fy += 4.5) {
      const winRing = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(47.65, 1.35, 74.65)),
        towerWinMat,
      );
      winRing.position.set(0, fy, 1.5);
      root.add(winRing);
    }
  }

  if (biome === 'arctic') {
    const icePatch = new THREE.Mesh(
      trackGeo(new THREE.CircleGeometry(7.2, 20)),
      mats.iceSurface,
    );
    icePatch.rotation.x = -Math.PI / 2;
    icePatch.position.set(0, 0.015, 22);
    root.add(icePatch);
  }

  // Interior Sector 2 Pad (z: -16..+10)
  const hallMat: THREE.Material =
    biome === 'metro'
      ? mats.metroTile
      : biome === 'desert'
        ? mats.sandGround
        : biome === 'jungle'
          ? mats.jungleMoss
          : biome === 'arctic'
            ? mats.iceSurface
            : mats.concreteFloor;

  const hallFloor = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(44.8, 0.08, 26)),
    hallMat,
  );
  hallFloor.position.set(0, 0.01, -3);
  hallFloor.receiveShadow = !isSoftwareGl;
  root.add(hallFloor);

  const wallMat: THREE.Material =
    biome === 'desert'
      ? mats.sandstoneRock
      : biome === 'mediterranean'
        ? mats.terracottaWall
        : biome === 'metro'
          ? mats.metroTile
          : mats.concreteWall;

  // --- HELPER: Solid Structural Wall with Coping & Base Plinth ---
  const addWall = (
    cx: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    baseY: number = 0,
    customMat?: THREE.Material,
  ) => {
    const grp = new THREE.Group();
    const wallMesh = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(w, h, d)),
      customMat ?? wallMat,
    );
    wallMesh.position.set(0, h / 2, 0);
    wallMesh.castShadow = !isSoftwareGl;
    wallMesh.receiveShadow = !isSoftwareGl;
    grp.add(wallMesh);

    const alongX = w >= d;
    const capW = alongX ? w : w + 0.14;
    const capD = alongX ? d + 0.14 : Math.max(0.2, d - 0.14);
    const capMesh = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(capW, 0.14, capD)),
      mats.steelDark,
    );
    capMesh.position.set(0, h + 0.07, 0);
    grp.add(capMesh);

    const skirtW = alongX ? w : w + 0.1;
    const skirtD = alongX ? d + 0.1 : Math.max(0.2, d - 0.1);
    const skirtMesh = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(skirtW, 0.24, skirtD)),
      mats.concreteBarrier,
    );
    skirtMesh.position.set(0, 0.12, 0);
    grp.add(skirtMesh);

    const isTransitionSeam = Math.abs(cz - 10) < 0.25 || Math.abs(cz + 16) < 0.25;
    if (baseY === 0 && !isTransitionSeam) {
      const shadowY = cz > -16 && cz < 10 && Math.abs(cx) < 22.3 ? 0.053 : 0.014;
      const baseAo = new THREE.Mesh(
        trackGeo(new THREE.PlaneGeometry(w + 0.9, d + 0.9)),
        mats.contactShadowMat,
      );
      baseAo.rotation.x = -Math.PI / 2;
      baseAo.position.set(0, shadowY, 0);
      grp.add(baseAo);
    }

    grp.position.set(cx, baseY, cz);
    root.add(grp);
    registerBox(nextId('wall'), cx, baseY, cz, w, h + 0.14, d, 'concrete');
  };

  // --- HELPER: Reinforced Doorway Frame ---
  const addWallWithDoorway = (
    cx: number,
    cz: number,
    totalW: number,
    doorW: number,
    doorH: number,
    totalH: number,
    thickness: number,
  ) => {
    const sideW = (totalW - doorW) / 2;
    if (sideW > 0.2) {
      addWall(cx - doorW / 2 - sideW / 2, cz, sideW, totalH, thickness);
      addWall(cx + doorW / 2 + sideW / 2, cz, sideW, totalH, thickness);
    }
    const headerH = totalH - doorH;
    const headerGrp = new THREE.Group();
    const headerMesh = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(doorW, headerH, thickness)),
      wallMat,
    );
    headerMesh.position.set(0, doorH + headerH / 2, 0);
    headerMesh.castShadow = !isSoftwareGl;
    headerGrp.add(headerMesh);

    const headerCap = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(doorW, 0.14, thickness + 0.14)),
      mats.steelDark,
    );
    headerCap.position.set(0, totalH + 0.07, 0);
    headerGrp.add(headerCap);

    const lintel = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(doorW - 0.36, 0.26, thickness + 0.08)),
      mats.hazardStripe,
    );
    lintel.position.set(0, doorH + 0.13, 0);
    headerGrp.add(lintel);

    const jambGeo = trackGeo(new THREE.BoxGeometry(0.18, doorH + 0.26, thickness + 0.14));
    const jambL = new THREE.Mesh(jambGeo, mats.steelDark);
    jambL.position.set(-doorW / 2 + 0.09, (doorH + 0.26) / 2, 0);
    const jambR = new THREE.Mesh(jambGeo, mats.steelDark);
    jambR.position.set(doorW / 2 - 0.09, (doorH + 0.26) / 2, 0);
    headerGrp.add(jambL, jambR);

    headerGrp.position.set(cx, 0, cz);
    root.add(headerGrp);

    registerBox(nextId('lintel'), cx, doorH, cz, doorW, headerH + 0.14, thickness, 'concrete');
  };

  // --- HELPER: Multi-Part Corrugated Shipping Container ---
  const addShippingContainer = (
    cx: number,
    cz: number,
    rot90: boolean,
    variant: 'olive' | 'crimson' | 'navy',
    baseY: number = 0,
  ) => {
    const length = 6.2;
    const width = 2.6;
    const height = 2.75;
    const w = rot90 ? width : length;
    const d = rot90 ? length : width;
    const mat =
      variant === 'olive'
        ? mats.containerOlive
        : variant === 'navy'
          ? mats.containerNavy
          : mats.containerCrimson;

    const grp = new THREE.Group();
    const body = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(length - 0.24, height - 0.22, width - 0.14)),
      mat,
    );
    body.position.y = height / 2;
    body.castShadow = !isSoftwareGl;
    body.receiveShadow = !isSoftwareGl;
    grp.add(body);

    const ribGeo = trackGeo(new THREE.BoxGeometry(0.12, height - 0.28, width - 0.04));
    for (let rx = -2.4; rx <= 2.4; rx += 0.6) {
      const rib = new THREE.Mesh(ribGeo, mat);
      rib.position.set(rx, height / 2, 0);
      grp.add(rib);
    }

    const postGeo = trackGeo(new THREE.BoxGeometry(0.2, height, 0.2));
    [
      [-length / 2 + 0.1, -width / 2 + 0.1],
      [length / 2 - 0.1, -width / 2 + 0.1],
      [-length / 2 + 0.1, width / 2 - 0.1],
      [length / 2 - 0.1, width / 2 - 0.1],
    ].forEach(([px, pz]) => {
      const p = new THREE.Mesh(postGeo, mats.steelDark);
      p.position.set(px, height / 2, pz);
      grp.add(p);
    });

    const railGeo = trackGeo(new THREE.BoxGeometry(length - 0.42, 0.12, 0.14));
    [-width / 2 + 0.09, width / 2 - 0.09].forEach((sz) => {
      const botSill = new THREE.Mesh(railGeo, mats.rustMetal);
      botSill.position.set(0, 0.06, sz);
      const topHeader = new THREE.Mesh(railGeo, mats.steelDark);
      topHeader.position.set(0, height - 0.06, sz);
      grp.add(botSill, topHeader);
    });

    const roof = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(length - 0.38, 0.11, width - 0.34)),
      mat,
    );
    roof.position.y = height - 0.065;
    grp.add(roof);

    const barGeo = trackGeo(new THREE.CylinderGeometry(0.032, 0.032, height - 0.36, 8));
    const camGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.09, 0.09));
    [-0.45, 0.45].forEach((bz) => {
      const bar = new THREE.Mesh(barGeo, mats.steelGrate);
      bar.position.set(length / 2 - 0.01, height / 2, bz);
      const camBot = new THREE.Mesh(camGeo, mats.steelDark);
      camBot.position.set(length / 2 - 0.02, 0.32, bz);
      const camTop = new THREE.Mesh(camGeo, mats.steelDark);
      camTop.position.set(length / 2 - 0.02, height - 0.32, bz);
      grp.add(bar, camBot, camTop);
    });

    if (rot90) grp.rotation.y = Math.PI / 2;
    grp.position.set(cx, baseY, cz);
    root.add(grp);

    registerBox(nextId('container'), cx, baseY, cz, w + 0.1, height + 0.04, d + 0.1, 'metal', {
      walkable: true,
    });
  };

  // --- HELPER: Jersey Concrete Barrier ---
  const addJerseyBarrier = (cx: number, cz: number, length: number, rot90: boolean) => {
    const grp = new THREE.Group();
    const jShadow = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(length + 0.35, 1.1)),
      mats.contactShadowMat,
    );
    jShadow.rotation.x = -Math.PI / 2;
    jShadow.position.y = 0.012;
    grp.add(jShadow);

    const profile = new THREE.Shape();
    profile.moveTo(-0.36, 0);
    profile.lineTo(0.36, 0);
    profile.lineTo(0.36, 0.16);
    profile.lineTo(0.18, 0.36);
    profile.lineTo(0.13, 1.08);
    profile.lineTo(0.09, 1.12);
    profile.lineTo(-0.09, 1.12);
    profile.lineTo(-0.13, 1.08);
    profile.lineTo(-0.18, 0.36);
    profile.lineTo(-0.36, 0.16);
    profile.closePath();

    const barrierGeo = trackGeo(
      new THREE.ExtrudeGeometry(profile, {
        depth: length,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: 0.015,
        bevelSegments: 2,
      }),
    );
    barrierGeo.rotateY(Math.PI / 2);
    barrierGeo.translate(-length / 2, 0, 0);

    const barrier = new THREE.Mesh(barrierGeo, mats.concreteBarrier);
    barrier.castShadow = !isSoftwareGl;
    barrier.receiveShadow = !isSoftwareGl;
    grp.add(barrier);

    const loopGeo = trackGeo(new THREE.TorusGeometry(0.06, 0.014, 6, 12, Math.PI));
    [-length * 0.28, length * 0.28].forEach((lx) => {
      const loop = new THREE.Mesh(loopGeo, mats.steelDark);
      loop.position.set(lx, 1.11, 0);
      grp.add(loop);
    });

    const stripe = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(length * 0.84, 0.1, 0.34)),
      mats.hazardStripe,
    );
    stripe.position.y = 0.92;
    grp.add(stripe);

    if (rot90) grp.rotation.y = Math.PI / 2;
    grp.position.set(cx, 0, cz);
    root.add(grp);

    const w = rot90 ? 0.78 : length + 0.06;
    const d = rot90 ? length + 0.06 : 0.78;
    registerBox(nextId('barrier'), cx, 0, cz, w, 1.15, d, 'concrete', { walkable: true });
  };

  // --- HELPER: Sandbag Emplacement ---
  const addSandbagEmplacement = (cx: number, cz: number, cols: number, rot90: boolean) => {
    const grp = new THREE.Group();
    const bagW = 0.68;
    const bagH = 0.26;
    const bagD = 0.44;
    const totalLen = cols * (bagW * 0.88);

    const bagShadow = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(totalLen + 0.4, 1.1)),
      mats.contactShadowMat,
    );
    bagShadow.rotation.x = -Math.PI / 2;
    bagShadow.position.y = 0.012;
    grp.add(bagShadow);

    const bagGeo = trackGeo(new THREE.SphereGeometry(0.32, 10, 8));
    for (let row = 0; row < 3; row++) {
      const rowCols = row === 2 ? Math.max(2, cols - 1) : cols;
      const startX = -((rowCols - 1) * bagW * 0.86) / 2;
      for (let col = 0; col < rowCols; col++) {
        const bag = new THREE.Mesh(bagGeo, mats.sandbagCloth);
        bag.scale.set(1.12, 0.44, 0.74);
        const stagger = row % 2 === 1 ? 0.06 : -0.04;
        bag.position.set(
          startX + col * (bagW * 0.86),
          bagH * 0.5 + row * (bagH * 0.92),
          stagger,
        );
        bag.rotation.y = (((col + row) % 3) - 1) * 0.08;
        bag.castShadow = !isSoftwareGl;
        bag.receiveShadow = !isSoftwareGl;
        grp.add(bag);
      }
    }

    if (rot90) grp.rotation.y = Math.PI / 2;
    grp.position.set(cx, 0, cz);
    root.add(grp);

    const w = rot90 ? bagD + 0.24 : totalLen + 0.1;
    const d = rot90 ? totalLen + 0.1 : bagD + 0.24;
    registerBox(nextId('sandbag'), cx, 0, cz, w, 0.94, d, 'concrete', { walkable: true });
  };

  // --- HELPER: Destructible Wooden Supply Crate ---
  const addSupplyCrate = (cx: number, cz: number, baseY: number = 0, sector: number = 1) => {
    const size = 1.15;
    const grp = new THREE.Group();
    const boxMesh = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(size, size, size)),
      mats.woodCrate,
    );
    boxMesh.position.y = size / 2;
    boxMesh.castShadow = !isSoftwareGl;
    boxMesh.receiveShadow = !isSoftwareGl;
    grp.add(boxMesh);

    const cornerGeo = trackGeo(new THREE.BoxGeometry(size + 0.04, 0.11, size + 0.04));
    const botTrim = new THREE.Mesh(cornerGeo, mats.steelDark);
    botTrim.position.y = 0.075;
    const topTrim = new THREE.Mesh(cornerGeo, mats.steelDark);
    topTrim.position.y = size - 0.075;
    grp.add(botTrim, topTrim);

    const stileGeo = trackGeo(new THREE.BoxGeometry(0.11, size - 0.24, 0.11));
    [
      [-size / 2 + 0.03, -size / 2 + 0.03],
      [size / 2 - 0.03, -size / 2 + 0.03],
      [-size / 2 + 0.03, size / 2 - 0.03],
      [size / 2 - 0.03, size / 2 - 0.03],
    ].forEach(([sx, sz]) => {
      const stile = new THREE.Mesh(stileGeo, mats.steelDark);
      stile.position.set(sx, size / 2, sz);
      grp.add(stile);
    });

    grp.position.set(cx, baseY, cz);
    root.add(grp);

    const cid = nextId('crate');
    registerBox(cid, cx, baseY, cz, size, size, size, 'wood', {
      walkable: true,
      destructibleHp: 55,
      sector,
    });
    destructibles.push({
      id: `prop-${cid}`,
      colliderId: cid,
      group: grp,
      position: new THREE.Vector3(cx, baseY + size / 2, cz),
      isExplosive: false,
      destroyed: false,
    });
  };

  // --- HELPER: Explosive Fuel Drum ---
  const addFuelDrum = (cx: number, cz: number, baseY: number = 0, sector: number = 1) => {
    const grp = new THREE.Group();
    const r = 0.38;
    const h = 1.12;
    const drum = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(r, r, h, 16)),
      mats.hazardDrum,
    );
    drum.position.y = h / 2;
    drum.castShadow = !isSoftwareGl;
    drum.receiveShadow = !isSoftwareGl;
    grp.add(drum);

    const ribGeo = trackGeo(new THREE.TorusGeometry(r + 0.015, 0.024, 8, 16));
    [0.03, 0.34, 0.78, h - 0.03].forEach((ry) => {
      const rib = new THREE.Mesh(ribGeo, mats.steelDark);
      rib.rotation.x = Math.PI / 2;
      rib.position.y = ry;
      grp.add(rib);
    });

    const band = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(r + 0.008, r + 0.008, 0.18, 16)),
      mats.hazardStripe,
    );
    band.position.y = h * 0.56;
    const bung = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8)),
      mats.steelGrate,
    );
    bung.position.set(0.14, h + 0.015, 0);
    grp.add(band, bung);

    grp.position.set(cx, baseY, cz);
    root.add(grp);

    const cid = nextId('drum');
    registerBox(cid, cx, baseY, cz, r * 2, h, r * 2, 'explosive', {
      destructibleHp: 30,
      isExplosive: true,
      sector,
    });
    destructibles.push({
      id: `prop-${cid}`,
      colliderId: cid,
      group: grp,
      position: new THREE.Vector3(cx, baseY + h / 2, cz),
      isExplosive: true,
      destroyed: false,
    });
  };

  // --- HELPER: Steel I-Beam Pillar ---
  const addSteelPillar = (cx: number, cz: number, height: number = 6.2) => {
    const grp = new THREE.Group();
    const core = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.56, height, 0.56)),
      mats.steelDark,
    );
    core.position.y = height / 2;
    core.castShadow = !isSoftwareGl;
    core.receiveShadow = !isSoftwareGl;
    const plinth = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.95, 0.65, 0.95)),
      mats.concreteBarrier,
    );
    plinth.position.y = 0.325;
    const band = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.6, 0.35, 0.6)),
      mats.hazardStripe,
    );
    band.position.y = 1.4;
    grp.add(core, plinth, band);

    grp.position.set(cx, 0, cz);
    root.add(grp);
    registerBox(nextId('pillar'), cx, 0, cz, 0.92, height, 0.92, 'metal');
  };

  // --- HELPER: Walkable Elevated Catwalk ---
  const addCatwalk = (cx: number, cz: number, w: number, d: number, deckY: number) => {
    const grp = new THREE.Group();
    const thickness = 0.24;
    const deck = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(w, thickness, d)),
      mats.steelGrate,
    );
    deck.position.y = deckY - thickness / 2;
    deck.castShadow = !isSoftwareGl;
    deck.receiveShadow = !isSoftwareGl;
    grp.add(deck);

    const legGeo = trackGeo(new THREE.BoxGeometry(0.24, deckY - thickness, 0.24));
    [
      [-w / 2 + 0.16, -d / 2 + 0.16],
      [w / 2 - 0.16, -d / 2 + 0.16],
      [-w / 2 + 0.16, d / 2 - 0.16],
      [w / 2 - 0.16, d / 2 - 0.16],
    ].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, mats.steelDark);
      leg.position.set(lx, (deckY - thickness) / 2, lz);
      grp.add(leg);
      registerBox(nextId('catleg'), cx + lx, 0, cz + lz, 0.26, deckY - thickness, 0.26, 'metal');
    });

    const railH = 0.95;
    const innerX = cx < 0 ? w / 2 - 0.08 : -w / 2 + 0.08;
    const cornerZ = -d / 2 + 0.08;
    const sideRailLen = d - 0.14;
    const sideRailCenterZ = 0.07;

    const topRail = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.08, 0.08, sideRailLen)),
      mats.hazardStripe,
    );
    topRail.position.set(innerX, deckY + railH, sideRailCenterZ);
    const midRail = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.06, 0.05, sideRailLen)),
      mats.steelDark,
    );
    midRail.position.set(innerX, deckY + railH * 0.52, sideRailCenterZ);
    const kickPlate = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.05, 0.14, sideRailLen)),
      mats.steelGrate,
    );
    kickPlate.position.set(innerX, deckY + 0.07, sideRailCenterZ);

    const endRailLen = w - 0.16;
    const endRailX = cx < 0 ? -0.06 : 0.06;
    const endRail = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(endRailLen, 0.08, 0.08)),
      mats.hazardStripe,
    );
    endRail.position.set(endRailX, deckY + railH, cornerZ);
    const endMidRail = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(endRailLen, 0.05, 0.06)),
      mats.steelDark,
    );
    endMidRail.position.set(endRailX, deckY + railH * 0.52, cornerZ);
    const cornerPost = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.11, railH + 0.08, 0.11)),
      mats.steelDark,
    );
    cornerPost.position.set(innerX, deckY + (railH + 0.08) / 2, cornerZ);
    grp.add(topRail, midRail, kickPlate, endRail, endMidRail, cornerPost);

    const postGeo = trackGeo(new THREE.BoxGeometry(0.09, railH + 0.04, 0.09));
    for (let pz = -d / 2 + 2.4; pz <= d / 2 - 0.2; pz += d / 3) {
      const post = new THREE.Mesh(postGeo, mats.steelDark);
      post.position.set(innerX, deckY + railH / 2, pz);
      grp.add(post);
    }

    grp.position.set(cx, 0, cz);
    root.add(grp);
    registerBox(nextId('catwalk'), cx, deckY - thickness, cz, w, thickness, d, 'metal', {
      walkable: true,
    });
    registerBox(nextId('catrail'), cx + innerX, deckY, cz, 0.18, railH + 0.05, d, 'metal');
    registerBox(nextId('catendrail'), cx, deckY, cz + cornerZ, w, railH + 0.05, 0.18, 'metal');
  };

  // --- HELPER: Elevated Steel Landing Deck ---
  const addLandingDeck = (
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    deckY: number,
    rails?: { north?: boolean; south?: boolean; west?: boolean; east?: boolean },
  ) => {
    const w = maxX - minX;
    const d = maxZ - minZ;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const thickness = 0.24;
    const grp = new THREE.Group();

    const deck = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(w, thickness, d)),
      mats.steelGrate,
    );
    deck.position.y = deckY - thickness / 2;
    deck.castShadow = !isSoftwareGl;
    deck.receiveShadow = !isSoftwareGl;
    grp.add(deck);

    const legGeo = trackGeo(new THREE.BoxGeometry(0.24, deckY - thickness, 0.24));
    [
      [-w / 2 + 0.16, -d / 2 + 0.16],
      [w / 2 - 0.16, -d / 2 + 0.16],
      [-w / 2 + 0.16, d / 2 - 0.16],
      [w / 2 - 0.16, d / 2 - 0.16],
    ].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, mats.steelDark);
      leg.position.set(lx, (deckY - thickness) / 2, lz);
      grp.add(leg);
      registerBox(nextId('deckleg'), cx + lx, 0, cz + lz, 0.26, deckY - thickness, 0.26, 'metal');
    });

    const railH = 0.95;
    const addEdgeRail = (rx: number, rz: number, rw: number, rd: number) => {
      const top = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(rw, 0.08, rd)), mats.hazardStripe);
      top.position.set(rx, deckY + railH, rz);
      const mid = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(rw * 0.96, 0.05, rd * 0.96)),
        mats.steelDark,
      );
      mid.position.set(rx, deckY + railH * 0.52, rz);
      grp.add(top, mid);
      for (let i = 0; i < 3; i++) {
        const f = i / 2 - 0.5;
        const post = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(0.09, railH + 0.04, 0.09)),
          mats.steelDark,
        );
        post.position.set(
          rx + (rw > rd ? f * (rw - 0.14) : 0),
          deckY + railH / 2,
          rz + (rd > rw ? f * (rd - 0.14) : 0),
        );
        grp.add(post);
      }
      registerBox(
        nextId('deckrail'),
        cx + rx,
        deckY,
        cz + rz,
        Math.max(0.18, rw),
        railH + 0.05,
        Math.max(0.18, rd),
        'metal',
      );
    };

    if (rails?.north) addEdgeRail(0, -d / 2 + 0.08, w - 0.26, 0.08);
    if (rails?.south) addEdgeRail(0, d / 2 - 0.08, w - 0.26, 0.08);
    if (rails?.west) addEdgeRail(-w / 2 + 0.08, 0, 0.08, d - 0.26);
    if (rails?.east) addEdgeRail(w / 2 - 0.08, 0, 0.08, d - 0.26);

    grp.position.set(cx, 0, cz);
    root.add(grp);
    registerBox(nextId('landingdeck'), cx, deckY - thickness, cz, w, thickness, d, 'metal', {
      walkable: true,
    });
  };

  // --- HELPER: Walkable Steel Ramp ---
  const addSteelRamp = (
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    axis: 'x' | 'z',
    yStart: number,
    yEnd: number,
  ) => {
    const w = maxX - minX;
    const d = maxZ - minZ;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const run = axis === 'x' ? w : d;
    const rise = yEnd - yStart;
    const hyp = Math.sqrt(run * run + rise * rise);
    const slopeAngle = Math.atan2(rise, run);

    const rampGrp = new THREE.Group();
    const plank = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(axis === 'x' ? hyp : w, 0.2, axis === 'z' ? hyp : d)),
      mats.steelGrate,
    );
    plank.castShadow = !isSoftwareGl;
    plank.receiveShadow = !isSoftwareGl;
    rampGrp.add(plank);

    const sideOffset = (axis === 'z' ? w : d) / 2 - 0.08;
    const stringerGeo = trackGeo(
      new THREE.BoxGeometry(axis === 'x' ? hyp : 0.14, 0.34, axis === 'z' ? hyp : 0.14),
    );
    const railGeo = trackGeo(
      new THREE.BoxGeometry(axis === 'x' ? hyp : 0.06, 0.06, axis === 'z' ? hyp : 0.06),
    );
    [-sideOffset, sideOffset].forEach((so) => {
      const stringer = new THREE.Mesh(stringerGeo, mats.steelDark);
      const rail = new THREE.Mesh(railGeo, mats.hazardStripe);
      if (axis === 'z') {
        stringer.position.set(so, -0.04, 0);
        rail.position.set(so, 0.92, 0);
      } else {
        stringer.position.set(0, -0.04, so);
        rail.position.set(0, 0.92, so);
      }
      rampGrp.add(stringer, rail);

      [-hyp * 0.36, 0, hyp * 0.36].forEach((rp) => {
        const post = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(0.07, 0.92, 0.07)),
          mats.steelDark,
        );
        if (axis === 'z') post.position.set(so, 0.46, rp);
        else post.position.set(rp, 0.46, so);
        rampGrp.add(post);
      });
    });

    if (axis === 'z') rampGrp.rotation.x = -slopeAngle;
    else rampGrp.rotation.z = slopeAngle;
    rampGrp.position.set(cx, (yStart + yEnd) / 2 - 0.08, cz);
    root.add(rampGrp);

    const midH = Math.max(0.22, (yStart + yEnd) * 0.5 - 0.22);
    const legPos =
      axis === 'z' ? [cx - w / 2 + 0.08, cx + w / 2 - 0.08] : [cz - d / 2 + 0.08, cz + d / 2 - 0.08];
    legPos.forEach((lp) => {
      const lx = axis === 'z' ? lp : cx;
      const lz = axis === 'z' ? cz : lp;
      const leg = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.2, midH, 0.2)),
        mats.steelDark,
      );
      leg.position.set(lx, midH / 2, lz);
      const foot = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.36, 0.12, 0.36)),
        mats.concreteBarrier,
      );
      foot.position.set(lx, 0.06, lz);
      root.add(leg, foot);
    });

    ramps.push({ id: nextId('ramp'), minX, maxX, minZ, maxZ, axis, yStart, yEnd });

    const segments = 4;
    for (let s = 0; s < segments; s++) {
      const t0 = s / segments;
      const t1 = (s + 1) / segments;
      const segMinY = Math.min(yStart + (yEnd - yStart) * t0, yStart + (yEnd - yStart) * t1);
      const segMaxY = Math.max(yStart + (yEnd - yStart) * t0, yStart + (yEnd - yStart) * t1);

      if (axis === 'z') {
        const z0 = minZ + d * t0;
        const z1 = minZ + d * t1;
        const scz = (z0 + z1) * 0.5;
        const sd = z1 - z0;
        [-sideOffset, sideOffset].forEach((so) => {
          registerBox(
            nextId('ramprail'),
            cx + so,
            Math.max(0, segMinY - 0.15),
            scz,
            0.22,
            segMaxY - Math.max(0, segMinY - 0.15) + 1.02,
            sd,
            'metal',
          );
        });
        if (segMinY > 0.35) {
          registerBox(
            nextId('rampunder'),
            cx,
            0,
            scz,
            w - 0.44,
            Math.max(0.15, segMinY - 0.16),
            sd - 0.04,
            'metal',
          );
        }
      } else {
        const x0 = minX + w * t0;
        const x1 = minX + w * t1;
        const scx = (x0 + x1) * 0.5;
        const sw = x1 - x0;
        [-sideOffset, sideOffset].forEach((so) => {
          registerBox(
            nextId('ramprail'),
            scx,
            Math.max(0, segMinY - 0.15),
            cz + so,
            sw,
            segMaxY - Math.max(0, segMinY - 0.15) + 1.02,
            0.22,
            'metal',
          );
        });
        if (segMinY > 0.35) {
          registerBox(
            nextId('rampunder'),
            scx,
            0,
            cz,
            sw - 0.04,
            Math.max(0.15, segMinY - 0.16),
            d - 0.44,
            'metal',
          );
        }
      }
    }
  };

  // --- HELPER: Multi-Part Floodlight Tower ---
  const addLightTower = (cx: number, cz: number, colorHex: number, addLight: boolean) => {
    const grp = new THREE.Group();
    const base = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.9, 0.5, 0.9)),
      mats.concreteBarrier,
    );
    base.position.y = 0.25;
    const pole = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.11, 0.14, 5.4, 10)),
      mats.steelDark,
    );
    pole.position.y = 3.0;
    const head = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.1, 0.42, 0.48)),
      mats.steelGrate,
    );
    head.position.set(0, 5.7, 0);
    const yoke = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.24, 0.12, 0.18)),
      mats.steelDark,
    );
    yoke.position.set(0, 5.5, 0);

    const lensMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 1.15,
        roughness: 0.25,
      }),
    );
    const lens = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.9, 0.25, 0.12)),
      lensMat,
    );
    lens.position.set(0, 5.65, 0.22);
    grp.add(base, pole, head, yoke, lens);

    if (addLight && securityLights.length < 6) {
      const pt = new THREE.PointLight(colorHex, 14, 24, 2.0);
      pt.position.set(cx, 4.9, cz);
      root.add(pt);
      securityLights.push(pt);
    }

    grp.position.set(cx, 0, cz);
    root.add(grp);
    registerBox(nextId('tower'), cx, 0, cz, 0.9, 5.9, 0.9, 'metal');
  };

  // --- HELPER: Sculpted Tactical MRAP Armored Vehicle ---
  const addArmoredVehicle = (cx: number, cz: number, desertPaint: boolean = false, yaw: number = 0) => {
    const grp = new THREE.Group();
    const shadow = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(3.4, 6.0)),
      mats.contactShadowMat,
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.015;
    grp.add(shadow);

    const chassis = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(2.04, 0.48, 4.65)),
      mats.steelDark,
    );
    chassis.position.set(0, 0.66, 0);
    chassis.castShadow = !isSoftwareGl;
    chassis.receiveShadow = !isSoftwareGl;
    grp.add(chassis);

    const hullProfile = new THREE.Shape();
    hullProfile.moveTo(-2.15, 0.82);
    hullProfile.lineTo(2.25, 0.82);
    hullProfile.lineTo(2.28, 1.38);
    hullProfile.lineTo(1.28, 1.52);
    hullProfile.lineTo(0.86, 1.98);
    hullProfile.lineTo(-2.05, 1.98);
    hullProfile.lineTo(-2.15, 1.65);
    hullProfile.closePath();

    const hullGeo = trackGeo(
      new THREE.ExtrudeGeometry(hullProfile, {
        depth: 2.02,
        bevelEnabled: true,
        bevelThickness: 0.04,
        bevelSize: 0.03,
        bevelSegments: 2,
      }),
    );
    hullGeo.rotateY(-Math.PI / 2);
    hullGeo.translate(1.01, 0, 0);
    const hull = new THREE.Mesh(hullGeo, desertPaint ? mats.vehicleDesert : mats.vehicleArmor);
    hull.castShadow = !isSoftwareGl;
    hull.receiveShadow = !isSoftwareGl;
    grp.add(hull);

    const windshieldFrame = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.82, 0.42, 0.06)),
      mats.steelDark,
    );
    windshieldFrame.position.set(0, 1.75, 1.06);
    windshieldFrame.rotation.x = -0.74;
    const windshield = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.72, 0.34, 0.07)),
      mats.opticGlass,
    );
    windshield.position.set(0, 1.75, 1.07);
    windshield.rotation.x = -0.74;
    grp.add(windshieldFrame, windshield);

    [-1, 1].forEach((dir) => {
      const sideFrame = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.036, 0.37, 0.78)),
        mats.steelDark,
      );
      sideFrame.position.set(dir * 1.055, 1.66, 0.48);
      const sideWin = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.032, 0.31, 0.7)),
        mats.opticGlass,
      );
      sideWin.position.set(dir * 1.066, 1.66, 0.48);
      const rearFrame = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.036, 0.33, 0.62)),
        mats.steelDark,
      );
      rearFrame.position.set(dir * 1.055, 1.66, -0.78);
      const rearWin = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.032, 0.27, 0.54)),
        mats.opticGlass,
      );
      rearWin.position.set(dir * 1.066, 1.66, -0.78);
      const step = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.22, 0.08, 2.2)),
        mats.steelGrate,
      );
      step.position.set(dir * 1.1, 0.52, -0.1);
      grp.add(sideFrame, sideWin, rearFrame, rearWin, step);
    });

    const bumper = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(2.24, 0.34, 0.36)),
      mats.steelGrate,
    );
    bumper.position.set(0, 0.56, 2.36);
    const bullBar = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.56, 0.48, 0.1)),
      mats.steelDark,
    );
    bullBar.position.set(0, 0.9, 2.4);
    grp.add(bumper, bullBar);

    const turretRing = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.56, 0.64, 0.24, 12)),
      mats.steelDark,
    );
    turretRing.position.set(0, 2.08, -0.32);
    const gunCradle = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.26, 0.28, 0.56)),
      mats.gunmetal,
    );
    gunCradle.position.set(0, 2.3, -0.32);
    const hmgBarrel = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.032, 0.042, 0.96, 10)),
      mats.steelDark,
    );
    hmgBarrel.rotation.x = Math.PI / 2;
    hmgBarrel.position.set(0, 2.34, 0.34);
    grp.add(turretRing, gunCradle, hmgBarrel);

    const headlightMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfff8e7,
        emissive: 0xffe4b5,
        emissiveIntensity: 2.0,
        roughness: 0.15,
      }),
    );
    [-0.74, 0.74].forEach((hx) => {
      const lamp = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.24, 0.12, 0.05)),
        headlightMat,
      );
      lamp.position.set(hx, 1.04, 2.34);
      grp.add(lamp);
    });

    const tireGeo = trackGeo(new THREE.CylinderGeometry(0.48, 0.48, 0.36, 16));
    const rimGeo = trackGeo(new THREE.CylinderGeometry(0.25, 0.25, 0.38, 10));
    [
      [-1.04, 1.48],
      [1.04, 1.48],
      [-1.04, -1.42],
      [1.04, -1.42],
    ].forEach(([wx, wz]) => {
      const tire = new THREE.Mesh(tireGeo, mats.tireRubber);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(wx, 0.48, wz);
      tire.castShadow = !isSoftwareGl;
      const rim = new THREE.Mesh(rimGeo, mats.steelGrate);
      rim.rotation.z = Math.PI / 2;
      rim.position.set(wx, 0.48, wz);
      grp.add(tire, rim);
    });

    grp.position.set(cx, 0, cz);
    grp.rotation.y = yaw;
    root.add(grp);
    const cos = Math.abs(Math.cos(yaw));
    const sin = Math.abs(Math.sin(yaw));
    registerBox(
      nextId('mrap'),
      cx,
      0,
      cz,
      2.48 * cos + 5.14 * sin,
      2.48,
      5.14 * cos + 2.48 * sin,
      'metal',
    );
  };

  // --- HELPER: Industrial Turbine Generator ---
  const addTurbine = (cx: number, cz: number) => {
    const grp = new THREE.Group();
    const plinth = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(3.4, 0.42, 5.4)),
      mats.concreteBarrier,
    );
    plinth.position.y = 0.21;
    plinth.receiveShadow = !isSoftwareGl;
    grp.add(plinth);

    const hull = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(1.25, 1.25, 4.4, 20)),
      mats.steelGrate,
    );
    hull.rotation.x = Math.PI / 2;
    hull.position.y = 1.65;
    hull.castShadow = !isSoftwareGl;
    hull.receiveShadow = !isSoftwareGl;
    grp.add(hull);

    const capGeo = trackGeo(new THREE.SphereGeometry(1.24, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2));
    [-2.2, 2.2].forEach((czOff, idx) => {
      const cap = new THREE.Mesh(capGeo, mats.steelDark);
      cap.rotation.x = idx === 0 ? -Math.PI / 2 : Math.PI / 2;
      cap.position.set(0, 1.65, czOff);
      grp.add(cap);
    });

    const ringGeo = trackGeo(new THREE.TorusGeometry(1.31, 0.08, 8, 22));
    [-1.4, 0, 1.4].forEach((rz) => {
      const ring = new THREE.Mesh(ringGeo, mats.steelDark);
      ring.position.set(0, 1.65, rz);
      grp.add(ring);
    });

    const pipeGeo = trackGeo(new THREE.CylinderGeometry(0.16, 0.16, 1.38, 10));
    const flangeGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 10));
    const stemGeo = trackGeo(new THREE.CylinderGeometry(0.045, 0.045, 0.28, 8));
    [-1, 1].forEach((dir) => {
      const px = dir * 1.12;
      const pipe = new THREE.Mesh(pipeGeo, mats.copperBrass);
      pipe.position.set(px, 1.09, 0);
      const flange = new THREE.Mesh(flangeGeo, mats.steelDark);
      flange.position.set(px, 1.72, 0);
      const stem = new THREE.Mesh(stemGeo, mats.copperBrass);
      stem.rotation.z = Math.PI / 2;
      stem.position.set(px + dir * 0.14, 1.18, 0);
      const valveWheel = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(0.22, 0.032, 8, 14)),
        mats.hazardDrum,
      );
      valveWheel.rotation.y = Math.PI / 2;
      valveWheel.position.set(px + dir * 0.28, 1.18, 0);
      grp.add(pipe, flange, stem, valveWheel);
    });

    const stackGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.28, 2.1, 12));
    const stackRimGeo = trackGeo(new THREE.TorusGeometry(0.25, 0.045, 8, 14));
    [-0.95, 0.95].forEach((sz) => {
      const stack = new THREE.Mesh(stackGeo, mats.steelDark);
      stack.position.set(0, 3.25, sz);
      const stackRim = new THREE.Mesh(stackRimGeo, mats.steelGrate);
      stackRim.rotation.x = Math.PI / 2;
      stackRim.position.set(0, 4.3, sz);
      grp.add(stack, stackRim);
      registerBox(nextId('turbstack'), cx, 2.9, cz + sz, 0.6, 1.46, 0.6, 'metal');
    });

    grp.position.set(cx, 0, cz);
    root.add(grp);
    registerBox(nextId('turbine'), cx, 0, cz, 3.4, 2.9, 5.4, 'metal');
  };

  // =========================================================================
  // PERIMETER ENCLOSURE & SHARED OBJECTIVES
  // =========================================================================
  if (biome === 'rooftop') {
    // High-altitude rooftop parapet + glass safety balustrades so metropolis towers shine
    addWall(-23, 1.5, 1.4, 1.5, 71.6);
    addWall(23, 1.5, 1.4, 1.5, 71.6);
    addWall(0, 38, 47.4, 1.5, 1.4);
    addWall(0, -35, 47.4, 1.5, 1.4);
    const glassRailL = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.12, 1.4, 70)),
      mats.glassAtrium,
    );
    glassRailL.position.set(-22.2, 2.2, 1.5);
    const glassRailR = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.12, 1.4, 70)),
      mats.glassAtrium,
    );
    glassRailR.position.set(22.2, 2.2, 1.5);
    root.add(glassRailL, glassRailR);
  } else {
    addWall(-23, 1.5, 1.4, 5.2, 71.6);
    addWall(23, 1.5, 1.4, 5.2, 71.6);
    addWall(0, 38, 47.4, 5.2, 1.4);
    addWall(0, -35, 47.4, 5.2, 1.4);
  }

  // Transition walls (z = +10 double doorways, z = -16 central doorway)
  addWallWithDoorway(-11.55, 10, 21.5, 6.0, 3.6, 6.2, 1.2);
  addWallWithDoorway(11.55, 10, 21.5, 6.0, 3.6, 6.2, 1.2);
  addWall(0, 10, 1.6, 6.2, 1.36);
  addWallWithDoorway(0, -16, 44.6, 7.6, 3.8, 6.2, 1.4);

  // Enclosed Ceiling for Sunken Metro (op07) with glowing fluorescent ceiling strips & station lights
  if (levelConfig.isIndoor) {
    const ceiling = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(47.4, 0.5, 74.4)),
      mats.concreteWall,
    );
    ceiling.position.set(0, 6.65, 1.5);
    ceiling.castShadow = !isSoftwareGl;
    ceiling.receiveShadow = !isSoftwareGl;
    root.add(ceiling);
    const stripMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        emissive: 0xe6ecf2,
        emissiveIntensity: 1.1,
      }),
    );
    for (let lz = -30; lz <= 32; lz += 10) {
      [-9, 9].forEach((lx) => {
        const strip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.6, 0.14, 0.45)), stripMat);
        strip.position.set(lx, 6.32, lz);
        root.add(strip);
      });
    }
    [22, 4, -10, -25].forEach((sz) => {
      if (securityLights.length < 6) {
        const stLight = new THREE.PointLight(0xe6ecf2, 13, 22, 2.0);
        stLight.position.set(0, 4.5, sz);
        root.add(stLight);
        securityLights.push(stLight);
      }
    });
  }

  // Shared Sector 2 Intel Terminal (0, 0, -11.8)
  const terminalPos = new THREE.Vector3(0, 0, -11.8);
  const termGrp = new THREE.Group();
  const rack = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.6, 2.1, 0.9)), mats.steelDark);
  rack.position.y = 1.05;
  rack.castShadow = !isSoftwareGl;
  termGrp.add(rack);

  const terminalScreenMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.8,
      roughness: 0.25,
    }),
  );
  const screen = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.05, 0.62, 0.08)), terminalScreenMat);
  screen.position.set(0, 1.48, 0.46);
  const desk = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.75, 0.12, 0.65)), mats.steelGrate);
  desk.position.set(0, 0.95, 0.52);
  termGrp.add(screen, desk);
  termGrp.position.copy(terminalPos);
  root.add(termGrp);
  registerBox(nextId('terminal'), terminalPos.x, 0, terminalPos.z, 1.75, 2.1, 1.2, 'metal');

  // Shared Sector 3 Extraction Helipad (0, 0, -29.5)
  const extractionPos = new THREE.Vector3(0, 0, -29.5);
  const pad = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(4.5, 4.8, 0.1, 8)),
    mats.concreteFloor,
  );
  pad.position.set(extractionPos.x, 0.05, extractionPos.z);
  pad.receiveShadow = !isSoftwareGl;
  root.add(pad);

  const padStripeMat = trackMat(mats.hazardStripe.clone());
  padStripeMat.polygonOffset = true;
  padStripeMat.polygonOffsetFactor = -2;
  padStripeMat.polygonOffsetUnits = -2;

  const ringPad = new THREE.Mesh(
    trackGeo(new THREE.RingGeometry(3.45, 3.9, 32)),
    padStripeMat,
  );
  ringPad.rotation.x = -Math.PI / 2;
  ringPad.position.set(extractionPos.x, 0.104, extractionPos.z);
  root.add(ringPad);

  const hSideGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.016, 2.75));
  const hBarL = new THREE.Mesh(hSideGeo, padStripeMat);
  hBarL.position.set(extractionPos.x - 0.95, 0.108, extractionPos.z);
  const hBarR = new THREE.Mesh(hSideGeo, padStripeMat);
  hBarR.position.set(extractionPos.x + 0.95, 0.108, extractionPos.z);
  const hCross = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.48, 0.016, 0.42)),
    padStripeMat,
  );
  hCross.position.set(extractionPos.x, 0.108, extractionPos.z);
  root.add(hBarL, hBarR, hCross);

  const extractionBeaconMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x334155,
      emissive: 0x10b981,
      emissiveIntensity: 0.4,
      roughness: 0.35,
    }),
  );
  const padLightGeo = trackGeo(new THREE.CylinderGeometry(0.12, 0.16, 0.09, 8));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const pl = new THREE.Mesh(padLightGeo, extractionBeaconMat);
    pl.position.set(
      extractionPos.x + Math.cos(a) * 4.15,
      0.11,
      extractionPos.z + Math.sin(a) * 4.15,
    );
    root.add(pl);
  }

  const beaconPost = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.14, 0.22, 1.35, 10)),
    mats.steelDark,
  );
  beaconPost.position.set(extractionPos.x, 0.675, extractionPos.z - 3.6);
  const beaconOrb = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.24, 12, 12)),
    extractionBeaconMat,
  );
  beaconOrb.position.set(extractionPos.x, 1.5, extractionPos.z - 3.6);
  root.add(beaconPost, beaconOrb);
  registerBox(nextId('beacon'), extractionPos.x, 0, extractionPos.z - 3.6, 0.54, 1.78, 0.54, 'metal');

  // Shared Emergency Bulkhead Lights
  const emergencyRedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      emissive: biome === 'bunker' ? 0xef4444 : 0xb91c1c,
      emissiveIntensity: 1.9,
      roughness: 0.22,
    }),
  );
  [
    [-14.6, 10.65],
    [-7.8, 10.65],
    [7.8, 10.65],
    [14.6, 10.65],
    [-4.3, -15.25],
    [4.3, -15.25],
  ].forEach(([ex, ez]) => {
    const cage = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, 0.32, 0.16)), mats.steelDark);
    cage.position.set(ex, 2.95, ez);
    const bulbRed = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.08, 8, 8)), emergencyRedMat);
    bulbRed.position.set(ex, 2.95, ez + 0.07);
    root.add(cage, bulbRed);
  });

  // =========================================================================
  // BIOME & OPERATION-SPECIFIC LEVEL GEOMETRY, LANDMARKS & LIVING WORLD
  // =========================================================================
  if (levelConfig.id === 'op01') {
    // Preserve exact op01 walkable coordinates for test compatibility + enrich skyline/living world
    [-24, -10, 4, 22, 31].forEach((pz) => {
      addSteelPillar(-22.15, pz, 5.2);
      addSteelPillar(22.15, pz, 5.2);
    });

    addJerseyBarrier(-4.2, 28.5, 3.2, false);
    addJerseyBarrier(4.2, 28.5, 3.2, false);
    addSupplyCrate(-5.6, 27.2, 0, 1);
    addFuelDrum(5.6, 27.4, 0, 1);

    addShippingContainer(-11.5, 22, true, 'olive', 0);
    addShippingContainer(11.5, 21.5, true, 'crimson', 0);
    addShippingContainer(-11.5, 22, true, 'crimson', 2.75);

    addJerseyBarrier(-1.6, 20.5, 3.6, false);
    addJerseyBarrier(2.4, 17.2, 3.6, false);
    addSandbagEmplacement(-7.4, 24.4, 4, false);
    addSandbagEmplacement(2.8, 13.4, 4, false);
    addSupplyCrate(14.2, 19.2, 0, 1);
    addFuelDrum(-8.2, 17.5, 0, 1);
    addFuelDrum(1.8, 15.8, 0, 1);
    addArmoredVehicle(6.6, 23.6, false);

    addSteelRamp(10.2, 12.8, 24.65, 30.2, 'z', 2.79, 0.0);
    addSteelRamp(-15.8, -12.9, 27.85, 33.25, 'z', 2.78, 0.0);
    addLandingDeck(-18.7, -12.9, 25.25, 27.85, 2.78, { west: true });
    addSteelRamp(-18.7, -15.8, 21.05, 25.25, 'z', 5.54, 2.78);
    addLandingDeck(-18.7, -12.85, 18.85, 21.05, 5.54, { north: true, west: true });

    addLightTower(-20.2, 29.5, levelConfig.accentLightColor, true);
    addLightTower(16, 15, 0xf0f6ff, true);

    // Overhead Courtyard Pipe Gantry (grounded columns with concrete plinths + pipe saddles + wall flanges)
    const gantryPipe = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.24, 0.24, 45, 10)),
      mats.steelDark,
    );
    gantryPipe.rotation.z = Math.PI / 2;
    gantryPipe.position.set(0, 5.55, 18.2);
    const copperLine = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.14, 0.14, 45, 10)),
      mats.copperBrass,
    );
    copperLine.rotation.z = Math.PI / 2;
    copperLine.position.set(0, 5.9, 18.2);
    root.add(gantryPipe, copperLine);
    registerBox(nextId('gantrypipe'), 0, 5.28, 18.2, 45, 0.88, 0.68, 'metal');

    [-22.25, 22.25].forEach((wx) => {
      const wFlange = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.42, 0.42, 0.18, 10)),
        mats.concreteBarrier,
      );
      wFlange.rotation.z = Math.PI / 2;
      wFlange.position.set(wx, 5.55, 18.2);
      root.add(wFlange);
    });

    [-17.5, 17.5].forEach((gx) => {
      const plinth = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.86, 0.42, 0.86)),
        mats.concreteBarrier,
      );
      plinth.position.set(gx, 0.21, 18.2);
      const col = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.36, 5.75, 0.36)), mats.steelDark);
      col.position.set(gx, 3.22, 18.2);
      const saddle = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.56, 0.72, 0.68)),
        mats.hazardStripe,
      );
      saddle.position.set(gx, 5.72, 18.2);
      root.add(plinth, col, saddle);
      registerBox(nextId('gantrycol'), gx, 0, 18.2, 0.95, 5.8, 0.95, 'metal');
    });

    // Sector 2 Turbine Hall
    const hallFillLight = new THREE.PointLight(0xede9e0, 16, 28, 2.0);
    hallFillLight.position.set(0, 5.0, 0);
    root.add(hallFillLight);
    securityLights.push(hallFillLight);

    addTurbine(-6.8, -1.5);
    addTurbine(6.8, -1.5);
    addSteelPillar(-12.4, 2.5, 6.2);
    addSteelPillar(12.4, 2.5, 6.2);
    addSteelPillar(-12.4, -9.5, 6.2);
    addSteelPillar(12.4, -9.5, 6.2);

    addCatwalk(-18.55, -4.75, 7.5, 13.5, 2.4);
    addSteelRamp(-21.4, -15.0, 2.0, 6.8, 'z', 2.4, 0.0);
    addCatwalk(18.55, -4.75, 7.5, 13.5, 2.4);
    addSteelRamp(15.0, 21.4, 2.0, 6.8, 'z', 2.4, 0.0);

    addJerseyBarrier(0, 3.2, 3.8, false);
    addSupplyCrate(-1.8, -8.5, 0, 2);
    addSupplyCrate(1.8, -8.5, 0, 2);
    addFuelDrum(-4.2, -5.8, 0, 2);
    addFuelDrum(4.2, -5.8, 0, 2);
    addFuelDrum(17.5, -4.5, 2.4, 2);
    addLightTower(-5.2, -13.2, levelConfig.accentLightColor, true);

    // Sector 3 Containers & Ramps
    addShippingContainer(-13.5, -24.5, false, 'olive', 0);
    addShippingContainer(13.5, -24.5, false, 'crimson', 0);
    addSteelRamp(-15.0, -12.0, -31.0, -25.85, 'z', 0.0, 2.79);
    addSteelRamp(12.0, 15.0, -31.0, -25.85, 'z', 0.0, 2.79);
    addJerseyBarrier(-5.2, -21.5, 3.4, false);
    addJerseyBarrier(5.2, -21.5, 3.4, false);
    addSandbagEmplacement(-8.8, -19.2, 3, false);
    addSandbagEmplacement(8.8, -19.2, 3, false);
    addSupplyCrate(-6.2, -26.5, 0, 3);
    addSupplyCrate(6.2, -26.5, 0, 3);
    addFuelDrum(-4.5, -24.8, 0, 3);
    addFuelDrum(4.5, -24.8, 0, 3);
    addLightTower(6.2, -31.8, 0xf0f6ff, true);

    // AAA World Landmarks & Living World around Refinery
    addCoolingTower(assetCtx, -46, -42, 1.05);
    addCoolingTower(assetCtx, 48, -46, 1.15);
    addGantryCrane(assetCtx, -36, 10, 14, 13);
    addRadarDish(assetCtx, 36, 0, -22, 1.05);
    addBlackhawkHelicopter(assetCtx, 13, 8.2, -39, -0.55, false);
  } else {
    // =========================================================================
    // OPERATIONS 02..11 — DISTINCT ARCHITECTURES, LANDMARKS & LIVING ECOLOGIES
    // =========================================================================
    // Common Sector 2 elevated tactical walkways (catwalks) for vertical gunfights
    addCatwalk(-18.55, -4.75, 7.5, 13.5, 2.4);
    addSteelRamp(-21.4, -15.0, 2.0, 6.8, 'z', 2.4, 0.0);
    addCatwalk(18.55, -4.75, 7.5, 13.5, 2.4);
    addSteelRamp(15.0, 21.4, 2.0, 6.8, 'z', 2.4, 0.0);

    const hallLight = new THREE.PointLight(levelConfig.accentLightColor, 16, 28, 2.0);
    hallLight.position.set(0, 5.0, -2);
    root.add(hallLight);
    securityLights.push(hallLight);

    // Common light towers & tactical supply/explosive cover
    addLightTower(-19.5, 29.0, levelConfig.accentLightColor, true);
    addLightTower(16.0, 15.0, levelConfig.accentLightColor, true);
    addLightTower(-5.2, -13.2, levelConfig.accentLightColor, true);
    addLightTower(6.2, -31.8, levelConfig.accentLightColor, true);

    addSupplyCrate(-5.4, 27.2, 0, 1);
    addFuelDrum(5.4, 27.2, 0, 1);
    addSupplyCrate(-2.2, -8.5, 0, 2);
    addSupplyCrate(2.2, -8.5, 0, 2);
    addFuelDrum(-4.4, -5.8, 0, 2);
    addFuelDrum(4.4, -5.8, 0, 2);
    addSupplyCrate(-6.2, -26.5, 0, 3);
    addSupplyCrate(6.2, -26.5, 0, 3);
    addFuelDrum(-4.5, -24.8, 0, 3);
    addFuelDrum(4.5, -24.8, 0, 3);

    if (biome === 'desert') {
      // op02: Scorched Convoy — Desert MRAPs, sandstone boulders, sandbags, desert palms
      addArmoredVehicle(6.5, 24.5, true, -0.25);
      addArmoredVehicle(-6.8, 17.5, true, 0.35);
      addArmoredVehicle(0, -1.5, true, 0.15);
      addBoulderCluster(assetCtx, -13.5, 24.0, 2.3, mats.sandstoneRock, true);
      addBoulderCluster(assetCtx, 14.5, 20.0, 2.5, mats.sandstoneRock, true);
      addBoulderCluster(assetCtx, -13.5, -24.0, 2.2, mats.sandstoneRock, true);
      addBoulderCluster(assetCtx, 13.5, -24.0, 2.1, mats.sandstoneRock, true);
      addShippingContainer(-12.0, 19.5, true, 'olive', 0);
      addSandbagEmplacement(-3.6, 28.2, 4, false);
      addSandbagEmplacement(3.6, 28.2, 4, false);
      addSandbagEmplacement(-6.0, -21.5, 4, false);
      addSandbagEmplacement(6.0, -21.5, 4, false);
      [
        [-29, 25], [29, 22], [-31, -8], [31, -12], [-28, -32], [28, -32],
      ].forEach(([tx, tz]) => addTree(assetCtx, tx, tz, 'palm', 1.15));
      addBlackhawkHelicopter(assetCtx, 14, 8.8, -40, -0.5, false);
    } else if (biome === 'arctic') {
      // op03: Frostline Outpost — Snow pines, icy boulders, radar dishes, navy containers
      addShippingContainer(-11.5, 22.0, true, 'navy', 0);
      addShippingContainer(11.5, 22.0, true, 'crimson', 0);
      addSteelRamp(10.2, 12.8, 25.0, 30.2, 'z', 2.79, 0.0);
      addRadarDish(assetCtx, -8.0, 0, -2.0, 0.9);
      addRadarDish(assetCtx, 8.0, 0, -2.0, 0.9);
      addRadarDish(assetCtx, -14.5, 0, -24.5, 1.0);
      addBoulderCluster(assetCtx, 14.0, -24.5, 2.4, mats.concreteBarrier, true);
      addJerseyBarrier(-4.2, 28.5, 3.2, false);
      addJerseyBarrier(4.2, 28.5, 3.2, false);
      addJerseyBarrier(-5.2, -21.5, 3.4, false);
      addJerseyBarrier(5.2, -21.5, 3.4, false);
      [
        [-19, 24], [19, 26], [-28, 30], [28, 28], [-30, 8], [30, 6],
        [-30, -14], [30, -16], [-28, -32], [28, -32], [-18, -42], [18, -42],
      ].forEach(([tx, tz]) => addTree(assetCtx, tx, tz, 'snowPine', 1.05));
      addBlackhawkHelicopter(assetCtx, -13, 8.5, -40, 0.55, false);
    } else if (biome === 'jungle') {
      // op04: Verdant Ruin — Palms, pine jungle canopy, stone ruins, boulders
      addTree(assetCtx, -15.5, 26.0, 'palm', 1.2);
      addTree(assetCtx, 15.5, 26.5, 'palm', 1.15);
      addTree(assetCtx, -17.0, 17.5, 'pine', 1.1);
      addTree(assetCtx, 17.0, 17.5, 'pine', 1.1);
      addBoulderCluster(assetCtx, -10.5, 22.0, 2.4, mats.jungleMoss, true);
      addBoulderCluster(assetCtx, 10.5, 21.0, 2.3, mats.jungleMoss, true);
      addBoulderCluster(assetCtx, -7.2, -1.5, 2.2, mats.jungleMoss, true);
      addBoulderCluster(assetCtx, 7.2, -1.5, 2.2, mats.jungleMoss, true);
      addWall(-13.0, -24.0, 4.5, 2.8, 1.4, 0, mats.sandstoneRock);
      addWall(13.0, -24.0, 4.5, 2.8, 1.4, 0, mats.sandstoneRock);
      addSandbagEmplacement(-3.8, 28.0, 4, false);
      addSandbagEmplacement(3.8, 28.0, 4, false);
      addSandbagEmplacement(-5.2, -21.0, 4, false);
      addSandbagEmplacement(5.2, -21.0, 4, false);
      [
        [-28, 28], [28, 28], [-32, 12], [32, 12], [-30, -10], [30, -10], [-28, -30], [28, -30],
      ].forEach(([tx, tz], i) => addTree(assetCtx, tx, tz, i % 2 === 0 ? 'palm' : 'pine', 1.3));
      addBlackhawkHelicopter(assetCtx, 12, 9.0, -40, -0.45, false);
    } else if (biome === 'harbor') {
      // op05: Black Harbor — Gantry cranes, navy/crimson containers, harbor pier, freighter silhouette
      addShippingContainer(-11.5, 22.0, true, 'navy', 0);
      addShippingContainer(11.5, 21.5, true, 'crimson', 0);
      addShippingContainer(-11.5, 22.0, true, 'olive', 2.75);
      addSteelRamp(10.2, 12.8, 24.65, 30.2, 'z', 2.79, 0.0);
      addShippingContainer(-13.5, -24.5, false, 'navy', 0);
      addShippingContainer(13.5, -24.5, false, 'crimson', 0);
      addSteelRamp(-15.0, -12.0, -31.0, -25.85, 'z', 0.0, 2.79);
      addArmoredVehicle(5.8, 24.0, false, 0.15);
      addTurbine(-6.8, -1.5);
      addTurbine(6.8, -1.5);
      addGantryCrane(assetCtx, -32, 18, 14, 14);
      addGantryCrane(assetCtx, 32, -16, 14, 14);
      addRadarDish(assetCtx, -34, 0, -32, 1.1);
      addJerseyBarrier(-4.2, 28.5, 3.2, false);
      addJerseyBarrier(4.2, 28.5, 3.2, false);
      // Detailed Moored Container Freighter Ship off the east pier
      addFreighterShip(assetCtx, 44, 0);
      addBlackhawkHelicopter(assetCtx, 13, 8.2, -39, -0.5, false);
    } else if (biome === 'volcanic') {
      // op06: Ashen Citadel — Cooling towers, dark obsidian basalt boulders, charred trees, lava condensers
      const darkObsidianRock = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x201a19,
          roughness: 0.9,
          metalness: 0.14,
          flatShading: true,
        }),
      );
      addBoulderCluster(assetCtx, -11.5, 22.5, 2.5, darkObsidianRock, true);
      addBoulderCluster(assetCtx, 11.5, 21.5, 2.5, darkObsidianRock, true);
      addBoulderCluster(assetCtx, -13.0, -24.0, 2.4, darkObsidianRock, true);
      addBoulderCluster(assetCtx, 13.0, -24.0, 2.4, darkObsidianRock, true);
      addChemicalVat(assetCtx, -6.8, -1.5, false);
      addChemicalVat(assetCtx, 6.8, -1.5, false);
      addArmoredVehicle(0, 19.5, false, 0.4);
      addJerseyBarrier(-4.2, 28.5, 3.2, false);
      addJerseyBarrier(4.2, 28.5, 3.2, false);
      addJerseyBarrier(-5.2, -21.5, 3.4, false);
      addJerseyBarrier(5.2, -21.5, 3.4, false);
      [
        [-19, 28], [19, 28], [-29, 16], [29, 16], [-29, -24], [29, -24],
      ].forEach(([tx, tz]) => addTree(assetCtx, tx, tz, 'charred', 1.2));
      addCoolingTower(assetCtx, -46, -42, 1.15);
      addCoolingTower(assetCtx, 48, -42, 1.2);
    } else if (biome === 'metro') {
      // op07: Sunken Metro — Parked Subway Cars, turnstile barriers, tiled pillars
      addSubwayCar(assetCtx, -11.8, 22.0, 0);
      addSubwayCar(assetCtx, 11.8, 22.0, 0);
      addSubwayCar(assetCtx, -7.8, -1.5, 0);
      addSubwayCar(assetCtx, 7.8, -1.5, 0);
      addSteelPillar(-12.4, 31.0, 6.4);
      addSteelPillar(12.4, 31.0, 6.4);
      addSteelPillar(-12.4, -22.5, 6.4);
      addSteelPillar(12.4, -22.5, 6.4);
      addJerseyBarrier(-4.2, 28.5, 3.2, false);
      addJerseyBarrier(4.2, 28.5, 3.2, false);
      addJerseyBarrier(-5.2, -21.5, 3.4, false);
      addJerseyBarrier(5.2, -21.5, 3.4, false);
      addSandbagEmplacement(0, 18.0, 4, false);
    } else if (biome === 'mediterranean') {
      // op08: Golden Dawn — Terracotta villa walls, cypress/palm avenues, parked Blackhawk, radar
      addWall(-11.5, 22.0, 2.6, 2.8, 6.2, 0, mats.terracottaWall);
      addWall(11.5, 22.0, 2.6, 2.8, 6.2, 0, mats.terracottaWall);
      addArmoredVehicle(-6.2, 20.0, true, 0.2);
      addRadarDish(assetCtx, -14.5, 0, -24.5, 1.0);
      addTurbine(7.5, -1.5);
      addBoulderCluster(assetCtx, -7.5, -1.5, 2.1, mats.sandstoneRock, true);
      addSandbagEmplacement(-3.8, 28.2, 4, false);
      addSandbagEmplacement(3.8, 28.2, 4, false);
      addSandbagEmplacement(-5.2, -21.5, 4, false);
      addSandbagEmplacement(5.2, -21.5, 4, false);
      [
        [-19, 28], [19, 28], [-19, 16], [19, 16], [-29, 22], [29, 22], [-29, -18], [29, -18],
      ].forEach(([tx, tz], i) => addTree(assetCtx, tx, tz, i % 2 === 0 ? 'cypress' : 'palm', 1.15));
      // Parked Extraction Blackhawk right beside Sector 3 pad apron (solid hull collision)
      addBlackhawkHelicopter(assetCtx, 12.8, 0, -25.0, -0.75, true);
    } else if (biome === 'chemical') {
      // op09: Yellowcake Quarry — Toxic chemical vats, gantry cranes, hazard containers
      addChemicalVat(assetCtx, -11.5, 22.0, true);
      addChemicalVat(assetCtx, 11.5, 22.0, true);
      addChemicalVat(assetCtx, -6.8, -1.5, true);
      addChemicalVat(assetCtx, 6.8, -1.5, true);
      addShippingContainer(-13.5, -24.5, false, 'navy', 0);
      addShippingContainer(13.5, -24.5, false, 'olive', 0);
      addSteelRamp(-15.0, -12.0, -31.0, -25.85, 'z', 0.0, 2.79);
      addSteelRamp(12.0, 15.0, -31.0, -25.85, 'z', 0.0, 2.79);
      addGantryCrane(assetCtx, 0, 18.0, 28, 12);
      addJerseyBarrier(-4.2, 28.5, 3.2, false);
      addJerseyBarrier(4.2, 28.5, 3.2, false);
      addJerseyBarrier(-5.2, -21.5, 3.4, false);
      addJerseyBarrier(5.2, -21.5, 3.4, false);
      addBlackhawkHelicopter(assetCtx, -13, 8.8, -40, 0.55, false);
    } else if (biome === 'rooftop') {
      // op10: Skyfall Penthouse — Glass Atrium skylight, HVAC pods, skyscraper skyline below
      const skylight = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(22, 0.35, 18)),
        mats.glassAtrium,
      );
      skylight.position.set(0, 6.4, -3);
      root.add(skylight);
      addShippingContainer(-11.5, 22.0, true, 'navy', 0);
      addShippingContainer(11.5, 22.0, true, 'navy', 0);
      addTurbine(-6.8, -1.5);
      addTurbine(6.8, -1.5);
      addJerseyBarrier(-4.2, 28.5, 3.2, false);
      addJerseyBarrier(4.2, 28.5, 3.2, false);
      addJerseyBarrier(-5.2, -21.5, 3.4, false);
      addJerseyBarrier(5.2, -21.5, 3.4, false);
      addRadarDish(assetCtx, -14.5, 0, -24.5, 0.95);
      addBlackhawkHelicopter(assetCtx, 13, 7.2, -38, -0.5, false);
    } else if (biome === 'bunker') {
      // op11: Red Silo — Twin ICBM Missile Silo Units, snow pines, radar dishes, blast barriers
      addMissileSiloUnit(assetCtx, -12.5, -23.5);
      addMissileSiloUnit(assetCtx, 12.5, -23.5);
      addArmoredVehicle(6.6, 23.6, false, -0.2);
      addShippingContainer(-11.5, 22.0, true, 'crimson', 0);
      addShippingContainer(11.5, 22.0, true, 'navy', 0);
      addTurbine(-6.8, -1.5);
      addTurbine(6.8, -1.5);
      addRadarDish(assetCtx, -32, 0, 12, 1.1);
      addRadarDish(assetCtx, 32, 0, -12, 1.1);
      addJerseyBarrier(-4.2, 28.5, 3.2, false);
      addJerseyBarrier(4.2, 28.5, 3.2, false);
      addJerseyBarrier(-5.2, -21.5, 3.4, false);
      addJerseyBarrier(5.2, -21.5, 3.4, false);
      [
        [-29, 28], [29, 28], [-31, -8], [31, -8], [-29, -32], [29, -32],
      ].forEach(([tx, tz]) => addTree(assetCtx, tx, tz, 'snowPine', 1.2));
      addBlackhawkHelicopter(assetCtx, 0, 10.5, -42, 0.35, false);
    }
  }

  // =========================================================================
  // DISTANT NATURAL MOUNTAIN PERIMETER, SKYLINE & CIRCLING BIRD FLOCKS
  // =========================================================================
  if (!levelConfig.isIndoor) {
    if (biome !== 'rooftop') {
      addMountainPerimeter(assetCtx, biome);
    }

    if (biome === 'industrial' || biome === 'rooftop' || biome === 'harbor' || biome === 'bunker') {
      const skylineMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: biome === 'rooftop' ? 0x161f2c : 0x1e2630,
          roughness: 0.86,
          metalness: 0.25,
        }),
      );
      const aviationRedMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0xef4444,
          emissive: 0xef4444,
          emissiveIntensity: 1.9,
          roughness: 0.2,
        }),
      );
      const distantWindowMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x2a2f36,
          emissive: biome === 'rooftop' ? 0x7e8d9c : 0x8f7f6a,
          emissiveIntensity: biome === 'rooftop' ? 0.2 : 0.16,
          roughness: 0.45,
        }),
      );
      const baseDrop = biome === 'rooftop' ? -26 : -0.1;
      const towers: [number, number, number, number, number][] = [
        [-46, -24, 14, biome === 'rooftop' ? 44 : 24, 14],
        [48, -18, 16, biome === 'rooftop' ? 52 : 28, 16],
        [-42, 22, 12, biome === 'rooftop' ? 38 : 18, 12],
        [44, 24, 15, biome === 'rooftop' ? 42 : 20, 15],
        [-16, -64, 22, biome === 'rooftop' ? 56 : 32, 16],
        [22, -62, 18, biome === 'rooftop' ? 48 : 26, 14],
      ];
      towers.forEach(([tx, tz, tw, th, td], idx) => {
        const bMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(tw, th, td)), skylineMat);
        bMesh.position.set(tx, baseDrop + th / 2, tz);
        root.add(bMesh);

        [0.34, 0.54, 0.74, 0.9].forEach((f) => {
          const frameBand = new THREE.Mesh(
            trackGeo(new THREE.BoxGeometry(tw + 0.2, 1.0, td + 0.2)),
            mats.steelDark,
          );
          frameBand.position.set(tx, baseDrop + th * f, tz);
          const winBand = new THREE.Mesh(
            trackGeo(new THREE.BoxGeometry(tw + 0.24, 0.52, td + 0.24)),
            distantWindowMat,
          );
          winBand.position.set(tx, baseDrop + th * f, tz);
          root.add(frameBand, winBand);
        });

        const penthouse = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(tw * 0.45, 2.6, td * 0.45)),
          mats.steelDark,
        );
        penthouse.position.set(tx, baseDrop + th + 1.3, tz);
        root.add(penthouse);

        if (idx % 2 === 0) {
          const beacon = new THREE.Mesh(
            trackGeo(new THREE.SphereGeometry(0.5, 8, 8)),
            aviationRedMat,
          );
          beacon.position.set(tx, baseDrop + th + 3.0, tz);
          root.add(beacon);
        }
      });
    }

    if (levelConfig.hasBirds) {
      addBirdFlock(assetCtx, isSoftwareGl ? 6 : 11, levelConfig.birdColor);
    }
  }

  return {
    root,
    config: levelConfig,
    colliders,
    ramps,
    destructibles,
    pickups,
    animatables,
    terminalPos,
    extractionPos,
    extractionBeaconMat,
    terminalScreenMat,
    skyDomeMat,
    securityLights,
    playerSpawn: new THREE.Vector3(0, 0, 33.5),
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      localMaterials.forEach((m) => m.dispose());
    },
  };
}
