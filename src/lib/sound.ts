"use client";

// Tiny Web Audio synth for live-play sounds — no assets, no dependencies.
// Browsers block audio until a user gesture, so callers unlock the context
// on first interaction (see the mute toggles on /play and /screen).

export type SoundKind =
  | "click"
  | "tick"
  | "urgent"
  | "timeup"
  | "correct"
  | "wrong"
  | "turn"
  | "start";

let ctx: AudioContext | null = null;

type AudioContextCtor = typeof AudioContext;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { webkitAudioContext?: AudioContextCtor };
  const Ctor = window.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

/** Resume the context after a user gesture (required by autoplay policies). */
export function unlockAudio(): void {
  const c = getCtx();
  if (c && c.state === "suspended") void c.resume();
}

function tone(
  c: AudioContext,
  freq: number,
  delay: number,
  duration: number,
  type: OscillatorType,
  gain: number,
  freqEnd?: number
) {
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const vol = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t0 + duration);
  }
  vol.gain.setValueAtTime(0.0001, t0);
  vol.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  vol.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(vol).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

/** Fire a named sound. Never throws; silently no-ops when disabled/unsupported. */
export function playSound(kind: SoundKind, enabled: boolean): void {
  if (!enabled) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  try {
    switch (kind) {
      case "click":
        tone(c, 520, 0, 0.07, "sine", 0.06);
        break;
      case "tick":
        tone(c, 950, 0, 0.05, "sine", 0.07);
        break;
      case "urgent":
        tone(c, 1150, 0, 0.08, "square", 0.05);
        tone(c, 1150, 0.12, 0.08, "square", 0.05);
        break;
      case "timeup":
        tone(c, 320, 0, 0.5, "sawtooth", 0.09, 120);
        break;
      case "correct":
        tone(c, 523.25, 0, 0.16, "triangle", 0.09);
        tone(c, 659.25, 0.12, 0.16, "triangle", 0.09);
        tone(c, 783.99, 0.24, 0.3, "triangle", 0.1);
        break;
      case "wrong":
        tone(c, 233.08, 0, 0.22, "sawtooth", 0.08);
        tone(c, 174.61, 0.18, 0.34, "sawtooth", 0.08);
        break;
      case "turn":
        tone(c, 660, 0, 0.1, "sine", 0.07);
        tone(c, 880, 0.09, 0.14, "sine", 0.07);
        break;
      case "start":
        tone(c, 392, 0, 0.15, "triangle", 0.09);
        tone(c, 523.25, 0.14, 0.15, "triangle", 0.09);
        tone(c, 659.25, 0.28, 0.3, "triangle", 0.1);
        break;
    }
  } catch {
    /* audio is best-effort */
  }
}

const PREF_KEY = "fassa_sound";

/** Local mute preference (clients can mute even when the match allows sound). */
export function readSoundPref(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeSoundPref(on: boolean): void {
  try {
    window.localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
}
