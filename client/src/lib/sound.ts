// Petits sons synthétisés (Web Audio) : papier, tampon, horloge et bourdon, aucun fichier à charger.
import { useStore } from '../store';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!useStore.getState().prefs.sound) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slide?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.12, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, opts: { gain?: number; delay?: number; freq?: number; type?: BiquadFilterType } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const buffer = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = opts.type ?? 'bandpass';
  filter.frequency.value = opts.freq ?? 2400;
  const g = a.createGain();
  g.gain.value = opts.gain ?? 0.25;
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t0);
}

export const sfx = {
  /** Une feuille qu'on tourne. */
  paper: () => noise(0.14, { gain: 0.16, freq: 3400 }),
  /** Un souffle : quelqu'un chuchote quelque part. */
  whisper: () => {
    noise(0.28, { gain: 0.05, freq: 5200 });
    noise(0.2, { gain: 0.035, freq: 6400, delay: 0.14 });
  },
  message: () => tone(860, 0.06, { gain: 0.045, slide: 1.2 }),
  /** Le rideau de l'isoloir : du tissu, puis un bourdon. */
  curtain: () => {
    noise(0.6, { gain: 0.3, freq: 700 });
    [55, 82].forEach((f) => tone(f, 2.6, { type: 'sawtooth', gain: 0.05, delay: 0.1 }));
  },
  pick: () => tone(420, 0.09, { type: 'triangle', gain: 0.1, slide: 0.8 }),
  /** Le sceau de cire qui s'écrase. */
  seal: () => {
    noise(0.1, { gain: 0.5, freq: 260, type: 'lowpass' });
    tone(150, 0.14, { gain: 0.2, slide: 0.5 });
  },
  tick: () => {
    noise(0.02, { gain: 0.3, freq: 3000 });
    tone(1800, 0.02, { type: 'square', gain: 0.02 });
  },
  /** Un bulletin ouvert : la note monte, la tension aussi. */
  ballot: (n: number) => {
    noise(0.08, { gain: 0.18, freq: 2800 });
    tone(130 * 2 ** (n / 12), 0.22, { type: 'triangle', gain: 0.1 });
  },
  /** Le tampon rouge. */
  stamp: () => {
    noise(0.16, { gain: 0.9, freq: 170, type: 'lowpass' });
    tone(82, 0.32, { gain: 0.3, slide: 0.5 });
    noise(0.04, { gain: 0.25, freq: 2400 });
  },
  survive: () => [392, 494, 587].forEach((f, i) => tone(f, 0.5, { type: 'triangle', gain: 0.1, delay: i * 0.12 })),
  fall: () => {
    tone(196, 1.1, { type: 'sawtooth', gain: 0.09, slide: 0.35 });
    tone(147, 1.1, { type: 'sawtooth', gain: 0.07, slide: 0.35, delay: 0.1 });
  },
  betrayal: () => {
    [233, 247].forEach((f) => tone(f, 0.7, { type: 'sawtooth', gain: 0.08 }));
    noise(0.1, { gain: 0.35, freq: 400, type: 'lowpass' });
  },
  kept: () => tone(523, 0.22, { type: 'triangle', gain: 0.07 }),
  champion: () => [262, 330, 392, 523, 659, 784].forEach((f, i) => tone(f, 0.8, { type: 'triangle', gain: 0.08, delay: i * 0.16 })),
  pop: () => tone(700, 0.08, { gain: 0.06, slide: 1.6 }),
};
