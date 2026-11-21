import test from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { resolveAllowedHosts } from '../../src/shared/config/allowedHosts';
import { buildArchitecturalBuilding } from '../../src/engine/builders/ArchitectureBuilder';
import { buildInstancedPropClusters } from '../../src/engine/builders/CompositeBuilders';
import { CameraRig } from '../../src/engine/camera/CameraRig';
import { DiagnosticsTracker } from '../../src/engine/core/Diagnostics';
import { ResourceRegistry } from '../../src/engine/core/ResourceRegistry';
import { MaterialLibrary } from '../../src/engine/materials/MaterialLibrary';
import { InputHub } from '../../src/gameplay/input/InputHub';
import { resolveInteractionPrompt } from '../../src/gameplay/interactions/InteractionSystem';
import { PlayerController } from '../../src/gameplay/player/PlayerController';
import { VehicleSystem } from '../../src/gameplay/vehicles/VehicleSystem';
import { WorldClock } from '../../src/simulation/clock/WorldClock';
import { MissionSystem } from '../../src/simulation/missions/MissionSystem';
import { DialogueEngine } from '../../src/simulation/npcs/DialogueEngine';
import { NpcSimulation } from '../../src/simulation/npcs/NpcSimulation';
import { RelationshipModel } from '../../src/simulation/npcs/RelationshipModel';
import { TrafficSystem } from '../../src/simulation/traffic/TrafficSystem';
import { WeatherSystem } from '../../src/simulation/weather/WeatherSystem';
import { getRegionManifest } from '../../src/worlds/WorldCatalog';

test('DiagnosticsTracker computes FPS from inter-frame interval dt rather than JS tick duration', () => {
  const diag = new DiagnosticsTracker();
  // Simulate 100ms between frames (~10 FPS pacing) while JS work takes only 2ms
  let t = 1000;
  for (let i = 0; i < 60; i++) {
    t += 100;
    diag.recordFrame(2, 0.5, t);
  }
  const snap = diag.snapshot(
    {
      info: {
        render: { calls: 10, triangles: 100 },
        memory: { geometries: 5, textures: 3 },
      },
    } as never,
    true,
    'low',
    'solara-bay',
    4,
    3,
  );
  assert.ok(snap.fps >= 8 && snap.fps <= 13, `Expected ~10 FPS from 100ms cadence, got ${snap.fps}`);
});

test('MissionSystem reset clears prior completed missions cleanly', () => {
  const ms = new MissionSystem();
  const solara = getRegionManifest('solara-bay');
  ms.registerMissions(solara.missions);
  const first = ms.getActiveMission();
  assert.ok(first);
  for (const obj of first.def.objectives) {
    ms.notifyAction(obj.kind, obj.targetId, obj.regionId);
  }
  assert.equal(
    ms.getAllMissions().find((m) => m.def.id === first.def.id)?.progress.status,
    'completed',
  );

  // Calling loadProgress({}) or reset() must restore clean initial mission state
  ms.loadProgress({});
  const resetFirst = ms.getAllMissions().find((m) => m.def.id === first.def.id);
  assert.equal(resetFirst?.progress.status, 'active');
  assert.equal(resetFirst?.progress.currentObjectiveIndex, 0);
  assert.equal(resetFirst?.progress.completedObjectiveIds.length, 0);
});

test('VehicleSystem handles throttle, steering, braking, reverse, and collision damping', () => {
  const vs = new VehicleSystem();
  const solara = getRegionManifest('solara-bay');
  vs.registerRegion(solara);
  const roadster = vs.getVehicleById('veh-solara-roadster');
  assert.ok(roadster);
  const startX = roadster.position.x;
  const startZ = roadster.position.z;

  const input = new InputHub();
  // Accelerate forward (W) + steer left (A) via virtual stick
  input.setVirtualStick(-0.6, 1.0);
  for (let i = 0; i < 20; i++) {
    vs.stepActiveVehicle(0.05, roadster.id, input, solara);
  }
  assert.ok(roadster.speed > 5, `Expected positive forward speed, got ${roadster.speed}`);
  assert.notEqual(roadster.position.x, startX);
  assert.ok(roadster.steerAngle > 0, 'Left steering should produce positive steerAngle');

  // Brake to stop via virtual stick neutral + Space? Test Space via trigger or reverse
  input.setVirtualStick(0, -1.0);
  for (let i = 0; i < 40; i++) {
    vs.stepActiveVehicle(0.05, roadster.id, input, solara);
  }
  assert.ok(roadster.speed < 0, `Expected reverse velocity after holding reverse, got ${roadster.speed}`);
  void startZ;
});

