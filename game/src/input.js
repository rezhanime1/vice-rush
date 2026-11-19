// Keyboard and pointer input. Held keys give movement and driving; one-shot
// presses (start, enter a car, punch, reload, pause) are queued as bit flags
// and taken once by the loop, so a press between two frames is never lost and
// never counted twice. The mouse is tracked for aiming and shooting.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_RELOAD = 16;
export const ACTION_NEWGAME = 32;
export const ACTION_MUTE = 64;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);

export function createInput(target) {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let run = false;
  let handbrake = false;
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let click = false;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (RUN.has(event.code)) run = true;
    else if (event.code === 'KeyE') {
      if (!event.repeat) actions |= ACTION_ENTER;
    } else if (event.code === 'KeyR') {
      if (!event.repeat) actions |= ACTION_RELOAD;
    } else if (event.code === 'KeyN') {
      if (!event.repeat) actions |= ACTION_NEWGAME;
    } else if (event.code === 'KeyM') {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (RUN.has(event.code)) run = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of
  // everything on blur.
  window.addEventListener('blur', () => {
    up = false;
    down = false;
    left = false;
    right = false;
    run = false;
    handbrake = false;
  });
  // Space is the handbrake while driving and the punch on foot: held state for
  // the car, one-shot punch for the walker, both read by the loop.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && !event.repeat) {
      handbrake = true;
      actions |= ACTION_PUNCH;
    }
  });
  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space') handbrake = false;
  });
  target.addEventListener('pointermove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
  });
  target.addEventListener('pointerdown', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    if (event.button === 0) click = true;
  });

  return {
    /** Movement axes, each -1, 0 or 1. */
    move() {
      return { x: (right ? 1 : 0) - (left ? 1 : 0), y: (down ? 1 : 0) - (up ? 1 : 0) };
    },
    up: () => up,
    down: () => down,
    left: () => left,
    right: () => right,
    run: () => run,
    handbrake: () => handbrake,
    /** The mouse position in CSS pixels, for aiming. */
    mouse() {
      return { x: mouseX, y: mouseY };
    },
    /** Whether the mouse was clicked since the last call (one-shot). */
    takeClick() {
      const taken = click;
      click = false;
      return taken;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
