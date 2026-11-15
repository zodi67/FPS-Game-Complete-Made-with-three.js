import * as THREE from 'three';

export interface MaterialLibrary {
  asphaltWet: THREE.MeshPhysicalMaterial;
  concreteWall: THREE.MeshStandardMaterial;
  concreteFloor: THREE.MeshStandardMaterial;
  concreteBarrier: THREE.MeshStandardMaterial;
  containerOlive: THREE.MeshStandardMaterial;
  containerCrimson: THREE.MeshStandardMaterial;
  containerNavy: THREE.MeshStandardMaterial;
  steelDark: THREE.MeshStandardMaterial;
  steelGrate: THREE.MeshStandardMaterial;
  woodCrate: THREE.MeshStandardMaterial;
  hazardDrum: THREE.MeshStandardMaterial;
  hazardStripe: THREE.MeshStandardMaterial;
  gunmetal: THREE.MeshPhysicalMaterial;
  anodizedTan: THREE.MeshPhysicalMaterial;
  polymerBlack: THREE.MeshStandardMaterial;
  polymerGrip: THREE.MeshStandardMaterial;
  chromeBarrel: THREE.MeshPhysicalMaterial;
  copperBrass: THREE.MeshStandardMaterial;
  brassShell: THREE.MeshStandardMaterial;
  bakeliteOrange: THREE.MeshStandardMaterial;
  opticGlass: THREE.MeshPhysicalMaterial;
  kevlarDark: THREE.MeshStandardMaterial;
  tacticalWeave: THREE.MeshStandardMaterial;
  gloveFabric: THREE.MeshStandardMaterial;
  leatherGlove: THREE.MeshStandardMaterial;
  vehicleArmor: THREE.MeshPhysicalMaterial;
  vehicleDesert: THREE.MeshPhysicalMaterial;
  tireRubber: THREE.MeshStandardMaterial;
  sandbagCloth: THREE.MeshStandardMaterial;
  enemyUniform: THREE.MeshStandardMaterial;
  enemyVest: THREE.MeshStandardMaterial;
  enemyHelmet: THREE.MeshStandardMaterial;
  juggernautArmor: THREE.MeshPhysicalMaterial;
  desertCamo: THREE.MeshStandardMaterial;
  arcticCamo: THREE.MeshStandardMaterial;
  woodlandCamo: THREE.MeshStandardMaterial;
  hazmatSuit: THREE.MeshStandardMaterial;
  skinTone: THREE.MeshStandardMaterial;
  ghillieMat: THREE.MeshStandardMaterial;
  contactShadowMat: THREE.MeshBasicMaterial;
  bloodDecalMat: THREE.MeshStandardMaterial;
  rustMetal: THREE.MeshStandardMaterial;
  // Biome & Natural World PBR Materials
  sandGround: THREE.MeshStandardMaterial;
  sandstoneRock: THREE.MeshStandardMaterial;
  snowGround: THREE.MeshStandardMaterial;
  iceSurface: THREE.MeshPhysicalMaterial;
  jungleMoss: THREE.MeshStandardMaterial;
  treeBark: THREE.MeshStandardMaterial;
  foliageGreen: THREE.MeshStandardMaterial;
  foliagePalm: THREE.MeshStandardMaterial;
  volcanicBasalt: THREE.MeshStandardMaterial;
  magmaGlow: THREE.MeshStandardMaterial;
  harborWater: THREE.MeshPhysicalMaterial;
  metroTile: THREE.MeshStandardMaterial;
  terracottaWall: THREE.MeshStandardMaterial;
  toxicSludge: THREE.MeshStandardMaterial;
  heliOlive: THREE.MeshPhysicalMaterial;
  glassAtrium: THREE.MeshPhysicalMaterial;
  birdFeather: THREE.MeshStandardMaterial;
  updateShaderTime: (elapsedSec: number) => void;
  dispose: () => void;
}

function hash2D(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2D(ix, iy, seed);
  const b = hash2D(ix + 1, iy, seed);
  const c = hash2D(ix, iy + 1, seed);
  const d = hash2D(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm2D(x: number, y: number, seed: number, octaves: number = 4): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    val += amp * smoothNoise(x * freq, y * freq, seed + i * 19);
    freq *= 2.02;
    amp *= 0.5;
  }
  return val;
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  repeatX: number,
  repeatY: number,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function heightCanvasToNormalMap(
  heightCanvas: HTMLCanvasElement,
  strength: number,
  repeatX: number,
  repeatY: number,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const srcCtx = heightCanvas.getContext('2d')!;
  const src = srcCtx.getImageData(0, 0, w, h).data;
  const [normC, normCtx] = makeCanvas(w);
  const dst = normCtx.createImageData(w, h);

  const sample = (x: number, y: number) => {
    const wx = ((x % w) + w) % w;
    const wy = ((y % h) + h) % h;
    return src[(wy * w + wx) * 4] / 255;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = sample(x - 1, y - 1);
      const t = sample(x, y - 1);
      const tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y);
      const r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1);
      const b = sample(x, y + 1);
      const br = sample(x + 1, y + 1);

      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * 0.25 * strength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * 0.25 * strength;
      const dz = 1.0;
      const len = Math.hypot(dx, dy, dz) || 1;
      const idx = (y * w + x) * 4;
      dst.data[idx] = Math.round(((dx / len) * 0.5 + 0.5) * 255);
      dst.data[idx + 1] = Math.round(((dy / len) * 0.5 + 0.5) * 255);
      dst.data[idx + 2] = Math.round(((dz / len) * 0.5 + 0.5) * 255);
      dst.data[idx + 3] = 255;
    }
  }
  normCtx.putImageData(dst, 0, 0);
  return finalizeTexture(normC, false, repeatX, repeatY, maxAnisotropy);
}

