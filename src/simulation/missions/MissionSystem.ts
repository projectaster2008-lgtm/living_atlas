import { dist2D } from '../../shared/math/prng';
import {
  MissionDef,
  MissionObjectiveKind,
  MissionProgress,
  RegionId,
  Vec3,
} from '../../shared/types/world';

export interface MissionCompletionResult {
  completedMission: MissionDef;
  unlockedRegionId?: RegionId;
}

export class MissionSystem {
  private defs = new Map<string, MissionDef>();
  private orderedIds: string[] = [];
  private progress = new Map<string, MissionProgress>();
  private activeMissionId: string | null = null;

  registerMissions(missions: MissionDef[]): void {
    for (const m of missions) {
      if (!this.defs.has(m.id)) {
        this.defs.set(m.id, m);
        this.orderedIds.push(m.id);
      }
      if (!this.progress.has(m.id)) {
        const status = m.prerequisiteMissionId ? 'locked' : 'available';
        this.progress.set(m.id, {
          missionId: m.id,
          status,
          currentObjectiveIndex: 0,
          completedObjectiveIds: [],
          completedCount: 0,
        });
      }
    }
    this.ensureDefaultActiveMission();
  }

  reset(): void {
    for (const id of this.orderedIds) {
      const m = this.defs.get(id);
      if (!m) continue;
      this.progress.set(id, {
        missionId: m.id,
        status: m.prerequisiteMissionId ? 'locked' : 'available',
        currentObjectiveIndex: 0,
        completedObjectiveIds: [],
        completedCount: 0,
      });
    }
    this.activeMissionId = null;
    this.ensureDefaultActiveMission();
  }

  loadProgress(saved: Record<string, MissionProgress>): void {
    this.reset();
    for (const [id, p] of Object.entries(saved)) {
      if (this.defs.has(id)) {
        this.progress.set(id, {
          missionId: id,
          status: p.status,
          currentObjectiveIndex: p.currentObjectiveIndex,
          completedObjectiveIds: [...(p.completedObjectiveIds ?? [])],
          completedCount: p.completedCount ?? 0,
        });
      }
    }
    this.refreshUnlocks();
    this.ensureDefaultActiveMission();
  }

  private ensureDefaultActiveMission(): void {
    // Pick existing active if any
    for (const p of this.progress.values()) {
      if (p.status === 'active') {
        this.activeMissionId = p.missionId;
        return;
      }
    }
    // Otherwise activate first available mission
    for (const id of this.orderedIds) {
      const p = this.progress.get(id);
      if (p && p.status === 'available') {
        p.status = 'active';
        this.activeMissionId = id;
        return;
      }
    }
    this.activeMissionId = null;
  }

  private refreshUnlocks(): void {
    for (const m of this.defs.values()) {
      const p = this.progress.get(m.id);
      if (!p || p.status !== 'locked') continue;
      if (!m.prerequisiteMissionId) {
        p.status = 'available';
        continue;
      }
      const pre = this.progress.get(m.prerequisiteMissionId);
      if (pre && pre.status === 'completed') {
        p.status = 'available';
      }
    }
  }

  setActiveMission(missionId: string): boolean {
    const p = this.progress.get(missionId);
    if (!p || p.status === 'locked') return false;
    if (p.status === 'completed') {
      const def = this.defs.get(missionId);
      if (!def?.repeatable) return false;
      p.currentObjectiveIndex = 0;
      p.completedObjectiveIds = [];
    }
    for (const other of this.progress.values()) {
      if (other.status === 'active') other.status = 'available';
    }
    p.status = 'active';
    this.activeMissionId = missionId;
    return true;
  }

  notifyAction(
    kind: MissionObjectiveKind,
    targetId: string,
    regionId: RegionId,
  ): MissionCompletionResult | null {
    // Check active mission first, then any available missions in this region
    const candidates = [
      ...(this.activeMissionId ? [this.activeMissionId] : []),
      ...this.orderedIds.filter((id) => {
        const p = this.progress.get(id);
        return p && (p.status === 'active' || p.status === 'available');
      }),
    ];

    for (const id of candidates) {
      const def = this.defs.get(id);
      const prog = this.progress.get(id);
      if (!def || !prog || (prog.status !== 'active' && prog.status !== 'available')) continue;

      const obj = def.objectives[prog.currentObjectiveIndex];
      if (!obj) continue;
      if (obj.kind === kind && obj.targetId === targetId && obj.regionId === regionId) {
        if (prog.status === 'available') {
          this.setActiveMission(def.id);
        }
        prog.completedObjectiveIds.push(obj.id);
        prog.currentObjectiveIndex++;
        if (prog.currentObjectiveIndex >= def.objectives.length) {
          prog.status = 'completed';
          prog.completedCount++;
          this.activeMissionId = null;
          this.refreshUnlocks();
          this.ensureDefaultActiveMission();
          return {
            completedMission: def,
            unlockedRegionId: def.unlockRegionId,
          };
        }
        return null;
      }
    }
    return null;
  }

  checkProximityObjectives(regionId: RegionId, pos: Vec3): MissionCompletionResult | null {
    if (!this.activeMissionId) return null;
    const def = this.defs.get(this.activeMissionId);
    const prog = this.progress.get(this.activeMissionId);
    if (!def || !prog || prog.status !== 'active') return null;

    const obj = def.objectives[prog.currentObjectiveIndex];
    if (!obj || obj.regionId !== regionId || !obj.targetPosition) return null;
    if (obj.kind !== 'go_to' && obj.kind !== 'attend_event') return null;

    const r = obj.radius ?? 5.5;
    if (dist2D(pos.x, pos.z, obj.targetPosition.x, obj.targetPosition.z) <= r) {
      return this.notifyAction(obj.kind, obj.targetId, regionId);
    }
    return null;
  }

  getActiveMission(): { def: MissionDef; progress: MissionProgress } | null {
    if (!this.activeMissionId) return null;
    const def = this.defs.get(this.activeMissionId);
    const progress = this.progress.get(this.activeMissionId);
    if (!def || !progress) return null;
    return { def, progress };
  }

  getAllMissions(): Array<{ def: MissionDef; progress: MissionProgress }> {
    return this.orderedIds
      .map((id) => {
        const def = this.defs.get(id);
        const progress = this.progress.get(id);
        return def && progress ? { def, progress } : null;
      })
      .filter((x): x is { def: MissionDef; progress: MissionProgress } => x !== null);
  }

  serialize(): Record<string, MissionProgress> {
    const out: Record<string, MissionProgress> = {};
    for (const [k, v] of this.progress.entries()) {
      out[k] = { ...v, completedObjectiveIds: [...v.completedObjectiveIds] };
    }
    return out;
  }
}
