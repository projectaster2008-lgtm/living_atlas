import * as THREE from 'three';
import { DiagnosticsSnapshot, QualityTier, RegionId } from '../../shared/types/world';

export class DiagnosticsTracker {
  private frameTimes: number[] = [];
  private simTimes: number[] = [];
  private fps = 60;
  private lastTickAt = performance.now();

  recordFrame(frameMs: number, simMs: number, nowMs = performance.now()): void {
    this.frameTimes.push(frameMs);
    this.simTimes.push(simMs);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
    if (this.simTimes.length > 60) this.simTimes.shift();

    const dt = nowMs - this.lastTickAt;
    if (dt > 0) {
      const instFps = 1000 / Math.max(1, dt);
      this.fps = this.fps * 0.9 + instFps * 0.1;
    }
    this.lastTickAt = nowMs;
  }

  getP95FrameMs(): number {
    if (this.frameTimes.length === 0) return 16.6;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1];
  }

  snapshot(
    renderer: THREE.WebGLRenderer,
    isSoftwareGl: boolean,
    activeQuality: QualityTier,
    activeRegionId: RegionId,
    nearNpcCount: number,
    districtNpcCount: number,
  ): DiagnosticsSnapshot {
    const avgFrame =
      this.frameTimes.reduce((a, b) => a + b, 0) / Math.max(1, this.frameTimes.length);
    const avgSim =
      this.simTimes.reduce((a, b) => a + b, 0) / Math.max(1, this.simTimes.length);

    return {
      fps: Math.round(this.fps),
      frameTimeMs: Number(avgFrame.toFixed(1)),
      simTimeMs: Number(avgSim.toFixed(2)),
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      isSoftwareGl,
      activeQuality,
      activeRegionId,
      nearNpcCount,
      districtNpcCount,
    };
  }
}