function smoothNoisePeriodic(
  x: number,
  y: number,
  period: number,
  seed: number,
): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const wrap = (n: number) => ((n % period) + period) % period;
  const x0 = wrap(ix);
  const x1 = wrap(ix + 1);
  const y0 = wrap(iy);
  const y1 = wrap(iy + 1);
  const a = hash2D(x0, y0, seed);
  const b = hash2D(x1, y0, seed);
  const c = hash2D(x0, y1, seed);
  const d = hash2D(x1, y1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function tileableFbm2D(
  u: number,
  v: number,
  basePeriod: number,
  seed: number,
  octaves: number = 4,
): number {
  let val = 0;
  let amp = 0.5;
  let period = basePeriod;
  for (let i = 0; i < octaves; i++) {
    val += amp * smoothNoisePeriodic(u * period, v * period, period, seed + i * 19);
    period *= 2;
    amp *= 0.5;
  }
  return val;
}

function createAsphaltMaps(maxAnisotropy: number) {
  const size = 512;
  const [albedoC, albedoCtx] = makeCanvas(size);
  const [roughC, roughCtx] = makeCanvas(size);
  const [bumpC, bumpCtx] = makeCanvas(size);

  const aImg = albedoCtx.createImageData(size, size);
  const rImg = roughCtx.createImageData(size, size);
  const bImg = bumpCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = (y * size + x) * 4;
      const fine = hash2D(x, y, 1);
      const agg = tileableFbm2D(u, v, 32, 2, 3);
      const puddleFbm = tileableFbm2D(u, v, 4, 11, 4);
      const puddleT = Math.max(0, Math.min(1, (puddleFbm - 0.5) / 0.22));
      const smoothPuddle = puddleT * puddleT * (3 - 2 * puddleT);

      const oilStreak =
        Math.max(0, Math.sin(u * Math.PI * 4 + puddleFbm * 4.5) - 0.8) * 2.5;

      const dryBase = 44 + fine * 11 + agg * 16;
      const wetBase = 35 + fine * 6;
      const base = dryBase * (1 - smoothPuddle) + wetBase * smoothPuddle;

      aImg.data[idx] = Math.min(255, base + oilStreak * 0.6);
      aImg.data[idx + 1] = Math.min(255, base + 0.5 + oilStreak * 0.6);
      aImg.data[idx + 2] = Math.min(255, base + 1 + oilStreak * 0.7);
      aImg.data[idx + 3] = 255;

      const dryRough = 212 + fine * 28 + agg * 15;
      const wetRough = 82 + fine * 18;
      const roughVal = dryRough * (1 - smoothPuddle) + wetRough * smoothPuddle;
      rImg.data[idx] = roughVal;
      rImg.data[idx + 1] = roughVal;
      rImg.data[idx + 2] = roughVal;
      rImg.data[idx + 3] = 255;

      const dryBump = 74 + fine * 88 + agg * 76;
      const bumpVal = dryBump * (1 - smoothPuddle) + 128 * smoothPuddle;
      bImg.data[idx] = bumpVal;
      bImg.data[idx + 1] = bumpVal;
      bImg.data[idx + 2] = bumpVal;
      bImg.data[idx + 3] = 255;
    }
  }

  albedoCtx.putImageData(aImg, 0, 0);
  roughCtx.putImageData(rImg, 0, 0);
  bumpCtx.putImageData(bImg, 0, 0);

  albedoCtx.strokeStyle = 'rgba(10, 12, 15, 0.24)';
  bumpCtx.strokeStyle = 'rgb(65, 65, 65)';
  albedoCtx.lineWidth = 1.0;
  bumpCtx.lineWidth = 1.2;
  for (let c = 0; c < 5; c++) {
    let cx = hash2D(c, 1, 88) * size;
    let cy = hash2D(c, 2, 88) * size;
    albedoCtx.beginPath();
    bumpCtx.beginPath();
    albedoCtx.moveTo(cx, cy);
    bumpCtx.moveTo(cx, cy);
    for (let s = 0; s < 6; s++) {
      cx += (hash2D(c * 7 + s, 3, 88) - 0.5) * 20;
      cy += (hash2D(c * 7 + s, 4, 88) - 0.5) * 20;
      albedoCtx.lineTo(cx, cy);
      bumpCtx.lineTo(cx, cy);
    }
    albedoCtx.stroke();
    bumpCtx.stroke();
  }

  albedoCtx.strokeStyle = 'rgba(185, 148, 68, 0.2)';
  albedoCtx.lineWidth = 6;
  albedoCtx.setLineDash([32, 32]);
  albedoCtx.beginPath();
  albedoCtx.moveTo(0, 64);
  albedoCtx.lineTo(size, 64);
  albedoCtx.stroke();

  return {
    map: finalizeTexture(albedoC, true, 9, 9, maxAnisotropy),
    roughnessMap: finalizeTexture(roughC, false, 9, 9, maxAnisotropy),
    normalMap: heightCanvasToNormalMap(bumpC, 2.4, 9, 9, maxAnisotropy),
  };
}

function createConcreteMaps(maxAnisotropy: number, tone: 'wall' | 'floor' | 'barrier') {
  const size = 512;
  const [albedoC, albedoCtx] = makeCanvas(size);
  const [bumpC, bumpCtx] = makeCanvas(size);
  const aImg = albedoCtx.createImageData(size, size);
  const bImg = bumpCtx.createImageData(size, size);

  const baseTone = tone === 'wall' ? 70 : tone === 'floor' ? 60 : 78;

  for (let y = 0; y < size; y++) {
    const vNorm = y / size;
    const dampGrad =
      tone === 'wall'
        ? (vNorm > 0.68 ? (vNorm - 0.68) * -58 : 0) + (vNorm < 0.08 ? (0.08 - vNorm) * -140 : 0)
        : tone === 'barrier' && vNorm > 0.72
          ? (vNorm - 0.72) * -42
          : 0;
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const n1 = hash2D(x, y, 5);
      const macro = fbm2D(x * 0.025, y * 0.025, 9, 4);
      const micro = fbm2D(x * 0.18, y * 0.18, 17, 2);
      const pore = n1 < 0.035 ? -24 : 0;
      const v = Math.max(
        14,
        Math.min(198, baseTone + macro * 28 + micro * 13 + dampGrad + pore * 0.35),
      );

      aImg.data[idx] = v;
      aImg.data[idx + 1] = v + 1;
      aImg.data[idx + 2] = v + 4;
      aImg.data[idx + 3] = 255;

      const b = Math.max(20, Math.min(240, 102 + macro * 65 + micro * 48 + pore));
      bImg.data[idx] = b;
      bImg.data[idx + 1] = b;
      bImg.data[idx + 2] = b;
      bImg.data[idx + 3] = 255;
    }
  }
  albedoCtx.putImageData(aImg, 0, 0);
  bumpCtx.putImageData(bImg, 0, 0);

  if (tone === 'wall') {
    for (let i = 0; i < 46; i++) {
      const sx = hash2D(i, 2, 31) * size;
      const sw = 2 + hash2D(i, 4, 31) * 10;
      const sh = 65 + hash2D(i, 8, 31) * 230;
      albedoCtx.fillStyle = i % 3 === 0 ? 'rgba(42, 18, 12, 0.22)' : 'rgba(12, 15, 19, 0.26)';
      albedoCtx.fillRect(sx, 0, sw, sh);
    }
  }

  albedoCtx.strokeStyle = 'rgba(14, 17, 22, 0.48)';
  albedoCtx.lineWidth = 3;
  bumpCtx.strokeStyle = 'rgb(30, 30, 30)';
  bumpCtx.lineWidth = 3;
  for (let p = 128; p < size; p += 128) {
    albedoCtx.beginPath();
    albedoCtx.moveTo(0, p);
    albedoCtx.lineTo(size, p);
    albedoCtx.stroke();
    bumpCtx.beginPath();
    bumpCtx.moveTo(0, p);
    bumpCtx.lineTo(size, p);
    bumpCtx.stroke();
    for (let tx = 64; tx < size; tx += 128) {
      albedoCtx.fillStyle = 'rgba(12, 14, 18, 0.52)';
      albedoCtx.beginPath();
      albedoCtx.arc(tx, p - 32, 4, 0, Math.PI * 2);
      albedoCtx.fill();
      bumpCtx.fillStyle = 'rgb(35, 35, 35)';
      bumpCtx.beginPath();
      bumpCtx.arc(tx, p - 32, 4, 0, Math.PI * 2);
      bumpCtx.fill();
    }
  }

  const rep = tone === 'floor' ? 10 : tone === 'wall' ? 2 : 1;
  return {
    map: finalizeTexture(albedoC, true, rep, rep, maxAnisotropy),
    normalMap: heightCanvasToNormalMap(bumpC, 2.7, rep, rep, maxAnisotropy),
  };
}

