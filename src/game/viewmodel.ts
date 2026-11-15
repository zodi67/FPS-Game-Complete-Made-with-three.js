import * as THREE from 'three';
import type { MaterialLibrary } from './textures';
import type { WeaponId } from './types';

export interface ViewmodelState {
  weaponId: WeaponId;
  ads: number; // 0..1
  walkDist: number;
  moveSpeedRatio: number;
  sprintRatio: number;
  recoilKick: number;
  recoilRot: number;
  reloadRatio: number; // 0..1 when reloading, 0 otherwise
  meleeRatio: number; // 0..1
  swapDrop: number; // 0..1
  wallPull: number; // 0..1 CQB obstacle pullback
  flashlightOn: boolean;
}

export interface ViewmodelRig {
  root: THREE.Group;
  flashlight: THREE.SpotLight;
  flashlightTarget: THREE.Object3D;
  flashCone: THREE.Mesh;
  muzzleFlashMesh: THREE.Mesh;
  muzzlePoint: THREE.Object3D;
  ejectionPoint: THREE.Object3D;
  update: (dt: number, state: ViewmodelState) => void;
  triggerFire: () => void;
  dispose: () => void;
}

function makeBeveledBoxShape(w: number, h: number): THREE.Shape {
  const s = new THREE.Shape();
  const hw = w / 2;
  const hh = h / 2;
  s.moveTo(-hw, -hh);
  s.lineTo(hw, -hh);
  s.lineTo(hw, hh);
  s.lineTo(-hw, hh);
  s.closePath();
  return s;
}

