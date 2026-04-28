import { useCallback, useEffect, useRef } from "react";
import { getAudioContext, resumeAudioContext } from "@/lib/audioContext";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";

/**
 * Procedural Web Audio synth for the TV app's CRT effects. All sounds are
 * generated on the fly — no asset files — so they stay in sync with the
 * shader timings in TvCrtEffects and don't bloat the bundle.
 *
 * - powerOn:   short rising tone + soft "thunk" + brief noise burst,
 *              imitating a CRT degaussing as it warms up.
 * - powerOff:  inverse — high "tube whine" snaps down, plus a low thunk.
 * - channelSwitch: short noise burst with a quick filter sweep, like
 *                  switching between analog channels.
 * - startStatic / stopStatic: looping pink-ish noise bed for the
 *                  buffering / "no signal" state. Caller stops it when
 *                  the picture comes back.
 */

interface NoiseBedHandle {
  source: AudioBufferSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode;
}

const NOISE_BUFFER_SECONDS = 2;

function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * NOISE_BUFFER_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Pink-ish noise via Voss algorithm (cheap approximation). Plain white
  // noise sounds harsh and digital; pink noise is closer to a real
  // analog-TV "shhhh".
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    data[i] = pink * 0.11; // scale to ~unity loudness
  }
  return buffer;
}