function createCorrugatedMaps(maxAnisotropy: number, baseHex: string, stencilText: string) {
  const size = 256;
  const [albedoC, albedoCtx] = makeCanvas(size);
  const [bumpC, bumpCtx] = makeCanvas(size);

  albedoCtx.fillStyle = baseHex;
  albedoCtx.fillRect(0, 0, size, size);

  for (let x = 0; x < size; x++) {
    const wave = Math.sin((x / size) * Math.PI * 16);
    const shade = Math.round(wave * 26);
    albedoCtx.fillStyle = shade > 0
      ? `rgba(255,255,255,${(shade / 255).toFixed(3)})`
      : `rgba(0,0,0,${(-shade / 255).toFixed(3)})`;
    albedoCtx.fillRect(x, 0, 1, size);

    const bVal = Math.round(128 + wave * 98);
    bumpCtx.fillStyle = `rgb(${bVal},${bVal},${bVal})`;
    bumpCtx.fillRect(x, 0, 1, size);
  }

  for (let i = 0; i < 48; i++) {
    const rx = hash2D(i, 3, 14) * size;
    const ry = hash2D(i, 7, 14) * size;
    const rw = 4 + hash2D(i, 11, 14) * 14;
    const rh = 18 + hash2D(i, 17, 14) * 60;
    albedoCtx.fillStyle = 'rgba(84, 42, 20, 0.3)';
    albedoCtx.fillRect(rx, ry, rw, rh);
  }

  // Industrial cargo stencil markings
  albedoCtx.fillStyle = 'rgba(235, 240, 245, 0.56)';
  albedoCtx.font = 'bold 18px monospace';
  albedoCtx.fillText(stencilText, 24, 58);
  albedoCtx.fillStyle = 'rgba(245, 190, 60, 0.5)';
  albedoCtx.fillRect(24, 68, 42, 10);

  const aoBot = albedoCtx.createLinearGradient(0, size * 0.74, 0, size);
  aoBot.addColorStop(0, 'rgba(0,0,0,0)');
  aoBot.addColorStop(1, 'rgba(0,0,0,0.34)');
  albedoCtx.fillStyle = aoBot;
  albedoCtx.fillRect(0, size * 0.74, size, size * 0.26);

  return {
    map: finalizeTexture(albedoC, true, 2, 1, maxAnisotropy),
    normalMap: heightCanvasToNormalMap(bumpC, 3.2, 2, 1, maxAnisotropy),
  };
}

function createWoodCrateMaps(maxAnisotropy: number) {
  const size = 256;
  const [albedoC, albedoCtx] = makeCanvas(size);
  const [bumpC, bumpCtx] = makeCanvas(size);

  albedoCtx.fillStyle = '#6f5338';
  albedoCtx.fillRect(0, 0, size, size);
  bumpCtx.fillStyle = 'rgb(140,140,140)';
  bumpCtx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 32) {
    const tint = (hash2D(y, 1, 21) - 0.5) * 26;
    albedoCtx.fillStyle = `rgb(${112 + tint},${84 + tint * 0.7},${56 + tint * 0.5})`;
    albedoCtx.fillRect(0, y + 2, size, 28);

    albedoCtx.fillStyle = 'rgba(42, 28, 16, 0.22)';
    for (let g = 0; g < 4; g++) {
      const gy = y + 5 + g * 6 + hash2D(y, g, 23) * 3;
      albedoCtx.fillRect(0, gy, size, 1.5);
    }

    albedoCtx.fillStyle = '#261b11';
    albedoCtx.fillRect(0, y, size, 2);
    bumpCtx.fillStyle = 'rgb(40,40,40)';
    bumpCtx.fillRect(0, y, size, 2);
  }

  albedoCtx.strokeStyle = '#826344';
  albedoCtx.lineWidth = 22;
  albedoCtx.strokeRect(11, 11, size - 22, size - 22);
  albedoCtx.beginPath();
  albedoCtx.moveTo(16, 16);
  albedoCtx.lineTo(size - 16, size - 16);
  albedoCtx.stroke();

  bumpCtx.strokeStyle = 'rgb(220,220,220)';
  bumpCtx.lineWidth = 22;
  bumpCtx.strokeRect(11, 11, size - 22, size - 22);

  albedoCtx.fillStyle = 'rgba(235, 190, 65, 0.72)';
  albedoCtx.font = 'bold 26px monospace';
  albedoCtx.fillText('5.56 NATO', 52, 136);

  return {
    map: finalizeTexture(albedoC, true, 1, 1, maxAnisotropy),
    normalMap: heightCanvasToNormalMap(bumpC, 2.2, 1, 1, maxAnisotropy),
  };
}

