import { dist2D } from '../../shared/math/prng';
import {
  ActiveInteractionPrompt,
  InteriorDef,
  NpcProfile,
  NpcRuntimeState,
  PlayerRuntimeState,
  RegionManifest,
} from '../../shared/types/world';
import { VehicleSystem } from '../vehicles/VehicleSystem';

export function resolveInteractionPrompt(
  player: PlayerRuntimeState,
  manifest: RegionManifest,
  activeInterior: InteriorDef | null,
  npcs: NpcRuntimeState[],
  getProfile: (id: string) => NpcProfile | undefined,
  vehicles: VehicleSystem,
  collectedIds: Set<string>,
): ActiveInteractionPrompt | null {
  if (player.mode === 'vehicle' && player.activeVehicleId) {
    return {
      id: 'exit-vehicle',
      kind: 'exit-vehicle',
      label: 'Exit Vehicle',
      sublabel: 'Park safely and step out',
      targetId: player.activeVehicleId,
      distance: 0,
    };
  }

  if (activeInterior) {
    const dExit = dist2D(
      player.position.x,
      player.position.z,
      activeInterior.exitLocal.x,
      activeInterior.exitLocal.z,
    );
    if (dExit <= 3.2) {
      return {
        id: 'exit-interior',
        kind: 'exit-interior',
        label: `Exit to ${manifest.name}`,
        targetId: activeInterior.id,
        distance: dExit,
      };
    }

    // Interior NPCs (stationed inside building)
    const interiorNpcs = npcs.filter((n) => n.targetLocationId === activeInterior.entryBuildingId);
    let bestPrompt: ActiveInteractionPrompt | null = null;
    let bestDist = 4.5;
    for (let idx = 0; idx < interiorNpcs.length; idx++) {
      const npc = interiorNpcs[idx];
      const profile = getProfile(npc.id);
      if (!profile) continue;
      const offsetX = (idx - (interiorNpcs.length - 1) * 0.5) * 2.2;
      const d = dist2D(player.position.x, player.position.z, offsetX, -2.6);
      if (d <= bestDist) {
        bestDist = d;
        bestPrompt = {
          id: `npc-${profile.id}`,
          kind: 'npc',
          label: `Talk to ${profile.name}`,
          sublabel: profile.occupation,
          targetId: profile.id,
          distance: d,
        };
      }
    }
    if (bestPrompt) return bestPrompt;
    return null;
  }

  const candidates: ActiveInteractionPrompt[] = [];

  // 1. Nearby NPCs
  for (const npc of npcs) {
    if (npc.tier === 'offscreen' || npc.tier === 'inactive') continue;
    const d = dist2D(player.position.x, player.position.z, npc.position.x, npc.position.z);
    if (d <= 3.8) {
      const profile = getProfile(npc.id);
      if (profile) {
        candidates.push({
          id: `npc-${npc.id}`,
          kind: 'npc',
          label: `Talk to ${profile.name}`,
          sublabel: profile.occupation,
          targetId: npc.id,
          distance: d,
        });
      }
    }
  }

  // 2. Building interior doors
  for (const b of manifest.buildings) {
    if (!b.interiorId || !b.doorLocalOffset) continue;
    const doorX = b.position.x + b.doorLocalOffset.x;
    const doorZ = b.position.z + b.doorLocalOffset.z;
    const d = dist2D(player.position.x, player.position.z, doorX, doorZ);
    if (d <= 4.2) {
      candidates.push({
        id: `door-${b.interiorId}`,
        kind: 'door',
        label: `Enter ${b.name}`,
        sublabel: 'Explore interior',
        targetId: b.interiorId,
        distance: d,
      });
    }
  }

  // 3. Drivable vehicles
  const nearVeh = vehicles.findNearestDrivable(manifest.id, player.position.x, player.position.z, 4.4);
  if (nearVeh) {
    const spec = vehicles.getSpec(nearVeh.specId);
    const d = dist2D(player.position.x, player.position.z, nearVeh.position.x, nearVeh.position.z);
    candidates.push({
      id: `veh-${nearVeh.id}`,
      kind: 'vehicle',
      label: `Drive ${spec?.name ?? 'Vehicle'}`,
      sublabel: 'WASD Steer · Space Brake',
      targetId: nearVeh.id,
      distance: d,
    });
  }

  // 4. Collectibles
  for (const col of manifest.collectibles) {
    if (collectedIds.has(col.id)) continue;
    const d = dist2D(player.position.x, player.position.z, col.position.x, col.position.z);
    if (d <= 3.5) {
      candidates.push({
        id: `col-${col.id}`,
        kind: 'collectible',
        label: `Collect ${col.name}`,
        sublabel: 'Atlas Discovery',
        targetId: col.id,
        distance: d,
      });
    }
  }

  // 5. Gateway Transit Portal
  const dGate = dist2D(
    player.position.x,
    player.position.z,
    manifest.gatewayPortalPosition.x,
    manifest.gatewayPortalPosition.z,
  );
  if (dGate <= 5.2) {
    candidates.push({
      id: 'gateway-travel',
      kind: 'gateway',
      label: manifest.id === 'gateway' ? 'Select Destination Region' : 'Travel via World Gateway',
      sublabel: 'Open transit selector',
      targetId: 'gateway',
      distance: dGate,
    });
  }

  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0] ?? null;
}
