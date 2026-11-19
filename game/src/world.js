// Vice Rush's world: the one state and the one step that runs it. The player
// (on foot or in a car), the traffic, the pedestrians, the police, the bullets
// and the particles, the wanted level, the cash and the mission run all live
// here. step() takes the frame's input and returns what happened as bit flags,
// so the caller can react — sounds, screens, saves — without the world knowing
// about any of them.
import { BEACH, CAR, MONEY, PISTOL, PLACES, PLAYER, POLICE, SAVE_KEY, STEP, WANTED, WORLD } from './config.js';
import { createCity } from './city.js';
import { createRandom } from './random.js';
import { carsOverlap, damageCar, drawCar, makeCar, separateCars, spawnParked, spawnTraffic, stepCar, driveTraffic, KIND_VAN } from './vehicles.js';
import { drawPed, knockPed, scarePeds, spawnPeds, stepPed } from './pedestrians.js';
import { addHeat, clearWanted, createWanted, decayWanted, drawFootCop, maintainPolice, drivePoliceCar, stepFootCop } from './police.js';
import { burst, drawBullets, drawParticles, firePistol, makePistol, punch, startReload, stepParticles, stepPistol } from './combat.js';
import { createMissionRun, missionTarget, missionText, missionHeader, retryMission, stepMission, MISSIONS } from './missions.js';

