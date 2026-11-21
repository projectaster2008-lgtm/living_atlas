import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { QualityTier } from '../../shared/types/world';

export function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class EngineContext {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly isSoftwareGl: boolean;
  public activeQuality: QualityTier;
  private pmremEnvTarget: THREE.WebGLRenderTarget | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private frameHandle = 0;
  private timeoutHandle = 0;
  private disposed = false;
  private contextLost = false;
  private onContextLost: (e: Event) => void;
  private onContextRestored: () => void;

  constructor(container: HTMLElement, initialQuality: QualityTier) {
    this.isSoftwareGl = detectSoftwareWebGL();
    this.activeQuality = this.isSoftwareGl ? 'low' : initialQuality;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl && this.activeQuality === 'high',
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.90;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.applyQuality(this.activeQuality);

    const width = Math.max(1, container.clientWidth || window.innerWidth);
    const height = Math.max(1, container.clientHeight || window.innerHeight);
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, width / height, 0.25, 420);

    // Zero-dependency PBR reflections on all hardware & software WebGL
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.pmremEnvTarget = pmrem.fromScene(roomEnv, 0.04);
    this.scene.environment = this.pmremEnvTarget.texture;
    roomEnv.dispose();
    pmrem.dispose();

    this.onContextLost = (e: Event) => {
      e.preventDefault();
      this.contextLost = true;
    };
    this.onContextRestored = () => {
      this.contextLost = false;
      this.applyQuality(this.activeQuality);
    };
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);

    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize(container);
    });
    this.resizeObserver.observe(container);
  }

  applyQuality(tier: QualityTier): void {
    const effective: QualityTier = this.isSoftwareGl ? 'low' : tier;
    this.activeQuality = effective;

    const dpr = window.devicePixelRatio || 1;
    if (effective === 'low') {
      this.renderer.setPixelRatio(Math.min(dpr, 1.0));
      this.renderer.shadowMap.enabled = false;
    } else if (effective === 'medium') {
      this.renderer.setPixelRatio(Math.min(dpr, 1.25));
      this.renderer.shadowMap.enabled = true;
    } else {
      this.renderer.setPixelRatio(Math.min(dpr, 2.0));
      this.renderer.shadowMap.enabled = true;
    }
  }

  prewarmShaders(): void {
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  handleResize(container: HTMLElement): void {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (!this.contextLost && this.scene.children.length > 0) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  startLoop(onTick: (rawDtSec: number) => void): void {
    let lastTime = performance.now();

    const afterDraw = (cb: () => void) => {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      if (typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (this.disposed) {
            if (sync) gl.deleteSync(sync);
            return;
          }
          const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
          if (state === gl.UNSIGNALED) {
            this.timeoutHandle = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            this.timeoutHandle = window.setTimeout(cb, 80);
          }
        };
        this.timeoutHandle = window.setTimeout(poll, 5);
      } else {
        this.timeoutHandle = window.setTimeout(cb, 80);
      }
    };

    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      const rawDt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      if (!this.contextLost) {
        onTick(rawDt);
        this.renderer.render(this.scene, this.camera);
      }

      if (this.isSoftwareGl && !this.contextLost) {
        afterDraw(tick);
      } else {
        this.frameHandle = requestAnimationFrame(tick);
      }
    };

    this.frameHandle = requestAnimationFrame(tick);
  }

  captureScreenshotDataUrl(): string {
    if (!this.contextLost) {
      this.renderer.render(this.scene, this.camera);
    }
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameHandle);
    clearTimeout(this.timeoutHandle);
    this.resizeObserver?.disconnect();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.pmremEnvTarget?.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
