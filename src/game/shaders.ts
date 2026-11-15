import * as THREE from 'three';
import type { WeatherType } from './types';

export const BodyCamShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uDistortion: { value: 0.075 },
    uChromatic: { value: 0.0014 },
    uGrain: { value: 0.028 },
    uDamage: { value: 0.0 },
    uFlash: { value: 0.0 },
    uVignette: { value: 0.2 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uDistortion;
    uniform float uChromatic;
    uniform float uGrain;
    uniform float uDamage;
    uniform float uFlash;
    uniform float uVignette;
    varying vec2 vUv;

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    vec2 barrelDistort(vec2 uv, float k) {
      vec2 centered = uv - 0.5;
      float r2 = dot(centered, centered);
      vec2 warped = centered * (1.0 + k * r2);
      return warped + 0.5;
    }

    void main() {
      vec2 distortedUv = barrelDistort(vUv, uDistortion);
      vec2 clampedUv = clamp(distortedUv, vec2(0.002), vec2(0.998));

      vec2 dir = clampedUv - 0.5;
      float radial = length(dir);
      float ca = uChromatic + uDamage * 0.008 + uFlash * 0.006;

      float r = texture2D(tDiffuse, clamp(clampedUv + dir * ca, vec2(0.001), vec2(0.999))).r;
      float g = texture2D(tDiffuse, clampedUv).g;
      float b = texture2D(tDiffuse, clamp(clampedUv - dir * ca, vec2(0.001), vec2(0.999))).b;

      vec3 col = vec3(r, g, b);

      float dropMask = smoothstep(0.32, 0.62, radial);
      float dropNoise = hash12(floor(clampedUv * 26.0));
      if (dropNoise > 0.965) {
        vec2 cell = fract(clampedUv * 26.0) - 0.5;
        float droplet = smoothstep(0.26, 0.08, length(cell)) * dropMask;
        col += vec3(0.08, 0.11, 0.15) * droplet;
      }

      col = mix(col, col * col * (3.0 - 2.0 * col), 0.09);
      col = col / (col + vec3(0.075)) * 1.06;

      float grain = (hash12(clampedUv * 950.0 + fract(uTime * 17.3) * 120.0) - 0.5) * uGrain * 0.72;
      float scan = sin(clampedUv.y * 820.0) * 0.003;
      col += grain + scan;

      float vig = smoothstep(0.36, 0.94, radial);
      col *= 1.0 - vig * uVignette;

      if (uDamage > 0.01) {
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(col, vec3(lum), uDamage * 0.38);
        float edgeRed = smoothstep(0.22, 0.72, radial) * uDamage;
        col = mix(col, vec3(0.85, 0.07, 0.06), edgeRed * 0.65);
      }

      if (uFlash > 0.01) {
        col = mix(col, vec3(0.97, 0.98, 1.0), clamp(uFlash, 0.0, 0.92));
      }

      float inBounds =
        step(0.0, distortedUv.x) * step(distortedUv.x, 1.0) *
        step(0.0, distortedUv.y) * step(distortedUv.y, 1.0);
      col *= mix(0.08, 1.0, inBounds);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export interface WeatherSystem {
  mesh: THREE.LineSegments;
  setWeather: (weather: WeatherType, windStrength?: number) => void;
  setLightningFlash: (flash: number, colorHex?: number) => void;
  update: (dt: number, centerX: number, centerZ: number) => void;
  dispose: () => void;
}

export type RainSystem = WeatherSystem;

export function createWeatherSystem(
  count: number = 420,
  initialWeather: WeatherType = 'storm',
): WeatherSystem {
  const positions = new Float32Array(count * 6);
  const speeds = new Float32Array(count);
  const seeds = new Float32Array(count);
  const spread = 36;
  const height = 18;

  let currentWeather: WeatherType = initialWeather;
  let wind = 1.0;
  let timeAcc = 0;
  let baseOpacity = 0.28;
  const baseColor = new THREE.Color(0x9db4cc);
  const flashColor = new THREE.Color(0xf4f7fb);

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  geo.setAttribute('position', posAttr);

  const mat = new THREE.LineBasicMaterial({
    color: 0x9db4cc,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });

  const getWeatherParams = (w: WeatherType) => {
    switch (w) {
      case 'sandstorm':
        return { color: 0xe6b97a, opacity: 0.32, vx: 13.5, vy: -1.8, vz: 3.5, lenX: -0.7, lenY: 0.06 };
      case 'snow':
        return { color: 0xf1f5f9, opacity: 0.42, vx: 2.2, vy: -3.2, vz: 1.4, lenX: -0.06, lenY: 0.14 };
      case 'ash':
        return { color: 0xd6895e, opacity: 0.36, vx: 1.6, vy: 2.6, vz: 0.8, lenX: -0.04, lenY: -0.18 };
      case 'toxic':
        return { color: 0xa0ab84, opacity: 0.24, vx: 1.8, vy: -0.85, vz: 1.1, lenX: -0.06, lenY: 0.12 };
      case 'monsoon':
        return { color: 0xa5c0d8, opacity: 0.34, vx: 2.8, vy: -22.0, vz: 1.2, lenX: -0.12, lenY: 0.78 };
      case 'fog':
        return { color: 0x94a3b8, opacity: 0.16, vx: 1.2, vy: -0.45, vz: 0.6, lenX: -0.12, lenY: 0.08 };
      case 'underground':
        return { color: 0xcbd5e1, opacity: 0.14, vx: 0.4, vy: -1.2, vz: 0.3, lenX: -0.02, lenY: 0.15 };
      case 'clear':
        return { color: 0xfef3c7, opacity: 0.12, vx: 0.7, vy: -0.35, vz: 0.4, lenX: -0.05, lenY: 0.06 };
      case 'rain':
      case 'storm':
      default:
        return { color: 0x9db4cc, opacity: 0.28, vx: 1.8, vy: -19.0, vz: 0.9, lenX: -0.07, lenY: 0.68 };
    }
  };

  for (let i = 0; i < count; i++) {
    seeds[i] = Math.random() * Math.PI * 2;
    speeds[i] = 0.75 + Math.random() * 0.5;
    const x = (Math.random() - 0.5) * spread;
    const y = Math.random() * height;
    const z = (Math.random() - 0.5) * spread;
    const idx = i * 6;
    positions[idx] = x;
    positions[idx + 1] = y;
    positions[idx + 2] = z;
    positions[idx + 3] = x - 0.04;
    positions[idx + 4] = y - 0.5;
    positions[idx + 5] = z - 0.03;
  }

  const applyParams = () => {
    const p = getWeatherParams(currentWeather);
    baseColor.setHex(p.color);
    baseOpacity = p.opacity;
    mat.color.copy(baseColor);
    mat.opacity = baseOpacity;
  };
  applyParams();

  const mesh = new THREE.LineSegments(geo, mat);
  mesh.frustumCulled = false;

  return {
    mesh,
    setWeather: (weather: WeatherType, windStrength: number = 1.0) => {
      currentWeather = weather;
      wind = windStrength;
      applyParams();
    },
    setLightningFlash: (flash: number, colorHex: number = 0xf4f7fb) => {
      if (flash <= 0.005) {
        mat.color.copy(baseColor);
        mat.opacity = baseOpacity;
        return;
      }
      flashColor.setHex(colorHex);
      mat.color.copy(baseColor).lerp(flashColor, Math.min(1, flash * 0.85));
      mat.opacity = Math.min(0.82, baseOpacity + flash * 0.44);
    },
    update: (dt: number, centerX: number, centerZ: number) => {
      timeAcc += dt;
      const p = getWeatherParams(currentWeather);
      const arr = posAttr.array as Float32Array;
      const rising = p.vy > 0;
      const halfSpread = spread * 0.5;

      for (let i = 0; i < count; i++) {
        const idx = i * 6;
        const sp = speeds[i];
        const swirl =
          currentWeather === 'snow' || currentWeather === 'ash' || currentWeather === 'toxic'
            ? Math.sin(timeAcc * 2.2 + seeds[i]) * 1.4
            : 0;

        const dx = (p.vx * wind + swirl) * sp * dt;
        const dy = p.vy * sp * dt;
        const dz = p.vz * wind * sp * dt;

        arr[idx] += dx;
        arr[idx + 1] += dy;
        arr[idx + 2] += dz;
        arr[idx + 3] = arr[idx] + p.lenX * wind;
        arr[idx + 4] = arr[idx + 1] - p.lenY;
        arr[idx + 5] = arr[idx + 2] - 0.03;

        const outY = rising ? arr[idx + 1] > height : arr[idx + 1] < 0;
        const outX = Math.abs(arr[idx] - centerX) > halfSpread;
        const outZ = Math.abs(arr[idx + 2] - centerZ) > halfSpread;

        if (outY || outX || outZ) {
          const rx = centerX + (Math.random() - 0.5) * spread;
          const rz = centerZ + (Math.random() - 0.5) * spread;
          const ry = rising
            ? Math.random() * 2.2
            : outY
              ? height * (0.75 + Math.random() * 0.25)
              : Math.random() * height;
          arr[idx] = rx;
          arr[idx + 1] = ry;
          arr[idx + 2] = rz;
          arr[idx + 3] = rx + p.lenX * wind;
          arr[idx + 4] = ry - p.lenY;
          arr[idx + 5] = rz - 0.03;
        }
      }
      posAttr.needsUpdate = true;
    },
    dispose: () => {
      geo.dispose();
      mat.dispose();
    },
  };
}

export const createRainSystem = createWeatherSystem;
