import { dist2D, SeededPRNG } from '../../shared/math/prng';
import {
  DynamicEventDef,
  NpcProfile,
  NpcRuntimeState,
  RegionId,
  RegionManifest,
  Vec3,
  WeatherKind,
} from '../../shared/types/world';
import { Pathfinder } from '../navigation/Pathfinder';
import {
  evaluateSchedule,
  LocationLookup,
  selectUtilityAction,
  stepNpcMovementAndFsm,
  updateNeeds,
} from './DecisionPipeline';

const AMBIENT_BARKS = [
  'The breeze off the water feels crisp today.',
  'Did you catch the plaza showcase earlier?',
  'Always something shifting if you pay attention.',
  'Good day to take the scenic route.',
  'Hope the weather holds through evening.',
];

export class NpcSimulation {
  private manifests = new Map<RegionId, RegionManifest>();
  private npcsByRegion = new Map<RegionId, NpcRuntimeState[]>();
  private profileById = new Map<string, NpcProfile>();
  private pathfinder = new Pathfinder();
  private prng: SeededPRNG;
  private districtTickAcc = 0;
  private offscreenTickAcc = 0;
  private socialCheckAcc = 0;
  private lastVisitedTimeByRegion = new Map<RegionId, number>();
  private activatedRegions = new Set<RegionId>();
  private readonly seed: number;

  constructor(seed: number) {
    this.seed = seed;
    this.prng = new SeededPRNG(seed ^ 0x517cc1b7);
  }

  reset(initialClockSec = 9.5 * 3600): void {
    this.prng = new SeededPRNG(this.seed ^ 0x517cc1b7);
    this.districtTickAcc = 0;
    this.offscreenTickAcc = 0;
    this.socialCheckAcc = 0;
    this.activatedRegions.clear();
    this.lastVisitedTimeByRegion.clear();
    const manifests = Array.from(this.manifests.values());
    for (const manifest of manifests) {
      this.registerRegion(manifest, initialClockSec);
    }
  }

  getLastVisitedTime(regionId: RegionId): number | undefined {
    return this.lastVisitedTimeByRegion.get(regionId);
  }

  registerRegion(manifest: RegionManifest, initialClockSec: number): void {
    this.manifests.set(manifest.id, manifest);
    this.lastVisitedTimeByRegion.set(manifest.id, initialClockSec);

    const runtimes: NpcRuntimeState[] = [];
    for (const profile of manifest.residents) {
      this.profileById.set(profile.id, profile);
      const startPos = this.resolveLocationPos(manifest, profile.homeLocationId) ?? {
        ...manifest.arrivalSpawn,
      };
      runtimes.push({
        id: profile.id,
        regionId: manifest.id,
        interiorId: null,
        position: { x: startPos.x + this.prng.range(-2, 2), y: 0, z: startPos.z + this.prng.range(-2, 2) },
        yaw: this.prng.range(-Math.PI, Math.PI),
        speed: 0,
        tier: 'inactive',
        behavior: 'idle',
        currentGoal: 'Starting day',
        targetLocationId: profile.homeLocationId,
        path: [],
        pathIndex: 0,
        needs: {
          energy: this.prng.range(60, 95),
          hunger: this.prng.range(55, 95),
          social: this.prng.range(45, 90),
          comfort: 85,
        },
        mood: 'content',
        stateTimerSec: this.prng.range(1, 4),
        decisionCooldownSec: this.prng.range(0, 4),
        socialPartnerId: null,
        activeBark: null,
        barkTimerSec: 0,
        gaitPhase: this.prng.range(0, Math.PI * 2),
      });
    }
    this.npcsByRegion.set(manifest.id, runtimes);
  }

