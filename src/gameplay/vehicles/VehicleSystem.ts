import { clamp, damp, dist2D, wrapAngle } from '../../shared/math/prng';
import {
  RegionId,
  RegionManifest,
  VehicleRuntimeState,
  VehicleSpec,
} from '../../shared/types/world';
import { InputHub } from '../input/InputHub';
import { buildBuildingColliders, ColliderBox, resolveCircleBoxCollision } from '../player/PlayerController';

export class VehicleSystem {
  private specs = new Map<string, VehicleSpec>();
  private statesByRegion = new Map<RegionId, VehicleRuntimeState[]>();
  private collidersByRegion = new Map<RegionId, ColliderBox[]>();

  registerRegion(manifest: RegionManifest): void {
    this.collidersByRegion.set(manifest.id, buildBuildingColliders(manifest.buildings));
    const list: VehicleRuntimeState[] = [];
    for (const spec of manifest.vehicles) {
      this.specs.set(spec.id, spec);
      list.push({
        id: spec.id,
        specId: spec.id,
        regionId: manifest.id,
        position: { ...spec.spawnPosition },
        yaw: spec.spawnYaw,
        speed: 0,
        steerAngle: 0,
        condition: 100,
        occupiedByPlayer: false,
        wheelSpin: 0,
      });
    }
    this.statesByRegion.set(manifest.id, list);
  }

  loadSavedStates(saved: Record<string, { position: { x: number; y: number; z: number }; yaw: number; condition: number }>): void {
    for (const list of this.statesByRegion.values()) {
      for (const v of list) {
        const s = saved[v.id];
        if (s) {
          v.position = { ...s.position };
          v.yaw = s.yaw;
          v.condition = clamp(s.condition, 15, 100);
        }
      }
    }
  }

  getRegionVehicles(regionId: RegionId): VehicleRuntimeState[] {
    return this.statesByRegion.get(regionId) ?? [];
  }

  getVehicleById(vehicleId: string): VehicleRuntimeState | undefined {
    for (const list of this.statesByRegion.values()) {
      const found = list.find((v) => v.id === vehicleId);
      if (found) return found;
    }
    return undefined;
  }

  getSpec(specId: string): VehicleSpec | undefined {
    return this.specs.get(specId);
  }

  findNearestDrivable(regionId: RegionId, x: number, z: number, maxRange = 4.2): VehicleRuntimeState | null {
    const list = this.getRegionVehicles(regionId);
    let best: VehicleRuntimeState | null = null;
    let bestD = maxRange;
    for (const v of list) {
      const spec = this.specs.get(v.specId);
      if (!spec?.drivable) continue;
      const d = dist2D(x, z, v.position.x, v.position.z);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  stepActiveVehicle(
    dt: number,
    vehicleId: string,
    input: InputHub,
    manifest: RegionManifest,
  ): { collided: boolean; speedKmh: number } {
    const v = this.getVehicleById(vehicleId);
    if (!v) return { collided: false, speedKmh: 0 };
    const spec = this.specs.get(v.specId);
    if (!spec) return { collided: false, speedKmh: 0 };

    const move = input.getMoveAxes();
    const throttle = move.z; // W=+1, S=-1
    const steerInput = -move.x; // A=+1 left, D=-1 right
    const braking = input.isHeld('Space');

    if (braking) {
      v.speed = damp(v.speed, 0, 9, dt);
    } else if (Math.abs(throttle) > 0.05) {
      const target = throttle > 0 ? spec.maxSpeed : -spec.maxSpeed * 0.42;
      const rate = throttle > 0 ? spec.accel : spec.accel * 0.8;
      if (throttle > 0 && v.speed < 0) v.speed = damp(v.speed, 0, 10, dt);
      else if (throttle < 0 && v.speed > 0) v.speed = damp(v.speed, 0, 10, dt);
      else v.speed += Math.sign(target - v.speed) * Math.min(Math.abs(target - v.speed), rate * dt);
    } else {
      v.speed = damp(v.speed, 0, 2.8, dt);
    }

    v.steerAngle = damp(v.steerAngle, steerInput * 0.48, 10, dt);
    const steerFactor = clamp(Math.abs(v.speed) / 3.5, 0, 1) * Math.sign(v.speed || 1);
    v.yaw = wrapAngle(v.yaw + steerInput * spec.turnRate * steerFactor * dt);

    const sinY = Math.sin(v.yaw);
    const cosY = Math.cos(v.yaw);
    v.position.x += sinY * v.speed * dt;
    v.position.z += cosY * v.speed * dt;
    v.wheelSpin += v.speed * dt * 2.2;

    const colliders = this.collidersByRegion.get(manifest.id) ?? [];
    let collided = resolveCircleBoxCollision(v.position, 2.0, colliders);

    const r = Math.hypot(v.position.x, v.position.z);
    const maxR = manifest.boundsRadius - 4;
    if (r > maxR) {
      v.position.x = (v.position.x / r) * maxR;
      v.position.z = (v.position.z / r) * maxR;
      collided = true;
    }
    if (manifest.hasCoastalOcean && v.position.z < -68) {
      v.position.z = -68;
      collided = true;
    }

    if (collided && Math.abs(v.speed) > 4) {
      v.condition = clamp(v.condition - Math.abs(v.speed) * 0.45, 20, 100);
      v.speed *= -0.28;
    }

    return {
      collided,
      speedKmh: Math.round(Math.abs(v.speed) * 3.6),
    };
  }

  serialize(): Record<string, { position: { x: number; y: number; z: number }; yaw: number; condition: number }> {
    const out: Record<string, { position: { x: number; y: number; z: number }; yaw: number; condition: number }> = {};
    for (const list of this.statesByRegion.values()) {
      for (const v of list) {
        out[v.id] = {
          position: { ...v.position },
          yaw: v.yaw,
          condition: Math.round(v.condition),
        };
      }
    }
    return out;
  }
}