export function useTvSoundFx() {
  const masterVolume = useAudioSettingsStore((s) => s.masterVolume);
  const uiVolume = useAudioSettingsStore((s) => s.uiVolume);

  // Cache the noise buffer per AudioContext so we don't regenerate ~88k
  // samples for every tone. Re-created lazily if the context changes
  // (Safari may close + recreate it on long backgrounding).
  const noiseBufferRef = useRef<{ ctx: AudioContext; buffer: AudioBuffer } | null>(
    null
  );
  const noiseBedRef = useRef<NoiseBedHandle | null>(null);
  // Latest volume in a ref so the long-lived noise bed can react to
  // setting changes without restarting.
  const volumeRef = useRef(masterVolume * uiVolume);

  useEffect(() => {
    volumeRef.current = masterVolume * uiVolume;
    const bed = noiseBedRef.current;
    if (!bed) return;
    try {
      const ctx = getAudioContext();
      bed.gain.gain.cancelScheduledValues(ctx.currentTime);
      bed.gain.gain.linearRampToValueAtTime(
        0.18 * volumeRef.current,
        ctx.currentTime + 0.05
      );
    } catch {
      // ignore — bed may have been cleaned up between checks
    }
  }, [masterVolume, uiVolume]);

  const getNoiseBuffer = useCallback((ctx: AudioContext) => {
    if (!noiseBufferRef.current || noiseBufferRef.current.ctx !== ctx) {
      noiseBufferRef.current = { ctx, buffer: createNoiseBuffer(ctx) };
    }
    return noiseBufferRef.current.buffer;
  }, []);

  const ensureContext = useCallback(async (): Promise<AudioContext | null> => {
    try {
      await resumeAudioContext();
      const ctx = getAudioContext();
      if (ctx.state === "closed") return null;
      return ctx;
    } catch (err) {
      console.warn("[tvSoundFx] failed to resume audio context", err);
      return null;
    }
  }, []);

  const playPowerOn = useCallback(async () => {
    const ctx = await ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const v = volumeRef.current;
    if (v <= 0) return;

    // 1. Rising tube whine: square 80Hz → 600Hz over ~0.45s, fast decay.
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.45);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0, t);
    oscGain.gain.linearRampToValueAtTime(0.08 * v, t + 0.05);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    const oscFilter = ctx.createBiquadFilter();
    oscFilter.type = "lowpass";
    oscFilter.frequency.value = 1800;
    osc.connect(oscFilter);
    oscFilter.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.6);

    // 2. Low "thunk" of the chassis snapping on.
    const thunk = ctx.createOscillator();
    thunk.type = "sine";
    thunk.frequency.setValueAtTime(140, t);
    thunk.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    const thunkGain = ctx.createGain();
    thunkGain.gain.setValueAtTime(0.0001, t);
    thunkGain.gain.exponentialRampToValueAtTime(0.35 * v, t + 0.01);
    thunkGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    thunk.connect(thunkGain);
    thunkGain.connect(ctx.destination);
    thunk.start(t);
    thunk.stop(t + 0.3);

    // 3. Short noise crack as the picture warms up.
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "highpass";
    noiseFilter.frequency.setValueAtTime(800, t);
    noiseFilter.frequency.exponentialRampToValueAtTime(4000, t + 0.4);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0, t);
    noiseGain.gain.linearRampToValueAtTime(0.18 * v, t + 0.06);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + 0.55);
  }, [ensureContext, getNoiseBuffer]);

  const playPowerOff = useCallback(async () => {
    const ctx = await ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const v = volumeRef.current;
    if (v <= 0) return;

    // 1. Falling tube whine: 1200Hz → 60Hz, mimicking the flyback
    //    transformer winding down.
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.45);
    const oscFilter = ctx.createBiquadFilter();
    oscFilter.type = "lowpass";
    oscFilter.frequency.setValueAtTime(2200, t);
    oscFilter.frequency.exponentialRampToValueAtTime(300, t + 0.5);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.0001, t);
    oscGain.gain.exponentialRampToValueAtTime(0.1 * v, t + 0.02);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    osc.connect(oscFilter);
    oscFilter.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.6);

    // 2. Soft "tk" as the dot collapses.
    const click = ctx.createOscillator();
    click.type = "sine";
    click.frequency.setValueAtTime(2400, t + 0.42);
    click.frequency.exponentialRampToValueAtTime(800, t + 0.5);
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0, t + 0.42);
    clickGain.gain.linearRampToValueAtTime(0.18 * v, t + 0.43);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    click.connect(clickGain);
    clickGain.connect(ctx.destination);
    click.start(t + 0.42);
    click.stop(t + 0.6);
  }, [ensureContext]);

  const playChannelSwitch = useCallback(async () => {
    const ctx = await ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const v = volumeRef.current;
    if (v <= 0) return;

    // Quick filtered noise burst with a falling bandpass sweep + a tiny
    // mechanical "ka-chunk" click at the start (analog channel knob).
    const click = ctx.createOscillator();
    click.type = "square";
    click.frequency.setValueAtTime(220, t);
    click.frequency.exponentialRampToValueAtTime(80, t + 0.04);
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.0001, t);
    clickGain.gain.exponentialRampToValueAtTime(0.18 * v, t + 0.005);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    click.connect(clickGain);
    clickGain.connect(ctx.destination);
    click.start(t);
    click.stop(t + 0.07);

    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(3000, t);
    filter.frequency.exponentialRampToValueAtTime(900, t + 0.4);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.22 * v, t + 0.02);
    gain.gain.setValueAtTime(0.22 * v, t + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + 0.55);
  }, [ensureContext, getNoiseBuffer]);

  const stopStatic = useCallback(() => {
    const bed = noiseBedRef.current;
    if (!bed) return;
    noiseBedRef.current = null;
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;
      bed.gain.gain.cancelScheduledValues(now);
      bed.gain.gain.setValueAtTime(bed.gain.gain.value, now);
      bed.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      bed.source.stop(now + 0.2);
    } catch {
      try {
        bed.source.stop();
      } catch {
        /* already stopped */
      }
    }
  }, []);

  const startStatic = useCallback(async () => {
    if (noiseBedRef.current) return;
    const ctx = await ensureContext();
    if (!ctx) return;
    const v = volumeRef.current;
    if (v <= 0) return;

    const source = ctx.createBufferSource();
    source.buffer = getNoiseBuffer(ctx);
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.18 * v, ctx.currentTime + 0.18);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start();
    noiseBedRef.current = { source, gain, filter };
  }, [ensureContext, getNoiseBuffer]);

  // Stop any lingering noise bed when the consumer unmounts.
  useEffect(() => {
    return () => {
      stopStatic();
    };
  }, [stopStatic]);

  return {
    playPowerOn,
    playPowerOff,
    playChannelSwitch,
    startStatic,
    stopStatic,
  };
}
