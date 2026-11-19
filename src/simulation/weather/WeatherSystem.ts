import { clamp, lerp, SeededPRNG } from '../../shared/math/prng';
import { RegionId, WeatherKind } from '../../shared/types/world';

export interface RegionWeatherState {
  current: WeatherKind;
  next: WeatherKind;
  progress: number; // 0..1 transition toward next
  durationSec: number;
  elapsedSec: number;
}

export interface WeatherAtmosphereValues {
  activeWeather: WeatherKind;
  rainIntensity: number; // 0..1
  fogDensityMultiplier: number; // 1..4
  windStrength: number; // 0..1
  wetness: number; // 0..1
  cloudCover: number; // 0..1
}

const WEATHER_PARAMS: Record<
  WeatherKind,
  { rain: number; fog: number; wind: number; wetness: number; cloud: number }
> = {
  clear: { rain: 0, fog: 1.0, wind: 0.22, wetness: 0.0, cloud: 0.1 },
  overcast: { rain: 0, fog: 1.45, wind: 0.42, wetness: 0.12, cloud: 0.72 },
  fog: { rain: 0, fog: 3.1, wind: 0.18, wetness: 0.25, cloud: 0.55 },
  rain: { rain: 0.75, fog: 1.9, wind: 0.62, wetness: 0.85, cloud: 0.88 },
  storm: { rain: 1.0, fog: 2.4, wind: 0.96, wetness: 1.0, cloud: 1.0 },
};

export class WeatherSystem {
  private states = new Map<RegionId, RegionWeatherState>();
  private weightsByRegion = new Map<RegionId, Record<WeatherKind, number>>();
  private prng: SeededPRNG;

  constructor(seed: number) {
    this.prng = new SeededPRNG(seed ^ 0x9e3779b9);
  }

  registerRegion(regionId: RegionId, weights: Record<WeatherKind, number>, initial?: Partial<RegionWeatherState>): void {
    this.weightsByRegion.set(regionId, weights);
    if (!this.states.has(regionId)) {
      const start = initial?.current ?? this.pickWeightedWeather(weights);
      this.states.set(regionId, {
        current: start,
        next: initial?.next ?? start,
        progress: initial?.progress ?? 1,
        durationSec: initial?.durationSec ?? 180,
        elapsedSec: 0,
      });
    }
  }

  setState(regionId: RegionId, state: RegionWeatherState): void {
    this.states.set(regionId, { ...state });
  }

  forceWeather(regionId: RegionId, kind: WeatherKind): void {
    const s = this.states.get(regionId);
    if (!s) return;
    s.current = s.next;
    s.next = kind;
    s.progress = 0;
    s.elapsedSec = 0;
    s.durationSec = 210;
  }

  step(simDtSec: number, activeRegionId: RegionId): WeatherKind | null {
    let changedWeather: WeatherKind | null = null;
    for (const [regionId, s] of this.states.entries()) {
      // Transition blend (~18 seconds)
      if (s.progress < 1) {
        s.progress = clamp(s.progress + simDtSec / 18, 0, 1);
        if (s.progress >= 1) {
          s.current = s.next;
          if (regionId === activeRegionId) {
            changedWeather = s.current;
          }
        }
      } else {
        s.elapsedSec += simDtSec;
        if (s.elapsedSec >= s.durationSec) {
          s.elapsedSec = 0;
          s.durationSec = this.prng.range(150, 320);
          const weights = this.weightsByRegion.get(regionId);
          if (weights) {
            const candidate = this.pickWeightedWeather(weights);
            if (candidate !== s.current) {
              s.next = candidate;
              s.progress = 0;
            }
          }
        }
      }
    }
    return changedWeather;
  }

  getRegionState(regionId: RegionId): RegionWeatherState {
    return (
      this.states.get(regionId) ?? {
        current: 'clear',
        next: 'clear',
        progress: 1,
        durationSec: 200,
        elapsedSec: 0,
      }
    );
  }

  getAtmosphere(regionId: RegionId): WeatherAtmosphereValues {
    const s = this.getRegionState(regionId);
    const a = WEATHER_PARAMS[s.current];
    const b = WEATHER_PARAMS[s.next];
    const t = s.progress;
    return {
      activeWeather: t > 0.5 ? s.next : s.current,
      rainIntensity: lerp(a.rain, b.rain, t),
      fogDensityMultiplier: lerp(a.fog, b.fog, t),
      windStrength: lerp(a.wind, b.wind, t),
      wetness: lerp(a.wetness, b.wetness, t),
      cloudCover: lerp(a.cloud, b.cloud, t),
    };
  }

  shouldSeekShelter(regionId: RegionId): boolean {
    const w = this.getAtmosphere(regionId).activeWeather;
    return w === 'rain' || w === 'storm';
  }

  serializeAll(): Record<RegionId, { current: WeatherKind; next: WeatherKind; progress: number; durationSec: number }> {
    const out = {} as Record<RegionId, { current: WeatherKind; next: WeatherKind; progress: number; durationSec: number }>;
    for (const [id, s] of this.states.entries()) {
      out[id] = {
        current: s.current,
        next: s.next,
        progress: s.progress,
        durationSec: s.durationSec,
      };
    }
    return out;
  }

  private pickWeightedWeather(weights: Record<WeatherKind, number>): WeatherKind {
    const entries = Object.entries(weights) as Array<[WeatherKind, number]>;
    const total = entries.reduce((acc, [, w]) => acc + Math.max(0, w), 0);
    if (total <= 0) return 'clear';
    let roll = this.prng.next() * total;
    for (const [kind, w] of entries) {
      roll -= Math.max(0, w);
      if (roll <= 0) return kind;
    }
    return entries[0][0];
  }
}
