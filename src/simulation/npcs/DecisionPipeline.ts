import { clamp, dist2D, SeededPRNG, wrapAngle } from '../../shared/math/prng';
import {
  DynamicEventDef,
  NpcBehaviorState,
  NpcNeeds,
  NpcProfile,
  NpcRuntimeState,
  ScheduleBlock,
  Vec3,
  WeatherKind,
} from '../../shared/types/world';
import { Pathfinder } from '../navigation/Pathfinder';

export interface LocationLookup {
  getPosition(locationId: string): Vec3 | null;
  getNearestShelter(from: Vec3): { id: string; position: Vec3 } | null;
  getScenicSpot(prng: SeededPRNG): { id: string; position: Vec3 } | null;
}

export function evaluateSchedule(profile: NpcProfile, hourOfDay: number): ScheduleBlock {
  for (const block of profile.schedule) {
    if (block.startHour <= block.endHour) {
      if (hourOfDay >= block.startHour && hourOfDay < block.endHour) return block;
    } else {
      if (hourOfDay >= block.startHour || hourOfDay < block.endHour) return block;
    }
  }
  return {
    startHour: 0,
    endHour: 24,
    intent: 'leisure',
    targetLocationId: profile.homeLocationId,
  };
}

export function updateNeeds(needs: NpcNeeds, behavior: NpcBehaviorState, dtSec: number, weather: WeatherKind): void {
  const rate = dtSec * 0.12;
  if (behavior === 'work' || behavior === 'commute' || behavior === 'walk') {
    needs.energy = clamp(needs.energy - rate * 1.1, 0, 100);
  } else if (behavior === 'sit' || behavior === 'shelter') {
    needs.energy = clamp(needs.energy + rate * 1.6, 0, 100);
  }

  if (behavior === 'eat') {
    needs.hunger = clamp(needs.hunger + rate * 6.0, 0, 100);
  } else {
    needs.hunger = clamp(needs.hunger - rate * 0.7, 0, 100);
  }

  if (behavior === 'talk_npc' || behavior === 'talk_player' || behavior === 'attend_event') {
    needs.social = clamp(needs.social + rate * 5.0, 0, 100);
  } else {
    needs.social = clamp(needs.social - rate * 0.55, 0, 100);
  }

  if (weather === 'rain' || weather === 'storm') {
    if (behavior === 'shelter' || behavior === 'sit') {
      needs.comfort = clamp(needs.comfort + rate * 2.5, 0, 100);
    } else {
      needs.comfort = clamp(needs.comfort - rate * 3.2, 0, 100);
    }
  } else {
    needs.comfort = clamp(needs.comfort + rate * 1.2, 0, 100);
  }
}

export interface UtilityDecision {
  goal: string;
  desiredBehavior: NpcBehaviorState;
  targetLocationId: string;
  targetPosition: Vec3;
}