function createWeaveMaps(
  maxAnisotropy: number,
  baseRgb: [number, number, number],
  rep: number,
  camoContrast: number = 12,
  seed: number = 77,
) {
  const size = 128;
  const [albedoC, albedoCtx] = makeCanvas(size);
  const [bumpC, bumpCtx] = makeCanvas(size);
  const aImg = albedoCtx.createImageData(size, size);
  const bImg = bumpCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const warp = Math.sin(x * Math.PI * 0.5) * Math.cos(y * Math.PI * 0.5);
      const camo = fbm2D(x * 0.08, y * 0.08, seed, 3);
      const camoShift = camo > 0.56 ? camoContrast : camo < 0.38 ? -camoContrast : 0;
      const shade = warp * 8 + camoShift;
      aImg.data[idx] = Math.max(8, Math.min(255, baseRgb[0] + shade));
      aImg.data[idx + 1] = Math.max(8, Math.min(255, baseRgb[1] + shade * 0.96));
      aImg.data[idx + 2] = Math.max(8, Math.min(255, baseRgb[2] + shade * 0.85));
      aImg.data[idx + 3] = 255;

      const b = Math.round(128 + warp * 82);
      bImg.data[idx] = b;
      bImg.data[idx + 1] = b;
      bImg.data[idx + 2] = b;
      bImg.data[idx + 3] = 255;
    }
  }
  albedoCtx.putImageData(aImg, 0, 0);
  bumpCtx.putImageData(bImg, 0, 0);

  return {
    map: finalizeTexture(albedoC, true, rep, rep, maxAnisotropy),
    normalMap: heightCanvasToNormalMap(bumpC, 1.8, rep, rep, maxAnisotropy),
  };
}

function createVehicleArmorMaps(maxAnisotropy: number, baseHex: string = '#384034') {
  const size = 256;
  const [albedoC, albedoCtx] = makeCanvas(size);
  const [bumpC, bumpCtx] = makeCanvas(size);

  albedoCtx.fillStyle = baseHex;
  albedoCtx.fillRect(0, 0, size, size);
  bumpCtx.fillStyle = 'rgb(128,128,128)';
  bumpCtx.fillRect(0, 0, size, size);

  for (let i = 0; i < 64; i++) {
    const x = hash2D(i, 1, 91) * size;
    const y = hash2D(i, 2, 91) * size;
    const r = 8 + hash2D(i, 3, 91) * 28;
    albedoCtx.fillStyle = i % 2 === 0 ? 'rgba(20,24,18,0.16)' : 'rgba(130,124,105,0.1)';
    albedoCtx.beginPath();
    albedoCtx.arc(x, y, r, 0, Math.PI * 2);
    albedoCtx.fill();
  }

  albedoCtx.strokeStyle = 'rgba(18, 22, 18, 0.55)';
  albedoCtx.lineWidth = 2;
  albedoCtx.strokeRect(8, 8, size - 16, size - 16);
  bumpCtx.strokeStyle = 'rgb(60,60,60)';
  bumpCtx.lineWidth = 2;
  bumpCtx.strokeRect(8, 8, size - 16, size - 16);

  for (let p = 20; p < size - 16; p += 28) {
    [14, size - 14].forEach((edge) => {
      albedoCtx.fillStyle = '#4e5749';
      albedoCtx.fillRect(p - 2, edge - 2, 4, 4);
      bumpCtx.fillStyle = 'rgb(225,225,225)';
      bumpCtx.fillRect(p - 2, edge - 2, 4, 4);
    });
  }

  return {
    map: finalizeTexture(albedoC, true, 1, 1, maxAnisotropy),
    normalMap: heightCanvasToNormalMap(bumpC, 2.0, 1, 1, maxAnisotropy),
  };
}

function createBiomeGroundMaps(
  maxAnisotropy: number,
  mode: 'sand' | 'snow' | 'moss' | 'basalt' | 'metro' | 'terracotta',
) {
  const size = 256;
  const [albedoC, albedoCtx] = makeCanvas(size);
  const [bumpC, bumpCtx] = makeCanvas(size);
  const aImg = albedoCtx.createImageData(size, size);
  const bImg = bumpCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = (y * size + x) * 4;
      const f1 = tileableFbm2D(u, v, 8, 41, 3);
      const grain = hash2D(x, y, 42);

      let r = 128;
      let g = 128;
      let b = 128;
      let bump = 128;

      if (mode === 'sand') {
        const ripple = Math.sin(u * Math.PI * 18 + f1 * 4.5) * 14;
        r = 188 + f1 * 28 + ripple + grain * 10;
        g = 148 + f1 * 24 + ripple * 0.8 + grain * 8;
        b = 98 + f1 * 18 + ripple * 0.6 + grain * 6;
        bump = 128 + ripple * 3 + (grain - 0.5) * 45;
      } else if (mode === 'snow') {
        const drift = Math.sin(u * Math.PI * 10 + f1 * 5.0) * 10;
        r = 212 + f1 * 24 + drift + grain * 8;
        g = 224 + f1 * 20 + drift + grain * 8;
        b = 238 + f1 * 16 + drift + grain * 6;
        bump = 128 + drift * 2.5 + (f1 - 0.5) * 55;
      } else if (mode === 'moss') {
        const stone = f1 > 0.52 ? 1 : 0;
        r = stone ? 68 + grain * 14 : 44 + f1 * 32;
        g = stone ? 74 + grain * 14 : 78 + f1 * 48;
        b = stone ? 62 + grain * 10 : 38 + f1 * 22;
        bump = 110 + f1 * 80 + grain * 30;
      } else if (mode === 'basalt') {
        const crack = Math.abs(f1 - 0.5) < 0.035;
        r = crack ? 185 : 36 + f1 * 24 + grain * 10;
        g = crack ? 68 : 34 + f1 * 22 + grain * 10;
        b = crack ? 24 : 38 + f1 * 20 + grain * 10;
        bump = crack ? 60 : 120 + f1 * 70 + grain * 35;
      } else if (mode === 'metro') {
        const gx = x % 32 === 0 || y % 32 === 0;
        r = gx ? 38 : 112 + f1 * 18 + grain * 8;
        g = gx ? 42 : 118 + f1 * 18 + grain * 8;
        b = gx ? 48 : 126 + f1 * 20 + grain * 8;
        bump = gx ? 50 : 145 + (grain - 0.5) * 20;
      } else {
        // terracotta plaster
        r = 162 + f1 * 36 + grain * 12;
        g = 112 + f1 * 28 + grain * 10;
        b = 84 + f1 * 22 + grain * 8;
        bump = 120 + f1 * 64 + grain * 28;
      }

      aImg.data[idx] = Math.max(0, Math.min(255, r));
      aImg.data[idx + 1] = Math.max(0, Math.min(255, g));
      aImg.data[idx + 2] = Math.max(0, Math.min(255, b));
      aImg.data[idx + 3] = 255;

      const bv = Math.max(10, Math.min(245, bump));
      bImg.data[idx] = bv;
      bImg.data[idx + 1] = bv;
      bImg.data[idx + 2] = bv;
      bImg.data[idx + 3] = 255;
    }
  }
  albedoCtx.putImageData(aImg, 0, 0);
  bumpCtx.putImageData(bImg, 0, 0);

  const rep = mode === 'metro' ? 8 : 10;
  return {
    map: finalizeTexture(albedoC, true, rep, rep, maxAnisotropy),
    normalMap: heightCanvasToNormalMap(bumpC, 2.2, rep, rep, maxAnisotropy),
  };
}

