export interface SunState {
  hour: number;
  elevationDeg: number;
  azimuthDeg: number;
  isNight: boolean;
  phaseLabel: string;
  daylightFactor: number; // 0 (deep night) .. 1 (midday)
}

export class WorldClock {
  public totalSeconds: number;
  public timeScale: number;
  public paused: boolean;

  // 1 real second = 24 simulation seconds (~1 in-game day every 60 real minutes at 1x)
  private readonly baseRate = 24;

  constructor(initialSeconds = 9.5 * 3600, timeScale = 1) {
    this.totalSeconds = Math.max(0, initialSeconds);
    this.timeScale = timeScale;
    this.paused = false;
  }

  reset(initialSeconds = 9.5 * 3600, timeScale = 1): void {
    this.totalSeconds = Math.max(0, initialSeconds);
    this.timeScale = timeScale;
    this.paused = false;
  }

  step(realDtSec: number): void {
    if (this.paused) return;
    this.totalSeconds += realDtSec * this.baseRate * this.timeScale;
  }

  getDayCount(): number {
    return Math.floor(this.totalSeconds / 86400) + 1;
  }

  getHourOfDay(): number {
    const secInDay = ((this.totalSeconds % 86400) + 86400) % 86400;
    return secInDay / 3600;
  }

  getFormattedTime(): string {
    const hourFloat = this.getHourOfDay();
    const hours = Math.floor(hourFloat);
    const mins = Math.floor((hourFloat - hours) * 60);
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  getSunState(): SunState {
    const hour = this.getHourOfDay();
    // Sun peaks at 13:00 (72 deg) and sets around 19:30, rises around 06:00
    const sunAngle = ((hour - 6) / 13.5) * Math.PI;
    const rawSin = Math.sin(sunAngle);
    const elevationDeg =
      hour >= 5.5 && hour <= 20.0 ? Math.max(-12, rawSin * 68) : -18;
    const azimuthDeg = 95 + (hour / 24) * 260;

    const daylightFactor = Math.max(0, Math.min(1, (elevationDeg + 6) / 48));
    const isNight = elevationDeg < 2;

    let phaseLabel = 'Day';
    if (hour >= 5 && hour < 7.5) phaseLabel = 'Dawn';
    else if (hour >= 7.5 && hour < 11.5) phaseLabel = 'Morning';
    else if (hour >= 11.5 && hour < 16.5) phaseLabel = 'Midday';
    else if (hour >= 16.5 && hour < 19.25) phaseLabel = 'Golden Hour';
    else if (hour >= 19.25 && hour < 21.0) phaseLabel = 'Dusk';
    else phaseLabel = 'Night';

    return {
      hour,
      elevationDeg,
      azimuthDeg,
      isNight,
      phaseLabel,
      daylightFactor,
    };
  }
}
