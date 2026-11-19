// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one plays
// the real rules forward from a fresh world for a fixed number of steps, steered
// by a small driving autopilot, so the frame is what a short game really looks
// like and the same seed always gives the same frame.
import { STEP, CAR } from './config.js';
import { createMissionRun } from './missions.js';
import { addHeat } from './police.js';
import { makeCar, makeDriver, KIND_SPORTS } from './vehicles.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const SAMPLE = STEP;
const START_SECONDS = 5;
const DRIVE_SECONDS = 5;
const CHASE_SECONDS = 3;
const MISSION_SECONDS = 4;

// Stuck detection for the autopilot (see steerToward).
let stuckAt = { x: 0, y: 0 };
let stuckSteps = 0;
let reverseSteps = 0;

/** Clamp a value into [-1, 1]. */
function clamp1(value) {
  return Math.max(-1, Math.min(1, value));
}

/** The empty input: no keys, no clicks. */
function emptyInput() {
  return { mx: 0, my: 0, up: false, down: false, left: false, right: false, run: false, enter: false, punch: false, shootX: null, shootY: null, reload: false, handbrake: false };
}

/** Steer the player's car toward a point, easing off the gas for a car ahead. */
function steerToward(state, targetX, targetY, targetSpeed = Infinity) {
  const car = state.player.inCar;
  if (!car) return emptyInput();
  // Stuck detection: if the car has barely moved for a second and a half, it
  // is wedged (usually against a building after a ram) — reverse out.
  const moved = Math.hypot(car.x - stuckAt.x, car.y - stuckAt.y);
  stuckAt = { x: car.x, y: car.y };
  if (reverseSteps > 0) {
    reverseSteps -= 1;
    return { ...emptyInput(), down: true, left: true };
  }
  if (moved < 0.5) {
    stuckSteps += 1;
    if (stuckSteps > 90) {
      stuckSteps = 0;
      reverseSteps = 42;
      return { ...emptyInput(), down: true, left: true };
    }
  } else {
    stuckSteps = 0;
  }
  const heading = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
  const wantAngle = Math.atan2(targetY - car.y, targetX - car.x);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = clamp1(diff * 2.4);
  // Hold the target speed: full throttle below it, brake above it. The
  // target is the cornering speed near a turn (see loopAutopilot) and the
  // car's top speed on a straight.
  let throttle = car.speed < targetSpeed;
  let brake = car.speed > targetSpeed + 30;
  for (const other of state.cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * heading.x + dy * heading.y;
    const side = Math.abs(-dx * heading.y + dy * heading.x);
    if (ahead > 0 && ahead < 90 && side < 30) {
      throttle = false;
      break;
    }
  }
  return {
    mx: 0, my: 0,
    up: throttle, down: brake,
    left: steer < -0.08, right: steer > 0.08,
    run: false, enter: false, punch: false,
    shootX: null, shootY: null, reload: false, handbrake: false,
  };
}

/**
 * A loop around the city the drive and chase scenes follow: north up one
 * road, east across the top, south down the far side, west across the bottom.
 * A car that only ever drives straight runs out of city; a loop keeps it on
 * the roads, turning at intersections like a real drive.
 */
const LOOP_ROUTE = [
  { x: 1280, y: 320 },
  { x: 2240, y: 320 },
  { x: 2240, y: 1600 },
  { x: 1280, y: 1600 },
];
let routeIndex = 0;

function loopAutopilot(state) {
  const car = state.player.inCar;
  if (!car) return emptyInput();
  let target = LOOP_ROUTE[routeIndex];
  const distToCorner = Math.hypot(target.x - car.x, target.y - car.y);
  // Slow for the corner before it, not in it: at full speed the turning
  // circle is ~250 units, wider than the road, so the car swings off the
  // road and scrapes the buildings. At ~350 the circle is ~135, which fits
  // the road and clears the (set-back) buildings. Brake on the straight,
  // then carry the cornering speed through the turn.
  const targetSpeed = distToCorner < 550 ? 350 : car.maxSpeed;
  // Start the turn early, by exactly the car's turning radius at its current
  // speed: a quarter-circle from the turn start lands on the next road. A
  // fixed advance would turn too early when slow and too late when fast,
  // and either way the car ends up in a block.
  const advance = Math.max(80, Math.abs(car.speed) / CAR.turnRate + 40);
  if (distToCorner < advance) {
    routeIndex = (routeIndex + 1) % LOOP_ROUTE.length;
    target = LOOP_ROUTE[routeIndex];
  }
  return steerToward(state, target.x, target.y, targetSpeed);
}

/**
 * Pure pursuit along the road under the car: aim 260 units ahead, snapped to
 * the right-hand lane, and ease off the gas when a car is right ahead. The
 * direction of travel is the car's velocity when it is moving, else the way
 * it faces, so a car placed across a road still finds its lane.
 */
