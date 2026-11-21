import * as THREE from 'three';
import { clamp, damp } from '../../shared/math/prng';
import { CameraMode, Vec3 } from '../../shared/types/world';
import { InputHub } from '../../gameplay/input/InputHub';
import { ColliderBox } from '../../gameplay/player/PlayerController';

const _desiredPos = new THREE.Vector3();
const _desiredLook = new THREE.Vector3();
const _camForward = new THREE.Vector3();
const _camRight = new THREE.Vector3();

export interface InteriorCameraBounds {
  halfW: number;
  height: number;
  halfD: number;
}

export class CameraRig {
  public yaw = 0;
  public pitch = 0.32;
  public distance = 7.2;
  public mode: CameraMode = 'third-person';
  public observerPos = new THREE.Vector3(0, 8, 24);
  private currentPos = new THREE.Vector3(0, 4.5, 34);
  private currentLook = new THREE.Vector3(0, 1.4, 24);
  private titleTime = 0;

  reset(): void {
    this.yaw = 0;
    this.pitch = 0.32;
    this.distance = 7.2;
    this.mode = 'third-person';
    this.observerPos.set(0, 8, 24);
  }

  snapToTarget(target: Vec3, yaw: number, interiorBounds: InteriorCameraBounds | null = null): void {
    this.yaw = yaw + Math.PI;
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const dist = interiorBounds ? 3.4 : this.distance;
    const horiz = interiorBounds ? Math.cos(this.pitch) * dist : dist;
    const vert = interiorBounds ? Math.sin(this.pitch) * dist + 1.55 : 3.2;

    this.currentPos.set(
      target.x + sinY * horiz,
      target.y + vert,
      target.z + cosY * horiz,
    );
    if (interiorBounds) {
      this.clampToInterior(this.currentPos, interiorBounds);
    }
    this.currentLook.set(target.x, target.y + 1.4, target.z);
  }

  private clampToInterior(pos: THREE.Vector3, bounds: InteriorCameraBounds): void {
    const margin = 0.65;
    pos.x = clamp(pos.x, -(bounds.halfW - margin), bounds.halfW - margin);
    pos.z = clamp(pos.z, -(bounds.halfD - margin), bounds.halfD - margin);
    pos.y = clamp(pos.y, 0.9, Math.max(1.2, bounds.height - 0.55));
  }

  updateTitleFlyover(camera: THREE.PerspectiveCamera, dt: number): void {
    this.titleTime += dt * 0.14;
    const radius = 48;
    const cx = Math.sin(this.titleTime) * radius;
    const cz = -16 + Math.cos(this.titleTime) * 38;
    camera.position.set(cx, 17 + Math.sin(this.titleTime * 1.4) * 2.5, cz);
    camera.lookAt(0, 4.5, -24);
  }

