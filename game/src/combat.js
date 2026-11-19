// Combat: the player's pistol and fists, the bullets in the air, and the
// particles a crash or a shot throws off. Nothing here knows about the world
// beyond the lists it is handed, so the world can call it and read the hits.
import { PISTOL, PLAYER } from './config.js';

/** A fresh pistol: full magazine, ready to fire. */
export function makePistol() {
  return { ammo: PISTOL.magSize, reloading: 0, cooldown: 0 };
}

/** Fire one shot toward (tx, ty) from (x, y); returns the bullet or null. */
export function firePistol(pistol, x, y, tx, ty, random) {
  if (pistol.reloading > 0 || pistol.cooldown > 0 || pistol.ammo <= 0) return null;
  pistol.ammo -= 1;
  pistol.cooldown = PISTOL.fireCooldown;
  const spread = (random() - 0.5) * PISTOL.spread * 2;
  const angle = Math.atan2(ty - y, tx - x) + spread;
  return {
    x: x + Math.cos(angle) * 18,
    y: y + Math.sin(angle) * 18,
    vx: Math.cos(angle) * PISTOL.bulletSpeed,
    vy: Math.sin(angle) * PISTOL.bulletSpeed,
    life: PISTOL.range / PISTOL.bulletSpeed,
    damage: PISTOL.damage,
  };
}

/** Start a reload; call stepPistol every frame to count it down. */
export function startReload(pistol) {
  if (pistol.reloading > 0 || pistol.ammo === PISTOL.magSize) return false;
  pistol.reloading = PISTOL.reloadTime;
  return true;
}

export function stepPistol(pistol, dt) {
  if (pistol.cooldown > 0) pistol.cooldown -= dt;
  if (pistol.reloading > 0) {
    pistol.reloading -= dt;
    if (pistol.reloading <= 0) {
      pistol.ammo = PISTOL.magSize;
      pistol.reloading = 0;
    }
  }
}

/**
 * A punch on foot: the nearest pedestrian or cop within reach takes damage.
 * Returns the one hit, or null.
 */
export function punch(x, y, angle, targets) {
  let best = null;
  let bestD = PLAYER.punchRange;
  for (const t of targets) {
    if (t.dead || t.down > 0) continue;
    const dx = t.x - x;
    const dy = t.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist > bestD) continue;
    // Only what is in front of the player.
    const dot = (dx * Math.cos(angle) + dy * Math.sin(angle)) / (dist || 1);
    if (dot < 0.3) continue;
    best = t;
    bestD = dist;
  }
  if (best) best.punchHit = PLAYER.punchDamage;
  return best;
}

/** A burst of particles: sparks, smoke, blood, dust — one list, many uses. */
export function burst(particles, x, y, count, color, speed, life, size) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.8);
    particles.push({
      x, y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      life: life * (0.6 + Math.random() * 0.7),
      maxLife: life,
      size: size * (0.7 + Math.random() * 0.6),
      color,
    });
  }
}

export function stepParticles(particles, dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - dt * 2;
    p.vy *= 1 - dt * 2;
  }
}

export function drawParticles(ctx, particles) {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Draw the bullets as short bright streaks. */
export function drawBullets(ctx, bullets) {
  ctx.strokeStyle = '#ffe9a8';
  ctx.lineWidth = 3;
  for (const b of bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}
