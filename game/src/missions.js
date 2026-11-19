// The story of Vice Rush: five jobs for the fixer Mara Quinn, each a chain of
// steps the player works through in the open city. A mission run is a small
// state machine — the world feeds it what the player is doing, and it answers
// with the current objective, its target on the map, and what just happened.
import { PLACES } from './config.js';

export const MISSIONS = [
  {
    id: 'wheels',
    title: 'First Wheels',
    giver: 'Mara Quinn',
    briefing: 'You need wheels in this town, Rex. Take any car and bring it to the Hideout.',
    reward: 500,
    steps: [
      { type: 'car', text: 'Steal a car (walk up to one and press E)' },
      { type: 'goto', place: 'hideout', radius: 70, text: 'Drive to the Hideout' },
    ],
  },
  {
    id: 'package',
    title: 'Package Run',
    giver: 'Mara Quinn',
    briefing: 'A package is waiting at the Docks. Grab it on foot and run it to Motel Palm. Ninety seconds — the buyer does not wait.',
    reward: 900,
    steps: [
      { type: 'goto', place: 'docks', radius: 55, text: 'Go to the Docks' },
      { type: 'pickup', place: 'docks', radius: 45, text: 'Pick up the package' },
      { type: 'goto', place: 'motel', radius: 70, time: 90, text: 'Deliver to Motel Palm before the timer runs out' },
    ],
  },
  {
    id: 'getaway',
    title: 'Getaway',
    giver: 'Mara Quinn',
    briefing: 'My friend Lou is stuck at Coral Park with the cops on his tail. Pick him up, then shake the heat at Fresh Coat — the spray shop on the north side.',
    reward: 1400,
    steps: [
      { type: 'goto', place: 'park', radius: 60, text: 'Pick up Lou at Coral Park' },
      { type: 'pickup', place: 'park', radius: 45, text: 'Lou is with you — now lose the cops' },
      { type: 'clear', text: 'Lose the wanted level (Fresh Coat clears it for $200)' },
    ],
  },
  {
    id: 'bank',
    title: 'Bank Job',
    giver: 'Mara Quinn',
    briefing: 'The Bank of Solmar keeps its cash in a back room. Walk in, hold the room for three seconds, and get out. Then run — the whole city will be looking for you.',
    reward: 2500,
    steps: [
      { type: 'goto', place: 'bank', radius: 60, text: 'Reach the Bank of Solmar' },
      { type: 'grab', place: 'bank', radius: 50, hold: 3, text: 'Grab the cash — hold the room' },
      { type: 'goto', place: 'hideout', radius: 70, text: 'Escape to the Hideout' },
    ],
  },
  {
    id: 'score',
    title: 'The Big Score',
    giver: 'Mara Quinn',
    briefing: 'One last job, Rex. An armoured van is waiting at Port Gate. Drive it to the Hideout while every cop in Solmar Bay is on you. Do this and we are done.',
    reward: 5000,
    steps: [
      { type: 'car', place: 'port', radius: 90, text: 'Take the armoured van at Port Gate (press E)' },
      { type: 'goto', place: 'hideout', radius: 70, text: 'Deliver the van to the Hideout' },
    ],
  },
];

/** A fresh run of mission `index` (0-based). */
export function createMissionRun(index) {
  const mission = MISSIONS[index];
  return {
    mission,
    index,
    step: 0,
    timer: mission.steps[0].time ?? 0,
    hold: 0,
    failed: false,
    done: false,
    // The pickup flag: the player is carrying the job's item.
    carrying: false,
  };
}

/** Where the current step points on the map, or null when it points nowhere. */
export function missionTarget(run) {
  if (run.done) return null;
  const step = run.mission.steps[run.step];
  if (!step || !step.place) return null;
  const place = PLACES[step.place];
  return { x: place.x, y: place.y, label: place.label };
}

/** The one-line objective the HUD shows for the current step. */
export function missionText(run) {
  if (run.done) return 'Job done — see Mara for the next one.';
  return run.mission.steps[run.step].text;
}

/** The mission's title and step count for the HUD banner. */
export function missionHeader(run) {
  return `${run.mission.title} — step ${run.step + 1} of ${run.mission.steps.length}`;
}

function distTo(x, y, place) {
  return Math.hypot(x - place.x, y - place.y);
}

/**
 * Advance the mission run one step. `ctx` carries what the world knows:
 * player position, whether they are in a car, the wanted level and dt.
 * Returns an event string: 'advanced', 'failed', 'complete', 'picked-up',
 * 'wanted-up', or '' when nothing changed.
 */
export function stepMission(run, ctx) {
  if (run.done || run.failed) return '';
  const step = run.mission.steps[run.step];
  const player = ctx.player;
  if (step.time) {
    run.timer -= ctx.dt;
    if (run.timer <= 0) {
      run.failed = true;
      return 'failed';
    }
  }
  const place = step.place ? PLACES[step.place] : null;
  const near = place ? distTo(player.x, player.y, place) < (step.radius ?? 60) : false;
  switch (step.type) {
    case 'car': {
      if (!ctx.inCar) return '';
      if (place && !near) return '';
      break;
    }
    case 'goto': {
      if (!near) return '';
      break;
    }
    case 'pickup': {
      if (!near || ctx.inCar) return '';
      run.carrying = true;
      if (run.mission.id === 'getaway') return advance(run, 'picked-up', ctx);
      break;
    }
    case 'grab': {
      if (!near || ctx.inCar) {
        run.hold = 0;
        return '';
      }
      run.hold += ctx.dt;
      if (run.hold < (step.hold ?? 3)) return '';
      break;
    }
    case 'clear': {
      if (ctx.wantedStars > 0) return '';
      break;
    }
    default:
      return '';
  }
  return advance(run, 'advanced', ctx);
}

function advance(run, event, ctx) {
  run.step += 1;
  run.hold = 0;
  run.timer = 0;
  if (run.step >= run.mission.steps.length) {
    run.done = true;
    return 'complete';
  }
  const next = run.mission.steps[run.step];
  run.timer = next.time ?? 0;
  // The getaway heats up the moment Lou is picked up; the bank job heats up
  // the moment the cash is grabbed; the big score heats up the moment the van
  // is taken.
  if (event === 'picked-up' && run.mission.id === 'getaway') return 'wanted-up';
  if (run.mission.id === 'bank' && run.step === 2) return 'wanted-up';
  if (run.mission.id === 'score' && run.step === 1) return 'wanted-up';
  return event;
}

/** Restart a failed mission from its first step. */
export function retryMission(run) {
  run.step = 0;
  run.timer = run.mission.steps[0].time ?? 0;
  run.hold = 0;
  run.failed = false;
  run.carrying = false;
}