export function selectUtilityAction(
  profile: NpcProfile,
  npc: NpcRuntimeState,
  hourOfDay: number,
  weather: WeatherKind,
  activeEvent: DynamicEventDef | null,
  locations: LocationLookup,
  prng: SeededPRNG,
): UtilityDecision {
  const sched = evaluateSchedule(profile, hourOfDay);
  const rainRisk = weather === 'rain' || weather === 'storm';

  const candidates: Array<{ score: number; decision: UtilityDecision }> = [];

  // 1. Schedule work / commute / rest
  const schedPos = locations.getPosition(sched.targetLocationId) ?? npc.position;
  let schedScore = 45 + profile.personality.conscientiousness * 22;
  if (sched.intent === 'work') schedScore += 14;
  if (sched.intent === 'rest' && npc.needs.energy < 40) schedScore += 25;
  candidates.push({
    score: schedScore,
    decision: {
      goal: `Schedule: ${sched.intent}`,
      desiredBehavior: sched.intent === 'work' ? 'work' : sched.intent === 'rest' ? 'sit' : 'walk',
      targetLocationId: sched.targetLocationId,
      targetPosition: schedPos,
    },
  });

  // 2. Weather shelter reaction
  if (rainRisk) {
    const shelter = locations.getNearestShelter(npc.position);
    if (shelter) {
      const shelterScore = 64 + (100 - npc.needs.comfort) * 0.45 - profile.personality.curiosity * 10;
      candidates.push({
        score: shelterScore,
        decision: {
          goal: 'Seek rain shelter',
          desiredBehavior: 'shelter',
          targetLocationId: shelter.id,
          targetPosition: shelter.position,
        },
      });
    }
  }

  // 3. Hunger / Cafe break
  if (npc.needs.hunger < 48) {
    const breakPos = locations.getPosition(profile.workLocationId) ?? schedPos;
    candidates.push({
      score: 40 + (100 - npc.needs.hunger) * 0.55,
      decision: {
        goal: 'Grab a bite',
        desiredBehavior: 'eat',
        targetLocationId: profile.workLocationId,
        targetPosition: breakPos,
      },
    });
  }

  // 4. Attend active dynamic public event
  if (activeEvent && (!rainRisk || activeEvent.allowedWeather.includes(weather))) {
    const isParticipant = activeEvent.participantNpcIds.includes(profile.id);
    const eventScore =
      (isParticipant ? 72 : 38) +
      profile.personality.extraversion * 24 +
      profile.personality.curiosity * 10;
    candidates.push({
      score: eventScore,
      decision: {
        goal: `Attend ${activeEvent.name}`,
        desiredBehavior: 'attend_event',
        targetLocationId: activeEvent.locationId,
        targetPosition: activeEvent.position,
      },
    });
  }

  // 5. Scenic stroll / exploration
  const scenic = locations.getScenicSpot(prng);
  if (scenic && !rainRisk) {
    candidates.push({
      score: 32 + profile.personality.curiosity * 28 + prng.range(-4, 6),
      decision: {
        goal: 'Stroll the district',
        desiredBehavior: 'walk',
        targetLocationId: scenic.id,
        targetPosition: scenic.position,
      },
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].decision;
}

export function stepNpcMovementAndFsm(
  npc: NpcRuntimeState,
  profile: NpcProfile,
  dtSec: number,
  pathfinder: Pathfinder,
  desiredDecision: UtilityDecision | null,
  weather: WeatherKind,
): void {
  if (npc.barkTimerSec > 0) {
    npc.barkTimerSec = Math.max(0, npc.barkTimerSec - dtSec);
    if (npc.barkTimerSec === 0) npc.activeBark = null;
  }

  // Player conversation locks NPC gently in place facing the player
  if (npc.behavior === 'talk_player') {
    npc.speed = 0;
    return;
  }

  if (npc.behavior === 'talk_npc') {
    npc.stateTimerSec -= dtSec;
    npc.speed = 0;
    if (npc.stateTimerSec <= 0) {
      npc.behavior = 'idle';
      npc.socialPartnerId = null;
    }
    return;
  }

  if (desiredDecision && npc.decisionCooldownSec <= 0) {
    npc.currentGoal = desiredDecision.goal;
    npc.targetLocationId = desiredDecision.targetLocationId;
    const distToGoal = dist2D(
      npc.position.x,
      npc.position.z,
      desiredDecision.targetPosition.x,
      desiredDecision.targetPosition.z,
    );
    if (distToGoal > 2.2) {
      npc.path = pathfinder.findPath(npc.position, desiredDecision.targetPosition);
      npc.pathIndex = 0;
      npc.behavior = desiredDecision.desiredBehavior === 'work' ? 'commute' : 'walk';
    } else {
      npc.path = [];
      npc.behavior = desiredDecision.desiredBehavior;
    }
    npc.decisionCooldownSec = 6.5;
  }

  // Follow path if moving
  if (npc.path.length > 0 && npc.pathIndex < npc.path.length) {
    const wp = npc.path[npc.pathIndex];
    const dx = wp.x - npc.position.x;
    const dz = wp.z - npc.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.75) {
      npc.pathIndex++;
      if (npc.pathIndex >= npc.path.length) {
        npc.path = [];
        npc.speed = 0;
        if (weather === 'rain' || weather === 'storm') npc.behavior = 'shelter';
        else if (npc.currentGoal.includes('work')) npc.behavior = 'work';
        else if (npc.currentGoal.includes('Attend')) npc.behavior = 'attend_event';
        else if (npc.currentGoal.includes('bite')) npc.behavior = 'eat';
        else npc.behavior = 'idle';
        npc.stateTimerSec = 5;
      }
    } else {
      const moveSpeed = npc.behavior === 'commute' ? 2.45 : 1.75;
      npc.speed = moveSpeed;
      const step = Math.min(dist, moveSpeed * dtSec);
      npc.position.x += (dx / dist) * step;
      npc.position.z += (dz / dist) * step;
      const targetYaw = Math.atan2(dx, dz);
      const diff = wrapAngle(targetYaw - npc.yaw);
      npc.yaw = wrapAngle(npc.yaw + diff * Math.min(1, dtSec * 8));
      npc.gaitPhase += step * 2.9;
    }
  } else {
    npc.speed = 0;
    npc.stateTimerSec = Math.max(0, npc.stateTimerSec - dtSec);
  }

  // Mood derivation
  if (npc.behavior === 'shelter') npc.mood = 'sheltered';
  else if (npc.needs.energy < 25) npc.mood = 'weary';
  else if (npc.behavior === 'work') npc.mood = 'focused';
  else if (profile.personality.warmth > 0.65 && npc.needs.social > 45) npc.mood = 'cheerful';
  else npc.mood = 'content';
}
