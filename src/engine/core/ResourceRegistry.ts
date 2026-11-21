import * as THREE from 'three';

type DisposableResource =
  | THREE.BufferGeometry
  | THREE.Material
  | THREE.Texture
  | THREE.InstancedMesh;

interface TrackedEntry {
  resource: DisposableResource;
  scopes: Set<string>;
}

export class ResourceRegistry {
  private entries = new Map<DisposableResource, TrackedEntry>();

  track<T extends DisposableResource>(resource: T, scope = 'global'): T {
    let entry = this.entries.get(resource);
    if (!entry) {
      entry = { resource, scopes: new Set() };
      this.entries.set(resource, entry);
    }
    entry.scopes.add(scope);
    return resource;
  }

  trackObject3D(root: THREE.Object3D, scope: string): void {
    root.traverse((obj) => {
      if ((obj as THREE.InstancedMesh).isInstancedMesh) {
        this.track(obj as THREE.InstancedMesh, scope);
      }
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) this.track(mesh.geometry, scope);
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const mat of mats) {
            this.track(mat, scope);
            for (const val of Object.values(mat)) {
              if (val && typeof val === 'object' && (val as THREE.Texture).isTexture) {
                this.track(val as THREE.Texture, scope);
              }
            }
          }
        }
      }
    });
  }

  disposeScope(scope: string): number {
    let disposedCount = 0;
    for (const [res, entry] of Array.from(this.entries.entries())) {
      if (!entry.scopes.has(scope)) continue;
      entry.scopes.delete(scope);
      if (entry.scopes.size === 0) {
        res.dispose();
        this.entries.delete(res);
        disposedCount++;
      }
    }
    return disposedCount;
  }

  disposeAll(): void {
    for (const res of this.entries.keys()) {
      res.dispose();
    }
    this.entries.clear();
  }

  getTrackedCount(): number {
    return this.entries.size;
  }
}
