// Drawing only: the world's state and the current screen in, pixels out. The
// camera follows the player across Solmar Bay and zooms out a little when they
// drive fast; the HUD carries the cash, the wanted stars, the health, the
// mission and a minimap; the panels carry the title, the pause and the
// busted/wasted/failed/story screens. Nothing here changes the world.
import { FONT, PALETTE, PLACES, PLAYER, WORLD } from './config.js';
import { drawCar } from './vehicles.js';
import { drawPed } from './pedestrians.js';
import { drawFootCop } from './police.js';
import { drawBullets, drawParticles } from './combat.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_FAILED = 'failed';
export const SCREEN_STORY = 'story';

/** How much of the world the camera shows at zoom 1, in world units. */
const VIEW_W = 1120;
const VIEW_H = 630;

function starPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(angle) * rad;
    const py = y + Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { x: 0, y: 0, scale: 1 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, bold) {
    const key = `${size}:${bold ? 1 : 0}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  }

  function drawWorld(state) {
    const { x: cx, y: cy, zoom } = state.camera;
    const scale = Math.min(canvas.width / VIEW_W, canvas.height / VIEW_H) * zoom;
    view.scale = scale;
    view.x = cx - canvas.width / scale / 2;
    view.y = cy - canvas.height / scale / 2;
    ctx.setTransform(scale, 0, 0, scale, -view.x * scale, -view.y * scale);
    state.city.drawStatic(ctx, { x: view.x, y: view.y, width: canvas.width / scale, height: canvas.height / scale });

    // The mission beacon: a pulsing ring and a beam over the target.
    const target = state.missionTarget ? state.missionTarget() : null;
    if (target) {
      const pulse = 1 + Math.sin(state.time * 4) * 0.12;
      ctx.strokeStyle = PALETTE.mission;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(target.x, target.y, 34 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 210, 62, 0.25)';
      ctx.beginPath();
      ctx.arc(target.x, target.y, 30 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.mission;
      ctx.beginPath();
      ctx.moveTo(target.x, target.y - 64);
      ctx.lineTo(target.x - 10, target.y - 44);
      ctx.lineTo(target.x + 10, target.y - 44);
      ctx.closePath();
      ctx.fill();
    }

    // Skid marks under everything that drives.
    ctx.fillStyle = 'rgba(20, 20, 24, 0.45)';
    for (const car of state.cars) {
      for (const skid of car.skids) {
        ctx.beginPath();
        ctx.arc(skid.x, skid.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const ped of state.peds) drawPed(ctx, ped);
    for (const cop of state.police.cops) drawFootCop(ctx, cop);
    for (const car of state.cars) {
      if (car === state.player.inCar) {
        // A white ring marks the player's own car.
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(car.x, car.y, 34, 26, car.angle, 0, Math.PI * 2);
        ctx.stroke();
      }
      drawCar(ctx, car);
    }
    // The player on foot: teal jacket, dark jeans, easy to spot.
    const player = state.player;
    if (!player.inCar) {
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(player.angle);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath();
      ctx.ellipse(0, 4, 10, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = player.invulnerable > 0 && Math.floor(player.invulnerable * 10) % 2 === 0 ? 'rgba(45, 180, 160, 0.5)' : '#2db4a0';
      ctx.beginPath();
      ctx.roundRect(-8, -8, 16, 16, 7);
      ctx.fill();
      ctx.fillStyle = '#f0c8a0';
      ctx.beginPath();
      ctx.arc(11, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2f2f38';
      ctx.beginPath();
      ctx.arc(11, -2, 5, 0, Math.PI);
      ctx.fill();
      ctx.restore();
    }
    drawBullets(ctx, state.bullets);
    drawParticles(ctx, state.particles);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function drawStars(stars, x, y) {
    for (let i = 0; i < 5; i += 1) {
      starPath(ctx, x + i * 34, y, 13);
      ctx.fillStyle = i < stars ? '#ffd23e' : 'rgba(255, 255, 255, 0.25)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawMinimap(state) {
    const w = 208;
    const h = 156;
    const x = 16;
    const y = canvas.height - h - 16;
    const sx = w / WORLD.width;
    const sy = h / WORLD.height;
    ctx.fillStyle = PALETTE.panel;
    ctx.beginPath();
    ctx.roundRect(x - 6, y - 6, w + 12, h + 12, 8);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = '#5d8a4a';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#eed9a4';
    ctx.fillRect(x, y + 1760 * sy, w, h - 1760 * sy);
    ctx.fillStyle = '#2f9dc4';
    ctx.fillRect(x, y + 1872 * sy, w, h - 1872 * sy);
    ctx.strokeStyle = '#3c414d';
    ctx.lineWidth = 3;
    for (const rx of [320, 640, 960, 1280, 1600, 1920, 2240]) {
      ctx.beginPath();
      ctx.moveTo(x + rx * sx, y);
      ctx.lineTo(x + rx * sx, y + h);
      ctx.stroke();
    }
    for (const ry of [320, 640, 960, 1280, 1600]) {
      ctx.beginPath();
      ctx.moveTo(x, y + ry * sy);
      ctx.lineTo(x + w, y + ry * sy);
      ctx.stroke();
    }
    const target = state.missionTarget ? state.missionTarget() : null;
    if (target) {
      const pulse = 5 + Math.sin(state.time * 5) * 2;
      ctx.fillStyle = PALETTE.mission;
      ctx.beginPath();
      ctx.arc(x + target.x * sx, y + target.y * sy, pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const copCar of state.police.cars) {
      ctx.fillStyle = '#3f8cff';
      ctx.beginPath();
      ctx.arc(x + copCar.x * sx, y + copCar.y * sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const cop of state.police.cops) {
      ctx.fillStyle = '#3f8cff';
      ctx.beginPath();
      ctx.arc(x + cop.x * sx, y + cop.y * sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player: a white arrow that turns with them.
    ctx.save();
    ctx.translate(x + state.player.x * sx, y + state.player.y * sy);
    ctx.rotate(state.player.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-6, -5);
    ctx.lineTo(-6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - 6, y - 6, w + 12, h + 12, 8);
    ctx.stroke();
  }

  function drawObjectiveArrow(state) {
    const target = state.missionTarget ? state.missionTarget() : null;
    if (!target) return;
    const { x: cx, y: cy, zoom } = state.camera;
    const scale = Math.min(canvas.width / VIEW_W, canvas.height / VIEW_H) * zoom;
    const sx = (target.x - (cx - canvas.width / scale / 2)) * scale;
    const sy = (target.y - (cy - canvas.height / scale / 2)) * scale;
    if (sx > 40 && sx < canvas.width - 40 && sy > 100 && sy < canvas.height - 40) return;
    const dx = target.x - state.player.x;
    const dy = target.y - state.player.y;
    const angle = Math.atan2(dy, dx);
    const ex = Math.max(50, Math.min(canvas.width - 50, sx));
    const ey = Math.max(120, Math.min(canvas.height - 50, sy));
    const dist = Math.round(Math.hypot(dx, dy));
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(angle);
    ctx.fillStyle = PALETTE.mission;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, -11);
    ctx.lineTo(-10, 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    text(`${dist}m`, ex, ey + 30, 15, PALETTE.mission, 'center', true);
  }

  function drawHud(state) {
    const player = state.player;
    ctx.textBaseline = 'top';
    // Top-left: health and cash.
    ctx.fillStyle = PALETTE.panel;
    ctx.beginPath();
    ctx.roundRect(14, 14, 240, 64, 10);
    ctx.fill();
    text('HEALTH', 26, 22, 13, PALETTE.muted, 'left', true);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.roundRect(26, 42, 140, 12, 6);
    ctx.fill();
    ctx.fillStyle = PALETTE.health;
    ctx.beginPath();
    ctx.roundRect(26, 42, 140 * Math.max(0, player.health / 100), 12, 6);
    ctx.fill();
    text(`$${state.cash.toLocaleString('en-US')}`, 176, 36, 20, PALETTE.cash, 'left', true);
    // Top-right: wanted stars.
    drawStars(state.wanted.stars, canvas.width - 178, 34);
    if (state.wanted.stars > 0) {
      text('WANTED', canvas.width - 178, 52, 13, '#ff8080', 'left', true);
    }
    // Top-centre: the mission banner.
    const header = state.missionHeader ? state.missionHeader() : '';
    const objective = state.missionText ? state.missionText() : '';
    const timer = state.mission && state.mission.timer > 0 ? `  •  ${Math.ceil(state.mission.timer)}s` : '';
    ctx.fillStyle = PALETTE.panel;
    const bannerW = 560;
    ctx.beginPath();
    ctx.roundRect((canvas.width - bannerW) / 2, 14, bannerW, 64, 10);
    ctx.fill();
    text(header, canvas.width / 2, 22, 16, PALETTE.accent, 'center', true);
    text(objective + timer, canvas.width / 2, 46, 15, PALETTE.text, 'center');
    // Bottom-right: speed in a car, ammo on foot.
    if (player.inCar) {
      const car = player.inCar;
      const mph = Math.round(Math.abs(car.speed) * 0.12);
      text(`${mph}`, canvas.width - 30, canvas.height - 96, 44, PALETTE.text, 'right', true);
      text('MPH', canvas.width - 30, canvas.height - 52, 14, PALETTE.muted, 'right', true);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.roundRect(canvas.width - 190, canvas.height - 30, 160, 10, 5);
      ctx.fill();
      ctx.fillStyle = car.health > 45 ? PALETTE.health : '#ff8080';
      ctx.beginPath();
      ctx.roundRect(canvas.width - 190, canvas.height - 30, 160 * Math.max(0, car.health / 100), 10, 5);
      ctx.fill();
      text('CAR', canvas.width - 198, canvas.height - 36, 12, PALETTE.muted, 'right', true);
    } else {
      const pistol = player.pistol;
      const ammo = pistol.reloading > 0 ? 'RELOADING' : `${pistol.ammo} / 12`;
      text(ammo, canvas.width - 30, canvas.height - 66, 26, PALETTE.text, 'right', true);
      text('PISTOL — click to shoot, R reload, SPACE punch', canvas.width - 30, canvas.height - 34, 13, PALETTE.muted, 'right');
    }
    drawMinimap(state);
    drawObjectiveArrow(state);
    // A notice from the world, centre-bottom, while it lasts.
    if (state.noticeTimer > 0) {
      ctx.fillStyle = PALETTE.panel;
      const nw = 520;
      ctx.beginPath();
      ctx.roundRect((canvas.width - nw) / 2, canvas.height - 120, nw, 40, 10);
      ctx.fill();
      text(state.notice, canvas.width / 2, canvas.height - 108, 16, PALETTE.text, 'center', true);
    }
    // A red flash while the player is hurt.
    if (player.hurtTimer > 0) {
      ctx.fillStyle = `rgba(255, 40, 40, ${player.hurtTimer * 0.35})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 150 + lines.length * 32 + 70;
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;
    ctx.fillStyle = 'rgba(10, 12, 18, 0.45)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = PALETTE.panel;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 14);
    ctx.fill();
    ctx.strokeStyle = accent ?? PALETTE.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 14);
    ctx.stroke();
    ctx.textBaseline = 'alphabetic';
    text(title, canvas.width / 2, y + 72, 46, accent ?? PALETTE.accent, 'center', true);
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], canvas.width / 2, y + 122 + index * 32, 19, PALETTE.muted, 'center');
    }
    text(prompt, canvas.width / 2, y + height - 34, 20, PALETTE.text, 'center', true);
  }

  /** Convert a mouse position in CSS pixels to a point in the world. */
  function screenToWorld(clientX, clientY) {
    const ratio = window.devicePixelRatio || 1;
    return {
      x: view.x + (clientX * ratio) / view.scale,
      y: view.y + (clientY * ratio) / view.scale,
    };
  }

  /** Paint one frame: the world, then the HUD or a panel for the screen. */
  function draw(state, screen, best) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawWorld(state);
    ctx.textBaseline = 'top';
    if (screen === SCREEN_TITLE) {
      const lines = [
        'Solmar Bay. Sun, salt and five jobs for the fixer Mara Quinn.',
        'Steal cars, lose the cops, run the packages — and finish the Big Score.',
        'WASD move / drive  •  E enter a car  •  SPACE handbrake / punch',
        'Mouse aim, click to shoot  •  R reload  •  P pause',
      ];
      const hasSave = best !== null && best !== undefined;
      drawPanel('VICE RUSH', hasSave ? [...lines, `Saved game: $${state.cash.toLocaleString('en-US')} — mission ${state.missionIndex + 1} of 5`] : lines, hasSave ? 'Press ENTER to continue, or N for a new game' : 'Press ENTER to start', PALETTE.accent);
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The city waits for no one. Except now.'], 'Press P to keep playing');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', ['The Solmar Bay PD took 20% of your cash.', 'Mara is not impressed.'], 'Press ENTER to walk out of the hospital');
    } else if (screen === SCREEN_WASTED) {
      drawPanel('WASTED', ['St. Lumen patched you up — for 20% of your cash.', 'The city is still out there.'], 'Press ENTER to get back on your feet');
    } else if (screen === SCREEN_FAILED) {
      drawPanel('MISSION FAILED', ['The job went sideways. Mara gives second chances.'], 'Press R to retry the mission');
    } else if (screen === SCREEN_STORY) {
      drawPanel('THE BIG SCORE', [`Every job done. Total cash: $${state.cash.toLocaleString('en-US')}.`, 'Solmar Bay is yours, Rex. Free roam continues.'], 'Press ENTER to keep playing');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, screenToWorld };
}