  activateRegion(regionId: RegionId, currentClockSec: number, hourOfDay: number, weather: WeatherKind): void {
    const manifest = this.manifests.get(regionId);
    if (!manifest) return;
    this.pathfinder.loadGraph(manifest.navNodes);

    const isFirstActivation = !this.activatedRegions.has(regionId);
    const lastSec = this.lastVisitedTimeByRegion.get(regionId) ?? currentClockSec;
    const elapsed = Math.max(0, currentClockSec - lastSec);

    if (isFirstActivation || elapsed > 0) {
      this.fastForwardRegion(regionId, elapsed, hourOfDay, weather, isFirstActivation);
      this.activatedRegions.add(regionId);
    } else {
      const list = this.npcsByRegion.get(regionId) ?? [];
      for (const npc of list) {
        if (npc.tier === 'inactive') {
          npc.tier = 'offscreen';
        }
      }
    }
    this.lastVisitedTimeByRegion.set(regionId, currentClockSec);
  }

  deactivateRegion(regionId: RegionId, currentClockSec: number): void {
    this.lastVisitedTimeByRegion.set(regionId, currentClockSec);
    const list = this.npcsByRegion.get(regionId) ?? [];
    for (const npc of list) {
      npc.tier = 'inactive';
      npc.socialPartnerId = null;
      npc.activeBark = null;
    }
  }

  private fastForwardRegion(
    regionId: RegionId,
    elapsedSec: number,
    hourOfDay: number,
    weather: WeatherKind,
    isInitial: boolean,
  ): void {
    const manifest = this.manifests.get(regionId);
    const list = this.npcsByRegion.get(regionId);
    if (!manifest || !list) return;

    const bounded = Math.min(Math.max(0, elapsedSec), 24 * 3600);
    // Match active simulation time scale: WorldClock runs at 24x simDt
    const simElapsed = bounded / 24;
    const rainRisk = weather === 'rain' || weather === 'storm';

    if (!isInitial && bounded > 0 && simElapsed < 5) {
      for (const npc of list) {
        const profile = this.profileById.get(npc.id);
        if (!profile) continue;
        updateNeeds(npc.needs, npc.behavior, simElapsed, weather);
        if (npc.path.length > 0 && npc.pathIndex < npc.path.length) {
          const wp = npc.path[npc.pathIndex];
          const dx = wp.x - npc.position.x;
          const dz = wp.z - npc.position.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.01) {
            const moveSpeed = npc.behavior === 'commute' ? 2.45 : 1.75;
            const step = Math.min(d, moveSpeed * simElapsed);
            npc.position.x += (dx / d) * step;
            npc.position.z += (dz / d) * step;
            npc.yaw = Math.atan2(dx, dz);
            npc.gaitPhase += step * 2.9;
          }
        }
        this.enforceRegionClearance(regionId, npc.position);
        npc.tier = 'offscreen';
        this.applyMood(npc, profile);
      }
      return;
    }

    const bucket = Math.floor(bounded / 60);
    const slices = !isInitial && simElapsed >= 5 ? Math.min(24, Math.max(1, Math.ceil(simElapsed / 30))) : 0;
    const sliceSimDt = slices > 0 ? simElapsed / slices : 0;
    const startHour = hourOfDay - bounded / 3600;

