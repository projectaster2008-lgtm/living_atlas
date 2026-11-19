import { RegionId, WeatherKind } from '../../shared/types/world';

export class AmbientAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private ambientFilter: BiquadFilterNode | null = null;
  private ambientGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private muted = false;
  private volume = 0.45;
  private started = false;

  unlockAndStart(): void {
    if (this.started) {
      if (this.ctx?.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
      this.masterGain.connect(this.ctx.destination);

      // Filtered noise buffer for wind / surf / rain ambience
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let b0 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.96 * b0 + white * 0.04;
        output[i] = b0 * 1.4;
      }

      this.noiseSource = this.ctx.createBufferSource();
      this.noiseSource.buffer = noiseBuffer;
      this.noiseSource.loop = true;

      this.ambientFilter = this.ctx.createBiquadFilter();
      this.ambientFilter.type = 'lowpass';
      this.ambientFilter.frequency.value = 420;

      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = 0.08;

      this.noiseSource.connect(this.ambientFilter);
      this.ambientFilter.connect(this.ambientGain);
      this.ambientGain.connect(this.masterGain);
      this.noiseSource.start();

      // Subtle vehicle engine hum (gain 0 until driving)
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'triangle';
      this.engineOsc.frequency.value = 55;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineGain);
      this.engineGain.connect(this.masterGain);
      this.engineOsc.start();

      this.started = true;
    } catch {
      // Audio optional if blocked
    }
  }

  setVolume(vol: number, muted: boolean): void {
    this.volume = Math.max(0, Math.min(1, vol));
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.06);
    }
  }

  updateAtmosphere(regionId: RegionId, weather: WeatherKind, drivingSpeed: number | null): void {
    if (!this.ctx || !this.ambientFilter || !this.ambientGain) return;
    const isRain = weather === 'rain' || weather === 'storm';
    const baseFreq =
      isRain ? 1150 : regionId === 'solara-bay' ? 480 : regionId === 'vesper-city' ? 320 : 540;
    const baseGain = isRain ? 0.19 : regionId === 'gateway' ? 0.04 : 0.08;
    this.ambientFilter.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.4);
    this.ambientGain.gain.setTargetAtTime(baseGain, this.ctx.currentTime, 0.4);

    if (this.engineOsc && this.engineGain) {
      if (drivingSpeed !== null) {
        const freq = 52 + Math.min(110, Math.abs(drivingSpeed) * 4.5);
        this.engineOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.08);
        this.engineGain.gain.setTargetAtTime(0.055, this.ctx.currentTime, 0.1);
      } else {
        this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      }
    }
  }

  playFootstep(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115 + (Math.random() - 0.5) * 18, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(48, this.ctx.currentTime + 0.06);
    g.gain.setValueAtTime(0.045, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.065);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.07);
  }

  playChime(kind: 'interact' | 'mission' | 'photo'): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const notes =
      kind === 'mission'
        ? [523.25, 659.25, 783.99]
        : kind === 'photo'
          ? [880, 1174]
          : [440, 554.37];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = kind === 'photo' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);
      g.gain.setValueAtTime(0.07, now + idx * 0.07);
      g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.22);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.24);
    });
  }

  dispose(): void {
    try {
      this.noiseSource?.stop();
      this.engineOsc?.stop();
      void this.ctx?.close();
    } catch {
      // ignore
    }
    this.ctx = null;
  }
}