export const EVENT_HIT = 1;
export const EVENT_BUSTED = 2;
export const EVENT_WASTED = 4;
export const EVENT_MISSION_DONE = 8;
export const EVENT_MISSION_FAILED = 16;
export const EVENT_PICKUP = 32;
export const EVENT_SPRAYED = 64;
export const EVENT_CRIME = 128;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createWorld(random) {
  const city = createCity(random);
  const state = {
    time: 0,
    cash: 0,
    bestCash: 0,
    missionIndex: 0,
    storyDone: false,
    city,
    player: {
      x: PLACES.hideout.x, y: PLACES.hideout.y + 60,
      angle: 0, health: PLAYER.health, invulnerable: 0,
      inCar: null, punchCooldown: 0, hurtTimer: 0,
      pistol: makePistol(),
    },
    cars: [],
    traffic: [],
    peds: [],
    police: { cars: [], cops: [] },
    bullets: [],
    particles: [],
    wanted: createWanted(),
    mission: null,
    camera: { x: PLACES.hideout.x, y: PLACES.hideout.y + 60, zoom: 1 },
    sprayCooldown: 0,
    notice: '',
    noticeTimer: 0,
    // Mission helpers the renderer reads: the target on the map, the
    // objective line and the banner header for the current job.
    missionTarget() { return state.mission ? missionTarget(state.mission) : null; },
    missionText() { return state.mission ? missionText(state.mission) : 'Free roam — the city is yours.'; },
    missionHeader() { return state.mission ? missionHeader(state.mission) : 'Free Roam'; },
  };

  function reset(full) {
    state.cars = [];
    state.traffic = spawnTraffic(random, city);
    state.cars.push(...state.traffic);
    state.cars.push(...spawnParked(random, city));
    state.peds = spawnPeds(random, city);
    state.police = { cars: [], cops: [] };
    state.bullets = [];
    state.particles = [];
    state.wanted = createWanted();
    state.player.x = PLACES.hideout.x;
    state.player.y = PLACES.hideout.y + 60;
    state.player.angle = 0;
    state.player.health = PLAYER.health;
    state.player.invulnerable = 0;
    state.player.inCar = null;
    state.player.pistol = makePistol();
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
    if (full) {
      state.cash = 0;
      state.missionIndex = 0;
      state.storyDone = false;
    }
    startMission(state.missionIndex);
  }

  function startMission(index) {
    state.missionIndex = index;
    if (index >= MISSIONS.length) {
      state.storyDone = true;
      state.mission = null;
      return;
    }
    state.mission = createMissionRun(index);
    if (MISSIONS[index].id === 'score') {
      // The armoured van waits at Port Gate.
      const van = makeCar(PLACES.port.x + 30, PLACES.port.y, Math.PI / 2, KIND_VAN, random);
      state.cars.push(van);
    }
  }

  function notice(text, seconds) {
    state.notice = text;
    state.noticeTimer = seconds ?? 3;
  }

  function saveGame() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: state.cash,
        missionIndex: state.missionIndex,
        storyDone: state.storyDone,
        bestCash: state.bestCash,
      }));
    } catch {
      // Storage can be off: the save then lasts this visit only.
    }
  }

  function loadGame() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function applySave(save) {
    state.cash = save.cash ?? 0;
    state.missionIndex = save.missionIndex ?? 0;
    state.storyDone = !!save.storyDone;
    state.bestCash = save.bestCash ?? 0;
    startMission(state.missionIndex);
  }

  function nearestCar(x, y, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of state.cars) {
      if (car.dead) continue;
      const d = Math.hypot(car.x - x, car.y - y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function enterCar() {
    const player = state.player;
    if (player.inCar) {
      // Get out beside the car.
      const car = player.inCar;
      const side = { x: -Math.sin(car.angle), y: Math.cos(car.angle) };
      player.x = car.x + side.x * 34;
      player.y = car.y + side.y * 34;
      player.angle = car.angle;
      car.speed *= 0.2;
      player.inCar = null;
      return;
    }
    const car = nearestCar(player.x, player.y, 70);
    if (!car) return;
    player.inCar = car;
    car.driver = null;
    const index = state.traffic.indexOf(car);
    if (index !== -1) state.traffic.splice(index, 1);
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    addHeat(state.wanted, WANTED.stealCar);
    notice('Car stolen — the cops noticed (+1 star heat)', 2.5);
  }

  function respawnAfterTrouble() {
    const player = state.player;
    player.inCar = null;
    player.x = PLACES.hospital.x;
    player.y = PLACES.hospital.y + 40;
    player.health = PLAYER.health;
    player.invulnerable = 2;
    clearWanted(state.wanted);
    state.police = { cars: [], cops: [] };
    state.bullets = [];
    state.camera.x = player.x;
    state.camera.y = player.y;
  }

  function hurtPlayer(amount) {
    const player = state.player;
    if (player.invulnerable > 0 || player.health <= 0) return false;
    player.health -= amount;
    player.invulnerable = 0.6;
    player.hurtTimer = 0.4;
    return true;
  }

  function step(dt, input) {
    let events = 0;
    const player = state.player;
    state.time += dt;
    if (state.noticeTimer > 0) state.noticeTimer -= dt;
    if (state.sprayCooldown > 0) state.sprayCooldown -= dt;
    if (player.invulnerable > 0) player.invulnerable -= dt;
    if (player.hurtTimer > 0) player.hurtTimer -= dt;
    if (player.punchCooldown > 0) player.punchCooldown -= dt;

    // --- The player ---
    if (player.inCar) {
      const car = player.inCar;
      const drive = {
        throttle: (input.up ? 1 : 0) - (input.down ? 1 : 0),
        steer: (input.right ? 1 : 0) - (input.left ? 1 : 0),
        handbrake: input.handbrake,
      };
      stepCar(car, drive, dt);
      // Buildings stop cars, hard.
      const probe = { x: car.x, y: car.y, radius: 20 };
      if (city.collideBuildings(probe)) {
        const impact = Math.abs(car.speed);
        car.x = probe.x;
        car.y = probe.y;
        if (impact > 200) {
          damageCar(car, impact * 0.02);
          burst(state.particles, car.x, car.y, 8, '#d8d8d8', 120, 0.5, 3);
          events |= EVENT_HIT;
        }
        car.speed *= 0.4;
      }
      player.x = car.x;
      player.y = car.y;
      player.angle = car.angle;
      if (car.dead) {
        burst(state.particles, car.x, car.y, 26, '#ff8c2e', 260, 0.9, 5);
        burst(state.particles, car.x, car.y, 14, '#3a3a3a', 120, 1.4, 7);
        player.inCar = null;
        player.x = car.x + 40;
        player.y = car.y + 40;
        hurtPlayer(25);
        events |= EVENT_HIT;
        notice('Your car is wrecked!', 2.5);
      }
      if (input.enter) enterCar();
    } else {
      const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const len = Math.hypot(input.mx, input.my);
      if (len > 0.01) {
        const nx = input.mx / Math.max(1, len);
        const ny = input.my / Math.max(1, len);
        player.x += nx * speed * dt;
        player.y += ny * speed * dt;
        player.angle = Math.atan2(ny, nx);
      }
      player.x = clamp(player.x, 12, WORLD.width - 12);
      player.y = clamp(player.y, 12, WORLD.height - 12);
      city.collideBuildings({ x: player.x, y: player.y, radius: PLAYER.radius });
      if (input.enter) enterCar();
      if (input.punch && player.punchCooldown <= 0) {
        player.punchCooldown = PLAYER.punchCooldown;
        const hit = punch(player.x, player.y, player.angle, [...state.peds, ...state.police.cops]);
        if (hit) {
          if (state.peds.includes(hit)) {
            knockPed(hit, 4);
            addHeat(state.wanted, WANTED.hitPed);
            events |= EVENT_CRIME;
          } else {
            hit.health = (hit.health ?? 100) - PLAYER.punchDamage;
            addHeat(state.wanted, WANTED.shoot);
            if (hit.health <= 0) {
              hit.dead = true;
              addHeat(state.wanted, WANTED.killCop);
              burst(state.particles, hit.x, hit.y, 12, '#c0392b', 140, 0.6, 4);
            }
          }
          burst(state.particles, hit.x, hit.y, 6, '#f0e0c0', 100, 0.4, 3);
        }
      }
      // The pistol: aim with the mouse, click to fire.
      stepPistol(player.pistol, dt);
      if (input.reload) startReload(player.pistol);
      if (input.shootX !== null && input.shootX !== undefined) {
        const bullet = firePistol(player.pistol, player.x, player.y, input.shootX, input.shootY, random);
        if (bullet) {
          state.bullets.push(bullet);
          player.angle = Math.atan2(input.shootY - player.y, input.shootX - player.x);
          addHeat(state.wanted, WANTED.shoot);
          events |= EVENT_CRIME;
          burst(state.particles, player.x + Math.cos(player.angle) * 20, player.y + Math.sin(player.angle) * 20, 3, '#ffe9a8', 90, 0.2, 2);
        } else if (player.pistol.ammo === 0 && player.pistol.reloading <= 0) {
          startReload(player.pistol);
        }
      }
      // Slow health regen out of trouble.
      if (player.health < PLAYER.health && player.invulnerable <= 0) {
        player.health = Math.min(PLAYER.health, player.health + 4 * dt);
      }
    }

    // --- Traffic ---
    for (const car of state.traffic) {
      if (car.dead) continue;
      const drive = driveTraffic(car, random, state.cars);
      stepCar(car, drive, dt);
      const probe = { x: car.x, y: car.y, radius: 20 };
      if (city.collideBuildings(probe)) {
        car.x = probe.x;
        car.y = probe.y;
        car.speed *= 0.5;
      }
      // A car that got far from the player reappears on a road nearby.
      if (Math.hypot(car.x - player.x, car.y - player.y) > 1100) {
        const point = city.randomRoadPoint(140);
        car.x = point.x;
        car.y = point.y;
        car.speed = 120;
      }
    }

    // --- Car-to-car bumps ---
    for (let i = 0; i < state.cars.length; i += 1) {
      for (let j = i + 1; j < state.cars.length; j += 1) {
        const a = state.cars[i];
        const b = state.cars[j];
        if (a.dead || b.dead || !carsOverlap(a, b)) continue;
        const impact = separateCars(a, b);
        if (impact > 180) {
          damageCar(a, impact * 0.03);
          damageCar(b, impact * 0.03);
          burst(state.particles, (a.x + b.x) / 2, (a.y + b.y) / 2, 6, '#d8d8d8', 110, 0.4, 3);
          if ((a === player.inCar || b === player.inCar) && hurtPlayer(6)) events |= EVENT_HIT;
        }
      }
    }

    // --- Pedestrians ---
    for (const ped of state.peds) {
      if (ped.dead) continue;
      stepPed(ped, city, dt, random);
      // A fast car nearby scares them off the road.
      if (player.inCar && Math.abs(player.inCar.speed) > 260) {
        const d = Math.hypot(ped.x - player.x, ped.y - player.y);
        if (d < 130) scarePeds(state.peds, player.x, player.y, 130);
      }
      // Run over by any car.
      for (const car of state.cars) {
        if (car.dead || Math.abs(car.speed) < 40) continue;
        const d = Math.hypot(ped.x - car.x, ped.y - car.y);
        if (d < 26) {
          knockPed(ped, 5);
          burst(state.particles, ped.x, ped.y, 8, '#c0392b', 120, 0.6, 4);
          if (car === player.inCar) {
            addHeat(state.wanted, WANTED.hitPed);
            events |= EVENT_CRIME;
            notice('You hit a pedestrian!', 2);
          }
          break;
        }
      }
    }

    // --- Police ---
    maintainPolice(state.police, state.wanted, player, city, random);
    let policeNear = false;
    for (const copCar of state.police.cars) {
      drivePoliceCar(copCar, player, city, dt);
      const probe = { x: copCar.x, y: copCar.y, radius: 20 };
      if (city.collideBuildings(probe)) {
        copCar.x = probe.x;
        copCar.y = probe.y;
        copCar.speed *= 0.5;
      }
      const d = Math.hypot(copCar.x - player.x, copCar.y - player.y);
      if (d < 500) policeNear = true;
      // A police ram hurts whoever is in the way.
      if (d < 34 && Math.abs(copCar.speed) > 60) {
        if (player.inCar) {
          damageCar(player.inCar, POLICE.ramDamage * dt * 2);
          if (hurtPlayer(4)) events |= EVENT_HIT;
        } else if (hurtPlayer(10)) {
          events |= EVENT_HIT;
        }
        copCar.speed *= 0.5;
      }
    }
    for (const cop of state.police.cops) {
      if (cop.dead) continue;
      const holding = stepFootCop(cop, player, dt);
      if (holding && !player.inCar) {
        cop.bustHold += dt;
        if (cop.bustHold >= POLICE.bustTime) {
          state.cash = Math.floor(state.cash * (1 - MONEY.bustedLoss));
          respawnAfterTrouble();
          events |= EVENT_BUSTED;
          notice('BUSTED! The cops took 20% of your cash.', 3.5);
          saveGame();
          break;
        }
      } else {
        cop.bustHold = Math.max(0, cop.bustHold - dt * 2);
      }
      // A cop on foot who is shot.
      if (cop.health !== undefined && cop.health <= 0) cop.dead = true;
    }
    state.police.cops = state.police.cops.filter((c) => !c.dead);
    state.police.cars = state.police.cars.filter((c) => !c.dead || Math.hypot(c.x - player.x, c.y - player.y) < 700);
    decayWanted(state.wanted, dt, policeNear);

    // --- Bullets ---
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let gone = b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD.width || b.y > WORLD.height;
      if (!gone && city.buildingAt(b.x, b.y)) {
        burst(state.particles, b.x, b.y, 4, '#e8c84a', 90, 0.3, 2);
        gone = true;
      }
      if (!gone) {
        for (const ped of state.peds) {
          if (ped.dead || ped.down > 0) continue;
          if (Math.hypot(ped.x - b.x, ped.y - b.y) < 13) {
            ped.dead = true;
            addHeat(state.wanted, WANTED.killPed);
            events |= EVENT_CRIME;
            burst(state.particles, ped.x, ped.y, 12, '#c0392b', 150, 0.7, 4);
            scarePeds(state.peds, ped.x, ped.y, 220);
            gone = true;
            break;
          }
        }
      }
      if (!gone) {
        for (const cop of state.police.cops) {
          if (cop.dead) continue;
          if (Math.hypot(cop.x - b.x, cop.y - b.y) < 13) {
            cop.health = (cop.health ?? 100) - b.damage;
            burst(state.particles, cop.x, cop.y, 8, '#c0392b', 130, 0.5, 4);
            if (cop.health <= 0) {
              cop.dead = true;
              addHeat(state.wanted, WANTED.killCop);
              events |= EVENT_CRIME;
            }
            gone = true;
            break;
          }
        }
      }
      if (!gone) {
        for (const car of state.cars) {
          if (car.dead || car === player.inCar) continue;
          const dx = b.x - car.x;
          const dy = b.y - car.y;
          const c = Math.cos(-car.angle);
          const s = Math.sin(-car.angle);
          const lx = dx * c - dy * s;
          const ly = dx * s + dy * c;
          if (Math.abs(lx) < CAR.length / 2 + 2 && Math.abs(ly) < CAR.width / 2 + 2) {
            const died = damageCar(car, b.damage);
            burst(state.particles, b.x, b.y, 6, '#e8c84a', 110, 0.4, 3);
            if (died) {
              burst(state.particles, car.x, car.y, 20, '#ff8c2e', 220, 0.8, 5);
              if (state.police.cars.includes(car)) addHeat(state.wanted, WANTED.killCop);
            }
            gone = true;
            break;
          }
        }
      }
      if (gone) state.bullets.splice(i, 1);
    }
    stepParticles(state.particles, dt);

    // --- The spray shop: drive in with heat and cash, drive out clean ---
    if (state.sprayCooldown <= 0 && player.inCar && state.wanted.stars > 0 && state.cash >= MONEY.sprayCost) {
      const d = Math.hypot(player.x - PLACES.spray.x, player.y - PLACES.spray.y);
      if (d < 80) {
        state.cash -= MONEY.sprayCost;
        clearWanted(state.wanted);
        state.police = { cars: [], cops: [] };
        state.sprayCooldown = 8;
        events |= EVENT_SPRAYED;
        notice(`Fresh Coat — new paint, clean slate. -$${MONEY.sprayCost}`, 3);
      }
    }

    // --- Missions ---
    if (state.mission && !state.mission.done && !state.mission.failed) {
      const event = stepMission(state.mission, {
        player, inCar: !!player.inCar, wantedStars: state.wanted.stars, dt,
      });
      if (event === 'wanted-up') {
        if (state.mission.mission.id === 'getaway') addHeat(state.wanted, 70);
        else if (state.mission.mission.id === 'bank') addHeat(state.wanted, 120);
        else if (state.mission.mission.id === 'score') addHeat(state.wanted, 180);
      } else if (event === 'picked-up') {
        events |= EVENT_PICKUP;
      } else if (event === 'failed') {
        events |= EVENT_MISSION_FAILED;
        notice('Mission failed — press R to retry.', 4);
      } else if (event === 'complete') {
        const reward = state.mission.mission.reward;
        state.cash += reward;
        state.bestCash = Math.max(state.bestCash, state.cash);
        events |= EVENT_MISSION_DONE;
        notice(`Job done! +$${reward}`, 4);
        const next = state.mission.index + 1;
        saveGame();
        if (next >= MISSIONS.length) {
          state.storyDone = true;
          state.mission = null;
        } else {
          startMission(next);
        }
      }
    }

    // --- Wasted ---
    if (player.health <= 0) {
      state.cash = Math.floor(state.cash * (1 - MONEY.wastedLoss));
      respawnAfterTrouble();
      events |= EVENT_WASTED;
      notice('WASTED! The hospital took 20% of your cash.', 3.5);
      saveGame();
    }

    // --- Camera: follow the player, easing behind them, wider when fast ---
    const targetZoom = player.inCar ? 0.82 : 1;
    state.camera.zoom += (targetZoom - state.camera.zoom) * Math.min(1, dt * 2);
    state.camera.x += (player.x - state.camera.x) * Math.min(1, dt * 4);
    state.camera.y += (player.y - state.camera.y) * Math.min(1, dt * 4);

    return events;
  }

  reset(true);
  return {
    state, city, reset, step, startMission, retryMission: () => {
      if (state.mission) retryMission(state.mission);
    },
    saveGame, loadGame, applySave, notice,
    missionTarget: () => (state.mission ? missionTarget(state.mission) : null),
    missionText: () => (state.mission ? missionText(state.mission) : 'Free roam — the city is yours.'),
    missionHeader: () => (state.mission ? missionHeader(state.mission) : 'Free Roam'),
    drawCar,
    drawPed,
    drawFootCop,
  };
}
