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

  constructor(seed: number) {
    this.prng = new SeededPRNG(seed ^ 0x517cc1b7);
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

    // Fast-forward aggregate state from last visited clock time
    const lastSec = this.lastVisitedTimeByRegion.get(regionId) ?? currentClockSec;
    const elapsed = Math.max(0, currentClockSec - lastSec);
    this.fastForwardRegion(regionId, elapsed, hourOfDay, weather);
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
    _elapsedSec: number,
    hourOfDay: number,
    weather: WeatherKind,
  ): void {
    const manifest = this.manifests.get(regionId);
    const list = this.npcsByRegion.get(regionId);
    if (!manifest || !list) return;

    const rainRisk = weather === 'rain' || weather === 'storm';
    for (const npc of list) {
      const profile = this.profileById.get(npc.id);
      if (!profile) continue;
      const sched = evaluateSchedule(profile, hourOfDay);
      let targetPos = this.resolveLocationPos(manifest, sched.targetLocationId) ?? manifest.arrivalSpawn;
      let behavior: NpcRuntimeState['behavior'] =
        sched.intent === 'work' ? 'work' : sched.intent === 'rest' ? 'sit' : 'idle';

      if (rainRisk) {
        const shelter = manifest.buildings.find((b) => b.isShelter);
        if (shelter) {
          targetPos = {
            x: shelter.position.x + (shelter.doorLocalOffset?.x ?? 0),
            y: 0,
            z: shelter.position.z + (shelter.doorLocalOffset?.z ?? shelter.size.z * 0.5 + 2.5),
          };
          behavior = 'shelter';
        }
      }

      npc.position.x = targetPos.x + this.prng.range(-2.6, 2.6);
      npc.position.z = targetPos.z + this.prng.range(-2.6, 2.6);
      npc.position.y = 0;
      npc.path = [];
      npc.behavior = behavior;
      npc.targetLocationId = sched.targetLocationId;
      npc.currentGoal = `Schedule: ${sched.intent}`;
      npc.decisionCooldownSec = this.prng.range(0.5, 5.0);
    }
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
          ? selectUtilityAction(profile, npc, hourOfDay, weather, activeEvent, locations, this.prng)
          : null;
      stepNpcMovementAndFsm(npc, profile, simDtSec, this.pathfinder, decision, weather);
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
            ? selectUtilityAction(profile, npc, hourOfDay, weather, activeEvent, locations, this.prng)
            : null;
        stepNpcMovementAndFsm(npc, profile, dt, this.pathfinder, decision, weather);
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
            ? selectUtilityAction(profile, npc, hourOfDay, weather, activeEvent, locations, this.prng)
            : null;
        stepNpcMovementAndFsm(npc, profile, dt, this.pathfinder, decision, weather);
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
}
