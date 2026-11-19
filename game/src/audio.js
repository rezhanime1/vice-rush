// Sound, synthesized live with WebAudio — no audio files, nothing to load.
// A low engine hum that follows the car's speed, a two-tone siren when the
// wanted level is up, and short blips for shots, pickups, crashes and
// mission jingles. Audio starts on the first user gesture, as browsers
// require; M toggles it.

export function createAudio() {
  let ctx = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      return true;
    } catch {
      return false;
    }
  }

  /** Call on the first gesture (a key or a click) so the context may start. */
  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
  }

  function tone(freq, seconds, type, volume, slideTo) {
    if (!ensure() || muted || ctx.state !== 'running') return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type ?? 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + seconds);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
  }

  function noise(seconds, volume, lowpass) {
    if (!ensure() || muted || ctx.state !== 'running') return;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass ?? 1200;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  }

  /** The engine hum, following the car's speed (0 when on foot). */
  function engine(speedRatio, dt) {
    if (!ensure() || muted) return;
    if (speedRatio <= 0.02) {
      if (engineOsc) {
        engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      }
      return;
    }
    if (!engineOsc) {
      engineOsc = ctx.createOscillator();
      engineGain = ctx.createGain();
      engineOsc.type = 'sawtooth';
      engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
    }
    engineOsc.frequency.setTargetAtTime(55 + speedRatio * 130, ctx.currentTime, 0.08);
    engineGain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.1);
  }

  /** The police siren, alternating two tones while any wanted stars are up. */
  function siren(wanted, dt) {
    if (!ensure() || muted || wanted <= 0) {
      if (sirenOsc) sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      return;
    }
    if (!sirenOsc) {
      sirenOsc = ctx.createOscillator();
      sirenGain = ctx.createGain();
      sirenOsc.type = 'triangle';
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(ctx.destination);
      sirenOsc.start();
    }
    sirenTimer -= dt;
    if (sirenTimer <= 0) {
      sirenTimer = 0.42;
      sirenHigh = !sirenHigh;
      sirenOsc.frequency.setValueAtTime(sirenHigh ? 880 : 660, ctx.currentTime);
    }
    sirenGain.gain.setTargetAtTime(0.02, ctx.currentTime, 0.1);
  }

  return {
    unlock,
    toggleMute() {
      muted = !muted;
      return muted;
    },
    isMuted: () => muted,
    engine,
    siren,
    shot() {
      noise(0.12, 0.5, 2400);
      tone(190, 0.08, 'square', 0.18, 60);
    },
    punch() {
      noise(0.08, 0.35, 900);
    },
    crash() {
      noise(0.25, 0.5, 700);
      tone(90, 0.2, 'sine', 0.3, 40);
    },
    pickup() {
      tone(660, 0.09, 'sine', 0.22);
      setTimeout(() => tone(990, 0.12, 'sine', 0.22), 90);
    },
    missionDone() {
      [523, 659, 784, 1047].forEach((freq, i) => {
        setTimeout(() => tone(freq, 0.16, 'triangle', 0.22), i * 110);
      });
    },
    failed() {
      tone(330, 0.25, 'sawtooth', 0.18, 160);
    },
    busted() {
      tone(440, 0.3, 'sawtooth', 0.2, 220);
      setTimeout(() => tone(330, 0.35, 'sawtooth', 0.2, 180), 220);
    },
  };
}
