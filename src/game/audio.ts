import type { SurfaceType, WeaponId } from './types';

export class TacticalAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private volume = 0.72;

  public unlock() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
      this.masterGain.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoiseBuffer(this.ctx, 2.0);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        muted ? 0 : this.volume,
        this.ctx.currentTime,
        0.02,
      );
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx && !this.muted) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  public playGunshot(weapon: WeaponId, isEnemy: boolean = false, distAtten: number = 1) {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const pitchJitter = 0.94 + Math.random() * 0.12;
    const gainScale = (isEnemy ? 0.52 : 0.95) * Math.max(0.08, distAtten);

    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    const isSuppressed = weapon === 'sidearm' || weapon === 'smg';
    osc.type = isSuppressed ? 'triangle' : 'sawtooth';

    const startFreq =
      weapon === 'shotgun'
        ? 130
        : weapon === 'sniper'
          ? 110
          : weapon === 'lmg'
            ? 148
            : weapon === 'ak'
              ? 140
              : weapon === 'smg'
                ? 215
                : weapon === 'sidearm'
                  ? 190
                  : 165;
    const punchDur = weapon === 'sniper' ? 0.24 : weapon === 'shotgun' ? 0.18 : 0.095;
    osc.frequency.setValueAtTime(startFreq * pitchJitter, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + punchDur);

    oscGain.gain.setValueAtTime((weapon === 'sniper' ? 0.62 : 0.45) * gainScale, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + punchDur + 0.04);
    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + punchDur + 0.05);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = isSuppressed ? 'bandpass' : 'lowpass';
    const filterFreq =
      weapon === 'sidearm'
        ? 1650
        : weapon === 'smg'
          ? 2100
          : weapon === 'shotgun'
            ? 2800
            : weapon === 'sniper'
              ? 5200
              : weapon === 'ak'
                ? 3600
                : 4200;
    const tailLen =
      weapon === 'sidearm'
        ? 0.12
        : weapon === 'smg'
          ? 0.1
          : weapon === 'sniper'
            ? 0.58
            : weapon === 'shotgun'
              ? 0.45
              : weapon === 'lmg'
                ? 0.3
                : 0.34;
    filter.frequency.setValueAtTime(filterFreq, now);
    filter.frequency.exponentialRampToValueAtTime(320, now + tailLen);

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime((isSuppressed ? 0.26 : weapon === 'sniper' ? 0.85 : 0.72) * gainScale, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + tailLen);

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + tailLen + 0.03);

    if (!isEnemy) {
      const clinkDelay = weapon === 'sniper' ? 0.46 : 0.22 + Math.random() * 0.08;
      const clink = this.ctx.createOscillator();
      const cGain = this.ctx.createGain();
      clink.type = 'sine';
      clink.frequency.setValueAtTime(4200 + Math.random() * 900, now + clinkDelay);
      cGain.gain.setValueAtTime(0.035, now + clinkDelay);
      cGain.gain.exponentialRampToValueAtTime(0.0005, now + clinkDelay + 0.055);
      clink.connect(cGain);
      cGain.connect(this.masterGain);
      clink.start(now + clinkDelay);
      clink.stop(now + clinkDelay + 0.06);
    }
  }

  public playThunder() {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;

    // Initial sharp lightning sky-crack snap
    const crack = this.ctx.createBufferSource();
    crack.buffer = this.noiseBuffer;
    const crackFilter = this.ctx.createBiquadFilter();
    crackFilter.type = 'bandpass';
    crackFilter.frequency.setValueAtTime(1650, now);
    crackFilter.frequency.exponentialRampToValueAtTime(240, now + 0.28);
    const crackGain = this.ctx.createGain();
    crackGain.gain.setValueAtTime(0.38, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    crack.connect(crackFilter);
    crackFilter.connect(crackGain);
    crackGain.connect(this.masterGain);
    crack.start(now);
    crack.stop(now + 0.34);

    // Deep sub-bass thunder clap + rolling atmospheric rumble
    const sub = this.ctx.createOscillator();
    const sGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(72, now + 0.05);
    sub.frequency.exponentialRampToValueAtTime(22, now + 1.6);
    sGain.gain.setValueAtTime(0.48, now + 0.05);
    sGain.gain.exponentialRampToValueAtTime(0.001, now + 1.75);
    sub.connect(sGain);
    sGain.connect(this.masterGain);
    sub.start(now + 0.05);
    sub.stop(now + 1.8);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(680, now + 0.06);
    filter.frequency.exponentialRampToValueAtTime(85, now + 2.1);
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.52, now + 0.06);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 2.15);
    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.masterGain);
    noise.start(now + 0.06);
    noise.stop(now + 2.2);
  }

  public playBodyImpact(intensity: number = 1.0) {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const scale = Math.max(0.25, Math.min(1.4, intensity));

    // Heavy low-end tactical plate/body thud
    const thud = this.ctx.createOscillator();
    const tGain = this.ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(82, now);
    thud.frequency.exponentialRampToValueAtTime(28, now + 0.14);
    tGain.gain.setValueAtTime(0.24 * scale, now);
    tGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    thud.connect(tGain);
    tGain.connect(this.masterGain);
    thud.start(now);
    thud.stop(now + 0.17);

    // Gear rattle / dirt scrape
    const rustle = this.ctx.createBufferSource();
    rustle.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 480;
    const rGain = this.ctx.createGain();
    rGain.gain.setValueAtTime(0.14 * scale, now);
    rGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    rustle.connect(filter);
    filter.connect(rGain);
    rGain.connect(this.masterGain);
    rustle.start(now);
    rustle.stop(now + 0.13);
  }

  public playReloadClick(stage: 'out' | 'in' | 'rack') {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    const freq = stage === 'out' ? 520 : stage === 'in' ? 680 : 940;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.45, now + 0.05);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  public playFootstep(surface: SurfaceType, crouch: boolean) {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = surface === 'metal' ? 'bandpass' : 'lowpass';
    filter.frequency.value =
      (surface === 'metal'
        ? 780
        : surface === 'snow'
          ? 920
          : surface === 'sand'
            ? 540
            : 320) *
      (0.92 + Math.random() * 0.16);

    const gain = this.ctx.createGain();
    const vol = crouch ? 0.045 : 0.1;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 0.1);
  }

  public playHitMarker(headshot: boolean) {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(headshot ? 1750 : 1050, now);
    osc.frequency.exponentialRampToValueAtTime(headshot ? 900 : 520, now + 0.05);
    gain.gain.setValueAtTime(headshot ? 0.18 : 0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  public playImpact(surface: SurfaceType) {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    if (surface === 'metal') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2200 + Math.random() * 900, now);
      osc.frequency.exponentialRampToValueAtTime(900, now + 0.11);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.13);
    } else {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = surface === 'wood' ? 950 : 620;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.09);
    }
  }

  public playExplosion() {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const oGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.exponentialRampToValueAtTime(22, now + 0.65);
    oGain.gain.setValueAtTime(0.7, now);
    oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.72);
    osc.connect(oGain);
    oGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.75);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(140, now + 0.85);
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.85, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 0.92);
  }

  public playTelegraphChirp(isSniper: boolean) {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isSniper ? 'sine' : 'square';
    osc.frequency.setValueAtTime(isSniper ? 780 : 1200, now);
    osc.frequency.linearRampToValueAtTime(isSniper ? 1480 : 880, now + 0.14);
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playPickup() {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(580, now);
    osc.frequency.setValueAtTime(860, now + 0.06);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playPlayerHurt() {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.18);
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  public playOutcomeSting(victory: boolean) {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const notes = victory ? [440, 554.37, 659.25] : [293.66, 233.08, 174.61];
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.14);
      gain.gain.setValueAtTime(0.14, now + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.14 + 0.45);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + i * 0.14);
      osc.stop(now + i * 0.14 + 0.48);
    });
  }

  public dispose() {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
