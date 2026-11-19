import { hashString, SeededPRNG } from '../shared/math/prng';
import {
  DialogueNode,
  NavNode,
  NpcProfile,
  RegionId,
  ScheduleBlock,
  TrafficNode,
  Vec3,
} from '../shared/types/world';

const SKIN_TONES = ['#f1c7a6', '#d9a47c', '#b77d56', '#8a583b', '#f5d5be'];
const HAIR_COLORS = ['#221d1a', '#4a3222', '#7a5230', '#c4965a', '#6d7278', '#3c241d'];
const COAT_PALETTES: Record<RegionId, string[]> = {
  gateway: ['#375a7f', '#c99746', '#4c756d', '#735d78', '#4a5568'],
  'solara-bay': ['#2f7a8c', '#d87c5a', '#e0a952', '#4c8c74', '#5c6f8c', '#b85c6a'],
  'vesper-city': ['#2d3748', '#4a5568', '#8c3f4c', '#36688d', '#b8863d', '#4f6d65'],
  'verdant-highlands': ['#436449', '#8c5338', '#b07f3f', '#51697a', '#704a3d', '#3e5c54'],
  'aether-district': ['#3a7ca5', '#529994', '#6d688a', '#c98d42', '#3f5168', '#488b8f'],
};
const PANTS_COLORS = ['#2b3440', '#3d4856', '#4a4238', '#222831', '#3b4f5e'];
const HAT_STYLES: Array<NpcProfile['appearance']['hatStyle']> = [
  'none',
  'none',
  'none',
  'cap',
  'sunhat',
  'beanie',
  'visor',
];

export function connectNavGrid(nodes: NavNode[], maxDist = 26): NavNode[] {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const d = Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z);
      if (d <= maxDist) {
        if (!a.neighbors.includes(b.id)) a.neighbors.push(b.id);
        if (!b.neighbors.includes(a.id)) b.neighbors.push(a.id);
      }
    }
  }
  return nodes;
}

export function buildLoopTrafficNodes(
  prefix: string,
  points: Array<{ x: number; z: number; speed?: number; signalId?: string }>,
): TrafficNode[] {
  return points.map((p, idx) => {
    const nextIdx = (idx + 1) % points.length;
    return {
      id: `${prefix}-t-${idx}`,
      position: { x: p.x, y: 0, z: p.z },
      nextIds: [`${prefix}-t-${nextIdx}`],
      speedLimit: p.speed ?? 11,
      signalId: p.signalId,
    };
  });
}

export interface ResidentSeedSpec {
  id: string;
  name: string;
  occupation: string;
  bio: string;
  homeLocationId: string;
  workLocationId: string;
  leisureLocationId: string;
  isKeyResident?: boolean;
  hatStyle?: NpcProfile['appearance']['hatStyle'];
  customDialogues?: DialogueNode[];
}

