import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { ResourceRegistry } from '../core/ResourceRegistry';

export interface LoadedGltfAsset {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

export class AssetLoader {
  private gltfLoader = new GLTFLoader();
  private cache = new Map<string, LoadedGltfAsset>();
  private registry: ResourceRegistry;

  constructor(registry: ResourceRegistry) {
    this.registry = registry;
  }

  async loadGltf(url: string, scope: string): Promise<LoadedGltfAsset> {
    const existing = this.cache.get(url);
    if (existing) {
      const cloned = SkeletonUtils.clone(existing.scene) as THREE.Group;
      this.registry.trackObject3D(cloned, scope);
      return { scene: cloned, animations: existing.animations };
    }

    const gltf = await this.gltfLoader.loadAsync(url);
    gltf.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    this.registry.trackObject3D(gltf.scene, scope);
    this.cache.set(url, { scene: gltf.scene, animations: gltf.animations });
    const cloned = SkeletonUtils.clone(gltf.scene) as THREE.Group;
    return { scene: cloned, animations: gltf.animations };
  }

  clearScope(scope: string): void {
    this.registry.disposeScope(scope);
    if (scope !== 'global') {
      // Cached base templates are cleared if their scope was disposed
      this.cache.clear();
    }
  }
}