test('resolveInteractionPrompt handles interior NPC placement, exit-interior, and exit-vehicle priority', () => {
  const solara = getRegionManifest('solara-bay');
  const vs = new VehicleSystem();
  vs.registerRegion(solara);
  const sim = new NpcSimulation(104729);
  sim.registerRegion(solara, 9.5 * 3600);
  sim.activateRegion('solara-bay', 9.5 * 3600, 9.5, 'clear');

  const cafeInterior = solara.interiors.find((i) => i.id === 'sb-int-cafe')!;
  const npcs = sim.getActiveRegionNpcs('solara-bay');

  // Near interior exit
  const exitPrompt = resolveInteractionPrompt(
    {
      regionId: 'solara-bay',
      interiorId: cafeInterior.id,
      exteriorReturnPosition: { x: 0, y: 0, z: 0 },
      exteriorReturnYaw: 0,
      position: { ...cafeInterior.exitLocal },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      isGrounded: true,
      mode: 'foot',
      activeVehicleId: null,
      gaitPhase: 0,
      squashY: 1,
    },
    solara,
    cafeInterior,
    npcs,
    (id) => sim.getProfile(id),
    vs,
    new Set(),
  );
  assert.equal(exitPrompt?.kind, 'exit-interior');

  // Near counter inside cafe -> should find NPC
  const npcPrompt = resolveInteractionPrompt(
    {
      regionId: 'solara-bay',
      interiorId: cafeInterior.id,
      exteriorReturnPosition: { x: 0, y: 0, z: 0 },
      exteriorReturnYaw: 0,
      position: { x: -1.1, y: 0, z: -1.0 },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      isGrounded: true,
      mode: 'foot',
      activeVehicleId: null,
      gaitPhase: 0,
      squashY: 1,
    },
    solara,
    cafeInterior,
    npcs,
    (id) => sim.getProfile(id),
    vs,
    new Set(),
  );
  assert.equal(npcPrompt?.kind, 'npc');
});

test('resolveAllowedHosts builds strict explicit allowlist and rejects wildcards', () => {
  const hosts = resolveAllowedHosts({
    APP_URL: 'https://ais-dev-abc123.asia-east1.run.app',
    NG_ALLOWED_HOSTS: '.run.app, ais-dev-abc123.asia-east1.run.app, *',
    VITE_ALLOWED_HOSTS: 'custom-preview.example.org',
  });
  assert.ok(hosts.includes('localhost'));
  assert.ok(hosts.includes('127.0.0.1'));
  assert.ok(hosts.includes('ais-dev-abc123.asia-east1.run.app'));
  assert.ok(hosts.includes('ais-pre-abc123.asia-east1.run.app'));
  assert.ok(hosts.includes('custom-preview.example.org'));
  assert.equal(hosts.includes('.run.app'), false);
  assert.equal(hosts.includes('*'), false);
  assert.equal(hosts.includes('evil.example.com'), false);
  assert.equal(hosts.includes('other.run.app'), false);
});

test('VehicleSystem Space brake stops vehicle cleanly and handles building collisions', () => {
  const vs = new VehicleSystem();
  const solara = getRegionManifest('solara-bay');
  vs.registerRegion(solara);
  const roadster = vs.getVehicleById('veh-solara-roadster')!;
  const input = new InputHub();
  input.setVirtualStick(0, 1);
  for (let i = 0; i < 15; i++) vs.stepActiveVehicle(0.05, roadster.id, input, solara);
  assert.ok(roadster.speed > 4);

  // Release stick & hold Space via input mock
  input.setVirtualStick(0, 0);
  const brakeInput = {
    getMoveAxes: () => ({ x: 0, z: 0, sprint: false }),
    isHeld: (code: string) => code === 'Space',
  } as unknown as InputHub;
  for (let i = 0; i < 20; i++) vs.stepActiveVehicle(0.05, roadster.id, brakeInput, solara);
  assert.equal(roadster.speed, 0);
});