function driveAutopilot(state) {
  const car = state.player.inCar;
  if (!car) return emptyInput();
  const road = state.city.nearestRoad(car.x, car.y);
  const heading = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
  const vx = heading.x * car.speed;
  const vy = heading.y * car.speed;
  let targetX = car.x + heading.x * 260;
  let targetY = car.y + heading.y * 260;
  if (road.vertical) {
    const dir = Math.abs(vy) > 40 ? Math.sign(vy) : (heading.y !== 0 ? Math.sign(heading.y) : 1);
    targetX = road.x + (dir < 0 ? 24 : -24);
    targetY = car.y + dir * 260;
  } else {
    const dir = Math.abs(vx) > 40 ? Math.sign(vx) : (heading.x !== 0 ? Math.sign(vx) : 1);
    targetY = road.y + (dir > 0 ? 24 : -24);
    targetX = car.x + dir * 260;
  }
  return steerToward(state, targetX, targetY);
}

/** Put the player in a sports car on a road, facing along it. */
function giveSportsCar(state, x, y, angle) {
  const car = makeCar(x, y, angle, KIND_SPORTS, () => 0.5);
  state.cars.push(car);
  state.player.inCar = car;
  state.player.x = car.x;
  state.player.y = car.y;
  state.player.angle = car.angle;
  car.speed = 200;
  return car;
}

/** A few traffic cars the player passes on the way: one in the opposite lane,
// one crossing at the intersection ahead, so the shot shows live traffic
// without the autopilot getting stuck behind it. */
function addPassingTraffic(state) {
  const spots = [
    { x: 1256, y: 1180, angle: Math.PI / 2, vertical: true, forward: -1 },
    { x: 1256, y: 820, angle: Math.PI / 2, vertical: true, forward: -1 },
    { x: 1000, y: 984, angle: 0, vertical: false, forward: 1 },
  ];
  for (const spot of spots) {
    const car = makeCar(spot.x, spot.y, spot.angle, 'sedan', () => 0.5);
    car.driver = makeDriver(() => 0.5);
    car.driver.vertical = spot.vertical;
    car.driver.forward = spot.forward;
    car.speed = 140;
    car.driver.cruise = 140;
    state.cars.push(car);
    state.traffic.push(car);
  }
}

function runFor(state, world, seconds, inputFn) {
  for (let t = 0; t < seconds / SAMPLE; t += 1) {
    world.step(SAMPLE, inputFn(state));
  }
}

export { loopAutopilot, driveAutopilot };

/**
 * Set `world` to the named scene (start, drive, chase or mission; any other
 * name is start) and return the screen to draw over it and the best cash.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset(true);
  if (name !== 'drive' && name !== 'chase' && name !== 'mission') {
    runFor(state, world, START_SECONDS, () => ({
      mx: 0, my: 0, up: false, down: false, left: false, right: false,
      run: false, enter: false, punch: false, shootX: null, shootY: null,
      reload: false, handbrake: false,
    }));
    return { screen: SCREEN_TITLE, best: null };
  }
  if (name === 'drive') {
    routeIndex = 0;
    stuckAt = { x: 1280, y: 1500 };
    stuckSteps = 0;
    reverseSteps = 0;
    giveSportsCar(state, 1280, 1500, -Math.PI / 2);
    addPassingTraffic(state);
    runFor(state, world, DRIVE_SECONDS, loopAutopilot);
    return { screen: SCREEN_PLAY, best: state.bestCash };
  }
  if (name === 'chase') {
    routeIndex = 0;
    stuckAt = { x: 1280, y: 1500 };
    stuckSteps = 0;
    reverseSteps = 0;
    const playerCar = giveSportsCar(state, 1280, 1500, -Math.PI / 2);
    playerCar.health = 300;
    addPassingTraffic(state);
    addHeat(state.wanted, 120);
    // Let the police spawn, then put them on the player's tail, staggered
    // behind on the same road and faster than the player's car, so they stay
    // glued to it in the frame instead of falling back or piling on its nose.
    world.step(STEP, loopAutopilot(state));
    const spots = [
      { x: 1304, y: state.player.y + 260, angle: -Math.PI / 2 },
      { x: 1256, y: state.player.y + 420, angle: -Math.PI / 2 },
      { x: 1304, y: state.player.y + 580, angle: -Math.PI / 2 },
    ];
    state.police.cars.forEach((copCar, i) => {
      const spot = spots[i % spots.length];
      copCar.x = spot.x;
      copCar.y = spot.y;
      copCar.angle = spot.angle;
      copCar.speed = 420;
      copCar.maxSpeed = 660;
    });
    runFor(state, world, CHASE_SECONDS, loopAutopilot);
    return { screen: SCREEN_PLAY, best: state.bestCash };
  }
  // mission: the Package Run delivery, timer running, motel far ahead.
  const run = createMissionRun(1);
  run.step = 2;
  run.timer = 60;
  run.carrying = true;
  state.mission = run;
  state.missionIndex = 1;
  giveSportsCar(state, 400, 1600, 0);
  runFor(state, world, MISSION_SECONDS, driveAutopilot);
  return { screen: SCREEN_PLAY, best: state.bestCash };
}
