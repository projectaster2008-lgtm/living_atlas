import { RegionId, SaveGameV1, WeatherKind } from '../shared/types/world';

export const SAVE_SCHEMA_VERSION = 1;

const VALID_REGIONS: RegionId[] = [
  'gateway',
  'solara-bay',
  'vesper-city',
  'verdant-highlands',
  'aether-district',
];

const VALID_WEATHERS: WeatherKind[] = ['clear', 'overcast', 'rain', 'fog', 'storm'];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isVec3(v: unknown): v is { x: number; y: number; z: number } {
  return (
    isObject(v) &&
    typeof v.x === 'number' &&
    Number.isFinite(v.x) &&
    typeof v.y === 'number' &&
    Number.isFinite(v.y) &&
    typeof v.z === 'number' &&
    Number.isFinite(v.z)
  );
}

export type MigrationResult =
  | { ok: true; data: SaveGameV1; migratedFrom?: number }
  | { ok: false; error: string };

export function migrateSaveData(raw: unknown): MigrationResult {
  if (!isObject(raw)) {
    return { ok: false, error: 'Save payload must be a JSON object.' };
  }

  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;

  if (version > SAVE_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Save schema v${version} is newer than supported v${SAVE_SCHEMA_VERSION}.`,
    };
  }

  // Upgrade v0 legacy prototypes cleanly into v1 without dropping progress
  let working: Record<string, unknown> = { ...raw };
  let migratedFrom: number | undefined;
  if (version === 0) {
    migratedFrom = 0;
    working = {
      ...working,
      schemaVersion: 1,
      slotId: typeof working.slotId === 'string' ? working.slotId : 'autosave',
      label: typeof working.label === 'string' ? working.label : 'Migrated Save',
      savedAtIso: typeof working.savedAtIso === 'string' ? working.savedAtIso : new Date().toISOString(),
      worldSeed: typeof working.worldSeed === 'number' ? working.worldSeed : 104729,
      worldClockSeconds:
        typeof working.worldClockSeconds === 'number' ? working.worldClockSeconds : 9.5 * 3600,
      dayCount: typeof working.dayCount === 'number' ? working.dayCount : 1,
      currentRegionId:
        typeof working.currentRegionId === 'string' &&
        VALID_REGIONS.includes(working.currentRegionId as RegionId)
          ? working.currentRegionId
          : 'solara-bay',
      activeInteriorId:
        typeof working.activeInteriorId === 'string' ? working.activeInteriorId : null,
      exteriorReturnPosition: isVec3(working.exteriorReturnPosition)
        ? working.exteriorReturnPosition
        : { x: 0, y: 0, z: 18 },
      exteriorReturnYaw: typeof working.exteriorReturnYaw === 'number' ? working.exteriorReturnYaw : 0,
      playerPosition: isVec3(working.playerPosition)
        ? working.playerPosition
        : { x: 0, y: 0, z: 18 },
      playerYaw: typeof working.playerYaw === 'number' ? working.playerYaw : 0,
      activeVehicleId: typeof working.activeVehicleId === 'string' ? working.activeVehicleId : null,
      vehicleStates: isObject(working.vehicleStates) ? working.vehicleStates : {},
      weatherByRegion: isObject(working.weatherByRegion) ? working.weatherByRegion : {},
      unlockedRegions: Array.isArray(working.unlockedRegions)
        ? working.unlockedRegions
        : ['gateway', 'solara-bay', 'vesper-city', 'verdant-highlands', 'aether-district'],
      discoveredLandmarks: Array.isArray(working.discoveredLandmarks)
        ? working.discoveredLandmarks
        : [],
      collectedIds: Array.isArray(working.collectedIds) ? working.collectedIds : [],
      photos: Array.isArray(working.photos) ? working.photos : [],
      relationships: isObject(working.relationships) ? working.relationships : {},
      npcDialogueCooldowns: isObject(working.npcDialogueCooldowns)
        ? working.npcDialogueCooldowns
        : {},
      recentDialogueIds: isObject(working.recentDialogueIds) ? working.recentDialogueIds : {},
      worldFlags: Array.isArray(working.worldFlags) ? working.worldFlags : [],
      missions: isObject(working.missions) ? working.missions : {},
    };
  }

  if (
    typeof working.currentRegionId !== 'string' ||
    !VALID_REGIONS.includes(working.currentRegionId as RegionId)
  ) {
    return { ok: false, error: 'Invalid or missing currentRegionId in save data.' };
  }

  if (!isVec3(working.playerPosition) || typeof working.worldClockSeconds !== 'number') {
    return { ok: false, error: 'Missing required playerPosition or worldClockSeconds.' };
  }

  // Normalize weather map defensively
  const normalizedWeather = {} as SaveGameV1['weatherByRegion'];
  const rawWeather = isObject(working.weatherByRegion) ? working.weatherByRegion : {};
  for (const r of VALID_REGIONS) {
    const entry = rawWeather[r];
    if (
      isObject(entry) &&
      VALID_WEATHERS.includes(entry.current as WeatherKind) &&
      VALID_WEATHERS.includes(entry.next as WeatherKind)
    ) {
      normalizedWeather[r] = {
        current: entry.current as WeatherKind,
        next: entry.next as WeatherKind,
        progress: typeof entry.progress === 'number' ? Math.max(0, Math.min(1, entry.progress)) : 1,
        durationSec: typeof entry.durationSec === 'number' ? Math.max(60, entry.durationSec) : 240,
      };
    } else {
      normalizedWeather[r] = {
        current: r === 'verdant-highlands' ? 'fog' : 'clear',
        next: 'clear',
        progress: 1,
        durationSec: 240,
      };
    }
  }

  const normalized: SaveGameV1 = {
    schemaVersion: 1,
    slotId: typeof working.slotId === 'string' ? working.slotId : 'autosave',
    label: typeof working.label === 'string' ? working.label : 'Living Atlas Save',
    savedAtIso:
      typeof working.savedAtIso === 'string' ? working.savedAtIso : new Date().toISOString(),
    worldSeed: typeof working.worldSeed === 'number' ? working.worldSeed : 104729,
    worldClockSeconds: Math.max(0, working.worldClockSeconds),
    dayCount: typeof working.dayCount === 'number' && working.dayCount >= 1 ? working.dayCount : 1,
    currentRegionId: working.currentRegionId as RegionId,
    activeInteriorId:
      typeof working.activeInteriorId === 'string' ? working.activeInteriorId : null,
    exteriorReturnPosition: isVec3(working.exteriorReturnPosition)
      ? working.exteriorReturnPosition
      : { ...working.playerPosition },
    exteriorReturnYaw:
      typeof working.exteriorReturnYaw === 'number' ? working.exteriorReturnYaw : 0,
    playerPosition: working.playerPosition,
    playerYaw: typeof working.playerYaw === 'number' ? working.playerYaw : 0,
    activeVehicleId: typeof working.activeVehicleId === 'string' ? working.activeVehicleId : null,
    vehicleStates: (isObject(working.vehicleStates) ? working.vehicleStates : {}) as SaveGameV1['vehicleStates'],
    weatherByRegion: normalizedWeather,
    unlockedRegions: Array.isArray(working.unlockedRegions)
      ? (working.unlockedRegions.filter((x) =>
          VALID_REGIONS.includes(x as RegionId),
        ) as RegionId[])
      : ['gateway', 'solara-bay', 'vesper-city', 'verdant-highlands', 'aether-district'],
    discoveredLandmarks: Array.isArray(working.discoveredLandmarks)
      ? working.discoveredLandmarks.filter((x): x is string => typeof x === 'string')
      : [],
    collectedIds: Array.isArray(working.collectedIds)
      ? working.collectedIds.filter((x): x is string => typeof x === 'string')
      : [],
    photos: Array.isArray(working.photos)
      ? (working.photos as SaveGameV1['photos'])
      : [],
    relationships: (isObject(working.relationships) ? working.relationships : {}) as SaveGameV1['relationships'],
    npcDialogueCooldowns: (isObject(working.npcDialogueCooldowns)
      ? working.npcDialogueCooldowns
      : {}) as Record<string, number>,
    recentDialogueIds: (isObject(working.recentDialogueIds)
      ? working.recentDialogueIds
      : {}) as Record<string, string[]>,
    worldFlags: Array.isArray(working.worldFlags)
      ? working.worldFlags.filter((x): x is string => typeof x === 'string')
      : [],
    missions: (isObject(working.missions) ? working.missions : {}) as SaveGameV1['missions'],
  };

  return { ok: true, data: normalized, migratedFrom };
}