export function createViewmodelRig(
  mats: MaterialLibrary,
  isSoftwareGl: boolean,
): ViewmodelRig {
  const root = new THREE.Group();
  const swayGroup = new THREE.Group();
  root.add(swayGroup);

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

  // Emissive holographic reticle, tritium fiber & laser indicator materials
  const holoReticleMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0.94,
      depthTest: true,
      depthWrite: false,
    }),
  );

  const redDotMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xff3b30,
      transparent: true,
      opacity: 0.96,
      depthTest: true,
      depthWrite: false,
    }),
  );

  const peqLaserMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  const muzzleFlashMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffc86b,
      transparent: true,
      opacity: 0.94,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  const watchGlowMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );

  const flashLensMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfff8e7,
      emissive: 0xfff0c2,
      emissiveIntensity: 2.0,
      roughness: 0.1,
    }),
  );

  const flashConeMat = trackMat(
    new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color(0xfff4e0) },
        uOpacity: { value: isSoftwareGl ? 0.016 : 0.028 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vViewPos;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vViewPos = -mv.xyz;
          vNormalView = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vViewPos;
        void main() {
          float axial = smoothstep(0.0, 0.72, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
          float edge = pow(abs(dot(normalize(vNormalView), normalize(vViewPos))), 1.8);
          gl_FragColor = vec4(uColor, uOpacity * axial * edge);
        }
      `,
    }),
  );

  // --- SCULPTED ARTICULATED GLOVED OPERATOR ARMS (Continuous Shoulder -> Wrist -> Palm -> Grip) ---
  const orientBetween = (
    mesh: THREE.Object3D,
    a: THREE.Vector3,
    b: THREE.Vector3,
    length: number,
  ) => {
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    mesh.position.copy(mid);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    mesh.scale.set(1, length, 1);
  };

  const armRight = new THREE.Group();
  const wristR = new THREE.Vector3(0.038, -0.088, 0.008);
  const shoulderR = new THREE.Vector3(0.185, -0.21, 0.34);
  const foreLenR = wristR.distanceTo(shoulderR);

  const sleeveR = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.036, 0.054, 1, 14)),
    mats.kevlarDark,
  );
  orientBetween(sleeveR, wristR, shoulderR, foreLenR);

  const cuffR = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.039, 0.04, 0.038, 14)),
    mats.polymerBlack,
  );
  cuffR.position.copy(wristR);
  cuffR.quaternion.copy(sleeveR.quaternion);

  const handGroupR = new THREE.Group();
  handGroupR.position.set(0.01, -0.064, -0.038);

  const wristBridgeR = new THREE.Mesh(
    trackGeo(new THREE.CapsuleGeometry(0.028, 0.042, 6, 10)),
    mats.gloveFabric,
  );
  wristBridgeR.rotation.x = Math.PI / 2.2;
  wristBridgeR.rotation.z = -0.35;
  wristBridgeR.position.set(0.016, -0.014, 0.026);
  handGroupR.add(wristBridgeR);

  const palmR = new THREE.Mesh(
    trackGeo(new THREE.CapsuleGeometry(0.026, 0.044, 6, 10)),
    mats.gloveFabric,
  );
  palmR.rotation.x = 0.36;
  palmR.position.set(0.006, -0.006, -0.002);
  handGroupR.add(palmR);

  const knuckleR = new THREE.Mesh(
    trackGeo(new THREE.CapsuleGeometry(0.014, 0.036, 4, 8)),
    mats.leatherGlove,
  );
  knuckleR.rotation.x = Math.PI / 2;
  knuckleR.position.set(0.015, 0.012, -0.008);
  handGroupR.add(knuckleR);

  const fingerGeo = trackGeo(new THREE.CapsuleGeometry(0.0075, 0.032, 4, 6));
  for (let f = 0; f < 3; f++) {
    const finger = new THREE.Mesh(fingerGeo, mats.leatherGlove);
    finger.rotation.z = Math.PI / 2.25;
    finger.position.set(-0.012, -0.006 - f * 0.015, -0.016 - f * 0.003);
    handGroupR.add(finger);
  }
  const triggerFinger = new THREE.Mesh(fingerGeo, mats.leatherGlove);
  triggerFinger.rotation.x = Math.PI / 2.35;
  triggerFinger.position.set(0.014, 0.014, -0.034);
  handGroupR.add(triggerFinger);

  armRight.add(sleeveR, cuffR, handGroupR);

  // Left Support Arm (Continuous Forearm -> Wrist Watch -> Contoured C-Clamp Palm around Handguard)
  const armLeft = new THREE.Group();
  const wristL = new THREE.Vector3(-0.026, -0.028, -0.342);
  const shoulderL = new THREE.Vector3(-0.225, -0.225, 0.06);
  const foreLenL = wristL.distanceTo(shoulderL);

  const sleeveL = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.032, 0.051, 1, 14)),
    mats.kevlarDark,
  );
  orientBetween(sleeveL, wristL, shoulderL, foreLenL);

  const cuffL = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.035, 0.036, 0.038, 14)),
    mats.polymerBlack,
  );
  cuffL.position.copy(wristL);
  cuffL.quaternion.copy(sleeveL.quaternion);

  // Contoured wrist bridge & palm wrapping cleanly around bottom/side of M-LOK handguard
  const wristBridgeL = new THREE.Mesh(
    trackGeo(new THREE.CapsuleGeometry(0.026, 0.044, 6, 10)),
    mats.gloveFabric,
  );
  wristBridgeL.rotation.x = Math.PI / 2.15;
  wristBridgeL.rotation.z = 0.44;
  wristBridgeL.position.set(-0.022, -0.024, -0.365);

  const palmL = new THREE.Mesh(
    trackGeo(new THREE.CapsuleGeometry(0.024, 0.046, 6, 10)),
    mats.gloveFabric,
  );
  palmL.rotation.x = Math.PI / 2;
  palmL.rotation.z = 0.28;
  palmL.position.set(-0.015, -0.014, -0.398);

  const thumbL = new THREE.Mesh(fingerGeo, mats.leatherGlove);
  thumbL.rotation.z = -0.88;
  thumbL.rotation.x = 0.62;
  thumbL.position.set(-0.018, 0.021, -0.386);

  const knuckleL = new THREE.Mesh(
    trackGeo(new THREE.CapsuleGeometry(0.013, 0.04, 4, 8)),
    mats.leatherGlove,
  );
  knuckleL.rotation.x = Math.PI / 2;
  knuckleL.position.set(-0.029, -0.008, -0.396);

  for (let f = 0; f < 3; f++) {
    const lf = new THREE.Mesh(fingerGeo, mats.leatherGlove);
    lf.rotation.z = -Math.PI / 2.35;
    lf.position.set(0.011, -0.024, -0.386 - f * 0.015);
    armLeft.add(lf);
  }

  // Tactical Wrist GPS Computer strapped cleanly proud outside left forearm sleeve
  const watchAnchor = new THREE.Vector3().lerpVectors(wristL, shoulderL, 0.17);
  const watchGroup = new THREE.Group();
  watchGroup.position.copy(watchAnchor);
  watchGroup.quaternion.copy(sleeveL.quaternion);

  const watchStrap = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.039, 0.04, 0.028, 14)),
    mats.polymerGrip,
  );
  const watchBody = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.032, 0.038, 0.014)),
    mats.polymerBlack,
  );
  watchBody.position.set(0, 0, -0.045);
  const watchFace = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(0.022, 0.026)),
    watchGlowMat,
  );
  watchFace.rotation.y = Math.PI;
  watchFace.position.set(0, 0, -0.0535);
  watchGroup.add(watchStrap, watchBody, watchFace);

  armLeft.add(sleeveL, cuffL, wristBridgeL, palmL, thumbL, knuckleL, watchGroup);
  swayGroup.add(armRight, armLeft);

  // =========================================================================
  // WEAPON 1: SCULPTED MK18 MOD-1 CQB (Two-Tone FDE + Gunmetal + Suppressor + PEQ-15)
  // =========================================================================
  const carbineGrp = new THREE.Group();

  // Extruded Lower/Upper Forged Receiver Silhouette (side profile extruded across width)
  const recShape = new THREE.Shape();
  recShape.moveTo(0.04, -0.025); // buffer tube rear
  recShape.lineTo(-0.02, -0.025);
  recShape.lineTo(-0.03, -0.068); // trigger guard rear
  recShape.lineTo(-0.13, -0.068); // magwell rear
  recShape.lineTo(-0.145, -0.11); // flared magwell bottom
  recShape.lineTo(-0.23, -0.105); // magwell front
  recShape.lineTo(-0.245, -0.015);
  recShape.lineTo(-0.28, -0.015); // delta ring
  recShape.lineTo(-0.28, 0.05); // upper rail front
  recShape.lineTo(0.03, 0.05); // charging handle rear
  recShape.closePath();

  const recGeo = trackGeo(
    new THREE.ExtrudeGeometry(recShape, {
      depth: 0.046,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.004,
      bevelSegments: 2,
    }),
  );
  // Rotate -90deg around Y so X->-Z (barrel forward), Y->Y (up), Z->-X (width centered)
  recGeo.rotateY(-Math.PI / 2);
  recGeo.translate(0.023, 0, 0);
  const cReceiver = new THREE.Mesh(recGeo, mats.gunmetal);
  carbineGrp.add(cReceiver);

  // FDE Anodized M-LOK Ventilated Handguard (octagonal profile)
  const cHandguard = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.029, 0.03, 0.275, 8)),
    mats.anodizedTan,
  );
  cHandguard.rotation.x = Math.PI / 2;
  cHandguard.position.set(0, 0.018, -0.415);
  carbineGrp.add(cHandguard);

  // Cooling vent slots along side of handguard (proud of 0.060 handguard diameter)
  const slotGeo = trackGeo(new THREE.BoxGeometry(0.062, 0.011, 0.032));
  for (let sz = -0.32; sz >= -0.51; sz -= 0.045) {
    const slot = new THREE.Mesh(slotGeo, mats.polymerBlack);
    slot.position.set(0, 0.018, sz);
    carbineGrp.add(slot);
  }

  // Stainless Chrome Inner Barrel + Gas Tube glimpsed through handguard
  const cGasTube = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.003, 0.003, 0.26, 8)),
    mats.chromeBarrel,
  );
  cGasTube.rotation.x = Math.PI / 2;
  cGasTube.position.set(0, 0.035, -0.4);
  carbineGrp.add(cGasTube);

  // Top Continuous Picatinny Rail Spine + Cleat Teeth seated cleanly proud of upper receiver (0.054)
  const cTopRailBase = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.024, 0.008, 0.55)),
    mats.polymerBlack,
  );
  cTopRailBase.position.set(0, 0.054, -0.275);
  carbineGrp.add(cTopRailBase);

  const railToothGeo = trackGeo(new THREE.BoxGeometry(0.027, 0.0055, 0.011));
  for (let rz = -0.54; rz <= -0.01; rz += 0.02) {
    const tooth = new THREE.Mesh(railToothGeo, mats.steelDark);
    tooth.position.set(0, 0.0585, rz);
    carbineGrp.add(tooth);
  }

  // Ambidextrous Fire Selector Switch & Forward Assist detail
  const cSelector = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.058, 0.009, 0.024)),
    mats.steelDark,
  );
  cSelector.rotation.x = 0.3;
  cSelector.position.set(0, -0.006, -0.036);
  carbineGrp.add(cSelector);

  // Heavy Barrel + Sculpted Fluted Suppressor (LatheGeometry)
  const cBarrel = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.012, 0.014, 0.14, 14)),
    mats.gunmetal,
  );
  cBarrel.rotation.x = Math.PI / 2;
  cBarrel.position.set(0, 0.018, -0.58);

  const suppProfile = [
    new THREE.Vector2(0.016, 0),
    new THREE.Vector2(0.023, 0.012),
    new THREE.Vector2(0.023, 0.05),
    new THREE.Vector2(0.025, 0.058),
    new THREE.Vector2(0.025, 0.145),
    new THREE.Vector2(0.023, 0.152),
    new THREE.Vector2(0.023, 0.18),
    new THREE.Vector2(0.015, 0.19),
  ];
  const cSuppressor = new THREE.Mesh(
    trackGeo(new THREE.LatheGeometry(suppProfile, 16)),
    mats.steelDark,
  );
  cSuppressor.rotation.x = -Math.PI / 2;
  cSuppressor.position.set(0, 0.018, -0.62);

  // Heat-wrap strap around suppressor
  const cSuppWrap = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.026, 0.026, 0.095, 14)),
    mats.anodizedTan,
  );
  cSuppWrap.rotation.x = Math.PI / 2;
  cSuppWrap.position.set(0, 0.018, -0.715);

  // Reciprocating Chrome Bolt Carrier + Brass Deflector
  const cBolt = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.012, 0.02, 0.072)),
    mats.chromeBarrel,
  );
  cBolt.position.set(0.024, 0.022, -0.11);

  const cDeflector = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.016, 0.024, 0.024)),
    mats.gunmetal,
  );
  cDeflector.position.set(0.026, 0.024, -0.05);

  // Charging Handle Latch
  const cChHandle = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.042, 0.014, 0.02)),
    mats.anodizedTan,
  );
  cChHandle.position.set(0, 0.046, 0.022);

  // Buffer Tube + SOPMOD Crane Stock cheek weld peeking cleanly below sightline
  const cBuffer = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.017, 0.017, 0.16, 24)),
    mats.polymerBlack,
  );
  cBuffer.rotation.x = Math.PI / 2;
  cBuffer.position.set(0, 0.012, 0.095);

  const cStockBody = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.044, 0.088, 0.14)),
    mats.anodizedTan,
  );
  cStockBody.position.set(0, -0.01, 0.155);
  const cButtPad = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.046, 0.094, 0.022)),
    mats.polymerBlack,
  );
  cButtPad.position.set(0, -0.012, 0.228);
  carbineGrp.add(cStockBody, cButtPad);

  // Stippled Ergonomic Pistol Grip + Curved Trigger seated seamlessly into receiver tang
  const cGrip = new THREE.Mesh(
    trackGeo(
      new THREE.ExtrudeGeometry(makeBeveledBoxShape(0.032, 0.108), {
        depth: 0.046,
        bevelEnabled: true,
        bevelThickness: 0.005,
        bevelSize: 0.004,
        bevelSegments: 2,
      }),
    ),
    mats.polymerGrip,
  );
  cGrip.rotation.x = 0.34;
  cGrip.position.set(0, -0.065, -0.048);

  const cTrigger = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.006, 0.024, 0.01)),
    mats.steelGrate,
  );
  cTrigger.rotation.x = 0.35;
  cTrigger.position.set(0, -0.044, -0.068);

  // Ribbed Windowed PMAG + Visible Brass 5.56 Rounds
  const cMag = new THREE.Mesh(
    trackGeo(
      new THREE.ExtrudeGeometry(makeBeveledBoxShape(0.028, 0.145), {
        depth: 0.062,
        bevelEnabled: true,
        bevelThickness: 0.003,
        bevelSize: 0.003,
        bevelSegments: 2,
      }),
    ),
    mats.anodizedTan,
  );
  cMag.rotation.x = 0.15;
  cMag.position.set(0, -0.105, -0.22);

  // Brass round window indicator seated cleanly proud of mag walls
  const cMagWindow = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.036, 0.045, 0.022)),
    mats.brassShell,
  );
  cMagWindow.rotation.x = 0.15;
  cMagWindow.position.set(0, -0.095, -0.19);

  // Angled Foregrip on M-LOK rail
  const cForegrip = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.016, 0.018, 0.078, 10)),
    mats.polymerGrip,
  );
  cForegrip.rotation.x = -0.18;
  cForegrip.position.set(0, -0.042, -0.4);

  // Sculpted EOTech EXPS3 Holographic Sight
  const cOpticBase = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.048, 0.018, 0.088)),
    mats.anodizedTan,
  );
  cOpticBase.position.set(0, 0.063, -0.145);

  const hoodShape = new THREE.Shape();
  hoodShape.moveTo(-0.024, 0);
  hoodShape.lineTo(-0.024, 0.046);
  hoodShape.lineTo(-0.014, 0.056);
  hoodShape.lineTo(0.014, 0.056);
  hoodShape.lineTo(0.024, 0.046);
  hoodShape.lineTo(0.024, 0);
  hoodShape.lineTo(0.018, 0);
  hoodShape.lineTo(0.018, 0.042);
  hoodShape.lineTo(0.011, 0.049);
  hoodShape.lineTo(-0.011, 0.049);
  hoodShape.lineTo(-0.018, 0.042);
  hoodShape.lineTo(-0.018, 0);
  hoodShape.closePath();

  const cOpticHood = new THREE.Mesh(
    trackGeo(
      new THREE.ExtrudeGeometry(hoodShape, {
        depth: 0.068,
        bevelEnabled: true,
        bevelThickness: 0.0025,
        bevelSize: 0.0025,
        bevelSegments: 2,
      }),
    ),
    mats.anodizedTan,
  );
  cOpticHood.position.set(0, 0.066, -0.178);

  const cOpticBattery = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.0095, 0.0095, 0.026, 12)),
    mats.polymerBlack,
  );
  cOpticBattery.rotation.z = Math.PI / 2;
  cOpticBattery.position.set(0.031, 0.074, -0.162);
  carbineGrp.add(cOpticBattery);

  const cOpticLens = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(0.035, 0.036)),
    mats.opticGlass,
  );
  cOpticLens.position.set(0, 0.094, -0.145);

  const cReticleRing = new THREE.Mesh(
    trackGeo(new THREE.RingGeometry(0.0055, 0.0074, 20)),
    holoReticleMat,
  );
  cReticleRing.position.set(0, 0.094, -0.143);
  cReticleRing.renderOrder = 5;

  const cReticleDot = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(0.0015, 10)),
    holoReticleMat,
  );
  cReticleDot.position.set(0, 0.094, -0.143);
  cReticleDot.renderOrder = 5;

  // PEQ-15 Tactical Laser Pod + Rail Grabber Clamp + SureFire Flashlight w/ M-LOK Offset Mount
  const cPeqClamp = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.032, 0.01, 0.072)),
    mats.steelDark,
  );
  cPeqClamp.position.set(0.005, 0.054, -0.47);
  carbineGrp.add(cPeqClamp);

  const cPeqBody = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.044, 0.022, 0.088)),
    mats.anodizedTan,
  );
  cPeqBody.position.set(0.012, 0.064, -0.47);

  const cPeqLaserLens = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.0042, 0.0042, 0.006, 10)),
    redDotMat,
  );
  cPeqLaserLens.rotation.x = Math.PI / 2;
  cPeqLaserLens.position.set(0.022, 0.064, -0.514);

  const cPeqBeam = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.0012, 0.0022, 4.5, 6)),
    peqLaserMat,
  );
  cPeqBeam.rotation.x = Math.PI / 2;
  cPeqBeam.position.set(0.022, 0.064, -2.76);

  // SureFire Scout Flashlight on Right M-LOK Rail + Offset Mount Arm
  const cLightMount = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.026, 0.014, 0.046)),
    mats.gunmetal,
  );
  cLightMount.position.set(0.024, 0.018, -0.475);
  carbineGrp.add(cLightMount);

  const cLightTube = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.013, 0.012, 0.11, 12)),
    mats.steelDark,
  );
  cLightTube.rotation.x = Math.PI / 2;
  cLightTube.position.set(0.036, 0.018, -0.48);

  const cLightLens = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.0105, 0.0105, 0.006, 12)),
    flashLensMat,
  );
  cLightLens.rotation.x = Math.PI / 2;
  cLightLens.position.set(0.036, 0.018, -0.535);

  carbineGrp.add(
    cHandguard,
    cBarrel,
    cSuppressor,
    cSuppWrap,
    cBolt,
    cDeflector,
    cChHandle,
    cBuffer,
    cGrip,
    cTrigger,
    cMag,
    cMagWindow,
    cForegrip,
    cOpticBase,
    cOpticHood,
    cOpticLens,
    cReticleRing,
    cReticleDot,
    cPeqBody,
    cPeqLaserLens,
    cPeqBeam,
    cLightTube,
    cLightLens,
  );

  // =========================================================================
  // WEAPON 2: SCULPTED M1014 BREACHER (12-Gauge Tactical Shotgun)
  // =========================================================================
  const shotgunGrp = new THREE.Group();

  const sRecGeo = trackGeo(
    new THREE.ExtrudeGeometry(makeBeveledBoxShape(0.048, 0.064), {
      depth: 0.27,
      bevelEnabled: true,
      bevelThickness: 0.006,
      bevelSize: 0.005,
      bevelSegments: 2,
    }),
  );
  sRecGeo.translate(0, 0.012, -0.25);
  const sReceiver = new THREE.Mesh(sRecGeo, mats.gunmetal);

  // Shotgun Collapsible Tactical Stock + Steel Extension Tube seated solidly into receiver rear
  const sStockTube = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 12)),
    mats.steelDark,
  );
  sStockTube.rotation.x = Math.PI / 2;
  sStockTube.position.set(0, 0.012, 0.09);
  const sStock = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.044, 0.092, 0.14)),
    mats.polymerGrip,
  );
  sStock.position.set(0, -0.008, 0.155);
  const sButtPad = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.046, 0.098, 0.02)),
    mats.polymerBlack,
  );
  sButtPad.position.set(0, -0.01, 0.228);
  shotgunGrp.add(sStockTube, sStock, sButtPad);

  // Knurled Oversized Benelli Charging Bolt Handle
  const sBolt = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.006, 0.008, 0.035, 10)),
    mats.chromeBarrel,
  );
  sBolt.rotation.z = Math.PI / 2;
  sBolt.position.set(0.034, 0.022, -0.11);

  // Fluted Heavy Barrel + Breacher Stand-Off Crown + Ventilated Shroud
  const sBarrel = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.016, 0.018, 0.5, 14)),
    mats.gunmetal,
  );
  sBarrel.rotation.x = Math.PI / 2;
  sBarrel.position.set(0, 0.028, -0.47);

  const sChoke = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.02, 0.018, 0.052, 8)),
    mats.steelDark,
  );
  sChoke.rotation.x = Math.PI / 2;
  sChoke.position.set(0, 0.028, -0.73);

  const sTubeMag = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 12)),
    mats.steelDark,
  );
  sTubeMag.rotation.x = Math.PI / 2;
  sTubeMag.position.set(0, -0.003, -0.45);

  const sClamp = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.04, 0.056, 0.026)),
    mats.steelGrate,
  );
  sClamp.position.set(0, 0.013, -0.62);

  // Sculpted Ribbed Polymer Forend seated flush against receiver face
  const sForend = new THREE.Mesh(
    trackGeo(
      new THREE.ExtrudeGeometry(makeBeveledBoxShape(0.048, 0.046), {
        depth: 0.23,
        bevelEnabled: true,
        bevelThickness: 0.006,
        bevelSize: 0.005,
        bevelSegments: 2,
      }),
    ),
    mats.polymerGrip,
  );
  sForend.position.set(0, -0.008, -0.48);

  const sGrip = new THREE.Mesh(
    trackGeo(
      new THREE.ExtrudeGeometry(makeBeveledBoxShape(0.034, 0.11), {
        depth: 0.048,
        bevelEnabled: true,
        bevelThickness: 0.005,
        bevelSize: 0.004,
        bevelSegments: 2,
      }),
    ),
    mats.polymerGrip,
  );
  sGrip.rotation.x = 0.34;
  sGrip.position.set(0, -0.058, -0.046);

  // Ghost Ring Rear Sight Base + Ring + Protective Ears seated solidly on receiver top (y = 0.050)
  const sGhostBase = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.036, 0.012, 0.036)),
    mats.steelDark,
  );
  sGhostBase.position.set(0, 0.052, -0.09);
  shotgunGrp.add(sGhostBase);

  const sGhostRing = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(0.011, 0.0024, 10, 20)),
    mats.steelGrate,
  );
  sGhostRing.position.set(0, 0.068, -0.09);

  [-0.015, 0.015].forEach((ex) => {
    const ear = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.004, 0.022, 0.018)),
      mats.gunmetal,
    );
    ear.position.set(ex, 0.066, -0.09);
    shotgunGrp.add(ear);
  });

  // Glowing Fiber-Optic Green Front Blade aligned to Y = 0.068
  const sFrontBase = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.012, 0.018, 0.026)),
    mats.steelDark,
  );
  sFrontBase.position.set(0, 0.052, -0.66);

  const sFrontPost = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.004, 0.014, 0.016)),
    holoReticleMat,
  );
  sFrontPost.position.set(0, 0.066, -0.66);

  // Side Shell Saddle (5 crimson 12G shells with brass primers!)
  const saddlePlate = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.014, 0.044, 0.15)),
    mats.polymerBlack,
  );
  saddlePlate.position.set(-0.032, 0.012, -0.11);
  shotgunGrp.add(saddlePlate);

  for (let i = 0; i < 5; i++) {
    const zShell = -0.055 - i * 0.026;
    const shell = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.009, 0.009, 0.048, 10)),
      mats.hazardDrum,
    );
    shell.position.set(-0.04, 0.014, zShell);
    const brassHead = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.0095, 0.0095, 0.014, 10)),
      mats.brassShell,
    );
    brassHead.position.set(-0.04, -0.012, zShell);
    shotgunGrp.add(shell, brassHead);
  }

  shotgunGrp.add(
    sReceiver,
    sBolt,
    sBarrel,
    sChoke,
    sTubeMag,
    sClamp,
    sForend,
    sGrip,
    sGhostRing,
    sFrontBase,
    sFrontPost,
  );
  shotgunGrp.visible = false;

  // =========================================================================
  // WEAPON 3: SCULPTED G19 TACTICAL SUPPRESSED SIDEARM
  // =========================================================================
  const sidearmGrp = new THREE.Group();

  const pFrame = new THREE.Mesh(
    trackGeo(
      new THREE.ExtrudeGeometry(makeBeveledBoxShape(0.032, 0.032), {
        depth: 0.21,
        bevelEnabled: true,
        bevelThickness: 0.003,
        bevelSize: 0.003,
        bevelSegments: 2,
      }),
    ),
    mats.polymerGrip,
  );
  pFrame.position.set(0, -0.004, -0.25);

  const pSlide = new THREE.Mesh(
    trackGeo(
      new THREE.ExtrudeGeometry(makeBeveledBoxShape(0.034, 0.03), {
        depth: 0.21,
        bevelEnabled: true,
        bevelThickness: 0.004,
        bevelSize: 0.003,
        bevelSegments: 2,
      }),
    ),
    mats.gunmetal,
  );
  pSlide.position.set(0, 0.028, -0.25);

  // Slide serrations (protruding cleanly proud of 0.040 beveled slide width) & chrome barrel hood
  for (let i = 0; i < 6; i++) {
    const serr = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.043, 0.022, 0.004)),
      mats.steelDark,
    );
    serr.position.set(0, 0.028, -0.055 - i * 0.008);
    sidearmGrp.add(serr);
  }
  const pBarrelHood = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.024, 0.012, 0.042)),
    mats.chromeBarrel,
  );
  pBarrelHood.position.set(0, 0.04, -0.16);

  // Octagonal Osprey-style Suppressor + X300 Underbarrel Light
  const pSuppressor = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.019, 0.019, 0.19, 8)),
    mats.steelDark,
  );
  pSuppressor.rotation.x = Math.PI / 2;
  pSuppressor.position.set(0, 0.026, -0.34);

  const pUnderLight = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.032, 0.028, 0.08)),
    mats.steelDark,
  );
  pUnderLight.position.set(0, -0.026, -0.21);

  const pLightLens = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.0105, 0.0105, 0.006, 12)),
    flashLensMat,
  );
  pLightLens.rotation.x = Math.PI / 2;
  pLightLens.position.set(0, -0.026, -0.25);

  const pGrip = new THREE.Mesh(
    trackGeo(
      new THREE.ExtrudeGeometry(makeBeveledBoxShape(0.032, 0.105), {
        depth: 0.048,
        bevelEnabled: true,
        bevelThickness: 0.004,
        bevelSize: 0.003,
        bevelSegments: 2,
      }),
    ),
    mats.polymerGrip,
  );
  pGrip.rotation.x = 0.28;
  pGrip.position.set(0, -0.062, -0.08);

  const pMag = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.026, 0.095, 0.038)),
    mats.steelGrate,
  );
  pMag.rotation.x = 0.28;
  pMag.position.set(0, -0.07, -0.055);
  const pMagPlate = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.032, 0.012, 0.046)),
    mats.polymerBlack,
  );
  pMagPlate.rotation.x = 0.28;
  pMagPlate.position.set(0, -0.114, -0.067);
  sidearmGrp.add(pMagPlate);

  // Sculpted Trijicon RMR Micro Red Dot (Winged Hood + Lens + Red Dot at Y=0.064, non-coplanar corners)
  const pRmrBase = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.032, 0.01, 0.044)),
    mats.gunmetal,
  );
  pRmrBase.position.set(0, 0.049, -0.085);

  [-0.014, 0.014].forEach((rx) => {
    const wing = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.004, 0.02, 0.03)),
      mats.gunmetal,
    );
    wing.position.set(rx, 0.063, -0.085);
    sidearmGrp.add(wing);
  });
  const pRmrTop = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.033, 0.0045, 0.033)),
    mats.gunmetal,
  );
  pRmrTop.position.set(0, 0.075, -0.085);

  const pRmrLens = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(0.024, 0.02)),
    mats.opticGlass,
  );
  pRmrLens.position.set(0, 0.064, -0.085);

  const pRmrDot = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(0.0018, 10)),
    redDotMat,
  );
  pRmrDot.position.set(0, 0.064, -0.083);
  pRmrDot.renderOrder = 5;

  sidearmGrp.add(
    pFrame,
    pSlide,
    pBarrelHood,
    pSuppressor,
    pUnderLight,
    pLightLens,
    pGrip,
    pMag,
    pRmrBase,
    pRmrTop,
    pRmrLens,
    pRmrDot,
  );
  sidearmGrp.visible = false;

  // =========================================================================
  // WEAPON 4: MP7-A2 TACTICAL PDW (SMG + Extended 40-rd Mag + Suppressor + Micro Dot)
  // =========================================================================
  const smgGrp = new THREE.Group();

  const smgUpper = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.044, 0.068, 0.34)),
    mats.polymerBlack,
  );
  smgUpper.position.set(0, 0.014, -0.17);

  const smgRail = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.024, 0.008, 0.32)),
    mats.steelDark,
  );
  smgRail.position.set(0, 0.052, -0.17);

  const smgStockBars = [-0.022, 0.022].map((sx) => {
    const bar = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.006, 0.012, 0.16)),
      mats.steelDark,
    );
    bar.position.set(sx, 0.016, 0.07);
    return bar;
  });
  const smgButt = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.046, 0.088, 0.024)),
    mats.polymerGrip,
  );
  smgButt.position.set(0, 0.004, 0.155);

  const smgGrip = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.032, 0.11, 0.046)),
    mats.polymerGrip,
  );
  smgGrip.rotation.x = 0.22;
  smgGrip.position.set(0, -0.068, -0.09);

  const smgMag = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.024, 0.145, 0.036)),
    mats.steelDark,
  );
  smgMag.rotation.x = 0.22;
  smgMag.position.set(0, -0.125, -0.105);

  const smgForegrip = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.013, 0.015, 0.082, 10)),
    mats.polymerGrip,
  );
  smgForegrip.rotation.x = 0.08;
  smgForegrip.position.set(0, -0.056, -0.29);

  const smgSupp = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.019, 0.019, 0.18, 12)),
    mats.gunmetal,
  );
  smgSupp.rotation.x = Math.PI / 2;
  smgSupp.position.set(0, 0.018, -0.43);

  const smgBolt = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.01, 0.018, 0.055)),
    mats.chromeBarrel,
  );
  smgBolt.position.set(0.023, 0.022, -0.14);

  // Micro T2 Red Dot Optic (lens center Y = 0.082)
  const smgOpticMount = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.026, 0.018, 0.046)),
    mats.steelDark,
  );
  smgOpticMount.position.set(0, 0.062, -0.14);
  const smgOpticTube = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.017, 0.017, 0.064, 14, 1, true)),
    mats.gunmetal,
  );
  smgOpticTube.rotation.x = Math.PI / 2;
  smgOpticTube.position.set(0, 0.082, -0.14);
  const smgOpticLens = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(0.015, 14)),
    mats.opticGlass,
  );
  smgOpticLens.position.set(0, 0.082, -0.138);
  const smgDot = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(0.0017, 10)),
    redDotMat,
  );
  smgDot.position.set(0, 0.082, -0.136);
  smgDot.renderOrder = 5;

  smgGrp.add(
    smgUpper,
    smgRail,
    ...smgStockBars,
    smgButt,
    smgGrip,
    smgMag,
    smgForegrip,
    smgSupp,
    smgBolt,
    smgOpticMount,
    smgOpticTube,
    smgOpticLens,
    smgDot,
  );
  smgGrp.visible = false;

  // =========================================================================
  // WEAPON 5: M2010 ESR PRECISION BOLT-ACTION SNIPER RIFLE
  // =========================================================================
  const sniperGrp = new THREE.Group();

  const snChassis = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.048, 0.066, 0.44)),
    mats.anodizedTan,
  );
  snChassis.position.set(0, 0.006, -0.18);

  const snHandguard = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.028, 0.03, 0.34, 8)),
    mats.anodizedTan,
  );
  snHandguard.rotation.x = Math.PI / 2;
  snHandguard.position.set(0, 0.018, -0.45);

  const snBarrel = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.013, 0.016, 0.56, 12)),
    mats.gunmetal,
  );
  snBarrel.rotation.x = Math.PI / 2;
  snBarrel.position.set(0, 0.02, -0.74);

  const snSuppressor = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.023, 0.023, 0.22, 14)),
    mats.steelDark,
  );
  snSuppressor.rotation.x = Math.PI / 2;
  snSuppressor.position.set(0, 0.02, -1.04);

  // Folded Bipod Legs under handguard
  [-0.026, 0.026].forEach((bx) => {
    const bpLeg = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.007, 0.008, 0.19, 8)),
      mats.steelDark,
    );
    bpLeg.rotation.x = Math.PI / 2;
    bpLeg.position.set(bx, -0.026, -0.52);
    sniperGrp.add(bpLeg);
  });

  const snStock = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.042, 0.082, 0.22)),
    mats.anodizedTan,
  );
  snStock.position.set(0, -0.008, 0.14);

  const snGrip = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.032, 0.105, 0.044)),
    mats.polymerGrip,
  );
  snGrip.rotation.x = 0.28;
  snGrip.position.set(0, -0.068, -0.045);

  const snMag = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.034, 0.095, 0.088)),
    mats.steelDark,
  );
  snMag.position.set(0, -0.072, -0.19);

  const snBoltHandle = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.007, 0.007, 0.048, 8)),
    mats.chromeBarrel,
  );
  snBoltHandle.rotation.z = Math.PI / 2;
  snBoltHandle.position.set(0.034, 0.026, -0.07);

  // Large Variable Precision Scope (Center Y = 0.088)
  const snMount = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.034, 0.026, 0.14)),
    mats.steelDark,
  );
  snMount.position.set(0, 0.056, -0.16);
  const snScopeTube = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.019, 0.019, 0.24, 16)),
    mats.gunmetal,
  );
  snScopeTube.rotation.x = Math.PI / 2;
  snScopeTube.position.set(0, 0.088, -0.18);
  const snScopeBell = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.027, 0.02, 0.08, 16)),
    mats.gunmetal,
  );
  snScopeBell.rotation.x = Math.PI / 2;
  snScopeBell.position.set(0, 0.088, -0.32);
  const snScopeLens = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(0.018, 14)),
    mats.opticGlass,
  );
  snScopeLens.position.set(0, 0.088, -0.059);

  [-0.11, -0.22].forEach((rz) => {
    const ringClamp = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.023, 0.023, 0.018, 14)),
      mats.steelDark,
    );
    ringClamp.rotation.x = Math.PI / 2;
    ringClamp.position.set(0, 0.088, rz);
    const ringStem = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.026, 0.022, 0.018)),
      mats.steelDark,
    );
    ringStem.position.set(0, 0.072, rz);
    sniperGrp.add(ringClamp, ringStem);
  });

  sniperGrp.add(
    snChassis,
    snHandguard,
    snBarrel,
    snSuppressor,
    snStock,
    snGrip,
    snMag,
    snBoltHandle,
    snMount,
    snScopeTube,
    snScopeBell,
    snScopeLens,
  );
  sniperGrp.visible = false;

  // =========================================================================
  // WEAPON 6: M249 SAW LIGHT MACHINE GUN (Ammo Box + Brass Belt + Heatshield)
  // =========================================================================
  const lmgGrp = new THREE.Group();

  const lmgBody = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.068, 0.082, 0.42)),
    mats.gunmetal,
  );
  lmgBody.position.set(0, 0.01, -0.2);

  const lmgFeedCover = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.064, 0.024, 0.18)),
    mats.steelDark,
  );
  lmgFeedCover.position.set(0, 0.058, -0.18);

  const lmgHeatshield = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.028, 0.03, 0.3, 10, 1, false, 0, Math.PI)),
    mats.steelGrate,
  );
  lmgHeatshield.rotation.z = -Math.PI / 2;
  lmgHeatshield.rotation.y = Math.PI / 2;
  lmgHeatshield.position.set(0, 0.022, -0.5);

  const lmgBarrel = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.015, 0.017, 0.48, 12)),
    mats.steelDark,
  );
  lmgBarrel.rotation.x = Math.PI / 2;
  lmgBarrel.position.set(0, 0.018, -0.62);

  const lmgFlashHider = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.02, 0.018, 0.065, 10)),
    mats.gunmetal,
  );
  lmgFlashHider.rotation.x = Math.PI / 2;
  lmgFlashHider.position.set(0, 0.018, -0.88);

  const lmgGasBlock = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.014, 0.014, 0.36, 10)),
    mats.steelGrate,
  );
  lmgGasBlock.rotation.x = Math.PI / 2;
  lmgGasBlock.position.set(0, -0.014, -0.54);

  const lmgForearm = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.056, 0.044, 0.24)),
    mats.polymerGrip,
  );
  lmgForearm.position.set(0, -0.022, -0.44);

  const lmgStock = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.048, 0.095, 0.22)),
    mats.polymerBlack,
  );
  lmgStock.position.set(0, -0.01, 0.11);

  const lmgGrip = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.034, 0.108, 0.048)),
    mats.polymerGrip,
  );
  lmgGrip.rotation.x = 0.32;
  lmgGrip.position.set(0, -0.068, -0.05);

  // 100-Round Olive Ammo Pouch + Exposed Brass Cartridge Belt feeding up left side!
  const lmgBox = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.115, 0.125, 0.145)),
    mats.containerOlive,
  );
  lmgBox.position.set(-0.028, -0.098, -0.22);

  for (let b = 0; b < 5; b++) {
    const bullet = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.0055, 0.0055, 0.042, 8)),
      mats.brassShell,
    );
    bullet.rotation.z = Math.PI / 2;
    bullet.position.set(-0.044 + b * 0.003, -0.032 + b * 0.014, -0.19);
    lmgGrp.add(bullet);
  }

  const lmgBolt = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.014, 0.02, 0.045)),
    mats.chromeBarrel,
  );
  lmgBolt.position.set(0.038, 0.02, -0.14);

  // Rugged Reflex Optic (center Y = 0.098)
  const lmgOpticBase = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.042, 0.018, 0.072)),
    mats.steelDark,
  );
  lmgOpticBase.position.set(0, 0.076, -0.16);
  const lmgOpticHood = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.044, 0.036, 0.052)),
    mats.gunmetal,
  );
  lmgOpticHood.position.set(0, 0.098, -0.16);
  const lmgOpticLens = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(0.03, 0.026)),
    mats.opticGlass,
  );
  lmgOpticLens.position.set(0, 0.098, -0.133);
  const lmgReticle = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(0.0022, 10)),
    holoReticleMat,
  );
  lmgReticle.position.set(0, 0.098, -0.131);
  lmgReticle.renderOrder = 5;

  lmgGrp.add(
    lmgBody,
    lmgFeedCover,
    lmgHeatshield,
    lmgBarrel,
    lmgFlashHider,
    lmgGasBlock,
    lmgForearm,
    lmgStock,
    lmgGrip,
    lmgBox,
    lmgBolt,
    lmgOpticBase,
    lmgOpticHood,
    lmgOpticLens,
    lmgReticle,
  );
  lmgGrp.visible = false;

  // =========================================================================
  // WEAPON 7: AK-105 ZENITCO CARBINE (Bakelite Curved Mag + Ribbed Cover + OKP-7)
  // =========================================================================
  const akGrp = new THREE.Group();

  const akReceiver = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.046, 0.068, 0.29)),
    mats.gunmetal,
  );
  akReceiver.position.set(0, 0.008, -0.14);

  const akDustCover = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.024, 0.024, 0.26, 8, 1, false, -Math.PI / 2, Math.PI)),
    mats.steelDark,
  );
  akDustCover.rotation.x = Math.PI / 2;
  akDustCover.position.set(0, 0.042, -0.14);

  const akHandguard = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.048, 0.056, 0.24)),
    mats.polymerBlack,
  );
  akHandguard.position.set(0, 0.012, -0.4);

  const akGasTube = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 10)),
    mats.steelDark,
  );
  akGasTube.rotation.x = Math.PI / 2;
  akGasTube.position.set(0, 0.044, -0.4);

  const akBarrel = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.012, 0.014, 0.24, 12)),
    mats.gunmetal,
  );
  akBarrel.rotation.x = Math.PI / 2;
  akBarrel.position.set(0, 0.014, -0.61);

  const akBooster = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.021, 0.017, 0.078, 12)),
    mats.steelDark,
  );
  akBooster.rotation.x = Math.PI / 2;
  akBooster.position.set(0, 0.014, -0.75);

  const akStock = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.038, 0.088, 0.2)),
    mats.polymerBlack,
  );
  akStock.position.set(0, -0.006, 0.1);

  const akGrip = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.032, 0.105, 0.044)),
    mats.bakeliteOrange,
  );
  akGrip.rotation.x = 0.34;
  akGrip.position.set(0, -0.068, -0.05);

  // Curved Iconic Orange Bakelite 5.45/7.62 Magazine (2 angled segments)
  const akMagGrp = new THREE.Group();
  const akMagTop = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.03, 0.1, 0.068)),
    mats.bakeliteOrange,
  );
  akMagTop.rotation.x = 0.12;
  akMagTop.position.set(0, -0.065, -0.2);
  const akMagBot = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.03, 0.1, 0.066)),
    mats.bakeliteOrange,
  );
  akMagBot.rotation.x = 0.34;
  akMagBot.position.set(0, -0.145, -0.214);
  akMagGrp.add(akMagTop, akMagBot);

  const akBolt = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.006, 0.007, 0.036, 8)),
    mats.chromeBarrel,
  );
  akBolt.rotation.z = Math.PI / 2;
  akBolt.position.set(0.032, 0.024, -0.14);

  // OKP-7 Open Reflex Sight on Left-Side Dovetail Rail Mount (center Y = 0.084)
  const akDovetailArm = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.012, 0.044, 0.068)),
    mats.steelDark,
  );
  akDovetailArm.position.set(-0.025, 0.044, -0.14);
  const akOpticBracket = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.032, 0.014, 0.062)),
    mats.steelDark,
  );
  akOpticBracket.position.set(-0.013, 0.068, -0.14);
  akGrp.add(akDovetailArm);
  const akOpticRing = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(0.016, 0.0028, 8, 18, Math.PI * 1.4)),
    mats.gunmetal,
  );
  akOpticRing.rotation.z = -0.3;
  akOpticRing.position.set(0, 0.084, -0.14);
  const akOpticDot = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(0.002, 10)),
    holoReticleMat,
  );
  akOpticDot.position.set(0, 0.084, -0.138);
  akOpticDot.renderOrder = 5;

  akGrp.add(
    akReceiver,
    akDustCover,
    akHandguard,
    akGasTube,
    akBarrel,
    akBooster,
    akStock,
    akGrip,
    akMagGrp,
    akBolt,
    akOpticBracket,
    akOpticRing,
    akOpticDot,
  );
  akGrp.visible = false;

  swayGroup.add(carbineGrp, shotgunGrp, sidearmGrp, smgGrp, sniperGrp, lmgGrp, akGrp);

  // --- MUZZLE FLASH & EJECTION ANCHORS ---
  const muzzleFlashMesh = new THREE.Mesh(
    trackGeo(new THREE.OctahedronGeometry(0.095, 1)),
    muzzleFlashMat,
  );
  muzzleFlashMesh.position.set(0, 0.018, -0.82);
  muzzleFlashMesh.visible = false;
  swayGroup.add(muzzleFlashMesh);

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0, 0.02, -0.82);
  swayGroup.add(muzzlePoint);

  const ejectionPoint = new THREE.Object3D();
  ejectionPoint.position.set(0.045, 0.025, -0.11);
  swayGroup.add(ejectionPoint);

  // --- TACTICAL FLASHLIGHT + VOLUMETRIC CONE (Mounted ahead of muzzle to avoid weapon glare) ---
  const flashlight = new THREE.SpotLight(
    0xfff6e8,
    isSoftwareGl ? 34 : 58,
    46,
    Math.PI / 6.8,
    0.72,
    1.35,
  );
  flashlight.position.set(0.08, -0.02, -0.88);
  flashlight.castShadow = false;
  const flashlightTarget = new THREE.Object3D();
  flashlightTarget.position.set(0, 0.2, -16);
  flashlight.target = flashlightTarget;

  const flashCone = new THREE.Mesh(
    trackGeo(new THREE.ConeGeometry(1.35, 7.5, 16, 1, true)),
    flashConeMat,
  );
  flashCone.rotation.x = Math.PI / 2;
  flashCone.position.set(0.08, -0.08, -4.65);

  // Animation accumulators
  let boltKick = 0;
  let flashTimer = 0;
  let currentX = 0.21;
  let currentY = -0.19;
  let currentZ = -0.25;

  // ADS target offsets aligned precisely with sculpted optic reticles at screen center (0, 0)
  const adsEyeOffsets: Record<WeaponId, { x: number; y: number; z: number }> = {
    carbine: { x: 0.0, y: -0.094, z: -0.15 },
    shotgun: { x: 0.0, y: -0.068, z: -0.15 },
    smg: { x: 0.0, y: -0.082, z: -0.14 },
    sniper: { x: 0.0, y: -0.088, z: -0.12 },
    lmg: { x: 0.0, y: -0.098, z: -0.14 },
    ak: { x: 0.0, y: -0.084, z: -0.15 },
    sidearm: { x: 0.0, y: -0.064, z: -0.22 },
  };

  return {
    root,
    flashlight,
    flashlightTarget,
    flashCone,
    muzzleFlashMesh,
    muzzlePoint,
    ejectionPoint,
    triggerFire: () => {
      boltKick = 1;
      flashTimer = 0.055;
      muzzleFlashMesh.visible = true;
      muzzleFlashMesh.rotation.z = Math.random() * Math.PI;
      const s = 0.78 + Math.random() * 0.55;
      muzzleFlashMesh.scale.set(s, s, s * 1.65);
    },
    update: (dt: number, state: ViewmodelState) => {
      const hideForScope = state.weaponId === 'sniper' && state.ads > 0.72;
      carbineGrp.visible = state.weaponId === 'carbine';
      shotgunGrp.visible = state.weaponId === 'shotgun';
      smgGrp.visible = state.weaponId === 'smg';
      sniperGrp.visible = state.weaponId === 'sniper' && !hideForScope;
      lmgGrp.visible = state.weaponId === 'lmg';
      akGrp.visible = state.weaponId === 'ak';
      sidearmGrp.visible = state.weaponId === 'sidearm';
      armRight.visible = !hideForScope;
      armLeft.visible = !hideForScope;

      // Muzzle flash & bolt decay
      if (flashTimer > 0) {
        flashTimer -= dt;
        if (flashTimer <= 0) muzzleFlashMesh.visible = false;
      }
      boltKick = THREE.MathUtils.damp(boltKick, 0, 26, dt);
      cBolt.position.z = -0.11 + boltKick * 0.058;
      pSlide.position.z = -0.25 + boltKick * 0.048;
      smgBolt.position.z = -0.14 + boltKick * 0.045;
      lmgBolt.position.z = -0.14 + boltKick * 0.052;
      akBolt.position.z = -0.14 + boltKick * 0.062;
      snBoltHandle.position.z = -0.07 + boltKick * 0.055;

      // Reload magazine drop & re-insert curve
      if (state.reloadRatio > 0) {
        const dropPhase = Math.sin(state.reloadRatio * Math.PI);
        cMag.position.y = -0.105 - dropPhase * 0.14;
        cMagWindow.position.y = -0.095 - dropPhase * 0.14;
        pMag.position.y = -0.07 - dropPhase * 0.12;
        smgMag.position.y = -0.125 - dropPhase * 0.14;
        snMag.position.y = -0.072 - dropPhase * 0.12;
        lmgBox.position.y = -0.098 - dropPhase * 0.15;
        akMagGrp.position.y = -dropPhase * 0.15;
      } else {
        cMag.position.y = -0.105;
        cMagWindow.position.y = -0.095;
        pMag.position.y = -0.07;
        smgMag.position.y = -0.125;
        snMag.position.y = -0.072;
        lmgBox.position.y = -0.098;
        akMagGrp.position.y = 0;
      }

      // Hip-fire vs ADS position interpolation
      const hipX = state.weaponId === 'sidearm' ? 0.17 : 0.21;
      const hipY = state.weaponId === 'sidearm' ? -0.18 : -0.19;
      const hipZ = state.weaponId === 'sidearm' ? -0.26 : -0.25;
      const adsTarget = adsEyeOffsets[state.weaponId];

      let tx = THREE.MathUtils.lerp(hipX, adsTarget.x, state.ads);
      let ty = THREE.MathUtils.lerp(hipY, adsTarget.y, state.ads);
      let tz = THREE.MathUtils.lerp(hipZ, adsTarget.z, state.ads);

      // Sprint canted low-ready
      tx += state.sprintRatio * 0.05 * (1 - state.ads);
      ty -= state.sprintRatio * 0.06 * (1 - state.ads);

      // Swap & Reload dip
      ty -= state.swapDrop * 0.22;
      if (state.reloadRatio > 0) {
        ty -= Math.sin(state.reloadRatio * Math.PI) * 0.08;
      }

      // Melee bash lunge
      if (state.meleeRatio > 0) {
        const lunge = Math.sin(state.meleeRatio * Math.PI);
        tz -= lunge * 0.22;
        tx -= lunge * 0.12;
      }

      // Distance-synced figure-8 walk sway
      const swayScale = (1 - state.ads * 0.78) * (0.008 + state.moveSpeedRatio * 0.015);
      const bobX = Math.sin(state.walkDist * 2.1) * swayScale;
      const bobY = Math.abs(Math.cos(state.walkDist * 2.1)) * swayScale * 0.75;

      // Recoil kickback & CQB wall-compression pullback
      tz += state.recoilKick * 0.075 + state.wallPull * 0.22;
      ty += state.recoilKick * 0.015 - state.wallPull * 0.06 * (1 - state.ads);
      tx -= state.wallPull * 0.04 * (1 - state.ads);

      currentX = THREE.MathUtils.damp(currentX, tx + bobX, 18, dt);
      currentY = THREE.MathUtils.damp(currentY, ty - bobY, 18, dt);
      currentZ = THREE.MathUtils.damp(currentZ, tz, 20, dt);

      swayGroup.position.set(currentX, currentY, currentZ);

      const targetRotX =
        state.recoilRot +
        state.sprintRatio * -0.22 * (1 - state.ads) +
        state.wallPull * 0.16 * (1 - state.ads) -
        (state.reloadRatio > 0 ? Math.sin(state.reloadRatio * Math.PI) * 0.38 : 0);
      const targetRotY =
        state.sprintRatio * 0.36 * (1 - state.ads) +
        state.wallPull * 0.48 * (1 - state.ads) +
        (state.meleeRatio > 0 ? Math.sin(state.meleeRatio * Math.PI) * 0.65 : 0);
      const targetRotZ =
        state.sprintRatio * 0.18 * (1 - state.ads) +
        state.wallPull * 0.14 * (1 - state.ads) +
        (state.reloadRatio > 0 ? Math.sin(state.reloadRatio * Math.PI) * 0.28 : 0);

      swayGroup.rotation.x = THREE.MathUtils.damp(swayGroup.rotation.x, targetRotX, 18, dt);
      swayGroup.rotation.y = THREE.MathUtils.damp(swayGroup.rotation.y, targetRotY, 16, dt);
      swayGroup.rotation.z = THREE.MathUtils.damp(swayGroup.rotation.z, targetRotZ, 16, dt);

      // Right trigger-hand & left support-hand align cleanly with each weapon's grip & handguard
      armRight.position.set(
        0,
        0,
        state.weaponId === 'sidearm' ? -0.038 : state.weaponId === 'smg' ? -0.046 : 0,
      );
      armLeft.position.set(
        state.weaponId === 'sidearm' ? 0.032 : state.weaponId === 'smg' ? 0.01 : 0,
        state.weaponId === 'sidearm' ? -0.036 : state.weaponId === 'lmg' ? -0.025 : 0,
        state.weaponId === 'sidearm' ? 0.305 : state.weaponId === 'smg' ? 0.105 : 0,
      );

      const barrelZ =
        state.weaponId === 'sniper'
          ? -1.16
          : state.weaponId === 'lmg'
            ? -0.92
            : state.weaponId === 'carbine'
              ? -0.82
              : state.weaponId === 'ak'
                ? -0.8
                : state.weaponId === 'shotgun'
                  ? -0.76
                  : state.weaponId === 'smg'
                    ? -0.54
                    : -0.46;
      muzzleFlashMesh.position.z = barrelZ;
      muzzlePoint.position.z = barrelZ;
      flashlight.intensity = state.flashlightOn ? (isSoftwareGl ? 34 : 58) : 0;
      flashCone.visible = state.flashlightOn;
      flashLensMat.emissiveIntensity = state.flashlightOn ? 2.2 : 0.05;
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      localMaterials.forEach((m) => m.dispose());
    },
  };
}
