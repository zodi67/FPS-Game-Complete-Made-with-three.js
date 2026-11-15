import * as THREE from 'three';
import type { BiomeType } from './types';
import { computeLightningPulse, generateLightningBoltSegments } from './rules';

export interface LightningPalette {
  coreColor: number;
  glowColor: number;
  lightColor: number;
  fogTint: number;
}

export interface LightningFrameState {
  flashIntensity: number;
  boltDirX: number;
  boltDirY: number;
  boltDirZ: number;
  lightColor: number;
  fogTint: number;
}

export interface LightningSystem {
  group: THREE.Group;
  triggerStrike: (
    camPos: THREE.Vector3,
    camYaw: number,
    biome: BiomeType,
    forceForwardView?: boolean,
  ) => void;
  clear: () => void;
  update: (dt: number) => LightningFrameState;
  dispose: () => void;
}

const MAX_SEGS = 64;
const MAX_VERTS = MAX_SEGS * 4;
const MAX_INDICES = MAX_SEGS * 6;

function getBiomeLightningPalette(_biome: BiomeType): LightningPalette {
  // Natural storm lightning: pure incandescent white core with crisp cool silver-white cloud corona
  return {
    coreColor: 0xffffff,
    glowColor: 0xe4ebf4,
    lightColor: 0xedf2f8,
    fogTint: 0xbcc3cc,
  };
}

function makeCloudHaloTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    2,
    size / 2,
    size / 2,
    size / 2,
  );
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.30)');
  grad.addColorStop(0.28, 'rgba(244, 248, 252, 0.14)');
  grad.addColorStop(0.62, 'rgba(235, 241, 248, 0.05)');
  grad.addColorStop(1.0, 'rgba(235, 241, 248, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

interface BoltSlot {
  coreMesh: THREE.Mesh;
  glowMesh: THREE.Mesh;
  coreGeo: THREE.BufferGeometry;
  glowGeo: THREE.BufferGeometry;
  corePosAttr: THREE.BufferAttribute;
  glowPosAttr: THREE.BufferAttribute;
  coreMat: THREE.MeshBasicMaterial;
  glowMat: THREE.MeshBasicMaterial;
  haloMesh: THREE.Mesh;
  haloMat: THREE.MeshBasicMaterial;
  active: boolean;
  elapsed: number;
  duration: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  palette: LightningPalette;
}

const _segDir = new THREE.Vector3();
const _toCam = new THREE.Vector3();
const _perp = new THREE.Vector3();
const _mid = new THREE.Vector3();

function buildBoltRibbonGeo(): {
  geo: THREE.BufferGeometry;
  posAttr: THREE.BufferAttribute;
} {
  const positions = new Float32Array(MAX_VERTS * 3);
  const indices = new Uint16Array(MAX_INDICES);
  for (let i = 0; i < MAX_SEGS; i++) {
    const v = i * 4;
    const idx = i * 6;
    indices[idx] = v;
    indices[idx + 1] = v + 1;
    indices[idx + 2] = v + 2;
    indices[idx + 3] = v + 1;
    indices[idx + 4] = v + 3;
    indices[idx + 5] = v + 2;
  }
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  return { geo, posAttr };
}

export function createLightningSystem(): LightningSystem {
  const group = new THREE.Group();
  const haloTex = makeCloudHaloTexture();
  const haloGeo = new THREE.PlaneGeometry(22, 13);

  const slots: BoltSlot[] = [];
  for (let s = 0; s < 2; s++) {
    const coreBuild = buildBoltRibbonGeo();
    const glowBuild = buildBoltRibbonGeo();

    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xe4ebf4,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const haloMat = new THREE.MeshBasicMaterial({
      map: haloTex,
      color: 0xe4ebf4,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });

    const coreMesh = new THREE.Mesh(coreBuild.geo, coreMat);
    const glowMesh = new THREE.Mesh(glowBuild.geo, glowMat);
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    coreMesh.frustumCulled = false;
    glowMesh.frustumCulled = false;
    haloMesh.frustumCulled = false;
    coreMesh.visible = false;
    glowMesh.visible = false;
    haloMesh.visible = false;
    coreMesh.renderOrder = 2;
    glowMesh.renderOrder = 1;
    haloMesh.renderOrder = 0;

    group.add(haloMesh, glowMesh, coreMesh);

    slots.push({
      coreMesh,
      glowMesh,
      coreGeo: coreBuild.geo,
      glowGeo: glowBuild.geo,
      corePosAttr: coreBuild.posAttr,
      glowPosAttr: glowBuild.posAttr,
      coreMat,
      glowMat,
      haloMesh,
      haloMat,
      active: false,
      elapsed: 0,
      duration: 0.68,
      dirX: 0.3,
      dirY: 0.65,
      dirZ: -0.7,
      palette: getBiomeLightningPalette('industrial'),
    });
  }

  let nextSlot = 0;

  const populateRibbon = (
    attr: THREE.BufferAttribute,
    segs: ReturnType<typeof generateLightningBoltSegments>,
    camPos: THREE.Vector3,
    baseHalfWidth: number,
  ) => {
    const arr = attr.array as Float32Array;
    const count = Math.min(segs.length, MAX_SEGS);
    for (let i = 0; i < MAX_SEGS; i++) {
      const vOffset = i * 12;
      if (i >= count) {
        arr.fill(0, vOffset, vOffset + 12);
        continue;
      }
      const seg = segs[i];
      _segDir.set(seg.bx - seg.ax, seg.by - seg.ay, seg.bz - seg.az);
      _mid.set(
        (seg.ax + seg.bx) * 0.5,
        (seg.ay + seg.by) * 0.5,
        (seg.az + seg.bz) * 0.5,
      );
      _toCam.subVectors(camPos, _mid).normalize();
      _perp.crossVectors(_segDir, _toCam);
      if (_perp.lengthSq() < 1e-6) {
        _perp.set(1, 0, 0);
      } else {
        _perp.normalize();
      }
      const hw = baseHalfWidth * seg.thickness;
      const px = _perp.x * hw;
      const py = _perp.y * hw;
      const pz = _perp.z * hw;

      arr[vOffset] = seg.ax - px;
      arr[vOffset + 1] = seg.ay - py;
      arr[vOffset + 2] = seg.az - pz;

      arr[vOffset + 3] = seg.ax + px;
      arr[vOffset + 4] = seg.ay + py;
      arr[vOffset + 5] = seg.az + pz;

      arr[vOffset + 6] = seg.bx - px;
      arr[vOffset + 7] = seg.by - py;
      arr[vOffset + 8] = seg.bz - pz;

      arr[vOffset + 9] = seg.bx + px;
      arr[vOffset + 10] = seg.by + py;
      arr[vOffset + 11] = seg.bz + pz;
    }
    attr.needsUpdate = true;
  };

  return {
    group,
    triggerStrike: (camPos, camYaw, biome, forceForwardView = false) => {
      const slot = slots[nextSlot];
      nextSlot = (nextSlot + 1) % slots.length;

      const palette = getBiomeLightningPalette(biome);
      slot.palette = palette;
      slot.coreMat.color.setHex(palette.coreColor);
      slot.glowMat.color.setHex(palette.glowColor);
      slot.haloMat.color.setHex(palette.glowColor);

      // Anchor in visible upper storm sky clearly above skyline/horizon buildings
      const forwardYaw = camYaw;
      const spread = forceForwardView ? 0.30 : 0.56;
      const azOffset = (Math.random() - 0.5) * 2 * spread;
      const strikeAz = forwardYaw + azOffset;
      const dist = 66 + Math.random() * 16;
      const rx = -Math.sin(strikeAz) * dist;
      const rz = -Math.cos(strikeAz) * dist;
      const sx = camPos.x + rx;
      const sz = camPos.z + rz;
      const sy = camPos.y + 30 + Math.random() * 6;

      const isCloudToCloud = Math.random() < 0.32;
      const endOffsetAngle = strikeAz + (Math.random() - 0.5) * (isCloudToCloud ? 0.34 : 0.12);
      const endDist = dist + (Math.random() - 0.5) * 5;
      const ex = camPos.x - Math.sin(endOffsetAngle) * endDist;
      const ez = camPos.z - Math.cos(endOffsetAngle) * endDist;
      const ey = camPos.y + (isCloudToCloud ? 16 + Math.random() * 5 : 9.5 + Math.random() * 4.5);

      const segs = generateLightningBoltSegments(
        sx,
        sy,
        sz,
        ex,
        ey,
        ez,
        5.2,
        Math.random() * 1000,
      );

      populateRibbon(slot.corePosAttr, segs, camPos, 0.10);
      populateRibbon(slot.glowPosAttr, segs, camPos, 0.34);

      slot.haloMesh.position.set(sx, sy - 1.0, sz);
      slot.haloMesh.lookAt(camPos);

      const relY = sy - camPos.y;
      const dirLen = Math.hypot(rx, relY, rz) || 1;
      slot.dirX = rx / dirLen;
      slot.dirY = relY / dirLen;
      slot.dirZ = rz / dirLen;

      slot.active = true;
      slot.elapsed = 0;
      slot.duration = 0.58 + Math.random() * 0.22;
      slot.coreMesh.visible = true;
      slot.glowMesh.visible = true;
      slot.haloMesh.visible = true;
    },
    clear: () => {
      for (const slot of slots) {
        slot.active = false;
        slot.elapsed = 0;
        slot.coreMesh.visible = false;
        slot.glowMesh.visible = false;
        slot.haloMesh.visible = false;
      }
    },
    update: (dt) => {
      let maxFlash = 0;
      let leadSlot = slots[0];

      for (const slot of slots) {
        if (!slot.active) continue;
        slot.elapsed += dt;
        if (slot.elapsed >= slot.duration) {
          slot.active = false;
          slot.coreMesh.visible = false;
          slot.glowMesh.visible = false;
          slot.haloMesh.visible = false;
          continue;
        }
        const pulse = computeLightningPulse(slot.elapsed, slot.duration);
        slot.coreMat.opacity = Math.min(1, pulse * 1.15);
        slot.glowMat.opacity = Math.min(0.46, pulse * 0.42);
        slot.haloMat.opacity = Math.min(0.18, pulse * 0.16);
        if (pulse > maxFlash) {
          maxFlash = pulse;
          leadSlot = slot;
        }
      }

      return {
        flashIntensity: maxFlash,
        boltDirX: leadSlot.dirX,
        boltDirY: leadSlot.dirY,
        boltDirZ: leadSlot.dirZ,
        lightColor: leadSlot.palette.lightColor,
        fogTint: leadSlot.palette.fogTint,
      };
    },
    dispose: () => {
      haloTex.dispose();
      haloGeo.dispose();
      for (const slot of slots) {
        slot.coreGeo.dispose();
        slot.glowGeo.dispose();
        slot.coreMat.dispose();
        slot.glowMat.dispose();
        slot.haloMat.dispose();
      }
    },
  };
}
