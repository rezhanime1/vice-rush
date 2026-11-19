// Pedestrians: the people of Solmar Bay. They stroll the sidewalks, cross at
// intersections, and run for cover when a car bears down on them or a shot
// rings out. A pedestrian is a walker with a mood, not a target — hitting one
// is a crime the police notice.
import { PEDS, WORLD } from './config.js';
import { pick, range } from './random.js';

const SHIRTS = ['#e86a6a', '#6aa8e8', '#e8c86a', '#8ae86a', '#c86ae8', '#e8e8e8', '#6ad8d8', '#e89a4f'];
const SKINS = ['#f0c8a0', '#c89878', '#8a5f3c', '#e8b88a'];

/** A fresh pedestrian standing on a sidewalk point. */
export function makePed(x, y, random) {
  return {
    x, y,
    angle: pick(random, [0, Math.PI / 2, Math.PI, -Math.PI / 2]),
    speed: range(random, PEDS.speed * 0.8, PEDS.speed * 1.2),
    shirt: pick(random, SHIRTS),
    skin: pick(random, SKINS),
    walkPhase: random() * Math.PI * 2,
    // Where they are headed, and how scared they are (0 calm, 1 running).
    targetX: x,
    targetY: y,
    fear: 0,
    // A pedestrian that was hit lies down for a while, then gets up.
    down: 0,
    dead: false,
  };
}

/** Pick a new strolling destination on a nearby sidewalk. */
export function retargetPed(ped, city, random) {
  const point = city.sidewalkPoint();
  ped.targetX = point.x;
  ped.targetY = point.y;
  ped.angle = Math.atan2(point.y - ped.y, point.x - ped.x);
}

/** Spawn the city's walkers, spread along the sidewalks. */
export function spawnPeds(random, city) {
  const peds = [];
  for (let i = 0; i < PEDS.count; i += 1) {
    const point = city.sidewalkPoint();
    const ped = makePed(point.x, point.y, random);
    retargetPed(ped, city, random);
    peds.push(ped);
  }
  return peds;
}

/** Scare every pedestrian within `radius` of (x, y): they run away from it. */
export function scarePeds(peds, x, y, radius) {
  for (const ped of peds) {
    if (ped.dead || ped.down > 0) continue;
    const dx = ped.x - x;
    const dy = ped.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist < radius) {
      ped.fear = 1;
      ped.targetX = ped.x + (dx / (dist || 1)) * 260;
      ped.targetY = ped.y + (dy / (dist || 1)) * 260;
      ped.angle = Math.atan2(ped.targetY - ped.y, ped.targetX - ped.x);
    }
  }
}

/** One step for a pedestrian: stroll, run when scared, lie down when hit. */
export function stepPed(ped, city, dt, random) {
  if (ped.dead) return;
  if (ped.down > 0) {
    ped.down -= dt;
    return;
  }
  const dx = ped.targetX - ped.x;
  const dy = ped.targetY - ped.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 12) {
    if (ped.fear > 0) {
      ped.fear = Math.max(0, ped.fear - dt * 0.5);
      if (ped.fear === 0) retargetPed(ped, city, random);
    } else {
      retargetPed(ped, city, random);
    }
    return;
  }
  const speed = ped.fear > 0 ? PEDS.fleeSpeed : ped.speed;
  const ux = dx / dist;
  const uy = dy / dist;
  ped.x = Math.max(10, Math.min(WORLD.width - 10, ped.x + ux * speed * dt));
  ped.y = Math.max(10, Math.min(WORLD.height - 10, ped.y + uy * speed * dt));
  ped.angle = Math.atan2(uy, ux);
  ped.walkPhase += dt * (ped.fear > 0 ? 14 : 8);
  // Stay out of the buildings.
  city.collideBuildings({ x: ped.x, y: ped.y, radius: 10 });
}

/** Knock a pedestrian down (a hit, not a kill): they stay down, then get up. */
export function knockPed(ped, seconds) {
  ped.down = seconds;
  ped.fear = 1;
}

/** Draw one pedestrian: a little walking figure, or lying down when hit. */
export function drawPed(ctx, ped) {
  if (ped.dead) return;
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.down > 0) {
    ctx.rotate(0.4);
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.roundRect(-12, -5, 24, 10, 5);
    ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(14, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const bob = Math.sin(ped.walkPhase) * 2;
  ctx.rotate(ped.angle);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 4, 9, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.shirt;
  ctx.beginPath();
  ctx.roundRect(-7, -7 + bob * 0.3, 14, 14, 6);
  ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(10, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2f2f38';
  ctx.beginPath();
  ctx.arc(10, -2, 5, 0, Math.PI);
  ctx.fill();
  ctx.restore();
}
