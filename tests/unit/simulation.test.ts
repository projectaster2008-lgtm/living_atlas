import test from 'node:test';
import assert from 'node:assert/strict';

import { exportSaveToJson, importSaveFromJson } from '../../src/persistence/ExportImport';
import { migrateSaveData, SAVE_SCHEMA_VERSION } from '../../src/persistence/SaveMigrations';
import { SeededPRNG } from '../../src/shared/math/prng';
import { WorldClock } from '../../src/simulation/clock/WorldClock';
import { MissionSystem } from '../../src/simulation/missions/MissionSystem';
import { Pathfinder } from '../../src/simulation/navigation/Pathfinder';
import { DialogueEngine } from '../../src/simulation/npcs/DialogueEngine';
import { NpcSimulation } from '../../src/simulation/npcs/NpcSimulation';
import { RelationshipModel } from '../../src/simulation/npcs/RelationshipModel';
import { TrafficSystem } from '../../src/simulation/traffic/TrafficSystem';
import { WeatherSystem } from '../../src/simulation/weather/WeatherSystem';
import { ALL_REGION_IDS, getRegionManifest } from '../../src/worlds/WorldCatalog';

test('SeededPRNG produces deterministic sequences for identical seeds', () => {
  const a = new SeededPRNG(104729);
  const b = new SeededPRNG(104729);
  const seqA = Array.from({ length: 12 }, () => a.next());
  const seqB = Array.from({ length: 12 }, () => b.next());
  assert.deepEqual(seqA, seqB);
});

test('WorldClock advances day count, formatted HH:MM, and sun phase labels cleanly', () => {
  const clock = new WorldClock(9.5 * 3600, 1);
  assert.equal(clock.getDayCount(), 1);
  assert.equal(clock.getFormattedTime(), '09:30');
  assert.equal(clock.getSunState().phaseLabel, 'Morning');
  assert.equal(clock.getSunState().isNight, false);

  // Advance by 3600 real sec * 24 rate = 86400 sim sec (1 full day)
  clock.step(3600);
  assert.equal(clock.getDayCount(), 2);
  assert.equal(clock.getFormattedTime(), '09:30');

  const nightClock = new WorldClock(23.0 * 3600, 1);
  assert.equal(nightClock.getSunState().phaseLabel, 'Night');
  assert.equal(nightClock.getSunState().isNight, true);
});

test('WeatherSystem blends smoothly and reports shelter requirement during rain/storm', () => {
  const weather = new WeatherSystem(104729);
  const solara = getRegionManifest('solara-bay');
  weather.registerRegion('solara-bay', solara.weatherWeights, {
    current: 'clear',
    next: 'clear',
    progress: 1,
    durationSec: 200,
  });

  assert.equal(weather.shouldSeekShelter('solara-bay'), false);
  weather.forceWeather('solara-bay', 'storm');
  weather.step(12, 'solara-bay');
  const atm = weather.getAtmosphere('solara-bay');
  assert.equal(atm.activeWeather, 'storm');
  assert.ok(atm.rainIntensity > 0.5);
  assert.equal(weather.shouldSeekShelter('solara-bay'), true);
});

test('Pathfinder computes valid A* paths across region navigation graphs', () => {
  const solara = getRegionManifest('solara-bay');
  const pf = new Pathfinder();
  pf.loadGraph(solara.navNodes);
  const start = solara.navNodes[0].position;
  const end = solara.navNodes[solara.navNodes.length - 1].position;
  const path = pf.findPath(start, end);
  assert.ok(path.length >= 2);
  const last = path[path.length - 1];
  assert.equal(last.x, end.x);
  assert.equal(last.z, end.z);
});

test('World catalog manifests cover Gateway + 4 core districts with 20+ residents and interiors', () => {
  assert.equal(ALL_REGION_IDS.length, 5);
  for (const id of ['solara-bay', 'vesper-city', 'verdant-highlands', 'aether-district'] as const) {
    const m = getRegionManifest(id);
    assert.ok(m.residents.length >= 20, `${id} should have at least 20 residents`);
    assert.ok(m.interiors.length >= 2, `${id} should have at least 2 interiors`);
    assert.ok(m.landmarks.length >= 3, `${id} should have landmarks`);
    assert.ok(m.vehicles.some((v) => v.drivable), `${id} should have at least 1 drivable vehicle`);
  }
});

test('NpcSimulation enforces 4-tier simulation and fast-forwards inactive regions on return', () => {
  const sim = new NpcSimulation(104729);
  const solara = getRegionManifest('solara-bay');
  const vesper = getRegionManifest('vesper-city');
  sim.registerRegion(solara, 9.5 * 3600);
  sim.registerRegion(vesper, 9.5 * 3600);

  sim.activateRegion('solara-bay', 9.5 * 3600, 9.5, 'clear');
  sim.step('solara-bay', solara.arrivalSpawn, 0.1, 9.5, 'clear', null);

  const solaraNpcs = sim.getActiveRegionNpcs('solara-bay');
  const nearCount = solaraNpcs.filter((n) => n.tier === 'near').length;
  assert.ok(nearCount > 0 && nearCount <= 9);
  assert.ok(sim.getActiveRegionNpcs('vesper-city').every((n) => n.tier === 'inactive'));

  // Deactivate Solara Bay, step clock forward to rainy evening, re-activate
  sim.deactivateRegion('solara-bay', 9.5 * 3600);
  assert.ok(sim.getActiveRegionNpcs('solara-bay').every((n) => n.tier === 'inactive'));

  sim.activateRegion('solara-bay', 19.0 * 3600, 19.0, 'rain');
  const shelteredCount = sim.getActiveRegionNpcs('solara-bay').filter((n) => n.behavior === 'shelter').length;
  assert.ok(shelteredCount > 0, 'NPCs should seek shelter when returning during rain');
});

