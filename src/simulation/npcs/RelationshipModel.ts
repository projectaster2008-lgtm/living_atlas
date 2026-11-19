import { clamp } from '../../shared/math/prng';
import { RelationshipAxes } from '../../shared/types/world';

export function createDefaultRelationship(): RelationshipAxes {
  return {
    familiarity: 5,
    trust: 10,
    friendship: 10,
    respect: 15,
    memoryFlags: [],
    lastInteractionSec: -9999,
  };
}

export class RelationshipModel {
  private records = new Map<string, RelationshipAxes>();

  load(serialized: Record<string, RelationshipAxes>): void {
    this.records.clear();
    for (const [id, val] of Object.entries(serialized)) {
      this.records.set(id, {
        familiarity: clamp(val.familiarity ?? 5, 0, 100),
        trust: clamp(val.trust ?? 10, 0, 100),
        friendship: clamp(val.friendship ?? 10, 0, 100),
        respect: clamp(val.respect ?? 15, 0, 100),
        memoryFlags: Array.isArray(val.memoryFlags) ? [...val.memoryFlags] : [],
        lastInteractionSec: typeof val.lastInteractionSec === 'number' ? val.lastInteractionSec : -9999,
      });
    }
  }

  get(npcId: string): RelationshipAxes {
    let rec = this.records.get(npcId);
    if (!rec) {
      rec = createDefaultRelationship();
      this.records.set(npcId, rec);
    }
    return rec;
  }

  applyDelta(
    npcId: string,
    delta: Partial<Omit<RelationshipAxes, 'memoryFlags' | 'lastInteractionSec'>>,
    clockSec: number,
    addFlags?: string[],
  ): RelationshipAxes {
    const rec = this.get(npcId);
    if (delta.familiarity) rec.familiarity = clamp(rec.familiarity + delta.familiarity, 0, 100);
    if (delta.trust) rec.trust = clamp(rec.trust + delta.trust, 0, 100);
    if (delta.friendship) rec.friendship = clamp(rec.friendship + delta.friendship, 0, 100);
    if (delta.respect) rec.respect = clamp(rec.respect + delta.respect, 0, 100);
    rec.lastInteractionSec = clockSec;
    if (addFlags) {
      for (const f of addFlags) {
        if (!rec.memoryFlags.includes(f)) rec.memoryFlags.push(f);
      }
    }
    return rec;
  }

  getTierLabel(npcId: string): string {
    const r = this.get(npcId);
    const avg = (r.familiarity + r.trust + r.friendship + r.respect) / 4;
    if (avg >= 75) return 'Confidant';
    if (avg >= 55) return 'Trusted Friend';
    if (avg >= 35) return 'Friendly';
    if (avg >= 18) return 'Acquaintance';
    return 'Stranger';
  }

  serialize(): Record<string, RelationshipAxes> {
    const out: Record<string, RelationshipAxes> = {};
    for (const [k, v] of this.records.entries()) {
      out[k] = { ...v, memoryFlags: [...v.memoryFlags] };
    }
    return out;
  }
}
