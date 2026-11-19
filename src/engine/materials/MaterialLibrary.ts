import * as THREE from 'three';
import { ResourceRegistry } from '../core/ResourceRegistry';

export class MaterialLibrary {
  private registry: ResourceRegistry;
  private maxAnisotropy: number;
  private cache = new Map<string, THREE.Material>();
  private textures = new Map<string, THREE.Texture>();

  constructor(registry: ResourceRegistry, renderer: THREE.WebGLRenderer) {
    this.registry = registry;
    this.maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }

  getContactShadowMaterial(): THREE.MeshBasicMaterial {
    const key = 'global:contact-shadow';
    const existing = this.cache.get(key) as THREE.MeshBasicMaterial | undefined;
    if (existing) return existing;

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.48)');
    grad.addColorStop(0.6, 'rgba(0, 0, 0, 0.22)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.registry.track(tex, 'global');

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    });
    this.registry.track(mat, 'global');
    this.cache.set(key, mat);
    return mat;
  }

  getGrainBumpTexture(kind: 'stone' | 'asphalt' | 'wood' | 'grass', repeat = 8): THREE.CanvasTexture {
    const key = `bump:${kind}:${repeat}`;
    const cached = this.textures.get(key) as THREE.CanvasTexture | undefined;
    if (cached) return cached;

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);

    if (kind === 'stone') {
      ctx.strokeStyle = '#505050';
      ctx.lineWidth = 2;
      const step = 32;
      for (let y = 0; y < size; y += step) {
        const offset = (y / step) % 2 === 0 ? 0 : step / 2;
        for (let x = -step; x < size + step; x += step) {
          const shade = 115 + ((x * 7 + y * 13) % 35);
          ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
          ctx.fillRect(x + offset + 2, y + 2, step - 4, step - 4);
        }
      }
    } else if (kind === 'wood') {
      for (let y = 0; y < size; y += 2) {
        const v = 115 + Math.floor(Math.sin(y * 0.25) * 20 + ((y * 17) % 15));
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(0, y, size, 2);
      }
      ctx.fillStyle = '#4a4a4a';
      for (let y = 0; y < size; y += 32) {
        ctx.fillRect(0, y, size, 2);
      }
    } else {
      // Asphalt / grass micro-grain
      for (let i = 0; i < 2400; i++) {
        const x = (i * 73) % size;
        const y = (i * 139) % size;
        const v = 90 + ((i * 29) % 75);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x, y, 2, 2);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
    tex.anisotropy = this.maxAnisotropy;
    // Data/bump map stays in linear NoColorSpace
    this.registry.track(tex, 'global');
    this.textures.set(key, tex);
    return tex;
  }

  getRoadAlbedoTexture(scope: string, baseColor: string): THREE.CanvasTexture {
    const key = `road-albedo:${scope}:${baseColor}`;
    const cached = this.textures.get(key) as THREE.CanvasTexture | undefined;
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 256, 256);

    // Subtle shoulder curb strips
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.fillRect(6, 0, 4, 256);
    ctx.fillRect(246, 0, 4, 256);

    // Soft multi-scale mineral tinting (avoids pixel moiré patterns)
    for (let i = 0; i < 360; i++) {
      const x = (i * 79) % 256;
      const y = (i * 131) % 256;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.035)';
      ctx.fillRect(x, y, 6, 6);
    }

    // Center dashed lane markings
    ctx.fillStyle = 'rgba(235, 212, 148, 0.85)';
    for (let y = 14; y < 256; y += 64) {
      ctx.fillRect(124, y, 8, 34);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 10);
    tex.anisotropy = this.maxAnisotropy;
    this.registry.track(tex, scope);
    this.textures.set(key, tex);
    return tex;
  }

  getPaverAlbedoTexture(scope: string, baseColor: string, accentColor: string): THREE.CanvasTexture {
    const key = `paver-albedo:${scope}:${baseColor}:${accentColor}`;
    const cached = this.textures.get(key) as THREE.CanvasTexture | undefined;
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 256, 256);

    // Warm stone paver grid with subtle value variation
    const step = 32;
    for (let y = 0; y < 256; y += step) {
      const offset = (y / step) % 2 === 0 ? 0 : step / 2;
      for (let x = -step; x < 256 + step; x += step) {
        const shade = ((x * 13 + y * 29) % 3) === 0 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
        ctx.fillStyle = shade;
        ctx.fillRect(x + offset + 2, y + 2, step - 4, step - 4);
        ctx.strokeStyle = 'rgba(60, 52, 42, 0.16)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + offset + 1, y + 1, step - 2, step - 2);
      }
    }

    ctx.fillStyle = accentColor;
    ctx.globalAlpha = 0.14;
    ctx.fillRect(0, 0, 256, 6);
    ctx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 6);
    tex.anisotropy = this.maxAnisotropy;
    this.registry.track(tex, scope);
    this.textures.set(key, tex);
    return tex;
  }

  getTerrainAlbedoTexture(scope: string, baseColor: string): THREE.CanvasTexture {
    const key = `terrain-albedo:${scope}:${baseColor}`;
    const cached = this.textures.get(key) as THREE.CanvasTexture | undefined;
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 240; i++) {
      const x = (i * 67) % 256;
      const y = (i * 113) % 256;
      const r = 8 + (i % 14);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.04)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(22, 22);
    tex.anisotropy = this.maxAnisotropy;
    this.registry.track(tex, scope);
    this.textures.set(key, tex);
    return tex;
  }

  getStandardMaterial(
    key: string,
    params: THREE.MeshStandardMaterialParameters,
    scope: string,
  ): THREE.MeshStandardMaterial {
    const fullKey = `${scope}:${key}`;
    const existing = this.cache.get(fullKey) as THREE.MeshStandardMaterial | undefined;
    if (existing) return existing;
    const mat = new THREE.MeshStandardMaterial(params);
    this.registry.track(mat, scope);
    this.cache.set(fullKey, mat);
    return mat;
  }

  getGlassMaterial(scope: string, tint = '#8cc2d9'): THREE.MeshPhysicalMaterial {
    const fullKey = `${scope}:glass:${tint}`;
    const existing = this.cache.get(fullKey) as THREE.MeshPhysicalMaterial | undefined;
    if (existing) return existing;
    const mat = new THREE.MeshPhysicalMaterial({
      color: tint,
      roughness: 0.1,
      metalness: 0.15,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      reflectivity: 0.9,
      envMapIntensity: 1.25,
    });
    this.registry.track(mat, scope);
    this.cache.set(fullKey, mat);
    return mat;
  }

  clearScopeCache(scope: string): void {
    for (const k of Array.from(this.cache.keys())) {
      if (k.startsWith(`${scope}:`)) this.cache.delete(k);
    }
    for (const k of Array.from(this.textures.keys())) {
      if (k.includes(`:${scope}:`)) this.textures.delete(k);
    }
  }
}
