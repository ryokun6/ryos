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

    // Stage 1 (0–60ms): low chassis "thunk" of the power button engaging.
    const thunk = ctx.createOscillator();
    thunk.type = "sine";
    thunk.frequency.setValueAtTime(160, t);
    thunk.frequency.exponentialRampToValueAtTime(40, t + 0.22);
    const thunkGain = ctx.createGain();
    thunkGain.gain.setValueAtTime(0.0001, t);
    thunkGain.gain.exponentialRampToValueAtTime(0.4 * v, t + 0.012);
    thunkGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    thunk.connect(thunkGain);
    thunkGain.connect(ctx.destination);
    thunk.start(t);
    thunk.stop(t + 0.32);

    // Stage 2 (~140–650ms): rising tube whine — the high-voltage line
    // ramping up. Slower ramp than before so the pitch follows the
    // visual unfold rather than racing ahead.
    const whine = ctx.createOscillator();
    whine.type = "sawtooth";
    whine.frequency.setValueAtTime(70, t + 0.12);
    whine.frequency.exponentialRampToValueAtTime(900, t + 0.62);
    const whineFilter = ctx.createBiquadFilter();
    whineFilter.type = "lowpass";
    whineFilter.frequency.setValueAtTime(900, t + 0.12);
    whineFilter.frequency.exponentialRampToValueAtTime(2400, t + 0.62);
    const whineGain = ctx.createGain();
    whineGain.gain.setValueAtTime(0, t + 0.12);
    whineGain.gain.linearRampToValueAtTime(0.07 * v, t + 0.22);
    whineGain.gain.setValueAtTime(0.07 * v, t + 0.55);
    whineGain.gain.exponentialRampToValueAtTime(0.001, t + 0.78);
    whine.connect(whineFilter);
    whineFilter.connect(whineGain);
    whineGain.connect(ctx.destination);
    whine.start(t + 0.12);
    whine.stop(t + 0.82);

    // Stage 3 (~280–820ms): swept noise crack as the picture warms up.
    // Bandpass sweeps from 800Hz up to 5kHz, mimicking the high-pitched
    // hiss of a CRT settling in.
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.Q.value = 0.6;
    noiseFilter.frequency.setValueAtTime(800, t + 0.28);
    noiseFilter.frequency.exponentialRampToValueAtTime(5000, t + 0.7);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0, t + 0.28);
    noiseGain.gain.linearRampToValueAtTime(0.16 * v, t + 0.36);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.82);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(t + 0.28);
    noise.stop(t + 0.85);
  }, [ensureContext, getNoiseBuffer]);

  const playPowerOff = useCallback(async () => {
    const ctx = await ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const v = volumeRef.current;
    if (v <= 0) return;

    // Stage 1 (0–230ms): "shhk" of the picture squeezing in — short
    // bandpass noise sweep falling from 4kHz to 600Hz, matching the
    // visual vertical squeeze.
    const squeeze = ctx.createBufferSource();
    squeeze.buffer = getNoiseBuffer(ctx);
    squeeze.loop = true;
    const squeezeFilter = ctx.createBiquadFilter();
    squeezeFilter.type = "bandpass";
    squeezeFilter.Q.value = 0.7;
    squeezeFilter.frequency.setValueAtTime(4000, t);
    squeezeFilter.frequency.exponentialRampToValueAtTime(600, t + 0.23);
    const squeezeGain = ctx.createGain();
    squeezeGain.gain.setValueAtTime(0, t);
    squeezeGain.gain.linearRampToValueAtTime(0.16 * v, t + 0.04);
    squeezeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    squeeze.connect(squeezeFilter);
    squeezeFilter.connect(squeezeGain);
    squeezeGain.connect(ctx.destination);
    squeeze.start(t);
    squeeze.stop(t + 0.3);

    // Stage 2 (60–620ms): falling flyback whine — the high-voltage
    // line winding down. Sawtooth so the harmonics give it that
    // unmistakable analog-TV decay.
    const whine = ctx.createOscillator();
    whine.type = "sawtooth";
    whine.frequency.setValueAtTime(1400, t + 0.06);
    whine.frequency.exponentialRampToValueAtTime(40, t + 0.6);
    const whineFilter = ctx.createBiquadFilter();
    whineFilter.type = "lowpass";
    whineFilter.frequency.setValueAtTime(2400, t + 0.06);
    whineFilter.frequency.exponentialRampToValueAtTime(220, t + 0.62);
    const whineGain = ctx.createGain();
    whineGain.gain.setValueAtTime(0.0001, t + 0.06);
    whineGain.gain.exponentialRampToValueAtTime(0.11 * v, t + 0.1);
    whineGain.gain.setValueAtTime(0.11 * v, t + 0.45);
    whineGain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    whine.connect(whineFilter);
    whineFilter.connect(whineGain);
    whineGain.connect(ctx.destination);
    whine.start(t + 0.06);
    whine.stop(t + 0.72);

    // Stage 3 (~440ms): soft "tk" click as the dot collapses to a
    // point. Aligns with the beam → dot transition in PowerOffEffect.
    const click = ctx.createOscillator();
    click.type = "sine";
    click.frequency.setValueAtTime(2200, t + 0.44);
    click.frequency.exponentialRampToValueAtTime(700, t + 0.55);
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0, t + 0.44);
    clickGain.gain.linearRampToValueAtTime(0.2 * v, t + 0.455);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.62);
    click.connect(clickGain);
    clickGain.connect(ctx.destination);
    click.start(t + 0.44);
    click.stop(t + 0.65);
  }, [ensureContext, getNoiseBuffer]);

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