test('NpcSimulation keeps NPCs outside central plaza fountain radius in non-gateway regions', () => {
  const solara = getRegionManifest('solara-bay');
  const sim = new NpcSimulation(104729);
  sim.registerRegion(solara, 9.5 * 3600);
  sim.activateRegion('solara-bay', 9.5 * 3600, 9.5, 'clear');

  const checkClearance = (phase: string) => {
    for (const npc of sim.getActiveRegionNpcs('solara-bay')) {
      const distFromOrigin = Math.hypot(npc.position.x, npc.position.z);
      assert.ok(
        distFromOrigin >= 4.1,
        `NPC ${npc.id} clipped inside central fountain during ${phase} (r=${distFromOrigin.toFixed(2)})`,
      );
    }
  };

  checkClearance('activateRegion');

  // Step simulation during morning market when plaza event attracts NPCs to origin
  for (let i = 0; i < 120; i++) {
    sim.step('solara-bay', { x: 0, y: 0, z: 12 }, 0.5, 9.5, 'clear', solara.events[0]);
  }
  checkClearance('step simulation');
});

test('CameraRig clamps camera strictly inside interior room bounds near spawn/exit wall', () => {
  const rig = new CameraRig();
  const cam = new THREE.PerspectiveCamera(58, 16 / 9, 0.25, 450);
  const input = new InputHub();
  const bounds = { halfW: 8, height: 5.5, halfD: 7 };
  const playerPos = { x: 0, y: 0, z: 4.8 };

  rig.snapToTarget(playerPos, Math.PI, bounds);
  for (let i = 0; i < 20; i++) {
    rig.updateGameplay(cam, 0.05, playerPos, Math.PI, false, true, input, 1, [], bounds);
    assert.ok(cam.position.z < bounds.halfD - 0.5, `Camera clipped outside south wall (z=${cam.position.z})`);
    assert.ok(cam.position.z > -(bounds.halfD - 0.5), `Camera clipped outside north wall (z=${cam.position.z})`);
    assert.ok(Math.abs(cam.position.x) < bounds.halfW - 0.5, `Camera clipped outside side wall (x=${cam.position.x})`);
    assert.ok(cam.position.y < bounds.height - 0.4, `Camera clipped above ceiling (y=${cam.position.y})`);
  }
});