export function buildResidentProfiles(
  regionId: RegionId,
  regionName: string,
  specs: ResidentSeedSpec[],
): NpcProfile[] {
  const palette = COAT_PALETTES[regionId];

  return specs.map((spec, idx) => {
    const prng = new SeededPRNG(hashString(`${regionId}:${spec.id}:${idx}`));
    const schedule: ScheduleBlock[] = [
      { startHour: 0, endHour: 7.5, intent: 'rest', targetLocationId: spec.homeLocationId },
      { startHour: 7.5, endHour: 8.5, intent: 'commute', targetLocationId: spec.workLocationId },
      { startHour: 8.5, endHour: 12.5, intent: 'work', targetLocationId: spec.workLocationId },
      { startHour: 12.5, endHour: 14.0, intent: 'break', targetLocationId: spec.leisureLocationId },
      { startHour: 14.0, endHour: 17.5, intent: 'work', targetLocationId: spec.workLocationId },
      { startHour: 17.5, endHour: 21.5, intent: 'social', targetLocationId: spec.leisureLocationId },
      { startHour: 21.5, endHour: 24.0, intent: 'rest', targetLocationId: spec.homeLocationId },
    ];

    const defaultDialogues: DialogueNode[] = [
      {
        id: `${spec.id}-intro`,
        tags: ['greeting', 'general'],
        cooldownSec: 45,
        greeting: `Good to see you around ${regionName}.`,
        body: `I'm ${spec.name}, working as ${spec.occupation}. ${spec.bio}`,
        choices: [
          {
            id: 'ask-district',
            label: `What do you enjoy most about ${regionName}?`,
            replyText: `The rhythm of the streets here—every corner shifts between morning errands and evening gatherings.`,
            relationshipDelta: { familiarity: 8, friendship: 5, respect: 3 },
          },
          {
            id: 'wish-well',
            label: 'Appreciate the local insight. See you around!',
            replyText: 'Anytime! Stop by again when the weather shifts or the evening lights come up.',
            relationshipDelta: { familiarity: 5, respect: 4 },
          },
        ],
      },
      {
        id: `${spec.id}-daily-notes`,
        tags: ['daily', 'observation'],
        cooldownSec: 50,
        greeting: `Taking a stroll through ${regionName}?`,
        body: `Between shifts I keep an eye on how the district shifts through the day—morning errands, midday shade, and folks trading stories around the plaza.`,
        choices: [
          {
            id: 'share-route',
            label: 'Any landmarks nearby worth checking out?',
            replyText: 'Follow the main avenues out toward the overlook—the light across the water changes completely every hour.',
            relationshipDelta: { familiarity: 6, friendship: 5, respect: 3 },
          },
        ],
      },
      {
        id: `${spec.id}-rain`,
        tags: ['weather', 'rain'],
        weatherMatch: ['rain', 'storm'],
        cooldownSec: 60,
        greeting: 'Steady rain moving through today.',
        body: `I usually duck under the awnings when squalls roll into ${regionName}. Keeps the cobblestones slick, though the reflections look remarkable.`,
        choices: [
          {
            id: 'share-shelter',
            label: 'Smart call staying dry under cover.',
            replyText: 'Definitely—give the storm a bit to pass and the whole plaza clears right back up.',
            relationshipDelta: { familiarity: 6, trust: 5, friendship: 4 },
          },
        ],
      },
      {
        id: `${spec.id}-evening`,
        tags: ['evening', 'social'],
        timeRange: [17, 23],
        minFamiliarity: 12,
        cooldownSec: 75,
        greeting: `Evening's settling nicely over ${regionName}.`,
        body: 'Once the workday wraps up, folks drift toward the plazas and viewpoints. Always feels calmer at golden hour.',
        choices: [
          {
            id: 'chat-more',
            label: 'How has your week been going?',
            replyText: 'Busy in the best way. Seeing familiar faces out and about makes the neighborhood feel alive.',
            relationshipDelta: { familiarity: 7, friendship: 8, trust: 6 },
          },
        ],
      },
    ];

    // Normalize relationship delta cleanly
    for (const c of defaultDialogues[0].choices) {
      if (c.relationshipDelta) {
        c.relationshipDelta = { familiarity: 8, friendship: 5, respect: 3 };
      }
    }

    return {
      id: spec.id,
      name: spec.name,
      regionId,
      occupation: spec.occupation,
      bio: spec.bio,
      homeLocationId: spec.homeLocationId,
      workLocationId: spec.workLocationId,
      isKeyResident: spec.isKeyResident,
      appearance: {
        coatColor: palette[idx % palette.length],
        accentColor: palette[(idx + 2) % palette.length],
        pantsColor: PANTS_COLORS[idx % PANTS_COLORS.length],
        skinTone: SKIN_TONES[idx % SKIN_TONES.length],
        hairColor: HAIR_COLORS[idx % HAIR_COLORS.length],
        heightScale: prng.range(0.94, 1.07),
        hatStyle: spec.hatStyle ?? HAT_STYLES[idx % HAT_STYLES.length],
      },
      personality: {
        extraversion: prng.range(0.25, 0.92),
        conscientiousness: prng.range(0.35, 0.95),
        curiosity: prng.range(0.3, 0.95),
        warmth: prng.range(0.4, 0.95),
      },
      schedule,
      dialoguePool: [...(spec.customDialogues ?? []), ...defaultDialogues],
    };
  });
}

export function makeNav(id: string, x: number, z: number, tag: NavNode['tag'] = 'sidewalk'): NavNode {
  return {
    id,
    position: { x, y: 0, z },
    neighbors: [],
    tag,
  };
}

export function vec(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}
