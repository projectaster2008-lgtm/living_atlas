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

  getGrainBumpTexture(kind: 'stone' | 'asphalt' | 'wood' | 'grass' | 'roof', repeat = 8): THREE.CanvasTexture {
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
      ctx.strokeStyle = '#525252';
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
    } else if (kind === 'roof') {
      // Scalloped terracotta / ribbed roof courses
      for (let y = 0; y < size; y += 32) {
        for (let x = 0; x < size; x += 24) {
          const shade = 125 + ((x * 11 + y * 17) % 30);
          ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
          ctx.fillRect(x + 1, y + 2, 22, 28);
          ctx.fillStyle = '#5a5a5a';
          ctx.fillRect(x, y + 29, 24, 3);
          ctx.fillStyle = '#a8a8a8';
          ctx.fillRect(x + 8, y + 2, 6, 26);
        }
      }
    } else if (kind === 'wood') {
      for (let y = 0; y < size; y += 2) {
        const v = 118 + Math.floor(Math.sin(y * 0.25) * 18 + ((y * 17) % 14));
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(0, y, size, 2);
      }
      ctx.fillStyle = '#484848';
      for (let y = 0; y < size; y += 32) {
        ctx.fillRect(0, y, size, 2);
      }
    } else {
      // Subtle plaster / mineral / grass micro-grain
      for (let i = 0; i < 2200; i++) {
        const x = (i * 73) % size;
        const y = (i * 139) % size;
        const v = 104 + ((i * 29) % 52);
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

  getStuccoAlbedoTexture(scope: string, baseColor: string): THREE.CanvasTexture {
    const key = `stucco:${scope}:${baseColor}`;
    const cached = this.textures.get(key) as THREE.CanvasTexture | undefined;
    if (cached) return cached;

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);

    // Subtle sunlit plaster trowel mottling
    for (let i = 0; i < 420; i++) {
      const x = (i * 83) % size;
      const y = (i * 149) % size;
      const w = 10 + (i % 18);
      const h = 6 + (i % 10);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 250, 240, 0.038)' : 'rgba(55, 42, 28, 0.032)';
      ctx.fillRect(x, y, w, h);
    }

    // Subtle horizontal stone-wash bands
    ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
    ctx.fillRect(0, size - 22, size, 22);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    tex.anisotropy = this.maxAnisotropy;
    this.registry.track(tex, scope);
    this.textures.set(key, tex);
    return tex;
  }

  getRoofTileAlbedoTexture(scope: string, roofColor: string): THREE.CanvasTexture {
    const key = `roof-albedo:${scope}:${roofColor}`;
    const cached = this.textures.get(key) as THREE.CanvasTexture | undefined;
    if (cached) return cached;

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = roofColor;
    ctx.fillRect(0, 0, size, size);

    // Sun-baked roof tile courses & ridge highlights
    for (let y = 0; y < size; y += 32) {
      for (let x = 0; x < size; x += 24) {
        const warm = ((x * 7 + y * 13) % 5) === 0;
        ctx.fillStyle = warm ? 'rgba(255, 228, 195, 0.09)' : 'rgba(20, 12, 8, 0.08)';
        ctx.fillRect(x + 2, y + 2, 20, 27);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
        ctx.fillRect(x, y + 29, 24, 3);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    tex.anisotropy = this.maxAnisotropy;
    this.registry.track(tex, scope);
    this.textures.set(key, tex);
    return tex;
  }

  getTimberAlbedoTexture(scope: string, woodColor: string, repeatX = 2, repeatY = 6): THREE.CanvasTexture {
    const key = `timber-albedo:${scope}:${woodColor}:${repeatX}:${repeatY}`;
    const cached = this.textures.get(key) as THREE.CanvasTexture | undefined;
    if (cached) return cached;

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = woodColor;
    ctx.fillRect(0, 0, size, size);

    // Distinct weathered timber planks with wood grain & dark seams
    const plankW = 32;
    for (let x = 0; x < size; x += plankW) {
      const shade = ((x / plankW) * 19) % 3;
      ctx.fillStyle =
        shade === 0 ? 'rgba(255, 242, 220, 0.07)' : shade === 1 ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255,255,255,0.02)';
      ctx.fillRect(x + 2, 0, plankW - 3, size);
      // Grain lines
      for (let g = 0; g < 6; g++) {
        ctx.fillStyle = g % 2 === 0 ? 'rgba(25, 16, 8, 0.08)' : 'rgba(255, 245, 225, 0.04)';
        ctx.fillRect(x + 4 + g * 4, 0, 1.5, size);
      }
      // Plank seam
      ctx.fillStyle = 'rgba(20, 14, 10, 0.34)';
      ctx.fillRect(x, 0, 2, size);
    }
    // Cross plank joints
    ctx.fillStyle = 'rgba(20, 14, 10, 0.25)';
    for (let y = 0; y < size; y += 64) {
      ctx.fillRect(0, y, size, 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = this.maxAnisotropy;
    this.registry.track(tex, scope);
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

    // Subtle stone-curb shoulder trim
    ctx.fillStyle = 'rgba(235, 224, 200, 0.22)';
    ctx.fillRect(4, 0, 5, 256);
    ctx.fillRect(247, 0, 5, 256);

    // Soft multi-scale mineral variation
    for (let i = 0; i < 420; i++) {
      const x = (i * 79) % 256;
      const y = (i * 131) % 256;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.035)';
      ctx.fillRect(x, y, 5, 5);
    }

    // Center dashed lane markings
    ctx.fillStyle = 'rgba(235, 212, 148, 0.82)';
    for (let y = 14; y < 256; y += 64) {
      ctx.fillRect(125, y, 6, 32);
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

    // Ashlar coastal limestone pavers with warm mortar joints
    const step = 32;
    for (let y = 0; y < 256; y += step) {
      const offset = (y / step) % 2 === 0 ? 0 : step / 2;
      for (let x = -step; x < 256 + step; x += step) {
        const v = (x * 13 + y * 29) % 4;
        ctx.fillStyle =
          v === 0 ? 'rgba(0,0,0,0.05)' : v === 1 ? 'rgba(255,250,240,0.07)' : 'rgba(180,150,115,0.04)';
        ctx.fillRect(x + offset + 2, y + 2, step - 4, step - 4);
        ctx.strokeStyle = 'rgba(72, 62, 50, 0.18)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + offset + 1, y + 1, step - 2, step - 2);
      }
    }

    ctx.fillStyle = accentColor;
    ctx.globalAlpha = 0.12;
    ctx.fillRect(0, 0, 256, 5);
    ctx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(7, 7);
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

    // Soft overlapping mineral/sand ripples (subtle rectangles avoid circular dot spotting)
    for (let i = 0; i < 480; i++) {
      const x = (i * 67) % 256;
      const y = (i * 113) % 256;
      const w = 14 + (i % 22);
      const h = 4 + (i % 7);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 248, 232, 0.032)' : 'rgba(70, 56, 38, 0.03)';
      ctx.fillRect(x, y, w, h);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(26, 26);
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
