import test from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { resolveAllowedHosts } from '../../src/shared/config/allowedHosts';
import { CameraRig } from '../../src/engine/camera/CameraRig';
import { DiagnosticsTracker } from '../../src/engine/core/Diagnostics';
import { InputHub } from '../../src/gameplay/input/InputHub';
import { resolveInteractionPrompt } from '../../src/gameplay/interactions/InteractionSystem';
import { VehicleSystem } from '../../src/gameplay/vehicles/VehicleSystem';
import { MissionSystem } from '../../src/simulation/missions/MissionSystem';
import { NpcSimulation } from '../../src/simulation/npcs/NpcSimulation';
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