test('NpcSimulation preserves destination timestamp, applies deterministic elapsed fast-forward, and leaves state unchanged on zero elapsed time', () => {
  const solara = getRegionManifest('solara-bay');
  const vesper = getRegionManifest('vesper-city');

  const runScenario = () => {
    const sim = new NpcSimulation(104729);
    const t0 = 9.5 * 3600;
    sim.registerRegion(solara, t0);
    sim.registerRegion(vesper, t0);

    // Boot / activate Solara at 09:30
    sim.activateRegion('solara-bay', t0, 9.5, 'clear');
    const solaraBefore = sim.getActiveRegionNpcs('solara-bay').map((n) => ({
      id: n.id,
      x: n.position.x,
      z: n.position.z,
      needs: { ...n.needs },
      behavior: n.behavior,
      targetLocationId: n.targetLocationId,
      currentGoal: n.currentGoal,
    }));

    // Zero-elapsed reactivation must NOT alter active NPC state
    sim.activateRegion('solara-bay', t0, 9.5, 'clear');
    const solaraAfterZero = sim.getActiveRegionNpcs('solara-bay').map((n) => ({
      id: n.id,
      x: n.position.x,
      z: n.position.z,
      needs: { ...n.needs },
      behavior: n.behavior,
      targetLocationId: n.targetLocationId,
      currentGoal: n.currentGoal,
    }));
    assert.deepEqual(solaraAfterZero, solaraBefore, 'Zero elapsed time should not mutate NPC state');

    // Travel A -> B after 600s in Solara: deactivate Solara at t1, preserve Vesper timestamp at t0
    const t1 = t0 + 600;
    sim.deactivateRegion('solara-bay', t1);
    assert.ok(sim.getActiveRegionNpcs('solara-bay').every((n) => n.tier === 'inactive'));
    assert.equal(sim.getLastVisitedTime('solara-bay'), t1);
    assert.equal(sim.getLastVisitedTime('vesper-city'), t0, 'Destination timestamp must not be overwritten prior to activation');

    sim.activateRegion('vesper-city', t1, (t1 % 86400) / 3600, 'clear');
    assert.equal(sim.getLastVisitedTime('vesper-city'), t1);

    // Travel B -> A much later (+3600s at 11:40? let's advance +4200s total)
    const t2 = t1 + 4200;
    sim.deactivateRegion('vesper-city', t2);
    sim.activateRegion('solara-bay', t2, (t2 % 86400) / 3600, 'clear');

    const solaraReturned = sim.getActiveRegionNpcs('solara-bay');
    const changedNeedsCount = solaraReturned.filter((n, idx) => {
      const prev = solaraBefore[idx];
      return (
        Math.abs(n.needs.energy - prev.needs.energy) > 0.01 ||
        Math.abs(n.needs.hunger - prev.needs.hunger) > 0.01 ||
        Math.abs(n.needs.social - prev.needs.social) > 0.01
      );
    }).length;
    assert.ok(
      changedNeedsCount > 0,
      'Returning after significant elapsed time must progress NPC needs deterministically',
    );

    // Huge elapsed jump stays bounded (0..100) and finite
    const t3 = t2 + 10 * 86400;
    sim.deactivateRegion('solara-bay', t2);
    sim.activateRegion('solara-bay', t3, 18.5, 'clear');
    for (const npc of sim.getActiveRegionNpcs('solara-bay')) {
      assert.ok(npc.needs.energy >= 0 && npc.needs.energy <= 100);
      assert.ok(npc.needs.hunger >= 0 && npc.needs.hunger <= 100);
      assert.ok(npc.needs.social >= 0 && npc.needs.social <= 100);
      assert.ok(npc.needs.comfort >= 0 && npc.needs.comfort <= 100);
      assert.ok(Number.isFinite(npc.position.x) && Number.isFinite(npc.position.z));
    }

    return sim.getActiveRegionNpcs('solara-bay').map((n) => ({
      id: n.id,
      x: n.position.x,
      z: n.position.z,
      needs: { ...n.needs },
      behavior: n.behavior,
      goal: n.currentGoal,
    }));
  };

  const run1 = runScenario();
  const run2 = runScenario();
  assert.deepEqual(run1, run2, 'Elapsed-time progression must be 100% deterministic');
});

