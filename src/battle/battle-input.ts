import { createEmptyInput, type BattleInputState } from './battle-types';

export interface BattleInputController {
  readonly state: BattleInputState;
  attach(): void;
  detach(): void;
  consumeBombPressed(): boolean;
  consumePausePressed(): boolean;
  setAutoFire(enabled: boolean): void;
  setExternalFocus(held: boolean): void;
  /** Touch / on-screen Bomb button: rising-edge only, ignores held spam. */
  requestBomb(): void;
  resetTransient(): void;
}

type Listener = {
  target: EventTarget;
  type: string;
  handler: EventListenerOrEventListenerObject;
  options?: AddEventListenerOptions | boolean;
};

/** Touch gestures: relative drag + held auto-fire, 2nd finger held = focus, double-tap = bomb. */
const TAP_MAX_MS = 260;
const TAP_MAX_MOVE_PX = 14;
const DOUBLE_TAP_MS = 360;

export function createBattleInput(
  canvas: HTMLCanvasElement,
  options?: { autoFire?: boolean; logicalWidth?: number; logicalHeight?: number },
): BattleInputController {
  const state = createEmptyInput();
  const keys = new Set<string>();
  const listeners: Listener[] = [];
  let autoFire = Boolean(options?.autoFire);
  let externalFocus = false;
  let bombEdge = false;
  let pauseEdge = false;
  let attached = false;
  let touchFocus = false;
  let touchFiring = false;
  let primaryPointerId: number | null = null;
  let lastTapAt = -Infinity;
  const touchDown = new Map<number, { x: number; y: number; at: number; moved: boolean }>();

  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  const clearGestures = () => {
    touchDown.clear();
    touchFocus = false;
    touchFiring = false;
    primaryPointerId = null;
    lastTapAt = -Infinity;
    state.pointerRelative = false;
    state.pointerX = 0;
    state.pointerY = 0;
  };

  const add = (
    target: EventTarget,
    type: string,
    handler: EventListenerOrEventListenerObject,
    listenerOptions?: AddEventListenerOptions | boolean,
  ) => {
    target.addEventListener(type, handler, listenerOptions);
    listeners.push({ target, type, handler, options: listenerOptions });
  };

  const syncMovement = () => {
    const dx = Number(keys.has('ArrowRight') || keys.has('KeyD')) - Number(keys.has('ArrowLeft') || keys.has('KeyA'));
    const dy = Number(keys.has('ArrowDown') || keys.has('KeyS')) - Number(keys.has('ArrowUp') || keys.has('KeyW'));
    state.moveX = dx;
    state.moveY = dy;
    state.focused = externalFocus || touchFocus || keys.has('ShiftLeft') || keys.has('ShiftRight');
    state.firing = autoFire || touchFiring || keys.has('KeyZ');
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat) {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyZ', 'KeyX'].includes(event.code)) {
      event.preventDefault();
    }
    keys.add(event.code);
    if (event.code === 'KeyX') bombEdge = true;
    if (event.code === 'Escape') {
      event.preventDefault();
      pauseEdge = true;
    }
    syncMovement();
  };

  const onKeyUp = (event: KeyboardEvent) => {
    keys.delete(event.code);
    syncMovement();
  };

  const onBlur = () => {
    keys.clear();
    state.pointerActive = false;
    bombEdge = false;
    clearGestures();
    syncMovement();
  };

  const pointToArena = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    // Map to logical arena units — the backing store may be supersampled.
    const logicalWidth = options?.logicalWidth ?? canvas.width;
    const logicalHeight = options?.logicalHeight ?? canvas.height;
    state.pointerX = ((event.clientX - rect.left) / width) * logicalWidth;
    state.pointerY = ((event.clientY - rect.top) / height) * logicalHeight;
  };

  const touchDisplacementToArena = (
    event: PointerEvent,
    origin: { x: number; y: number },
  ) => {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const logicalWidth = options?.logicalWidth ?? canvas.width;
    const logicalHeight = options?.logicalHeight ?? canvas.height;
    state.pointerX = ((event.clientX - origin.x) / width) * logicalWidth;
    state.pointerY = ((event.clientY - origin.y) / height) * logicalHeight;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button != null && event.button !== 0) return;
    canvas.focus();
    const isTouch = event.pointerType !== 'mouse';
    if (isTouch) {
      touchDown.set(event.pointerId, { x: event.clientX, y: event.clientY, at: nowMs(), moved: false });
      if (touchDown.size >= 2 && !touchFocus) {
        touchFocus = true;
        syncMovement();
      }
    }
    // Only the first finger steers; a 2nd finger is the focus modifier.
    if (primaryPointerId == null || !isTouch) {
      primaryPointerId = event.pointerId;
      state.pointerActive = true;
      state.pointerRelative = isTouch;
      if (isTouch) {
        // Press establishes a zero-displacement anchor: the player never jumps
        // to the finger. Holding the primary touch is the mobile fire control.
        state.pointerX = 0;
        state.pointerY = 0;
        touchFiring = true;
        syncMovement();
      } else {
        pointToArena(event);
      }
    }
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // ignore capture failures in test doubles
    }
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent) => {
    const info = touchDown.get(event.pointerId);
    if (info && !info.moved) {
      if (Math.hypot(event.clientX - info.x, event.clientY - info.y) > TAP_MAX_MOVE_PX) info.moved = true;
    }
    if (!state.pointerActive) {
      if (event.pointerType === 'mouse' && event.buttons === 0) return;
      return;
    }
    if (event.pointerId !== primaryPointerId && event.pointerType !== 'mouse') return;
    if (event.pointerType !== 'mouse' && info) touchDisplacementToArena(event, info);
    else pointToArena(event);
    event.preventDefault();
  };

  const onPointerUp = (event: PointerEvent) => {
    const isTouch = event.pointerType !== 'mouse';
    if (isTouch) {
      const info = touchDown.get(event.pointerId);
      touchDown.delete(event.pointerId);
      if (touchDown.size < 2 && touchFocus) {
        touchFocus = false;
        syncMovement();
      }
      // Quick double-tap (short, near-motionless taps) fires a bomb.
      if (info && !info.moved && nowMs() - info.at <= TAP_MAX_MS) {
        if (nowMs() - lastTapAt <= DOUBLE_TAP_MS) {
          bombEdge = true;
          lastTapAt = -Infinity;
        } else {
          lastTapAt = nowMs();
        }
      }
    }
    if (event.pointerId === primaryPointerId || primaryPointerId == null || !isTouch) {
      primaryPointerId = null;
      state.pointerActive = false;
      state.pointerRelative = false;
      if (isTouch && touchFiring) {
        touchFiring = false;
        syncMovement();
      }
    }
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const onPointerCancel = () => {
    state.pointerActive = false;
    clearGestures();
    syncMovement();
  };

  return {
    state,
    attach() {
      if (attached) return;
      attached = true;
      add(canvas, 'keydown', onKeyDown as EventListener);
      add(canvas, 'keyup', onKeyUp as EventListener);
      add(canvas, 'blur', onBlur as EventListener);
      add(canvas, 'pointerdown', onPointerDown as EventListener);
      add(canvas, 'pointermove', onPointerMove as EventListener);
      add(canvas, 'pointerup', onPointerUp as EventListener);
      add(canvas, 'pointercancel', onPointerCancel as EventListener);
      const view = typeof window !== 'undefined' ? window : undefined;
      if (view && typeof view.addEventListener === 'function') {
        add(view, 'blur', onBlur as EventListener);
      }
      syncMovement();
    },
    detach() {
      if (!attached) return;
      attached = false;
      for (const listener of listeners) {
        listener.target.removeEventListener(listener.type, listener.handler, listener.options);
      }
      listeners.length = 0;
      keys.clear();
      bombEdge = false;
      pauseEdge = false;
      clearGestures();
      Object.assign(state, createEmptyInput());
    },
    consumeBombPressed() {
      const value = bombEdge;
      bombEdge = false;
      return value;
    },
    consumePausePressed() {
      const value = pauseEdge;
      pauseEdge = false;
      return value;
    },
    setAutoFire(enabled: boolean) {
      autoFire = enabled;
      syncMovement();
    },
    setExternalFocus(held: boolean) {
      externalFocus = held;
      syncMovement();
    },
    requestBomb() {
      bombEdge = true;
    },
    resetTransient() {
      keys.clear();
      bombEdge = false;
      pauseEdge = false;
      state.pointerActive = false;
      externalFocus = false;
      clearGestures();
      Object.assign(state, createEmptyInput());
      state.firing = autoFire;
    },
  };
}
