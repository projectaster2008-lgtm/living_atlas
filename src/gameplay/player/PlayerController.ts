import { clamp, damp, dampAngle } from '../../shared/math/prng';
import { BuildingDef, InteriorDef, PlayerRuntimeState, RegionManifest } from '../../shared/types/world';
import { InputHub } from '../input/InputHub';

export interface ColliderBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function buildBuildingColliders(buildings: BuildingDef[]): ColliderBox[] {
  return buildings.map((b) => {
    const cos = Math.abs(Math.cos(b.yaw));
    const sin = Math.abs(Math.sin(b.yaw));
    const halfW = (b.size.x * cos + b.size.z * sin) * 0.5 + 0.45;
    const halfD = (b.size.x * sin + b.size.z * cos) * 0.5 + 0.45;
    return {
      minX: b.position.x - halfW,
      maxX: b.position.x + halfW,
      minZ: b.position.z - halfD,
      maxZ: b.position.z + halfD,
    };
  });
}

export function resolveCircleBoxCollision(
  pos: { x: number; z: number },
  radius: number,
  boxes: ColliderBox[],
): boolean {
  let hit = false;
  for (const box of boxes) {
    const closestX = clamp(pos.x, box.minX, box.maxX);
    const closestZ = clamp(pos.z, box.minZ, box.maxZ);
    const dx = pos.x - closestX;
    const dz = pos.z - closestZ;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      const d = Math.sqrt(d2);
      if (d > 0.0001) {
        const push = radius - d;
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
      } else {
        // Inside box: push out along nearest edge
        const leftPen = Math.abs(pos.x - box.minX);
        const rightPen = Math.abs(box.maxX - pos.x);
        const topPen = Math.abs(pos.z - box.minZ);
        const botPen = Math.abs(box.maxZ - pos.z);
        const m = Math.min(leftPen, rightPen, topPen, botPen);
        if (m === leftPen) pos.x = box.minX - radius;
        else if (m === rightPen) pos.x = box.maxX + radius;
        else if (m === topPen) pos.z = box.minZ - radius;
        else pos.z = box.maxZ + radius;
      }
    }
  }
  return hit;
}

export class PlayerController {
  public state: PlayerRuntimeState;
  private colliders: ColliderBox[] = [];
  private jumpBufferTimer = 0;
  private coyoteTimer = 0;
  private readonly radius = 0.55;

  constructor() {
    this.state = {
      regionId: 'solara-bay',
      interiorId: null,
      exteriorReturnPosition: { x: 0, y: 0, z: 26 },
      exteriorReturnYaw: Math.PI,
      position: { x: 0, y: 0, z: 26 },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: Math.PI,
      isGrounded: true,
      mode: 'foot',
      activeVehicleId: null,
      gaitPhase: 0,
      squashY: 1,
    };
  }

  configureRegion(manifest: RegionManifest): void {
    this.colliders = buildBuildingColliders(manifest.buildings);
    if (manifest.id !== 'gateway') {
      this.colliders.push({ minX: -3.5, maxX: 3.5, minZ: -3.5, maxZ: 3.5 });
    }
  }

  step(
    dt: number,
    input: InputHub,
    cameraYaw: number,
    manifest: RegionManifest,
    activeInterior: InteriorDef | null,
  ): { steppedFoot: boolean } {
    let steppedFoot = false;

    if (this.state.mode !== 'foot') {
      return { steppedFoot };
    }

    const move = input.getMoveAxes();
    const jumpPressed = input.consumeJustPressed('Space');
    if (jumpPressed) {
      this.jumpBufferTimer = 0.12;
    } else {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    }

    if (this.state.isGrounded) {
      this.coyoteTimer = 0.1;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }

    // Camera-relative movement: forward is (-sin(cameraYaw), -cos(cameraYaw)), right is (cos(cameraYaw), -sin(cameraYaw))
    const sinY = Math.sin(cameraYaw);
    const cosY = Math.cos(cameraYaw);
    const worldX = move.x * cosY - move.z * sinY;
    const worldZ = -move.x * sinY - move.z * cosY;

    const maxSpeed = move.sprint ? 7.6 : 4.2;
    const targetVx = worldX * maxSpeed;
    const targetVz = worldZ * maxSpeed;
    const accel = this.state.isGrounded ? 14 : 6;

    this.state.velocity.x = damp(this.state.velocity.x, targetVx, accel, dt);
    this.state.velocity.z = damp(this.state.velocity.z, targetVz, accel, dt);

    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
      this.state.velocity.y = 7.4;
      this.state.isGrounded = false;
      this.jumpBufferTimer = 0;
      this.coyoteTimer = 0;
      this.state.squashY = 1.18;
    }

    // Gravity
    this.state.velocity.y -= 21 * dt;

    this.state.position.x += this.state.velocity.x * dt;
    this.state.position.z += this.state.velocity.z * dt;
    this.state.position.y += this.state.velocity.y * dt;

    // Ground & bounds
    if (activeInterior) {
      const halfW = activeInterior.roomSize.x * 0.5 - 0.85;
      const halfD = activeInterior.roomSize.z * 0.5 - 0.85;
      this.state.position.x = clamp(this.state.position.x, -halfW, halfW);
      this.state.position.z = clamp(this.state.position.z, -halfD, halfD);
    } else {
      resolveCircleBoxCollision(this.state.position, this.radius, this.colliders);
      const r = Math.hypot(this.state.position.x, this.state.position.z);
      const maxR = manifest.boundsRadius - 2;
      if (r > maxR) {
        this.state.position.x = (this.state.position.x / r) * maxR;
        this.state.position.z = (this.state.position.z / r) * maxR;
      }
      // Keep out of deep ocean water in Solara Bay
      if (manifest.hasCoastalOcean && this.state.position.z < -72) {
        this.state.position.z = -72;
      }
    }

    if (this.state.position.y <= 0) {
      if (!this.state.isGrounded && this.state.velocity.y < -3) {
        this.state.squashY = 0.82;
        steppedFoot = true;
      }
      this.state.position.y = 0;
      this.state.velocity.y = 0;
      this.state.isGrounded = true;
    }

    this.state.squashY = damp(this.state.squashY, 1.0, 14, dt);

    const horizSpeed = Math.hypot(this.state.velocity.x, this.state.velocity.z);
    if (horizSpeed > 0.35) {
      const targetYaw = Math.atan2(this.state.velocity.x, this.state.velocity.z);
      this.state.yaw = dampAngle(this.state.yaw, targetYaw, 14, dt);
      const prevPhase = Math.floor(this.state.gaitPhase / Math.PI);
      this.state.gaitPhase += horizSpeed * dt * 2.4;
      const nextPhase = Math.floor(this.state.gaitPhase / Math.PI);
      if (this.state.isGrounded && nextPhase !== prevPhase) {
        steppedFoot = true;
      }
    }

    return { steppedFoot };
  }
}
