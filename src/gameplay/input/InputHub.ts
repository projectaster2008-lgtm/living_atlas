export interface VirtualStick {
  x: number;
  y: number;
}

export class InputHub {
  private held = new Set<string>();
  private justPressed = new Set<string>();
  private mouseDown = false;
  private lookDeltaX = 0;
  private lookDeltaY = 0;
  private wheelDelta = 0;
  private virtualMove: VirtualStick = { x: 0, y: 0 };
  private cleanupFns: Array<() => void> = [];
  private attachedElement: HTMLElement | null = null;
  public enabled = true;

  attach(canvasElement: HTMLElement): void {
    this.detach();
    this.attachedElement = canvasElement;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const code = e.code;
      if (!this.held.has(code)) {
        this.justPressed.add(code);
      }
      this.held.add(code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.held.delete(e.code);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 0 || e.button === 2) {
        this.mouseDown = true;
      }
    };

    const onPointerUp = () => {
      this.mouseDown = false;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (document.pointerLockElement === canvasElement || this.mouseDown) {
        this.lookDeltaX += e.movementX;
        this.lookDeltaY += e.movementY;
      }
    };

    const onWheel = (e: WheelEvent) => {
      this.wheelDelta += e.deltaY;
    };

    const onBlur = () => {
      this.clearAll();
    };

    const onVisibility = () => {
      if (document.hidden) this.clearAll();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    canvasElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointermove', onPointerMove);
    canvasElement.addEventListener('wheel', onWheel, { passive: true });

    this.cleanupFns.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      canvasElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointermove', onPointerMove);
      canvasElement.removeEventListener('wheel', onWheel);
    });
  }

  detach(): void {
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns = [];
    this.attachedElement = null;
    this.clearAll();
  }

  clearAll(): void {
    this.held.clear();
    this.justPressed.clear();
    this.mouseDown = false;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.wheelDelta = 0;
    this.virtualMove = { x: 0, y: 0 };
  }

  setVirtualStick(x: number, y: number): void {
    this.virtualMove.x = x;
    this.virtualMove.y = y;
  }

  triggerVirtualAction(code: string): void {
    this.justPressed.add(code);
  }

  isHeld(code: string): boolean {
    return this.enabled && this.held.has(code);
  }

  consumeJustPressed(code: string): boolean {
    if (!this.enabled) return false;
    if (this.justPressed.has(code)) {
      this.justPressed.delete(code);
      return true;
    }
    return false;
  }

  getMoveAxes(): { x: number; z: number; sprint: boolean } {
    if (!this.enabled) return { x: 0, z: 0, sprint: false };
    let x = this.virtualMove.x;
    let z = this.virtualMove.y;
    if (this.held.has('KeyA') || this.held.has('ArrowLeft')) x -= 1;
    if (this.held.has('KeyD') || this.held.has('ArrowRight')) x += 1;
    if (this.held.has('KeyW') || this.held.has('ArrowUp')) z += 1;
    if (this.held.has('KeyS') || this.held.has('ArrowDown')) z -= 1;

    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    const sprint = this.held.has('ShiftLeft') || this.held.has('ShiftRight');
    return { x, z, sprint };
  }

  consumeLookDelta(): { dx: number; dy: number; wheel: number } {
    const out = {
      dx: this.lookDeltaX,
      dy: this.lookDeltaY,
      wheel: this.wheelDelta,
    };
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.wheelDelta = 0;
    return out;
  }

  endFrame(): void {
    this.justPressed.clear();
  }

  getAttachedElement(): HTMLElement | null {
    return this.attachedElement;
  }
}
