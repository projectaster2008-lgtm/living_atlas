export type EventHandler<T = unknown> = (payload: T) => void;

export class EventBus<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<EventHandler<unknown>>>();

  on<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const wrapped = handler as EventHandler<unknown>;
    set.add(wrapped);
    return () => {
      set?.delete(wrapped);
    };
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of Array.from(set)) {
      handler(payload);
    }
  }

  clearAll(): void {
    this.listeners.clear();
  }
}

export interface WorldEvents {
  [key: string]: unknown;
  'region:changing': { from: string; to: string };
  'region:changed': { regionId: string };
  'interior:entered': { interiorId: string; name: string };
  'interior:exited': { regionId: string };
  'weather:changed': { regionId: string; weather: string };
  'mission:updated': { missionId: string; title: string; status: string };
  'landmark:discovered': { landmarkId: string; name: string };
  'photo:captured': { landmarkName: string; regionId: string };
  'toast:notify': { text: string };
}