function createBarkMaps(maxAnisotropy: number) {
  const size = 128;
  const [albedoC, albedoCtx] = makeCanvas(size);
  const [bumpC, bumpCtx] = makeCanvas(size);
  const aImg = albedoCtx.createImageData(size, size);
  const bImg = bumpCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const ridge = fbm2D(x * 0.24, y * 0.05, 51, 3);
      aImg.data[idx] = Math.min(255, 58 + ridge * 46);
      aImg.data[idx + 1] = Math.min(255, 42 + ridge * 34);
      aImg.data[idx + 2] = Math.min(255, 30 + ridge * 24);
      aImg.data[idx + 3] = 255;
      const bv = Math.min(255, 50 + ridge * 170);
      bImg.data[idx] = bv;
      bImg.data[idx + 1] = bv;
      bImg.data[idx + 2] = bv;
      bImg.data[idx + 3] = 255;
    }
  }
  albedoCtx.putImageData(aImg, 0, 0);
  bumpCtx.putImageData(bImg, 0, 0);
  return {
    map: finalizeTexture(albedoC, true, 1, 2, maxAnisotropy),
    normalMap: heightCanvasToNormalMap(bumpC, 2.5, 1, 2, maxAnisotropy),
  };
}

function createStippleNormal(maxAnisotropy: number, strength: number = 0.85) {
  const size = 128;
  const [bumpC, bumpCtx] = makeCanvas(size);
  const bImg = bumpCtx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const micro = fbm2D(x * 0.42, y * 0.42, 55, 2);
      const diamond = Math.sin(x * 0.9 + y * 0.9) * Math.sin(x * 0.9 - y * 0.9) * 0.18;
      const v = Math.max(40, Math.min(220, Math.round(118 + (micro - 0.5) * 72 + diamond * 48)));
      bImg.data[idx] = v;
      bImg.data[idx + 1] = v;
      bImg.data[idx + 2] = v;
      bImg.data[idx + 3] = 255;
    }
  }
  bumpCtx.putImageData(bImg, 0, 0);
  return heightCanvasToNormalMap(bumpC, strength, 2, 2, maxAnisotropy);
}

function createTireTreadNormal(maxAnisotropy: number) {
  const size = 128;
  const [bumpC, bumpCtx] = makeCanvas(size);
  bumpCtx.fillStyle = 'rgb(60,60,60)';
  bumpCtx.fillRect(0, 0, size, size);
  bumpCtx.fillStyle = 'rgb(220,220,220)';
  for (let y = 0; y < size; y += 16) {
    bumpCtx.fillRect(4, y + 2, size / 2 - 8, 10);
    bumpCtx.fillRect(size / 2 + 4, y + 6, size / 2 - 8, 10);
  }
  return heightCanvasToNormalMap(bumpC, 3.0, 4, 1, maxAnisotropy);
}

function createHazardStripeTexture(maxAnisotropy: number) {
  const size = 256;
  const [c, ctx] = makeCanvas(size);
  ctx.fillStyle = '#d99b1e';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#191d22';
  for (let i = -size; i < size * 2; i += 48) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 24, 0);
    ctx.lineTo(i + 24 - size, size);
    ctx.lineTo(i - size, size);
    ctx.closePath();
    ctx.fill();
  }
  return finalizeTexture(c, true, 2, 1, maxAnisotropy);
}