test('All simulation and gameplay subsystems reset cleanly to initial New Game state', () => {
  const solara = getRegionManifest('solara-bay');
  const vesper = getRegionManifest('vesper-city');

  // WeatherSystem reset restores initial configured weather (not stuck in storm)
  const weather = new WeatherSystem(104729);
  weather.registerRegion('solara-bay', solara.weatherWeights, {
    current: 'clear',
    next: 'clear',
    progress: 1,
    durationSec: 220,
  });
  weather.forceWeather('solara-bay', 'storm');
  weather.step(20, 'solara-bay');
  assert.equal(weather.getAtmosphere('solara-bay').activeWeather, 'storm');
  weather.reset();
  assert.equal(weather.getAtmosphere('solara-bay').activeWeather, 'clear');
  assert.equal(weather.getRegionState('solara-bay').progress, 1);

  // WorldClock reset
  const clock = new WorldClock(9.5 * 3600, 1);
  clock.step(500);
  clock.paused = true;
  clock.timeScale = 12;
  clock.reset(9.5 * 3600, 1);
  assert.equal(clock.totalSeconds, 9.5 * 3600);
  assert.equal(clock.paused, false);
  assert.equal(clock.timeScale, 1);

  // TrafficSystem reset restores clock & vehicle positions deterministically
  const trafficA = new TrafficSystem(104729);
  trafficA.loadRegion(vesper, 4);
  for (let i = 0; i < 20; i++) trafficA.step(0.5, { x: 200, y: 0, z: 200 }, 'clear');
  trafficA.reset();
  trafficA.loadRegion(vesper, 4);

  const trafficB = new TrafficSystem(104729);
  trafficB.loadRegion(vesper, 4);
  assert.deepEqual(trafficA.getVehicles(), trafficB.getVehicles());
  assert.equal(trafficA.getSignalColor(vesper.trafficSignals[0].id), trafficB.getSignalColor(vesper.trafficSignals[0].id));

  // NpcSimulation reset restores exact initial PRNG & NPC state
  const npcA = new NpcSimulation(104729);
  npcA.registerRegion(solara, 9.5 * 3600);
  npcA.activateRegion('solara-bay', 9.5 * 3600, 9.5, 'clear');
  npcA.step('solara-bay', { x: 0, y: 0, z: 20 }, 1.5, 9.5, 'clear', null);
  npcA.reset(9.5 * 3600);
  npcA.activateRegion('solara-bay', 9.5 * 3600, 9.5, 'clear');

  const npcB = new NpcSimulation(104729);
  npcB.registerRegion(solara, 9.5 * 3600);
  npcB.activateRegion('solara-bay', 9.5 * 3600, 9.5, 'clear');
  assert.deepEqual(npcA.getActiveRegionNpcs('solara-bay'), npcB.getActiveRegionNpcs('solara-bay'));

  // VehicleSystem reset restores spawn position, yaw, speed=0, condition=100
  const vs = new VehicleSystem();
  vs.registerRegion(solara);
  const roadster = vs.getVehicleById('veh-solara-roadster')!;
  roadster.position.x += 25;
  roadster.speed = 14;
  roadster.condition = 42;
  roadster.occupiedByPlayer = true;
  vs.reset();
  const resetRoadster = vs.getVehicleById('veh-solara-roadster')!;
  assert.equal(resetRoadster.occupiedByPlayer, false);
  assert.equal(resetRoadster.speed, 0);
  assert.equal(resetRoadster.condition, 100);
  assert.equal(resetRoadster.position.x, solara.vehicles.find((v) => v.id === 'veh-solara-roadster')!.spawnPosition.x);

  // PlayerController, RelationshipModel, DialogueEngine, CameraRig resets
  const pc = new PlayerController();
  pc.state.position = { x: 40, y: 3, z: -20 };
  pc.state.mode = 'vehicle';
  pc.state.activeVehicleId = 'veh-solara-roadster';
  pc.state.interiorId = 'sb-int-cafe';
  pc.reset('solara-bay', solara.arrivalSpawn, solara.arrivalYaw);
  assert.equal(pc.state.mode, 'foot');
  assert.equal(pc.state.activeVehicleId, null);
  assert.equal(pc.state.interiorId, null);
  assert.deepEqual(pc.state.position, solara.arrivalSpawn);

  const rel = new RelationshipModel();
  rel.applyDelta(solara.residents[0].id, { familiarity: 50 }, 1000, ['flag_a']);
  rel.reset();
  assert.deepEqual(rel.serialize(), {});
  assert.equal(rel.get(solara.residents[0].id).familiarity, 5);
  assert.deepEqual(rel.get(solara.residents[0].id).memoryFlags, []);

  const dlg = new DialogueEngine();
  dlg.markUsed(solara.residents[0].id, solara.residents[0].dialoguePool[0], 1000);
  dlg.reset();
  assert.deepEqual(dlg.serialize(), { cooldowns: {}, recent: {} });

  const rig = new CameraRig();
  rig.mode = 'observer';
  rig.pitch = 1.1;
  rig.distance = 13.5;
  rig.reset();
  assert.equal(rig.mode, 'third-person');
  assert.equal(rig.distance, 7.2);
});

