import * as THREE from 'three';

export interface HudOverlayUpdate {
  visible: boolean;
  spreadPx: number;
  adsBlend: number;
  scopedAds: boolean;
  hitMarkerTimer: number;
  headshotMarker: boolean;
  damageFlash: number;
  damageDirAngle: number; // screen-relative angle where 0 = top (+Y), +PI/2 = left (-X), -PI/2 = right (+X)
  lowHpRatio: number; // 0..1 when HP < 35
  flashbangTimer: number;
  lightningFlash: number;
  reloadProgress: number; // 0 when not reloading, 0..1 while reloading
}

export interface HudOverlaySystem {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  resize: (width: number, height: number) => void;
  update: (state: HudOverlayUpdate) => void;
  dispose: () => void;
}

export function createHudOverlay(): HudOverlaySystem {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-720, 720, 450, -450, -10, 10);
  camera.position.set(0, 0, 5);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  let viewW = 1440;
  let viewH = 900;

  // 1. Fullscreen Optical Screen FX Quad (Flashbang, Damage Vignette, Low-HP Pulse, Storm Flash)
  const screenFxGeo = trackGeo(new THREE.PlaneGeometry(2, 2));
  const screenFxMat = trackMat(
    new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uAspect: { value: 1440 / 900 },
        uDamage: { value: 0 },
        uFlashbang: { value: 0 },
        uLightning: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uAspect;
        uniform float uDamage;
        uniform float uFlashbang;
        uniform float uLightning;
        varying vec2 vUv;

        void main() {
          vec2 p = vUv - 0.5;
          p.x *= uAspect;
          float r = length(p);

          vec3 col = vec3(0.0);
          float alpha = 0.0;

          if (uDamage > 0.005) {
            float vig = smoothstep(0.28, 0.78, r) * clamp(uDamage, 0.0, 1.0);
            col = mix(col, vec3(0.86, 0.12, 0.10), vig * 0.72);
            alpha = max(alpha, vig * 0.56);
          }

          if (uLightning > 0.01) {
            float lAlpha = clamp(uLightning * 0.045, 0.0, 0.055);
            col = mix(col, vec3(0.95, 0.97, 1.0), lAlpha);
            alpha = max(alpha, lAlpha);
          }

          if (uFlashbang > 0.01) {
            float fAlpha = clamp(uFlashbang * 0.45, 0.0, 0.68);
            col = mix(col, vec3(1.0), fAlpha);
            alpha = max(alpha, fAlpha);
          }

          if (alpha <= 0.002) discard;
          gl_FragColor = vec4(col, alpha);
        }
      `,
    }),
  );
  const screenFxMesh = new THREE.Mesh(screenFxGeo, screenFxMat);
  screenFxMesh.position.z = 0;
  screenFxMesh.renderOrder = 1;
  scene.add(screenFxMesh);

  // 2. Three.js M2010 8.0x Mil-Dot Riflescope Optic Group
  const scopeGroup = new THREE.Group();
  scopeGroup.position.z = 1;
  scopeGroup.visible = false;
  scene.add(scopeGroup);

  const scopeMaskMat = trackMat(
    new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uAspect: { value: 1440 / 900 },
        uRadius: { value: 0.40 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uAspect;
        uniform float uRadius;
        varying vec2 vUv;

        void main() {
          vec2 p = vUv - 0.5;
          p.x *= min(1.0, uAspect);
          p.y *= min(1.0, 1.0 / max(0.01, uAspect));
          // Normalize against min screen dimension so scope aperture is always a true circle
          vec2 d = (vUv - 0.5) * vec2(uAspect > 1.0 ? uAspect : 1.0, uAspect < 1.0 ? 1.0 / uAspect : 1.0);
          float r = length(d);

          // Crisp black scope body mask outside aperture + soft inner glass shadow
          float outerMask = smoothstep(uRadius - 0.016, uRadius + 0.028, r);
          float innerGlass = smoothstep(uRadius - 0.09, uRadius, r) * 0.28;
          // Machined bezel ring highlight + subtle amber optic ring accent
          float bezel = exp(-pow((r - (uRadius - 0.002)) * 95.0, 2.0));
          float amberRing = exp(-pow((r - (uRadius - 0.018)) * 220.0, 2.0));

          vec3 col = vec3(0.01, 0.014, 0.02);
          col = mix(col, vec3(0.11, 0.14, 0.18), bezel * 0.85);
          col += vec3(0.96, 0.62, 0.05) * amberRing * 0.24;

          float alpha = clamp(max(outerMask * 0.985, innerGlass) + bezel * 0.5, 0.0, 0.99);
          if (alpha <= 0.004) discard;
          gl_FragColor = vec4(col, alpha);
        }
      `,
    }),
  );
  const scopeMaskMesh = new THREE.Mesh(screenFxGeo, scopeMaskMat);
  scopeMaskMesh.renderOrder = 2;
  scopeGroup.add(scopeMaskMesh);

  // Scope Crosshair & Mil-Dot Stadia Lines (unit-normalized to radius = 1, scaled on resize)
  const scopeReticleGroup = new THREE.Group();
  scopeReticleGroup.position.z = 0.5;
  scopeGroup.add(scopeReticleGroup);

  const stadiaMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x0f172a,
      transparent: true,
      opacity: 0.92,
      depthTest: false,
      depthWrite: false,
    }),
  );
  const fineRedMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.92,
      depthTest: false,
      depthWrite: false,
    }),
  );

  const unitPlaneGeo = trackGeo(new THREE.PlaneGeometry(1, 1));
  const addBar = (
    parent: THREE.Object3D,
    x: number,
    y: number,
    w: number,
    h: number,
    mat: THREE.Material,
    order: number,
  ) => {
    const m = new THREE.Mesh(unitPlaneGeo, mat);
    m.position.set(x, y, 0);
    m.scale.set(w, h, 1);
    m.renderOrder = order;
    parent.add(m);
    return m;
  };

  // Outer thick stadia posts (radius spans -0.88..+0.88 in normalized scope units)
  addBar(scopeReticleGroup, -0.52, 0, 0.72, 0.011, stadiaMat, 3);
  addBar(scopeReticleGroup, 0.52, 0, 0.72, 0.011, stadiaMat, 3);
  addBar(scopeReticleGroup, 0, 0.52, 0.011, 0.72, stadiaMat, 3);
  addBar(scopeReticleGroup, 0, -0.52, 0.011, 0.72, stadiaMat, 3);

  // Inner fine illuminated center crosshair & glowing aiming dot
  addBar(scopeReticleGroup, 0, 0, 0.32, 0.0045, fineRedMat, 3);
  addBar(scopeReticleGroup, 0, 0, 0.0045, 0.32, fineRedMat, 3);
  const centerDotGeo = trackGeo(new THREE.CircleGeometry(0.012, 16));
  const scopeCenterDot = new THREE.Mesh(centerDotGeo, fineRedMat);
  scopeCenterDot.renderOrder = 4;
  scopeReticleGroup.add(scopeCenterDot);

  // Mil-dot subtension markers along axes
  const milDotGeo = trackGeo(new THREE.CircleGeometry(0.0085, 10));
  for (const off of [-0.48, -0.32, -0.16, 0.16, 0.32, 0.48]) {
    const mx = new THREE.Mesh(milDotGeo, stadiaMat);
    mx.position.set(off, 0, 0);
    mx.renderOrder = 3;
    scopeReticleGroup.add(mx);
    const my = new THREE.Mesh(milDotGeo, stadiaMat);
    my.position.set(0, off, 0);
    my.renderOrder = 3;
    scopeReticleGroup.add(my);
  }
  // BDC elevation drop ticks
  for (let i = 0; i < 4; i++) {
    const drop = -(0.11 + i * 0.12);
    const w = 0.055 + i * 0.018;
    addBar(scopeReticleGroup, 0, drop, w, 0.006, stadiaMat, 3);
  }

  // 3. Dynamic Hip-Fire Crosshair (4 crisp white bars with subtle dark outline + center dot)
  const crosshairGroup = new THREE.Group();
  crosshairGroup.position.z = 2;
  scene.add(crosshairGroup);

  const crossBarMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
    }),
  );
  const crossShadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x05070a,
      transparent: true,
      opacity: 0.55,
      depthTest: false,
      depthWrite: false,
    }),
  );

  const makeCrossBar = (w: number, h: number) => {
    const g = new THREE.Group();
    const bg = new THREE.Mesh(unitPlaneGeo, crossShadowMat);
    bg.scale.set(w + 2, h + 2, 1);
    bg.renderOrder = 4;
    const fg = new THREE.Mesh(unitPlaneGeo, crossBarMat);
    fg.scale.set(w, h, 1);
    fg.position.z = 0.05;
    fg.renderOrder = 5;
    g.add(bg, fg);
    return g;
  };

  const barL = makeCrossBar(10, 2);
  const barR = makeCrossBar(10, 2);
  const barT = makeCrossBar(2, 10);
  const barB = makeCrossBar(2, 10);
  const centerDot = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(1.8, 10)), crossBarMat);
  centerDot.renderOrder = 5;
  crosshairGroup.add(barL, barR, barT, barB, centerDot);

  // 4. Ballistic Hit Marker X (scales smoothly & turns crimson on headshot)
  const hitMarkerGroup = new THREE.Group();
  hitMarkerGroup.position.z = 2.5;
  hitMarkerGroup.visible = false;
  scene.add(hitMarkerGroup);

  const hitMarkerMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
    }),
  );
  for (const ang of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
    const tick = new THREE.Mesh(unitPlaneGeo, hitMarkerMat);
    tick.scale.set(10, 2.4, 1);
    tick.rotation.z = ang;
    tick.position.set(Math.cos(ang) * 10, Math.sin(ang) * 10, 0);
    tick.renderOrder = 6;
    hitMarkerGroup.add(tick);
  }

  // 5. Directional Damage Indicator Arc (rotates around center toward attacker direction)
  const damageArcGroup = new THREE.Group();
  damageArcGroup.position.z = 2.2;
  damageArcGroup.visible = false;
  scene.add(damageArcGroup);

  const damageArcGeo = trackGeo(
    new THREE.RingGeometry(82, 95, 22, 1, Math.PI * 0.34, Math.PI * 0.32),
  );
  const damageArcMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    }),
  );
  const damageArcMesh = new THREE.Mesh(damageArcGeo, damageArcMat);
  damageArcMesh.renderOrder = 6;
  damageArcGroup.add(damageArcMesh);

  // 6. Circular Reload Progress Ring (built from 24 small arc segments scaled smoothly)
  const reloadGroup = new THREE.Group();
  reloadGroup.position.z = 2.3;
  reloadGroup.visible = false;
  scene.add(reloadGroup);

  const reloadSegs: THREE.Mesh[] = [];
  const reloadSegMats: THREE.MeshBasicMaterial[] = [];
  const reloadSegGeo = trackGeo(new THREE.PlaneGeometry(4.2, 2.4));
  const segCount = 24;
  for (let i = 0; i < segCount; i++) {
    const sMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.2,
        depthTest: false,
        depthWrite: false,
      }),
    );
    const seg = new THREE.Mesh(reloadSegGeo, sMat);
    const theta = Math.PI / 2 - (i / segCount) * Math.PI * 2;
    seg.position.set(Math.cos(theta) * 24, Math.sin(theta) * 24, 0);
    seg.rotation.z = theta + Math.PI / 2;
    seg.renderOrder = 6;
    reloadGroup.add(seg);
    reloadSegs.push(seg);
    reloadSegMats.push(sMat);
  }

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

    screenFxMesh.scale.set(halfW, halfH, 1);
    scopeMaskMesh.scale.set(halfW, halfH, 1);

    const minDim = Math.min(viewW, viewH);
    const scopeRadiusPx = minDim * 0.40;
    scopeReticleGroup.scale.set(scopeRadiusPx, scopeRadiusPx, 1);

    const aspect = viewW / viewH;
    screenFxMat.uniforms.uAspect.value = aspect;
    scopeMaskMat.uniforms.uAspect.value = aspect;
  };

  resize(1440, 900);

  return {
    scene,
    camera,
    resize,
    update: (state: HudOverlayUpdate) => {
      if (!state.visible) {
        scene.visible = false;
        return;
      }
      scene.visible = true;

      // Full-screen WebGL effects
      screenFxMat.uniforms.uDamage.value = Math.max(
        state.damageFlash * 0.85,
        state.lowHpRatio * 0.72,
      );
      screenFxMat.uniforms.uFlashbang.value = state.flashbangTimer;
      screenFxMat.uniforms.uLightning.value = state.lightningFlash;

      // M2010 8x Riflescope Optic
      scopeGroup.visible = state.scopedAds;

      // Hip-fire crosshair fades out smoothly into ADS
      const crossAlpha = THREE.MathUtils.clamp((1 - state.adsBlend * 2.0) * 0.9, 0, 0.9);
      crosshairGroup.visible = !state.scopedAds && crossAlpha > 0.02;
      if (crosshairGroup.visible) {
        crossBarMat.opacity = crossAlpha;
        crossShadowMat.opacity = crossAlpha * 0.58;
        const g = Math.max(6, Math.min(34, state.spreadPx)) + 5;
        barL.position.x = -g;
        barR.position.x = g;
        barT.position.y = g;
        barB.position.y = -g;
      }

      // Hit Marker X
      if (state.hitMarkerTimer > 0.005) {
        hitMarkerGroup.visible = true;
        const t = Math.min(1, state.hitMarkerTimer / 0.14);
        const s = 0.92 + (1 - t) * 0.25;
        hitMarkerGroup.scale.set(s, s, 1);
        hitMarkerMat.color.setHex(state.headshotMarker ? 0xef4444 : 0xffffff);
        hitMarkerMat.opacity = Math.min(1, t * 1.4);
      } else {
        hitMarkerGroup.visible = false;
      }

      // Directional Damage Indicator Arc
      if (state.damageFlash > 0.04) {
        damageArcGroup.visible = true;
        damageArcGroup.rotation.z = state.damageDirAngle;
        damageArcMat.opacity = Math.min(0.88, state.damageFlash * 0.9);
      } else {
        damageArcGroup.visible = false;
      }

      // Circular Reload Progress Ring
      if (state.reloadProgress > 0.001 && !state.scopedAds) {
        reloadGroup.visible = true;
        const activeCount = Math.ceil(state.reloadProgress * segCount);
        for (let i = 0; i < segCount; i++) {
          if (i < activeCount) {
            reloadSegMats[i].color.setHex(0xfbbf24);
            reloadSegMats[i].opacity = 0.92;
          } else {
            reloadSegMats[i].color.setHex(0x475569);
            reloadSegMats[i].opacity = 0.28;
          }
        }
      } else {
        reloadGroup.visible = false;
      }
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
