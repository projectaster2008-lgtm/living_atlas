import { dist2D, SeededPRNG, wrapAngle } from '../../shared/math/prng';
import {
  RegionManifest,
  TrafficNode,
  TrafficSignalDef,
  TrafficVehicleState,
  Vec3,
  WeatherKind,
} from '../../shared/types/world';

const TRAFFIC_COLORS = ['#c86a4b', '#3a6f8f', '#d4b468', '#5c7c66', '#8d99ae', '#b56576'];

export class TrafficSystem {
  private nodes = new Map<string, TrafficNode>();
  private signals: TrafficSignalDef[] = [];
  private vehicles: TrafficVehicleState[] = [];
  private elapsedClockSec = 0;
  private readonly seed: number;
  private prng: SeededPRNG;

  constructor(seed: number) {
    this.seed = seed;
    this.prng = new SeededPRNG(seed ^ 0x7f4a7c15);
  }

  reset(): void {
    this.prng = new SeededPRNG(this.seed ^ 0x7f4a7c15);
    this.elapsedClockSec = 0;
    this.nodes.clear();
    this.signals = [];
    this.vehicles = [];
  }

  loadRegion(manifest: RegionManifest, maxTraffic = 8): void {
    this.nodes.clear();
    this.vehicles = [];
    this.signals = manifest.trafficSignals;
    for (const n of manifest.trafficNodes) {
      this.nodes.set(n.id, n);
    }

    if (manifest.trafficNodes.length < 2) return;

    const count = Math.min(maxTraffic, Math.max(2, Math.floor(manifest.trafficNodes.length / 2)));
    for (let i = 0; i < count; i++) {
      const nodeIdx = Math.floor((i * manifest.trafficNodes.length) / count) % manifest.trafficNodes.length;
      const startNode = manifest.trafficNodes[nodeIdx];
      const nextId = startNode.nextIds[0] ?? startNode.id;
      const nextNode = this.nodes.get(nextId) ?? startNode;
      const progress = 0.12 + (i % 2) * 0.32;
      const yaw = Math.atan2(
        nextNode.position.x - startNode.position.x,
        nextNode.position.z - startNode.position.z,
      );
      this.vehicles.push({
        id: `traffic-${manifest.id}-${i}`,
        color: TRAFFIC_COLORS[i % TRAFFIC_COLORS.length],
        kind: i % 3 === 0 ? 'utility' : manifest.id === 'aether-district' ? 'pod' : 'coupe',
        currentNodeId: startNode.id,
        nextNodeId: nextNode.id,
        progress,
        position: {
          x: startNode.position.x + (nextNode.position.x - startNode.position.x) * progress,
          y: startNode.position.y + (nextNode.position.y - startNode.position.y) * progress,
          z: startNode.position.z + (nextNode.position.z - startNode.position.z) * progress,
        },
        yaw,
        speed: 0,
        wheelSpin: 0,
      });
    }
  }

  getSignalColor(signalId: string): 'green' | 'amber' | 'red' {
    const def = this.signals.find((s) => s.id === signalId);
    if (!def) return 'green';
    const phase = ((this.elapsedClockSec + def.phaseOffsetSec) % def.cycleSec) / def.cycleSec;
    if (phase < 0.48) return 'green';
    if (phase < 0.58) return 'amber';
    return 'red';
  }

  step(simDtSec: number, playerPos: Vec3, weather: WeatherKind): void {
    this.elapsedClockSec += simDtSec;
    const weatherSlowdown = weather === 'rain' || weather === 'fog' ? 0.78 : weather === 'storm' ? 0.65 : 1.0;

    for (const v of this.vehicles) {
      const curr = this.nodes.get(v.currentNodeId);
      const next = this.nodes.get(v.nextNodeId);
      if (!curr || !next) continue;

      const segLen = Math.max(0.5, dist2D(curr.position.x, curr.position.z, next.position.x, next.position.z));
      let targetSpeed = next.speedLimit * weatherSlowdown;

      // Traffic signal check near end of segment
      if (next.signalId && v.progress > 0.65) {
        const sig = this.getSignalColor(next.signalId);
        if (sig === 'red' || sig === 'amber') {
          targetSpeed = 0;
        }
      }

      // Yield to player near vehicle forward path
      const distPlayer = dist2D(v.position.x, v.position.z, playerPos.x, playerPos.z);
      if (distPlayer < 6.5) {
        targetSpeed = 0;
      }

      // Keep safe spacing behind other traffic vehicles ahead
      const fwdX = Math.sin(v.yaw);
      const fwdZ = Math.cos(v.yaw);
      for (const other of this.vehicles) {
        if (other.id === v.id) continue;
        const dx = other.position.x - v.position.x;
        const dz = other.position.z - v.position.z;
        const dOther = Math.hypot(dx, dz);
        const ahead = dx * fwdX + dz * fwdZ;
        if (dOther < 9.5 && ahead > 0.5) {
          targetSpeed = 0;
          break;
        }
      }

      v.speed += (targetSpeed - v.speed) * Math.min(1, simDtSec * 4.5);
      v.progress += (v.speed * simDtSec) / segLen;
      v.wheelSpin += v.speed * simDtSec * 2.1;

      while (v.progress >= 1.0) {
        v.progress -= 1.0;
        v.currentNodeId = v.nextNodeId;
        const landed = this.nodes.get(v.currentNodeId);
        if (landed && landed.nextIds.length > 0) {
          v.nextNodeId = this.prng.pick(landed.nextIds);
        }
      }

      const a = this.nodes.get(v.currentNodeId);
      const b = this.nodes.get(v.nextNodeId);
      if (a && b) {
        v.position.x = a.position.x + (b.position.x - a.position.x) * v.progress;
        v.position.y = a.position.y + (b.position.y - a.position.y) * v.progress;
        v.position.z = a.position.z + (b.position.z - a.position.z) * v.progress;
        const targetYaw = Math.atan2(b.position.x - a.position.x, b.position.z - a.position.z);
        v.yaw = wrapAngle(v.yaw + wrapAngle(targetYaw - v.yaw) * Math.min(1, simDtSec * 7));
      }
    }
  }

  getVehicles(): readonly TrafficVehicleState[] {
    return this.vehicles;
  }

  getSignals(): readonly TrafficSignalDef[] {
    return this.signals;
  }
}