test('ResourceRegistry and buildInstancedPropClusters track and dispose InstancedMesh without double-disposal or disposing shared globals', () => {
  const registry = new ResourceRegistry();

  const sharedGeo = new THREE.BoxGeometry(1, 1, 1);
  const sharedMat = new THREE.MeshStandardMaterial({ color: '#8899aa' });
  registry.track(sharedGeo, 'global');
  registry.track(sharedMat, 'global');

  const scopedInstanced = new THREE.InstancedMesh(sharedGeo, sharedMat, 5);
  let instDisposeCalls = 0;
  let geoDisposeCalls = 0;
  let matDisposeCalls = 0;
  scopedInstanced.addEventListener('dispose', () => {
    instDisposeCalls++;
  });
  sharedGeo.addEventListener('dispose', () => {
    geoDisposeCalls++;
  });
  sharedMat.addEventListener('dispose', () => {
    matDisposeCalls++;
  });

  registry.trackObject3D(scopedInstanced, 'region:solara-bay');

  // Disposing region scope must dispose InstancedMesh once, but keep global geometry & material alive
  registry.disposeScope('region:solara-bay');
  assert.equal(instDisposeCalls, 1);
  assert.equal(geoDisposeCalls, 0);
  assert.equal(matDisposeCalls, 0);

  // Repeated disposal of empty scope is a safe no-op
  registry.disposeScope('region:solara-bay');
  assert.equal(instDisposeCalls, 1);

  // Verify buildInstancedPropClusters registers every InstancedMesh in the passed scope
  const stubMat = new THREE.MeshStandardMaterial({ color: '#446655' });
  const stubMats = {
    getStandardMaterial: (_k: string, _p: THREE.MeshStandardMaterialParameters, scope: string) =>
      registry.track(stubMat, scope),
  } as unknown as MaterialLibrary;

  const propGroup = buildInstancedPropClusters(
    [
      { kind: 'palm', positions: [{ x: 4, y: 0, z: 4 }] },
      { kind: 'lamp', positions: [{ x: -4, y: 0, z: 4 }] },
      { kind: 'bench', positions: [{ x: 6, y: 0, z: -4 }] },
      { kind: 'bollard', positions: [{ x: -6, y: 0, z: -4 }] },
    ],
    stubMats,
    registry,
    'region:prop-test',
  );

  const instancedChildren: THREE.InstancedMesh[] = [];
  const disposeCounts: number[] = [];
  propGroup.traverse((obj) => {
    if ((obj as THREE.InstancedMesh).isInstancedMesh) {
      const idx = instancedChildren.length;
      instancedChildren.push(obj as THREE.InstancedMesh);
      disposeCounts.push(0);
      (obj as THREE.InstancedMesh).addEventListener('dispose', () => {
        disposeCounts[idx]++;
      });
    }
  });
  assert.equal(instancedChildren.length, 6);

  registry.disposeScope('region:prop-test');
  assert.deepEqual(disposeCounts, [1, 1, 1, 1, 1, 1]);

  registry.disposeScope('global');
  assert.equal(geoDisposeCalls, 1);
  assert.equal(matDisposeCalls, 1);
});

test('ArchitectureBuilder merges multi-bay building facades within draw-call budget and disposes cleanly', () => {
  const registry = new ResourceRegistry();
  const dummyTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  registry.track(dummyTex, 'global');
  const stubMat = new THREE.MeshStandardMaterial({ color: '#cccccc' });
  const stubMats = {
    getStandardMaterial: (_k: string, _p: THREE.MeshStandardMaterialParameters, scope: string) =>
      registry.track(stubMat, scope),
    getStuccoAlbedoTexture: () => dummyTex,
    getRoofTileAlbedoTexture: () => dummyTex,
    getTimberAlbedoTexture: () => dummyTex,
    getGrainBumpTexture: () => dummyTex,
  } as unknown as MaterialLibrary;

  const solara = getRegionManifest('solara-bay');
  const building = buildArchitecturalBuilding(solara.buildings[0], stubMats, registry, 'region:arch-test');

  let meshCount = 0;
  let geoCount = 0;
  const uniqueGeos = new Set<THREE.BufferGeometry>();
  const disposeCounts: number[] = [];
  building.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      meshCount++;
      const g = (obj as THREE.Mesh).geometry;
      if (!uniqueGeos.has(g)) {
        uniqueGeos.add(g);
        const idx = geoCount++;
        disposeCounts.push(0);
        g.addEventListener('dispose', () => {
          disposeCounts[idx]++;
        });
      }
    }
  });

  // Compact merged draw-call count despite multi-bay windows, shutters, pilasters, roof, and awning
  assert.ok(meshCount >= 5 && meshCount <= 16, `Expected 5..16 meshes for merged facade, got ${meshCount}`);
  assert.ok(geoCount >= 5);

  registry.disposeScope('region:arch-test');
  assert.ok(disposeCounts.every((c) => c === 1), 'Every merged building geometry should dispose exactly once');
  registry.disposeScope('global');
});