function createBrushedMetalNormal(maxAnisotropy: number) {
  const size = 256;
  const [c, ctx] = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    const streak = hash2D(0, y, 44) * 58;
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const v = Math.min(255, 95 + streak + hash2D(x, y, 45) * 22);
      img.data[idx] = v;
      img.data[idx + 1] = v;
      img.data[idx + 2] = v;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return heightCanvasToNormalMap(c, 1.6, 2, 2, maxAnisotropy);
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const [c, ctx] = makeCanvas(size);
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.08,
    size / 2,
    size / 2,
    size * 0.5,
  );
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.32)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createBloodOilDecalTexture(): THREE.CanvasTexture {
  const size = 256;
  const [c, ctx] = makeCanvas(size);
  ctx.clearRect(0, 0, size, size);

  for (let i = 0; i < 18; i++) {
    const angle = hash2D(i, 1, 73) * Math.PI * 2;
    const dist = hash2D(i, 2, 73) * 64;
    const cx = size / 2 + Math.cos(angle) * dist;
    const cy = size / 2 + Math.sin(angle) * dist;
    const r = 10 + hash2D(i, 3, 73) * 32;
    const grad = ctx.createRadialGradient(cx, cy, r * 0.12, cx, cy, r);
    const isBlood = i % 3 !== 0;
    grad.addColorStop(0, isBlood ? 'rgba(68, 10, 10, 0.72)' : 'rgba(16, 14, 12, 0.65)');
    grad.addColorStop(0.65, isBlood ? 'rgba(46, 8, 8, 0.42)' : 'rgba(14, 14, 14, 0.32)');
    grad.addColorStop(1, 'rgba(20, 6, 6, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createMaterialLibrary(
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean,
): MaterialLibrary {
  const maxAniso = isSoftwareGl ? 1 : Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const textures: THREE.Texture[] = [];
  const materials: THREE.Material[] = [];

  const trackTex = <T extends THREE.Texture>(t: T): T => {
    textures.push(t);
    return t;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const asphaltMaps = createAsphaltMaps(maxAniso);
  trackTex(asphaltMaps.map);
  trackTex(asphaltMaps.roughnessMap);
  trackTex(asphaltMaps.normalMap);

  const asphaltWet = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: asphaltMaps.map,
      roughnessMap: asphaltMaps.roughnessMap,
      normalMap: asphaltMaps.normalMap,
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughness: 0.9,
      metalness: 0.03,
      clearcoat: 0.14,
      clearcoatRoughness: 0.44,
    }),
  );

  asphaltWet.onBeforeCompile = (shader) => {
    shader.uniforms.uRainTime = { value: 0 };
    asphaltWet.userData.shader = shader;
    shader.vertexShader =
      'varying vec3 vWorldPosRain;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vWorldPosRain = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader =
      'uniform float uRainTime;\nvarying vec3 vWorldPosRain;\n' +
      shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float rCell = fract(sin(dot(floor(vWorldPosRain.xz * 2.2), vec2(12.9898, 78.233))) * 43758.5453);
        vec2 rLocal = fract(vWorldPosRain.xz * 2.2) - 0.5;
        float rPhase = fract(uRainTime * 1.45 + rCell);
        float rRing = abs(length(rLocal) - rPhase * 0.42);
        float ripple = smoothstep(0.038, 0.0, rRing) * (1.0 - rPhase);
        roughnessFactor = clamp(roughnessFactor - ripple * 0.16, 0.22, 1.0);`,
      );
  };

  const concWallMaps = createConcreteMaps(maxAniso, 'wall');
  const concFloorMaps = createConcreteMaps(maxAniso, 'floor');
  const concBarrierMaps = createConcreteMaps(maxAniso, 'barrier');
  [
    concWallMaps.map,
    concWallMaps.normalMap,
    concFloorMaps.map,
    concFloorMaps.normalMap,
    concBarrierMaps.map,
    concBarrierMaps.normalMap,
  ].forEach(trackTex);

  const concreteWall = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: concWallMaps.map,
      normalMap: concWallMaps.normalMap,
      normalScale: new THREE.Vector2(1.25, 1.25),
      roughness: 0.84,
      metalness: 0.04,
    }),
  );

  const concreteFloor = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: concFloorMaps.map,
      normalMap: concFloorMaps.normalMap,
      normalScale: new THREE.Vector2(0.95, 0.95),
      roughness: 0.78,
      metalness: 0.03,
    }),
  );

  const concreteBarrier = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: concBarrierMaps.map,
      normalMap: concBarrierMaps.normalMap,
      normalScale: new THREE.Vector2(1.2, 1.2),
      roughness: 0.84,
      metalness: 0.04,
    }),
  );

  const oliveMaps = createCorrugatedMaps(maxAniso, '#3d4838', 'MIL-44');
  const crimsonMaps = createCorrugatedMaps(maxAniso, '#5c2824', 'CARGO-09');
  const navyMaps = createCorrugatedMaps(maxAniso, '#283d54', 'MAERSK-7');
  const metalNormal = trackTex(createBrushedMetalNormal(maxAniso));
  const stippleNormal = trackTex(createStippleNormal(maxAniso, 1.8));
  const tireNormal = trackTex(createTireTreadNormal(maxAniso));
  [
    oliveMaps.map,
    oliveMaps.normalMap,
    crimsonMaps.map,
    crimsonMaps.normalMap,
    navyMaps.map,
    navyMaps.normalMap,
  ].forEach(trackTex);

  const containerOlive = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: oliveMaps.map,
      normalMap: oliveMaps.normalMap,
      normalScale: new THREE.Vector2(1.4, 1.4),
      roughness: 0.52,
      metalness: 0.48,
    }),
  );

  const containerCrimson = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: crimsonMaps.map,
      normalMap: crimsonMaps.normalMap,
      normalScale: new THREE.Vector2(1.4, 1.4),
      roughness: 0.54,
      metalness: 0.44,
    }),
  );

  const containerNavy = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: navyMaps.map,
      normalMap: navyMaps.normalMap,
      normalScale: new THREE.Vector2(1.4, 1.4),
      roughness: 0.52,
      metalness: 0.46,
    }),
  );

  const steelDark = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x242a32,
      normalMap: metalNormal,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 0.34,
      metalness: 0.86,
    }),
  );

  const steelGrate = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x39414b,
      normalMap: metalNormal,
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughness: 0.44,
      metalness: 0.82,
    }),
  );

  const woodMaps = createWoodCrateMaps(maxAnisotropyMapsSafe(maxAniso));
  trackTex(woodMaps.map);
  trackTex(woodMaps.normalMap);

  const woodCrate = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: woodMaps.map,
      normalMap: woodMaps.normalMap,
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughness: 0.8,
      metalness: 0.04,
    }),
  );

  const hazardDrum = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9b221d,
      normalMap: metalNormal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.38,
      metalness: 0.52,
    }),
  );

  const hazardTex = trackTex(createHazardStripeTexture(maxAniso));
  const hazardStripe = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: hazardTex,
      roughness: 0.55,
      metalness: 0.16,
    }),
  );

  const gunmetal = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x1a1e24,
      normalMap: metalNormal,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.44,
      metalness: 0.58,
      clearcoat: 0.08,
      anisotropy: isSoftwareGl ? 0 : 0.4,
    }),
  );

  const anodizedTan = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x735e45,
      normalMap: metalNormal,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 0.56,
      metalness: 0.28,
      clearcoat: 0.05,
    }),
  );

  const polymerBlack = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x20242a,
      normalMap: stippleNormal,
      normalScale: new THREE.Vector2(0.28, 0.28),
      roughness: 0.72,
      metalness: 0.1,
    }),
  );

  const polymerGrip = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x22262c,
      normalMap: stippleNormal,
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: 0.78,
      metalness: 0.08,
    }),
  );

  const chromeBarrel = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xcbd5e1,
      normalMap: metalNormal,
      normalScale: new THREE.Vector2(0.3, 0.3),
      roughness: 0.16,
      metalness: 0.98,
    }),
  );

  const copperBrass = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xb87333,
      normalMap: metalNormal,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 0.26,
      metalness: 0.9,
    }),
  );

  const brassShell = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd4aa4d,
      roughness: 0.2,
      metalness: 0.95,
    }),
  );

  const bakeliteOrange = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xb44c1e,
      normalMap: stippleNormal,
      normalScale: new THREE.Vector2(0.25, 0.25),
      roughness: 0.48,
      metalness: 0.08,
    }),
  );

  const opticGlass = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x8ad4ff,
      roughness: 0.05,
      metalness: 0.05,
      transmission: isSoftwareGl ? 0 : 0.86,
      transparent: true,
      opacity: isSoftwareGl ? 0.34 : 0.88,
      ior: 1.52,
      clearcoat: 1.0,
      depthWrite: false,
    }),
  );

  const weaveMaps = createWeaveMaps(maxAniso, [44, 52, 40], 4, 12, 77);
  const darkWeaveMaps = createWeaveMaps(maxAniso, [32, 36, 40], 3, 10, 79);
  const sandbagMaps = createWeaveMaps(maxAniso, [122, 108, 82], 3, 8, 81);
  const desertCamoMaps = createWeaveMaps(maxAniso, [166, 138, 96], 4, 24, 83);
  const arcticCamoMaps = createWeaveMaps(maxAniso, [206, 214, 222], 4, 26, 85);
  const woodlandCamoMaps = createWeaveMaps(maxAniso, [56, 76, 46], 4, 24, 87);
  [
    weaveMaps.map,
    weaveMaps.normalMap,
    darkWeaveMaps.map,
    darkWeaveMaps.normalMap,
    sandbagMaps.map,
    sandbagMaps.normalMap,
    desertCamoMaps.map,
    desertCamoMaps.normalMap,
    arcticCamoMaps.map,
    arcticCamoMaps.normalMap,
    woodlandCamoMaps.map,
    woodlandCamoMaps.normalMap,
  ].forEach(trackTex);

  const kevlarDark = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: weaveMaps.map,
      normalMap: weaveMaps.normalMap,
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughness: 0.86,
      metalness: 0.04,
    }),
  );

  const tacticalWeave = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: darkWeaveMaps.map,
      normalMap: darkWeaveMaps.normalMap,
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughness: 0.84,
      metalness: 0.06,
    }),
  );

  const gloveFabric = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2a2f2a,
      normalMap: weaveMaps.normalMap,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.85,
      metalness: 0.04,
    }),
  );

  const leatherGlove = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x302d2a,
      normalMap: stippleNormal,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.54,
      metalness: 0.08,
    }),
  );

  const vehicleMaps = createVehicleArmorMaps(maxAniso, '#384034');
  const desertVehMaps = createVehicleArmorMaps(maxAniso, '#a88c62');
  [
    vehicleMaps.map,
    vehicleMaps.normalMap,
    desertVehMaps.map,
    desertVehMaps.normalMap,
  ].forEach(trackTex);

  const vehicleArmor = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: vehicleMaps.map,
      normalMap: vehicleMaps.normalMap,
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughness: 0.54,
      metalness: 0.42,
      clearcoat: 0.18,
    }),
  );

  const vehicleDesert = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: desertVehMaps.map,
      normalMap: desertVehMaps.normalMap,
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughness: 0.62,
      metalness: 0.34,
      clearcoat: 0.12,
    }),
  );

  const tireRubber = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x15171a,
      normalMap: tireNormal,
      normalScale: new THREE.Vector2(1.4, 1.4),
      roughness: 0.86,
      metalness: 0.05,
    }),
  );

  const sandbagCloth = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: sandbagMaps.map,
      normalMap: sandbagMaps.normalMap,
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughness: 0.92,
      metalness: 0.02,
    }),
  );

  const enemyUniform = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: darkWeaveMaps.map,
      normalMap: darkWeaveMaps.normalMap,
      normalScale: new THREE.Vector2(0.95, 0.95),
      roughness: 0.86,
      metalness: 0.05,
    }),
  );

  const enemyVest = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e2328,
      normalMap: weaveMaps.normalMap,
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughness: 0.72,
      metalness: 0.14,
    }),
  );

  const enemyHelmet = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2b312c,
      normalMap: stippleNormal,
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 0.46,
      metalness: 0.28,
    }),
  );

  const juggernautArmor = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x2a2e35,
      normalMap: metalNormal,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.3,
      metalness: 0.88,
      clearcoat: 0.36,
    }),
  );

  const desertCamo = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: desertCamoMaps.map,
      normalMap: desertCamoMaps.normalMap,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.88,
      metalness: 0.03,
    }),
  );

  const arcticCamo = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: arcticCamoMaps.map,
      normalMap: arcticCamoMaps.normalMap,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.84,
      metalness: 0.04,
    }),
  );

  const woodlandCamo = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: woodlandCamoMaps.map,
      normalMap: woodlandCamoMaps.normalMap,
      normalScale: new THREE.Vector2(0.95, 0.95),
      roughness: 0.88,
      metalness: 0.04,
    }),
  );

  const hazmatSuit = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xcaa428,
      normalMap: stippleNormal,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 0.42,
      metalness: 0.12,
    }),
  );

  const skinTone = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc69072,
      roughness: 0.72,
      metalness: 0.02,
    }),
  );

  const ghillieMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x4b5c3b,
      normalMap: weaveMaps.normalMap,
      normalScale: new THREE.Vector2(1.4, 1.4),
      roughness: 0.96,
      metalness: 0.0,
    }),
  );

  const shadowTex = trackTex(createContactShadowTexture());
  const contactShadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.64,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );

  const bloodDecalTex = trackTex(createBloodOilDecalTexture());
  const bloodDecalMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: bloodDecalTex,
      transparent: true,
      roughness: 0.34,
      metalness: 0.05,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
  );

  const rustMetal = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x4b2f24,
      normalMap: metalNormal,
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughness: 0.68,
      metalness: 0.52,
    }),
  );

  // --- BIOME & LIVING WORLD MATERIALS ---
  const sandMaps = createBiomeGroundMaps(maxAniso, 'sand');
  const snowMaps = createBiomeGroundMaps(maxAniso, 'snow');
  const mossMaps = createBiomeGroundMaps(maxAniso, 'moss');
  const basaltMaps = createBiomeGroundMaps(maxAniso, 'basalt');
  const metroMaps = createBiomeGroundMaps(maxAniso, 'metro');
  const terraMaps = createBiomeGroundMaps(maxAniso, 'terracotta');
  const barkMaps = createBarkMaps(maxAniso);
  [
    sandMaps.map,
    sandMaps.normalMap,
    snowMaps.map,
    snowMaps.normalMap,
    mossMaps.map,
    mossMaps.normalMap,
    basaltMaps.map,
    basaltMaps.normalMap,
    metroMaps.map,
    metroMaps.normalMap,
    terraMaps.map,
    terraMaps.normalMap,
    barkMaps.map,
    barkMaps.normalMap,
  ].forEach(trackTex);

  const sandGround = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: sandMaps.map,
      normalMap: sandMaps.normalMap,
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughness: 0.9,
      metalness: 0.02,
    }),
  );

  const sandstoneRock = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xa46b42,
      normalMap: sandMaps.normalMap,
      normalScale: new THREE.Vector2(1.4, 1.4),
      roughness: 0.92,
      metalness: 0.04,
    }),
  );

  const snowGround = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: snowMaps.map,
      normalMap: snowMaps.normalMap,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.86,
      metalness: 0.02,
    }),
  );

  const [iceAlphaCanvas, iceAlphaCtx] = makeCanvas(128);
  const iceGrad = iceAlphaCtx.createRadialGradient(64, 64, 18, 64, 64, 62);
  iceGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.92)');
  iceGrad.addColorStop(0.55, 'rgba(220, 220, 220, 0.65)');
  iceGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  iceAlphaCtx.fillStyle = iceGrad;
  iceAlphaCtx.fillRect(0, 0, 128, 128);
  const iceAlphaTex = trackTex(new THREE.CanvasTexture(iceAlphaCanvas));
  iceAlphaTex.colorSpace = THREE.NoColorSpace;
  iceAlphaTex.needsUpdate = true;

  const iceSurface = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xd0dce6,
      normalMap: snowMaps.normalMap,
      alphaMap: iceAlphaTex,
      transparent: true,
      depthWrite: false,
      roughness: 0.36,
      metalness: 0.04,
      clearcoat: 0.32,
      clearcoatRoughness: 0.28,
    }),
  );

  const jungleMoss = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: mossMaps.map,
      normalMap: mossMaps.normalMap,
      normalScale: new THREE.Vector2(1.3, 1.3),
      roughness: 0.88,
      metalness: 0.04,
    }),
  );

  const treeBark = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: barkMaps.map,
      normalMap: barkMaps.normalMap,
      normalScale: new THREE.Vector2(1.4, 1.4),
      roughness: 0.94,
      metalness: 0.02,
    }),
  );

  const foliageGreen = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2f5a2c,
      normalMap: weaveMaps.normalMap,
      roughness: 0.82,
      metalness: 0.02,
    }),
  );

  const foliagePalm = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b7232,
      normalMap: weaveMaps.normalMap,
      roughness: 0.76,
      metalness: 0.04,
      side: THREE.DoubleSide,
    }),
  );

  const volcanicBasalt = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: basaltMaps.map,
      normalMap: basaltMaps.normalMap,
      normalScale: new THREE.Vector2(1.45, 1.45),
      roughness: 0.88,
      metalness: 0.12,
    }),
  );

  const magmaGlow = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x7c2d12,
      emissive: 0xb44314,
      emissiveIntensity: 0.78,
      roughness: 0.55,
    }),
  );

  const harborWater = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x1b2832,
      normalMap: snowMaps.normalMap,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.26,
      metalness: 0.08,
      clearcoat: 0.42,
      clearcoatRoughness: 0.22,
    }),
  );

  const metroTile = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: metroMaps.map,
      normalMap: metroMaps.normalMap,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.64,
      metalness: 0.05,
    }),
  );

  const terracottaWall = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: terraMaps.map,
      normalMap: terraMaps.normalMap,
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughness: 0.86,
      metalness: 0.02,
    }),
  );

  const toxicSludge = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x4b582c,
      emissive: 0x3b4720,
      emissiveIntensity: 0.42,
      roughness: 0.35,
      metalness: 0.08,
    }),
  );

  const heliOlive = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x2d352d,
      normalMap: metalNormal,
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 0.52,
      metalness: 0.52,
      clearcoat: 0.12,
    }),
  );

  const glassAtrium = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x52606d,
      roughness: 0.14,
      metalness: 0.08,
      transparent: true,
      opacity: 0.34,
      clearcoat: 0.48,
    }),
  );

  const birdFeather = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1f242d,
      roughness: 0.82,
      metalness: 0.05,
    }),
  );

  return {
    asphaltWet,
    concreteWall,
    concreteFloor,
    concreteBarrier,
    containerOlive,
    containerCrimson,
    containerNavy,
    steelDark,
    steelGrate,
    woodCrate,
    hazardDrum,
    hazardStripe,
    gunmetal,
    anodizedTan,
    polymerBlack,
    polymerGrip,
    chromeBarrel,
    copperBrass,
    brassShell,
    bakeliteOrange,
    opticGlass,
    kevlarDark,
    tacticalWeave,
    gloveFabric,
    leatherGlove,
    vehicleArmor,
    vehicleDesert,
    tireRubber,
    sandbagCloth,
    enemyUniform,
    enemyVest,
    enemyHelmet,
    juggernautArmor,
    desertCamo,
    arcticCamo,
    woodlandCamo,
    hazmatSuit,
    skinTone,
    ghillieMat,
    contactShadowMat,
    bloodDecalMat,
    rustMetal,
    sandGround,
    sandstoneRock,
    snowGround,
    iceSurface,
    jungleMoss,
    treeBark,
    foliageGreen,
    foliagePalm,
    volcanicBasalt,
    magmaGlow,
    harborWater,
    metroTile,
    terracottaWall,
    toxicSludge,
    heliOlive,
    glassAtrium,
    birdFeather,
    updateShaderTime: (elapsedSec: number) => {
      if (asphaltWet.userData.shader) {
        asphaltWet.userData.shader.uniforms.uRainTime.value = elapsedSec;
      }
      // Subtle magma pulse & water drift
      magmaGlow.emissiveIntensity = 0.68 + Math.sin(elapsedSec * 2.4) * 0.18;
      toxicSludge.emissiveIntensity = 0.36 + Math.sin(elapsedSec * 1.9) * 0.12;
      snowMaps.normalMap.offset.x = (elapsedSec * 0.018) % 1;
      snowMaps.normalMap.offset.y = (elapsedSec * 0.012) % 1;
    },
    dispose: () => {
      textures.forEach((t) => t.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

function maxAnisotropyMapsSafe(v: number): number {
  return Math.max(1, v);
}