  updateGameplay(
    camera: THREE.PerspectiveCamera,
    dt: number,
    playerPos: Vec3,
    playerYaw: number,
    isDriving: boolean,
    isInterior: boolean,
    input: InputHub,
    sensitivity: number,
    colliders: ColliderBox[],
    interiorBounds: InteriorCameraBounds | null = null,
  ): void {
    const look = input.consumeLookDelta();
    if (look.dx !== 0 || look.dy !== 0) {
      this.yaw -= look.dx * 0.0038 * sensitivity;
      this.pitch = clamp(this.pitch + look.dy * 0.0032 * sensitivity, -0.15, 1.15);
    }

    // Keyboard Q/C fallback orbit for accessibility
    if (this.mode !== 'observer') {
      if (input.isHeld('KeyQ')) this.yaw += 1.8 * dt;
      if (input.isHeld('KeyC')) this.yaw -= 1.8 * dt;
    }

    if (look.wheel !== 0) {
      this.distance = clamp(this.distance + look.wheel * 0.005, 3.6, 14.0);
    }

    if (this.mode === 'observer') {
      const move = input.getMoveAxes();
      _camForward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      _camRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const flySpeed = move.sprint ? 26 : 13;
      this.observerPos.addScaledVector(_camForward, move.z * flySpeed * dt);
      this.observerPos.addScaledVector(_camRight, move.x * flySpeed * dt);
      if (input.isHeld('KeyR') || input.isHeld('Space')) this.observerPos.y += flySpeed * 0.7 * dt;
      if (input.isHeld('KeyF')) this.observerPos.y = Math.max(1.2, this.observerPos.y - flySpeed * 0.7 * dt);

      _desiredPos.copy(this.observerPos);
      _desiredLook
        .copy(this.observerPos)
        .addScaledVector(_camForward, 12);
      _desiredLook.y += -Math.sin(this.pitch) * 10;

      this.currentPos.x = damp(this.currentPos.x, _desiredPos.x, 12, dt);
      this.currentPos.y = damp(this.currentPos.y, _desiredPos.y, 12, dt);
      this.currentPos.z = damp(this.currentPos.z, _desiredPos.z, 12, dt);
      this.currentLook.x = damp(this.currentLook.x, _desiredLook.x, 12, dt);
      this.currentLook.y = damp(this.currentLook.y, _desiredLook.y, 12, dt);
      this.currentLook.z = damp(this.currentLook.z, _desiredLook.z, 12, dt);
      camera.position.copy(this.currentPos);
      camera.lookAt(this.currentLook);
      return;
    }

    let targetDist = isInterior ? 3.4 : isDriving ? Math.max(7.6, this.distance + 1.8) : this.distance;
    if (this.mode === 'shoulder') targetDist = isInterior ? 2.6 : 3.2;

    if (isDriving) {
      // Gently align behind vehicle when moving
      const idealYaw = playerYaw + Math.PI;
      const diff = Math.atan2(Math.sin(idealYaw - this.yaw), Math.cos(idealYaw - this.yaw));
      this.yaw += diff * (1 - Math.exp(-1.5 * dt));
    }

    const horiz = Math.cos(this.pitch) * targetDist;
    const vert = Math.sin(this.pitch) * targetDist + (isDriving ? 2.1 : isInterior ? 1.55 : 1.75);

    _desiredLook.set(playerPos.x, playerPos.y + (isDriving ? 1.3 : 1.45), playerPos.z);
    _desiredPos.set(
      playerPos.x + Math.sin(this.yaw) * horiz,
      Math.max(0.8, playerPos.y + vert),
      playerPos.z + Math.cos(this.yaw) * horiz,
    );

    // Wall pull-in check against building colliders or interior room walls
    if (isInterior && interiorBounds) {
      this.clampToInterior(_desiredPos, interiorBounds);
    } else if (!isInterior) {
      for (const box of colliders) {
        if (
          _desiredPos.x > box.minX - 0.5 &&
          _desiredPos.x < box.maxX + 0.5 &&
          _desiredPos.z > box.minZ - 0.5 &&
          _desiredPos.z < box.maxZ + 0.5
        ) {
          _desiredPos.x = THREE.MathUtils.lerp(playerPos.x, _desiredPos.x, 0.45);
          _desiredPos.z = THREE.MathUtils.lerp(playerPos.z, _desiredPos.z, 0.45);
          _desiredPos.y += 2.5;
          break;
        }
      }
    }

    this.currentPos.x = damp(this.currentPos.x, _desiredPos.x, 12, dt);
    this.currentPos.y = damp(this.currentPos.y, _desiredPos.y, 12, dt);
    this.currentPos.z = damp(this.currentPos.z, _desiredPos.z, 12, dt);
    if (isInterior && interiorBounds) {
      this.clampToInterior(this.currentPos, interiorBounds);
    }
    this.currentLook.x = damp(this.currentLook.x, _desiredLook.x, 15, dt);
    this.currentLook.y = damp(this.currentLook.y, _desiredLook.y, 15, dt);
    this.currentLook.z = damp(this.currentLook.z, _desiredLook.z, 15, dt);

    camera.position.copy(this.currentPos);
    camera.lookAt(this.currentLook);
  }
}
