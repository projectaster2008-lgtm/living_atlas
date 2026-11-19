import { DynamicEventDef, RegionId, WeatherKind } from '../../shared/types/world';

export class DynamicEvents {
  private eventsByRegion = new Map<RegionId, DynamicEventDef[]>();

  registerRegion(regionId: RegionId, events: DynamicEventDef[]): void {
    this.eventsByRegion.set(regionId, events);
  }

  getActiveEvent(regionId: RegionId, hourOfDay: number, weather: WeatherKind): DynamicEventDef | null {
    const list = this.eventsByRegion.get(regionId) ?? [];
    for (const ev of list) {
      const inTime =
        ev.startHour <= ev.endHour
          ? hourOfDay >= ev.startHour && hourOfDay < ev.endHour
          : hourOfDay >= ev.startHour || hourOfDay < ev.endHour;
      if (inTime && ev.allowedWeather.includes(weather)) {
        return ev;
      }
    }
    return null;
  }

  getAllForRegion(regionId: RegionId): DynamicEventDef[] {
    return this.eventsByRegion.get(regionId) ?? [];
  }
}
