// The law of Solmar Bay: a wanted level that rises with every crime and cools
// when the player lies low, and the police who answer it. Police cars chase and
// ram; when the player is on foot, cops get out and run them down, and a cop
// who holds the player long enough busts them.
import { CAR, POLICE, WANTED, WORLD } from './config.js';
import { makeCar, stepCar, KIND_POLICE } from './vehicles.js';
import { range } from './random.js';

export function createWanted() {
  return { heat: 0, stars: 0, sinceCrime: 99, bust: 0 };
}

/** How many stars a heat value shows (0 to 5). */
export function starsFor(heat) {
  if (heat <= 0) return 0;
  if (heat < 35) return 1;
  if (heat < 70) return 2;
  if (heat < 120) return 3;
  if (heat < 180) return 4;
  return 5;
}

/** Add heat for a crime; the decay clock restarts. */
export function addHeat(wanted, amount) {
  wanted.heat = Math.min(240, wanted.heat + amount);
  wanted.stars = starsFor(wanted.heat);
  wanted.sinceCrime = 0;
}

/** Cool the wanted level when the player has been quiet for a while. */
export function decayWanted(wanted, dt, policeNear) {
  wanted.sinceCrime += dt;
  if (wanted.heat <= 0) return;
  if (wanted.sinceCrime < WANTED.decayDelay || policeNear) return;
  wanted.heat = Math.max(0, wanted.heat - WANTED.decayPerSecond * dt);
  wanted.stars = starsFor(wanted.heat);
}

/** Clear the wanted level entirely (the spray shop, or a bust). */
export function clearWanted(wanted) {
  wanted.heat = 0;
  wanted.stars = 0;
  wanted.bust = 0;
}

/** How many police cars a wanted level puts on the street. */
export function policeCarCount(stars) {
  if (stars === 0) return 0;
  if (stars <= 2) return 2;
  if (stars === 3) return 3;
  return 4;
}

/** How many foot cops a wanted level puts on the street. */
export function footCopCount(stars) {
  if (stars < 2) return 0;
  if (stars < 4) return 1;
  return 2;
}

function spawnPointNear(player, random, city) {
  // On a road near the player, but off the screen edge when possible.
  for (let tries = 0; tries < 12; tries += 1) {
    const angle = random() * Math.PI * 2;
    const dist = range(random, POLICE.spawnDistance * 0.7, POLICE.spawnDistance * 1.2);
    const x = player.x + Math.cos(angle) * dist;
    const y = player.y + Math.sin(angle) * dist;
    if (x < 60 || y < 60 || x > WORLD.width - 60 || y > WORLD.height - 60) continue;
    const road = city.nearestRoad(x, y);
    if (road) return { x: road.x, y: road.y };
  }
  const road = city.nearestRoad(player.x + POLICE.spawnDistance, player.y);
  return road ? { x: road.x, y: road.y } : { x: player.x + 400, y: player.y };
}

/** Bring the police force up to what the wanted level demands. */
export function maintainPolice(police, wanted, player, city, random) {
  const wantCars = policeCarCount(wanted.stars);
  while (police.cars.length < wantCars) {
    const point = spawnPointNear(player, random, city);
    const car = makeCar(point.x, point.y, 0, KIND_POLICE, random);
    car.maxSpeed = POLICE.carSpeed;
    police.cars.push(car);
  }
  while (police.cars.length > wantCars) police.cars.pop();
  const wantCops = footCopCount(wanted.stars);
  while (police.cops.length < wantCops) {
    const point = spawnPointNear(player, random, city);
    police.cops.push({ x: point.x, y: point.y, angle: 0, speed: POLICE.footSpeed, bustHold: 0 });
  }
  while (police.cops.length > wantCops) police.cops.pop();
}

/**
 * Chase along the road grid, not as the crow flies: head for the intersection
 * of the car's road with the road nearest the player, turn onto it there, and
 * drive straight at the player once they share a road. A straight-line chase
 * just rams buildings.
 */
export function drivePoliceCar(car, player, city, dt) {
  const carRoad = city.nearestRoad(car.x, car.y);
  const playerVertical = city.nearestVertical(player.x);
  const playerHorizontal = city.nearestHorizontal(player.y);
  const sameRoad = carRoad.vertical
    ? Math.abs(carRoad.x - playerVertical) < 60 && Math.abs(player.x - carRoad.x) < 60
    : Math.abs(carRoad.y - playerHorizontal) < 60 && Math.abs(player.y - carRoad.y) < 60;
  let target;
  if (sameRoad) {
    target = { x: player.x, y: player.y };
  } else if (carRoad.vertical) {
    target = { x: carRoad.x, y: playerHorizontal };
  } else {
    target = { x: playerVertical, y: carRoad.y };
  }
  const targetAngle = Math.atan2(target.y - car.y, target.x - car.x);
  let diff = targetAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  const dist = Math.hypot(player.x - car.x, player.y - car.y);
  let throttle = dist > 60 ? 1 : 0.4;
  // Slow for the turn at the intersection: at full speed the car blows
  // through the corner, overshoots to the map edge and wedges there. Brake
  // on the approach so it can turn onto the player's road instead.
  if (!sameRoad) {
    const distToTarget = Math.hypot(target.x - car.x, target.y - car.y);
    if (distToTarget < 300) throttle = car.speed > 250 ? -1 : 0.3;
  }
  stepCar(car, { throttle, steer, handbrake: false }, dt);
}

/** Run a foot cop toward the player; returns true while they hold the player. */
export function stepFootCop(cop, player, dt) {
  const dx = player.x - cop.x;
  const dy = player.y - cop.y;
  const dist = Math.hypot(dx, dy);
  if (dist > 4) {
    cop.x += (dx / dist) * cop.speed * dt;
    cop.y += (dy / dist) * cop.speed * dt;
    cop.angle = Math.atan2(dy, dx);
  }
  return dist < 26;
}

/** Draw a foot cop: navy uniform, cap, and a badge that reads at a glance. */
export function drawFootCop(ctx, cop) {
  ctx.save();
  ctx.translate(cop.x, cop.y);
  ctx.rotate(cop.angle);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 4, 9, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1d2f55';
  ctx.beginPath();
  ctx.roundRect(-7, -7, 14, 14, 6);
  ctx.fill();
  ctx.fillStyle = '#f0c8a0';
  ctx.beginPath();
  ctx.arc(10, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#101c38';
  ctx.beginPath();
  ctx.arc(10, -2, 5, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = '#ffd23e';
  ctx.fillRect(-2, -2, 4, 4);
  ctx.restore();
}
