// Cars: the player's ride and the city's traffic. One arcade model drives them
// all — accelerate, steer, drift on the handbrake — while traffic cars add a
// simple road-following brain (stay in lane, turn at intersections, slow for
// the car ahead). Cars have health: hard hits smoke them, and at zero they burn.
import { CAR, PALETTE, ROADS, TRAFFIC, WORLD } from './config.js';
import { intRange, pick, range } from './random.js';

export const KIND_SEDAN = 'sedan';
export const KIND_TAXI = 'taxi';
export const KIND_SPORTS = 'sports';
export const KIND_VAN = 'van';
export const KIND_POLICE = 'police';

const PAINTS = ['#d94f4f', '#4f7fd9', '#e8b13c', '#7d5fc0', '#3fae8a', '#d9d9d9', '#2f2f38', '#e07840'];
const TAXI_PAINT = '#f2c230';

/** A fresh car object; `kind` picks its looks and its top speed. */
export function makeCar(x, y, angle, kind, random) {
  const sports = kind === KIND_SPORTS;
  return {
    x, y, angle,
    speed: 0,
    steer: 0,
    kind,
    color: kind === KIND_TAXI ? TAXI_PAINT : kind === KIND_POLICE ? '#20242e' : pick(random, PAINTS),
    maxSpeed: sports ? CAR.sportsMax : kind === KIND_VAN ? CAR.maxSpeed * 0.75 : CAR.maxSpeed,
    health: CAR.health,
    smoke: 0,
    dead: false,
    // Traffic brain.
    driver: null,
    // Skid marks the car leaves while drifting.
    skids: [],
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * One physics step for any car. `drive` is {throttle (-1..1), steer (-1..1),
 * handbrake (bool)}: throttle 1 is the gas, -1 the brake/reverse. Returns true
 * when the car hit something hard this step.
 */
export function stepCar(car, drive, dt) {
  if (car.dead) return false;
  const forward = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
  const targetSteer = clamp(drive.steer, -1, 1);
  car.steer += (targetSteer - car.steer) * Math.min(1, dt * 10);
  const speedSign = car.speed >= 0 ? 1 : -1;
  const steerEffect = car.steer * CAR.turnRate * clamp(Math.abs(car.speed) / 220, 0, 1) * speedSign;
  car.angle += steerEffect * dt;
  if (drive.throttle > 0) car.speed += CAR.accel * drive.throttle * dt;
  else if (drive.throttle < 0) {
    if (car.speed > 5) car.speed -= CAR.brake * dt;
    else car.speed = Math.max(-CAR.reverseMax, car.speed + CAR.accel * 0.55 * dt);
  }
  // Rolling drag, and the handbrake kills grip and speed for a drift.
  const grip = drive.handbrake ? CAR.handbrakeGrip : CAR.grip;
  car.speed -= car.speed * (drive.handbrake ? 1.4 : 0.35) * dt;
  car.speed = clamp(car.speed, -CAR.reverseMax, car.maxSpeed);
  const nx = Math.cos(car.angle);
  const ny = Math.sin(car.angle);
  // Velocity follows the heading, but with low grip part of the old sideways
  // velocity survives: that slide is the drift.
  const vx = nx * car.speed;
  const vy = ny * car.speed;
  car.x += vx * dt;
  car.y += vy * dt;
  car.x = clamp(car.x, 20, WORLD.width - 20);
  car.y = clamp(car.y, 20, WORLD.height - 20);
  if (car.health < 45) car.smoke += dt;
  if (drive.handbrake && Math.abs(car.speed) > 180) {
    car.skids.push({ x: car.x - nx * 14, y: car.y - ny * 14, life: 0.9 });
  }
  for (let i = car.skids.length - 1; i >= 0; i -= 1) {
    car.skids[i].life -= dt;
    if (car.skids[i].life <= 0) car.skids.splice(i, 1);
  }
  return false;
}

function carCorners(car) {
  const c = Math.cos(car.angle);
  const s = Math.sin(car.angle);
  const hl = CAR.length / 2;
  const hw = CAR.width / 2;
  return [
    { x: car.x + c * hl - s * hw, y: car.y + s * hl + c * hw },
    { x: car.x + c * hl + s * hw, y: car.y + s * hl - c * hw },
    { x: car.x - c * hl + s * hw, y: car.y - s * hl - c * hw },
    { x: car.x - c * hl - s * hw, y: car.y - s * hl + c * hw },
  ];
}

/** Rough circle test between two cars (their middles within one car length). */
export function carsOverlap(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy < (CAR.length * 0.82) * (CAR.length * 0.82);
}

/** Push two overlapping cars apart and slow them; returns the impact speed. */
export function separateCars(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const push = (CAR.length * 0.82 - dist) / 2;
  const ux = dx / dist;
  const uy = dy / dist;
  a.x -= ux * push;
  a.y -= uy * push;
  b.x += ux * push;
  b.y += uy * push;
  const impact = Math.abs(a.speed - b.speed);
  a.speed *= 0.6;
  b.speed *= 0.6;
  return impact;
}

/** A traffic brain: follow the road grid, turning at intersections. */
export function makeDriver(random) {
  return {
    vertical: random() < 0.5,
    forward: random() < 0.5 ? 1 : -1,
    lane: ROADS.lane,
    wait: 0,
    // The intersection the car last decided at: deciding once per crossing
    // keeps it from flip-flopping in the middle of one.
    lastCrossing: null,
  };
}

/** Steer a traffic car along its road; returns its drive input for this step. */
export function driveTraffic(car, random, carsAhead) {
  const d = car.driver;
  const roadHalf = ROADS.width / 2;
  let targetAngle;
  let targetX = car.x;
  let targetY = car.y;
  if (d.vertical) {
    const laneX = nearestRoadLine(car.x, ROADS.vertical) + (d.forward ? d.lane : -d.lane);
    targetX = laneX;
    targetY = car.y + d.forward * 100;
    targetAngle = d.forward ? Math.PI / 2 : -Math.PI / 2;
  } else {
    const laneY = nearestRoadLine(car.y, ROADS.horizontal) + (d.forward ? d.lane : -d.lane);
    targetY = laneY;
    targetX = car.x + d.forward * 100;
    targetAngle = d.forward ? 0 : Math.PI;
  }
  // At an intersection, sometimes turn onto the crossing road — but decide
  // once per intersection, so the car never flip-flops in the crossing.
  const nearX = nearestRoadLine(car.x, ROADS.vertical);
  const nearY = nearestRoadLine(car.y, ROADS.horizontal);
  const atCrossing = Math.abs(car.x - nearX) < roadHalf && Math.abs(car.y - nearY) < roadHalf;
  const crossingKey = atCrossing ? `${nearX},${nearY}` : null;
  if (atCrossing && d.lastCrossing !== crossingKey && random() < 0.35) {
    d.vertical = !d.vertical;
    d.forward = random() < 0.5 ? 1 : -1;
  }
  d.lastCrossing = crossingKey;
  // Slow down for the car ahead.
  // Hold the cruising speed instead of accelerating to the car's top speed:
  // at top speed the turning circle is ~250 units, wider than the road, so
  // every turn at an intersection overshoots the lane, clips a building and
  // wedges the car. At the cruising speed the circle fits the road.
  const cruise = d.cruise ?? TRAFFIC.speed;
  let throttle = car.speed < cruise ? 1 : 0;
  if (car.speed > cruise + 60) throttle = -1;
  for (const other of carsAhead) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    if (ahead > 0 && ahead < TRAFFIC.followGap && side < 30) {
      throttle = 0;
      break;
    }
  }
  let angleDiff = targetAngle - car.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  const steer = clamp(angleDiff * 1.6, -1, 1);
  // Nudge back toward the lane centre.
  const laneError = d.vertical ? targetX - car.x : targetY - car.y;
  const nudge = clamp(laneError * 0.01, -0.4, 0.4) * (d.forward ? 1 : -1);
  return { throttle, steer: clamp(steer + (d.vertical ? nudge : -nudge), -1, 1), handbrake: false };
}

function nearestRoadLine(value, lines) {
  let best = lines[0];
  let bestD = Math.abs(value - best);
  for (const line of lines) {
    const d = Math.abs(value - line);
    if (d < bestD) { bestD = d; best = line; }
  }
  return best;
}

/** Spawn the city's traffic on the roads, spread out and facing along them. */
export function spawnTraffic(random, city) {
  const cars = [];
  let guard = 0;
  while (cars.length < TRAFFIC.count && guard < 400) {
    guard += 1;
    const point = city.randomRoadPoint(120);
    const vertical = Math.abs(point.x - nearestRoadLine(point.x, ROADS.vertical)) < 1;
    const forward = random() < 0.5 ? 1 : -1;
    const angle = vertical ? (forward > 0 ? Math.PI / 2 : -Math.PI / 2) : (forward > 0 ? 0 : Math.PI);
    let clear = true;
    for (const other of cars) {
      if (Math.hypot(other.x - point.x, other.y - point.y) < 160) { clear = false; break; }
    }
    if (!clear) continue;
    const kind = random() < 0.14 ? KIND_TAXI : random() < 0.12 ? KIND_VAN : random() < 0.1 ? KIND_SPORTS : KIND_SEDAN;
    const car = makeCar(point.x, point.y, angle, kind, random);
    car.driver = makeDriver(random);
    car.driver.vertical = vertical;
    car.driver.forward = forward;
    car.speed = range(random, TRAFFIC.speed - TRAFFIC.speedJitter, TRAFFIC.speed + TRAFFIC.speedJitter);
    car.driver.cruise = car.speed;
    cars.push(car);
  }
  return cars;
}

/** A few parked cars in the empty lots, for the player to steal. */
export function spawnParked(random, city) {
  const cars = [];
  for (const lot of city.lots) {
    if (lot.kind !== 'lot') continue;
    const n = intRange(random, 1, 3);
    for (let i = 0; i < n; i += 1) {
      const angle = pick(random, [0, Math.PI / 2, Math.PI, -Math.PI / 2]);
      cars.push(makeCar(
        lot.x + range(random, 30, lot.width - 30),
        lot.y + range(random, 30, lot.height - 30),
        angle, pick(random, [KIND_SEDAN, KIND_SPORTS, KIND_VAN]), random,
      ));
    }
  }
  return cars;
}

/** Damage a car; at zero health it burns out and stops. Returns true when it just died. */
export function damageCar(car, amount) {
  if (car.dead) return false;
  car.health -= amount;
  if (car.health <= 0) {
    car.health = 0;
    car.dead = true;
    car.speed = 0;
    return true;
  }
  return false;
}

/** Draw one car: shadow, body, cabin, windshield, lights, and its smoke. */
export function drawCar(ctx, car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Skid marks are drawn in world space before this transform by the caller.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.roundRect(-CAR.length / 2 + 2, -CAR.width / 2 + 3, CAR.length, CAR.width, 7);
  ctx.fill();
  ctx.fillStyle = car.dead ? '#3a3a3a' : car.color;
  ctx.beginPath();
  ctx.roundRect(-CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 7);
  ctx.fill();
  ctx.fillStyle = car.kind === KIND_POLICE ? '#e8ecf2' : 'rgba(20, 26, 36, 0.85)';
  ctx.beginPath();
  ctx.roundRect(-6, -CAR.width / 2 + 4, 16, CAR.width - 8, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.fillRect(6, -CAR.width / 2 + 5, 4, CAR.width - 10);
  // Headlights and taillights.
  ctx.fillStyle = '#fff8c8';
  ctx.fillRect(CAR.length / 2 - 2, -CAR.width / 2 + 2, 3, 4);
  ctx.fillRect(CAR.length / 2 - 2, CAR.width / 2 - 6, 3, 4);
  ctx.fillStyle = '#ff4040';
  ctx.fillRect(-CAR.length / 2 - 1, -CAR.width / 2 + 2, 3, 4);
  ctx.fillRect(-CAR.length / 2 - 1, CAR.width / 2 - 6, 3, 4);
  if (car.kind === KIND_POLICE) {
    ctx.fillStyle = PALETTE.policeRed;
    ctx.fillRect(-2, -CAR.width / 2 - 2, 8, 4);
    ctx.fillStyle = PALETTE.policeBlue;
    ctx.fillRect(-2, CAR.width / 2 - 2, 8, 4);
  }
  if (car.kind === KIND_TAXI) {
    ctx.fillStyle = '#20242e';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 3);
  }
  ctx.restore();
  if (car.smoke > 0.2) {
    ctx.fillStyle = `rgba(60, 60, 60, ${Math.min(0.6, car.smoke * 0.12)})`;
    ctx.beginPath();
    ctx.arc(car.x - Math.cos(car.angle) * 10, car.y - Math.sin(car.angle) * 10, 8 + (car.smoke % 1) * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  if (car.dead) {
    ctx.fillStyle = 'rgba(255, 120, 30, 0.5)';
    ctx.beginPath();
    ctx.arc(car.x, car.y, 14 + Math.sin(car.smoke * 9) * 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