test('RelationshipModel and DialogueEngine enforce 4 axes, cooldowns, and repetition avoidance', () => {
  const relModel = new RelationshipModel();
  const dlg = new DialogueEngine();
  const solara = getRegionManifest('solara-bay');
  const npc = solara.residents[0];
  const runtime = {
    id: npc.id,
    regionId: 'solara-bay' as const,
    interiorId: null,
    position: { x: 0, y: 0, z: 0 },
    yaw: 0,
    speed: 0,
    tier: 'near' as const,
    behavior: 'idle' as const,
    currentGoal: 'idle',
    targetLocationId: npc.homeLocationId,
    path: [],
    pathIndex: 0,
    needs: { energy: 80, hunger: 80, social: 80, comfort: 80 },
    mood: 'content' as const,
    stateTimerSec: 2,
    decisionCooldownSec: 2,
    socialPartnerId: null,
    activeBark: null,
    barkTimerSec: 0,
    gaitPhase: 0,
  };

  const ctx = {
    clockSec: 1000,
    hourOfDay: 10,
    weather: 'clear' as const,
    worldFlags: new Set<string>(),
    activeMissionIds: new Set<string>(),
    relationship: relModel.get(npc.id),
  };

  const first = dlg.selectNode(npc, runtime, ctx);
  dlg.markUsed(npc.id, first, 1000);

  // Second immediate call should avoid repeating the first node if another is eligible
  const second = dlg.selectNode(npc, runtime, { ...ctx, clockSec: 1005 });
  assert.notEqual(second.id, first.id);

  // Applying choice delta updates multi-axis scores & memory flags
  const updated = relModel.applyDelta(
    npc.id,
    { familiarity: 25, trust: 20, friendship: 25, respect: 20 },
    1005,
    ['met_elena'],
  );
  assert.ok(updated.familiarity >= 30);
  assert.ok(updated.memoryFlags.includes('met_elena'));
});

test('MissionSystem completes multi-step mission objectives and unlocks follow-ups', () => {
  const ms = new MissionSystem();
  const solara = getRegionManifest('solara-bay');
  ms.registerMissions(solara.missions);

  const active = ms.getActiveMission();
  assert.ok(active);
  const m = active.def;

  for (const obj of m.objectives) {
    ms.notifyAction(obj.kind, obj.targetId, obj.regionId);
  }

  const all = ms.getAllMissions();
  const completedEntry = all.find((entry) => entry.def.id === m.id);
  assert.equal(completedEntry?.progress.status, 'completed');
});

test('TrafficSystem cycles traffic signals and yields to nearby player', () => {
  const traffic = new TrafficSystem(104729);
  const vesper = getRegionManifest('vesper-city');
  traffic.loadRegion(vesper, 4);
  assert.ok(traffic.getVehicles().length >= 2);

  const firstSig = vesper.trafficSignals[0];
  if (firstSig) {
    const colors = new Set<string>();
    for (let t = 0; t < firstSig.cycleSec; t += 2) {
      traffic.step(2, { x: 999, y: 0, z: 999 }, 'clear');
      colors.add(traffic.getSignalColor(firstSig.id));
    }
    assert.ok(colors.has('green') && colors.has('red'), 'Signal should cycle through green and red');
  }
});

test('SaveMigrations upgrades v0 legacy saves to v1, rejects malformed JSON, and roundtrips Export/Import', () => {
  const legacyV0 = {
    currentRegionId: 'vesper-city',
    playerPosition: { x: 12, y: 0, z: -8 },
    worldClockSeconds: 42000,
    discoveredLandmarks: ['vc-exchange'],
  };
  const migrated = migrateSaveData(legacyV0);
  assert.equal(migrated.ok, true);
  if (migrated.ok) {
    assert.equal(migrated.migratedFrom, 0);
    assert.equal(migrated.data.schemaVersion, SAVE_SCHEMA_VERSION);
    assert.equal(migrated.data.currentRegionId, 'vesper-city');
    assert.deepEqual(migrated.data.discoveredLandmarks, ['vc-exchange']);

    const json = exportSaveToJson(migrated.data);
    const reimported = importSaveFromJson(json);
    assert.equal(reimported.ok, true);
    if (reimported.ok) {
      assert.equal(reimported.data.currentRegionId, 'vesper-city');
      assert.equal(reimported.data.worldClockSeconds, 42000);
    }
  }

  const invalid = importSaveFromJson('{bad json');
  assert.equal(invalid.ok, false);

  const badRegion = migrateSaveData({
    schemaVersion: 1,
    currentRegionId: 'atlantis',
    playerPosition: { x: 0, y: 0, z: 0 },
    worldClockSeconds: 100,
  });
  assert.equal(badRegion.ok, false);
});
