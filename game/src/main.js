// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), the
// renderer paints what is there, and the audio follows the car and the cops.
// The game moves between seven screens: title, play, paused, busted, wasted,
// mission failed and story complete. One-shot presses are read once per frame
// and handed to the first simulation step only, so a press is never lost and
// never counted twice.
//
// ?seed=N fixes the city and the traffic. ?shot=start|drive|chase|mission
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_CRIME, EVENT_HIT, EVENT_MISSION_DONE, EVENT_MISSION_FAILED, EVENT_PICKUP, EVENT_SPRAYED, EVENT_WASTED } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_NEWGAME, ACTION_PAUSE, ACTION_PUNCH, ACTION_RELOAD, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_FAILED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_STORY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();
const saved = world.loadGame();

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let storyShown = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startPlay() {
    screen = SCREEN_PLAY;
    announce('Playing. Follow the mission at the top of the screen.');
  }

  function beginNewGame() {
    world.reset(true);
    storyShown = false;
    startPlay();
  }

  function continueGame() {
    if (saved) world.applySave(saved);
    storyShown = false;
    startPlay();
  }

  /** Screen changes for this frame's one-shot presses. */
  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    audio.unlock();
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_NEWGAME) beginNewGame();
      else if (actions & ACTION_CONFIRM) {
        if (saved) continueGame();
        else beginNewGame();
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (screen === SCREEN_FAILED) {
      if (actions & ACTION_RELOAD) {
        world.retryMission();
        screen = SCREEN_PLAY;
        announce('Mission restarted.');
      }
      return;
    }
    if (screen === SCREEN_STORY) {
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        announce('Free roam. The city is yours.');
      }
      return;
    }
    // SCREEN_PLAY.
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  }

  /** One simulation step: build its input, run the world, react to events. */
  function stepFrame(actions, clicked) {
    const move = input.move();
    const player = world.state.player;
    const frameInput = {
      mx: move.x,
      my: move.y,
      up: input.up(),
      down: input.down(),
      left: input.left(),
      right: input.right(),
      run: input.run(),
      enter: !!(actions & ACTION_ENTER),
      punch: !!(actions & ACTION_PUNCH) && !player.inCar,
      reload: !!(actions & ACTION_RELOAD),
      shootX: null,
      shootY: null,
      handbrake: input.handbrake(),
    };
    if (clicked && !player.inCar) {
      const mouse = input.mouse();
      const aim = renderer.screenToWorld(mouse.x, mouse.y);
      frameInput.shootX = aim.x;
      frameInput.shootY = aim.y;
    }
    const ammoBefore = player.pistol.ammo;
    const events = world.step(STEP, frameInput);
    if (player.pistol.ammo < ammoBefore) audio.shot();
    if (events & EVENT_HIT) audio.crash();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_SPRAYED) audio.pickup();
    if (events & EVENT_MISSION_DONE) audio.missionDone();
    if (events & EVENT_MISSION_FAILED) {
      audio.failed();
      screen = SCREEN_FAILED;
      announce('Mission failed. Press R to retry.');
    }
    if (events & EVENT_BUSTED) {
      audio.busted();
      screen = SCREEN_BUSTED;
      announce('Busted. Press Enter to continue.');
    }
    if (events & EVENT_WASTED) {
      audio.busted();
      screen = SCREEN_WASTED;
      announce('Wasted. Press Enter to continue.');
    }
    if (world.state.storyDone && !storyShown) {
      storyShown = true;
      screen = SCREEN_STORY;
      announce('Story complete. The Big Score is done.');
    }
    // The engine and the siren follow the game every step.
    const car = player.inCar;
    audio.engine(car ? Math.abs(car.speed) / car.maxSpeed : 0, STEP);
    audio.siren(world.state.wanted.stars, STEP);
  }

  let accumulator = 0;
  let last = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    const clicked = input.takeClick();
    handleActions(actions);
    if (screen === SCREEN_PLAY) {
      let first = true;
      while (accumulator >= STEP) {
        stepFrame(first ? actions : 0, first ? clicked : false);
        accumulator -= STEP;
        first = false;
        if (screen !== SCREEN_PLAY) {
          accumulator = 0;
          break;
        }
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, saved ? world.state.bestCash : null);
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Vice Rush. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