    for (const npc of list) {
      const profile = this.profileById.get(npc.id);
      if (!profile) continue;

      for (let s = 0; s < slices; s++) {
        const rawH = startHour + ((s + 0.5) / slices) * (bounded / 3600);
        const sliceHour = ((rawH % 24) + 24) % 24;
        const sliceSched = evaluateSchedule(profile, sliceHour);
        let sliceBehavior: NpcRuntimeState['behavior'] =
          sliceSched.intent === 'work' ? 'work' : sliceSched.intent === 'rest' ? 'sit' : 'idle';
        if (rainRisk) sliceBehavior = 'shelter';
        else if (npc.needs.hunger < 45) sliceBehavior = 'eat';
        else if (npc.needs.energy < 25) sliceBehavior = 'sit';
        updateNeeds(npc.needs, sliceBehavior, sliceSimDt, weather);
      }

      const sched = evaluateSchedule(profile, hourOfDay);
      let targetPos = this.resolveLocationPos(manifest, sched.targetLocationId) ?? manifest.arrivalSpawn;
      let targetLocationId = sched.targetLocationId;
      let behavior: NpcRuntimeState['behavior'] =
        sched.intent === 'work' ? 'work' : sched.intent === 'rest' ? 'sit' : 'idle';
      let goal = `Schedule: ${sched.intent}`;

      if (rainRisk) {
        const shelter = manifest.buildings.find((b) => b.isShelter);
        if (shelter) {
          targetPos = {
            x: shelter.position.x + (shelter.doorLocalOffset?.x ?? 0),
            y: 0,
            z: shelter.position.z + (shelter.doorLocalOffset?.z ?? shelter.size.z * 0.5 + 2.5),
          };
          targetLocationId = shelter.id;
          behavior = 'shelter';
          goal = 'Seek rain shelter';
        }
      }

      const jx = (this.deterministicUnit(npc.id, bucket * 3 + 1) - 0.5) * 5.2;
      const jz = (this.deterministicUnit(npc.id, bucket * 3 + 2) - 0.5) * 5.2;
      if (regionId !== 'gateway' && Math.hypot(targetPos.x, targetPos.z) < 4.5) {
        const ringPos = this.ringOffsetForNpc(npc.id, targetPos, 5.4);
        npc.position.x = ringPos.x + jx * 0.23;
        npc.position.z = ringPos.z + jz * 0.23;
      } else {
        npc.position.x = targetPos.x + jx;
        npc.position.z = targetPos.z + jz;
      }
      npc.position.y = 0;
      this.enforceRegionClearance(regionId, npc.position);
      npc.path = [];
      npc.pathIndex = 0;
      npc.speed = 0;
      npc.tier = 'offscreen';
      npc.behavior = behavior;
      npc.targetLocationId = targetLocationId;
      npc.currentGoal = goal;
      npc.decisionCooldownSec = 0.5 + this.deterministicUnit(npc.id, bucket * 3 + 3) * 4.5;
      this.applyMood(npc, profile);
    }
  }

  private deterministicUnit(id: string, salt: number): number {
    let h = (this.seed ^ Math.imul(salt | 0, 374761393)) | 0;
    for (let i = 0; i < id.length; i++) {
      h = Math.imul(h ^ id.charCodeAt(i), 2246822519);
      h ^= h >>> 13;
    }
    h = Math.imul(h, 3266489917);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  private applyMood(npc: NpcRuntimeState, profile: NpcProfile): void {
    if (npc.behavior === 'shelter') npc.mood = 'sheltered';
    else if (npc.needs.energy < 25) npc.mood = 'weary';
    else if (npc.behavior === 'work') npc.mood = 'focused';
    else if (profile.personality.warmth > 0.65 && npc.needs.social > 45) npc.mood = 'cheerful';
    else npc.mood = 'content';
  }

  step(
    activeRegionId: RegionId,
    playerPos: Vec3,
    simDtSec: number,
    hourOfDay: number,
    weather: WeatherKind,
    activeEvent: DynamicEventDef | null,
  ): void {
    const manifest = this.manifests.get(activeRegionId);
    const list = this.npcsByRegion.get(activeRegionId);
    if (!manifest || !list) return;

    // Assign simulation tiers based on player distance (6-10 NEAR NPCs target)
    const sorted = [...list].sort(
      (a, b) =>
        dist2D(a.position.x, a.position.z, playerPos.x, playerPos.z) -
        dist2D(b.position.x, b.position.z, playerPos.x, playerPos.z),
    );

    for (let i = 0; i < sorted.length; i++) {
      const npc = sorted[i];
      const d = dist2D(npc.position.x, npc.position.z, playerPos.x, playerPos.z);
      if (i < 9 && d < 58) npc.tier = 'near';
      else if (d < 105) npc.tier = 'district';
      else npc.tier = 'offscreen';
    }

    const locations = this.createLocationLookup(manifest);

    // NEAR tier updates every simulation tick
    for (const npc of list) {
      if (npc.tier !== 'near') continue;
      const profile = this.profileById.get(npc.id);
      if (!profile) continue;
      npc.decisionCooldownSec = Math.max(0, npc.decisionCooldownSec - simDtSec);
      updateNeeds(npc.needs, npc.behavior, simDtSec, weather);
      const decision =
        npc.decisionCooldownSec <= 0
          ? this.sanitizeDecisionTarget(
              activeRegionId,
              npc.id,
              selectUtilityAction(profile, npc, hourOfDay, weather, activeEvent, locations, this.prng),
            )
          : null;
      stepNpcMovementAndFsm(npc, profile, simDtSec, this.pathfinder, decision, weather);
      this.enforceRegionClearance(activeRegionId, npc.position);
    }

    // DISTRICT tier staggered every 0.5s
    this.districtTickAcc += simDtSec;
    if (this.districtTickAcc >= 0.5) {
      const dt = this.districtTickAcc;
      this.districtTickAcc = 0;
      for (const npc of list) {
        if (npc.tier !== 'district') continue;
        const profile = this.profileById.get(npc.id);
        if (!profile) continue;
        npc.decisionCooldownSec = Math.max(0, npc.decisionCooldownSec - dt);
        updateNeeds(npc.needs, npc.behavior, dt, weather);
        const decision =
          npc.decisionCooldownSec <= 0
            ? this.sanitizeDecisionTarget(
                activeRegionId,
                npc.id,
                selectUtilityAction(profile, npc, hourOfDay, weather, activeEvent, locations, this.prng),
              )
            : null;
        stepNpcMovementAndFsm(npc, profile, dt, this.pathfinder, decision, weather);
        this.enforceRegionClearance(activeRegionId, npc.position);
      }
    }

    // OFFSCREEN tier staggered every 2.0s
    this.offscreenTickAcc += simDtSec;
    if (this.offscreenTickAcc >= 2.0) {
      const dt = this.offscreenTickAcc;
      this.offscreenTickAcc = 0;
      for (const npc of list) {
        if (npc.tier !== 'offscreen') continue;
        const profile = this.profileById.get(npc.id);
        if (!profile) continue;
        npc.decisionCooldownSec = Math.max(0, npc.decisionCooldownSec - dt);
        updateNeeds(npc.needs, npc.behavior, dt, weather);
        const decision =
          npc.decisionCooldownSec <= 0
            ? this.sanitizeDecisionTarget(
                activeRegionId,
                npc.id,
                selectUtilityAction(profile, npc, hourOfDay, weather, activeEvent, locations, this.prng),
              )
            : null;
        stepNpcMovementAndFsm(npc, profile, dt, this.pathfinder, decision, weather);
        this.enforceRegionClearance(activeRegionId, npc.position);
      }
    }

    // Ambient NPC-to-NPC social interactions every 4s
    this.socialCheckAcc += simDtSec;
    if (this.socialCheckAcc >= 4.0) {
      this.socialCheckAcc = 0;
      this.tryAmbientSocialEncounters(list);
    }
  }

  private tryAmbientSocialEncounters(list: NpcRuntimeState[]): void {
    const nearIdle = list.filter(
      (n) => n.tier === 'near' && (n.behavior === 'idle' || n.behavior === 'walk'),
    );
    for (let i = 0; i < nearIdle.length; i++) {
      const a = nearIdle[i];
      if (a.behavior !== 'idle' && a.behavior !== 'walk') continue;
      for (let j = i + 1; j < nearIdle.length; j++) {
        const b = nearIdle[j];
        if (b.behavior !== 'idle' && b.behavior !== 'walk') continue;
        const d = dist2D(a.position.x, a.position.z, b.position.x, b.position.z);
        if (d < 3.5 && this.prng.next() < 0.35) {
          a.behavior = 'talk_npc';
          b.behavior = 'talk_npc';
          a.stateTimerSec = 5.5;
          b.stateTimerSec = 5.5;
          a.socialPartnerId = b.id;
          b.socialPartnerId = a.id;
          a.yaw = Math.atan2(b.position.x - a.position.x, b.position.z - a.position.z);
          b.yaw = Math.atan2(a.position.x - b.position.x, a.position.z - b.position.z);
          a.activeBark = this.prng.pick(AMBIENT_BARKS);
          a.barkTimerSec = 4.2;
          break;
        }
      }
    }
  }

  getActiveRegionNpcs(regionId: RegionId): NpcRuntimeState[] {
    return this.npcsByRegion.get(regionId) ?? [];
  }

  getProfile(npcId: string): NpcProfile | undefined {
    return this.profileById.get(npcId);
  }

  getNpcById(regionId: RegionId, npcId: string): NpcRuntimeState | undefined {
    return (this.npcsByRegion.get(regionId) ?? []).find((n) => n.id === npcId);
  }

  beginPlayerConversation(regionId: RegionId, npcId: string, playerPos: Vec3): void {
    const npc = this.getNpcById(regionId, npcId);
    if (!npc) return;
    npc.behavior = 'talk_player';
    npc.speed = 0;
    npc.yaw = Math.atan2(playerPos.x - npc.position.x, playerPos.z - npc.position.z);
  }

  endPlayerConversation(regionId: RegionId, npcId: string): void {
    const npc = this.getNpcById(regionId, npcId);
    if (!npc) return;
    if (npc.behavior === 'talk_player') {
      npc.behavior = 'idle';
      npc.stateTimerSec = 3;
    }
  }

  private createLocationLookup(manifest: RegionManifest): LocationLookup {
    return {
      getPosition: (locId: string) => this.resolveLocationPos(manifest, locId),
      getNearestShelter: (from: Vec3) => {
        const shelters = manifest.buildings.filter((b) => b.isShelter);
        if (shelters.length === 0) return null;
        let best = shelters[0];
        let bestD = dist2D(from.x, from.z, best.position.x, best.position.z);
        for (const s of shelters) {
          const d = dist2D(from.x, from.z, s.position.x, s.position.z);
          if (d < bestD) {
            bestD = d;
            best = s;
          }
        }
        return {
          id: best.id,
          position: {
            x: best.position.x + (best.doorLocalOffset?.x ?? 0),
            y: 0,
            z: best.position.z + (best.doorLocalOffset?.z ?? best.size.z * 0.5 + 2.2),
          },
        };
      },
      getScenicSpot: (prng: SeededPRNG) => {
        if (manifest.landmarks.length === 0) return null;
        const lm = prng.pick(manifest.landmarks);
        return { id: lm.id, position: { ...lm.position } };
      },
    };
  }

  private resolveLocationPos(manifest: RegionManifest, locId: string): Vec3 | null {
    const lm = manifest.landmarks.find((l) => l.id === locId);
    if (lm) return { ...lm.position };
    const b = manifest.buildings.find((bld) => bld.id === locId);
    if (b) {
      return {
        x: b.position.x + (b.doorLocalOffset?.x ?? 0),
        y: 0,
        z: b.position.z + (b.doorLocalOffset?.z ?? b.size.z * 0.5 + 3.0),
      };
    }
    const nav = manifest.navNodes.find((n) => n.id === locId);
    if (nav) return { ...nav.position };
    return null;
  }

  private ringOffsetForNpc(npcId: string, center: Vec3, radius: number): Vec3 {
    let hash = 0;
    for (let i = 0; i < npcId.length; i++) {
      hash = (hash * 31 + npcId.charCodeAt(i)) | 0;
    }
    const angle = ((Math.abs(hash) % 360) / 180) * Math.PI;
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y,
      z: center.z + Math.sin(angle) * radius,
    };
  }

  private sanitizeDecisionTarget<T extends { targetPosition: Vec3 }>(
    regionId: RegionId,
    npcId: string,
    decision: T,
  ): T {
    if (regionId === 'gateway') return decision;
    const r = Math.hypot(decision.targetPosition.x, decision.targetPosition.z);
    if (r < 4.5) {
      return {
        ...decision,
        targetPosition: this.ringOffsetForNpc(npcId, { x: 0, y: 0, z: 0 }, 5.4),
      };
    }
    return decision;
  }

  private enforceRegionClearance(regionId: RegionId, pos: Vec3): void {
    if (regionId === 'gateway') return;
    const minRadius = 4.35;
    const r = Math.hypot(pos.x, pos.z);
    if (r < minRadius) {
      if (r < 0.001) {
        pos.x = minRadius;
        pos.z = 0;
      } else {
        const scale = minRadius / r;
        pos.x *= scale;
        pos.z *= scale;
      }
    }
  }
}
