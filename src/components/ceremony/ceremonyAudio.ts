/**
 * ceremonyAudio.ts
 * -----------------------------------------------------------------------------
 * Phase II — Ambient Audio Soundscape Engine.
 *
 * A self-contained Web Audio API engine that *synthesises* a distinct ambient
 * bed per chapter (no audio assets required) and cross-fades between them on
 * chapter transitions via per-voice gain nodes.
 *
 * Node tree:
 *
 *   [voice generators] → chapterGain(0..level) ─┬─→ dryGain ───────────────┐
 *                                               └─→ convolver → wetGain ────┤
 *                                                                           ▼
 *                                          masterLowpass → masterGain → destination
 *
 * Every voice runs continuously; only its `chapterGain` is ramped, so
 * transitions are seamless (no start/stop clicks). A generated convolution
 * reverb + gentle master low-pass keep the whole mix soft, spatial, and calm.
 *
 * Soundscapes (procedural approximations of the described textures):
 *   proposal → water ripples lapping stone + distant acoustic flute
 *   mehendi  → morning birdsong in a canopy + solo rabab
 *   sangeet  → low wooden dholak resonance + distant crowd chatter
 *   wedding  → deep Vedic chant drone + steady sandalwood fire crackle
 */

type NoiseKind = "white" | "brown";

/** Every chapter carries its own synthesised soundscape. */
const VOICE_IDS = [
  "proposal",
  "engagement",
  "mehendi",
  "sangeet",
  "wedding",
  "reception",
  "legacy",
] as const;
type VoiceId = (typeof VOICE_IDS)[number];

interface Voice {
  readonly gain: GainNode;
  /** Target gain when this chapter is active. */
  readonly level: number;
}

/** Resolve the AudioContext constructor with a webkit fallback (SSR-safe). */
function resolveAudioContext(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext;
}

export class CeremonySoundscape {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private started = false;

  /** Currently active chapter — gates each voice's random one-shot generators. */
  private activeId: string | null = null;

  private readonly voices = new Map<VoiceId, Voice>();
  private readonly intervals: number[] = [];

  /** Soft overall level — spatial and calming, never loud. */
  private readonly masterLevel = 0.22;

  /** Whether the engine could be constructed (Web Audio available). */
  get supported(): boolean {
    return resolveAudioContext() !== undefined;
  }

  /** Lazily build the graph + all voice generators. Idempotent. */
  start(): void {
    if (this.started) return;
    const Ctor = resolveAudioContext();
    if (!Ctor) return;

    const ctx = new Ctor();
    this.ctx = ctx;

    // Master chain.
    const master = ctx.createGain();
    master.gain.value = 0; // faded up by setEnabled()
    master.connect(ctx.destination);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 6500; // soften highs
    lowpass.connect(master);

    const dry = ctx.createGain();
    dry.gain.value = 0.8;
    dry.connect(lowpass);

    const convolver = ctx.createConvolver();
    convolver.buffer = this.impulseResponse(2.6, 2.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.35; // spatial send
    convolver.connect(wet);
    wet.connect(lowpass);

    this.masterGain = master;
    this.dryGain = dry;
    this.wetGain = wet;

    // Build voices, each feeding dry + reverb via its own chapter gain.
    for (const id of VOICE_IDS) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(dry);
      g.connect(convolver);
      this.voices.set(id, { gain: g, level: 0.9 });
    }

    this.buildProposal("proposal", this.voices.get("proposal")!.gain);
    this.buildEngagement("engagement", this.voices.get("engagement")!.gain);
    this.buildMehendi("mehendi", this.voices.get("mehendi")!.gain);
    this.buildSangeet("sangeet", this.voices.get("sangeet")!.gain);
    this.buildWedding("wedding", this.voices.get("wedding")!.gain);
    this.buildReception("reception", this.voices.get("reception")!.gain);
    this.buildLegacy("legacy", this.voices.get("legacy")!.gain);

    this.started = true;
  }

  /** Resume a suspended context (call from a user gesture). */
  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  /** Fade the master bus in or out. */
  setEnabled(on: boolean): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const g = this.masterGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(on ? this.masterLevel : 0, now + 1.2);
  }

  /** Cross-fade to a chapter's soundscape over `fadeSeconds`. */
  setChapter(id: string, fadeSeconds: number): void {
    if (!this.ctx) return;
    this.activeId = id;
    const now = this.ctx.currentTime;
    for (const [voiceId, voice] of this.voices) {
      const target = voiceId === id ? voice.level : 0;
      const g = voice.gain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(target, now + Math.max(0.05, fadeSeconds));
    }
  }

  /** Tear everything down and free the audio hardware. */
  dispose(): void {
    for (const id of this.intervals) window.clearInterval(id);
    this.intervals.length = 0;
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.voices.clear();
    this.masterGain = null;
    this.started = false;
  }

  // ---------------------------------------------------------------------------
  // Low-level helpers
  // ---------------------------------------------------------------------------

  private get now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** A looping noise source of the requested colour. */
  private noise(kind: NoiseKind): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    if (kind === "white") {
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } else {
      // Brown noise: integrated white, gently normalised.
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        data[i] = last * 3.2;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.start();
    return src;
  }

  /** A decaying-noise impulse response for the convolution reverb. */
  private impulseResponse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buffer;
  }

  /** Register a repeating scheduler (tracked for cleanup). */
  private every(ms: number, fn: () => void): void {
    const id = window.setInterval(fn, ms);
    this.intervals.push(id);
  }

  /** Play a short enveloped tone into `dest` (osc + gain + optional pan). */
  private blip(
    dest: AudioNode,
    opts: {
      type: OscillatorType;
      freq: number;
      toFreq?: number;
      peak: number;
      attack: number;
      dur: number;
      pan?: number;
      filter?: { type: BiquadFilterType; freq: number };
    },
  ): void {
    const ctx = this.ctx!;
    const t = this.now;
    const osc = ctx.createOscillator();
    osc.type = opts.type;
    osc.frequency.setValueAtTime(opts.freq, t);
    if (opts.toFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(1, opts.toFreq),
        t + opts.dur,
      );
    }

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.peak, t + opts.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);

    let node: AudioNode = osc;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = opts.filter.type;
      f.frequency.value = opts.filter.freq;
      node.connect(f);
      node = f;
    }
    node.connect(g);

    if (opts.pan !== undefined) {
      const p = ctx.createStereoPanner();
      p.pan.value = opts.pan;
      g.connect(p);
      p.connect(dest);
    } else {
      g.connect(dest);
    }

    osc.start(t);
    osc.stop(t + opts.dur + 0.1);
  }

  // ---------------------------------------------------------------------------
  // Voice builders
  // ---------------------------------------------------------------------------

  /** Proposal: low rhythmic wave movement + light airy flute oscillator. */
  private buildProposal(id: VoiceId, dest: GainNode): void {
    const ctx = this.ctx!;

    // Water bed: brown noise through a slowly sweeping band-pass.
    const water = this.noise("brown");
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 480;
    bp.Q.value = 0.7;
    const waterGain = ctx.createGain();
    waterGain.gain.value = 0.5;
    water.connect(bp);
    bp.connect(waterGain);
    waterGain.connect(dest);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain);
    lfoGain.connect(bp.frequency);
    lfo.start();

    // Occasional ripple accents.
    this.every(1300, () => {
      if (this.activeId !== id) return;
      if (Math.random() < 0.6) {
        this.blip(dest, {
          type: "sine",
          freq: 220 + Math.random() * 120,
          toFreq: 120,
          peak: 0.05,
          attack: 0.02,
          dur: 0.5,
          pan: Math.random() * 1.4 - 0.7,
          filter: { type: "lowpass", freq: 900 },
        });
      }
    });

    // Distant flute: soft pentatonic notes with vibrato, long and airy.
    const flute = [392, 440, 523.25, 587.33, 659.25];
    this.every(3400, () => {
      if (this.activeId !== id) return;
      if (Math.random() < 0.7) {
        const base = flute[Math.floor(Math.random() * flute.length)];
        this.blip(dest, {
          type: "triangle",
          freq: base,
          peak: 0.06,
          attack: 0.4,
          dur: 2.2,
          pan: Math.random() * 0.6 - 0.3,
          filter: { type: "lowpass", freq: 1800 },
        });
      }
    });
  }

  /** Mehendi: bright acoustic string loop + randomized bird chirps. */
  private buildMehendi(id: VoiceId, dest: GainNode): void {
    const ctx = this.ctx!;

    // Soft canopy air bed.
    const air = this.noise("white");
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 3000;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.015;
    air.connect(hp);
    hp.connect(airGain);
    airGain.connect(dest);

    // Birds: quick chirp sweeps, sometimes in trills.
    this.every(700, () => {
      if (this.activeId !== id) return;
      if (Math.random() < 0.55) {
        const syllables = 1 + Math.floor(Math.random() * 3);
        const pan = Math.random() * 1.6 - 0.8;
        for (let s = 0; s < syllables; s++) {
          const f0 = 2600 + Math.random() * 2200;
          window.setTimeout(() => {
            this.blip(dest, {
              type: "sine",
              freq: f0,
              toFreq: f0 * 0.6,
              peak: 0.05,
              attack: 0.008,
              dur: 0.09,
              pan,
            });
          }, s * 90);
        }
      }
    });

    // Rabab: plucked notes on a warm scale.
    const rabab = [196, 220, 246.94, 293.66, 329.63];
    this.every(1500, () => {
      if (this.activeId !== id) return;
      if (Math.random() < 0.6) {
        const base = rabab[Math.floor(Math.random() * rabab.length)];
        this.blip(dest, {
          type: "sawtooth",
          freq: base,
          peak: 0.07,
          attack: 0.01,
          dur: 0.7,
          pan: Math.random() * 0.5 - 0.25,
          filter: { type: "lowpass", freq: 1400 },
        });
      }
    });
  }

  /** Sangeet: low rhythmic percussive bass pulse + distant crowd chatter. */
  private buildSangeet(id: VoiceId, dest: GainNode): void {
    const ctx = this.ctx!;

    // Crowd chatter: band-passed white noise with a slow tremolo.
    const crowd = this.noise("white");
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1100;
    bp.Q.value = 0.8;
    const crowdGain = ctx.createGain();
    crowdGain.gain.value = 0.05;
    crowd.connect(bp);
    bp.connect(crowdGain);
    crowdGain.connect(dest);

    const trem = ctx.createOscillator();
    trem.frequency.value = 0.9;
    const tremGain = ctx.createGain();
    tremGain.gain.value = 0.02;
    trem.connect(tremGain);
    tremGain.connect(crowdGain.gain);
    trem.start();

    // Dholak: a steady two-beat pattern of resonant membrane hits.
    let beat = 0;
    this.every(430, () => {
      if (this.activeId !== id) return;
      beat = (beat + 1) % 4;
      const low = beat === 0 || beat === 2;
      // Sub-bass pulse on the downbeat anchors the room's low end.
      if (low) {
        this.blip(dest, {
          type: "sine",
          freq: 70,
          toFreq: 44,
          peak: 0.16,
          attack: 0.008,
          dur: 0.4,
        });
      }
      // Resonant body.
      this.blip(dest, {
        type: "sine",
        freq: low ? 150 : 210,
        toFreq: low ? 62 : 90,
        peak: 0.12,
        attack: 0.005,
        dur: 0.28,
        pan: low ? -0.15 : 0.15,
      });
      // Membrane click.
      this.blip(dest, {
        type: "triangle",
        freq: 900,
        toFreq: 400,
        peak: 0.04,
        attack: 0.002,
        dur: 0.05,
        filter: { type: "highpass", freq: 600 },
      });
    });
  }

  /** Wedding: low resonant drones + noise-modulated sandalwood fire crackle. */
  private buildWedding(id: VoiceId, dest: GainNode): void {
    const ctx = this.ctx!;

    // Chant drone: two detuned saws through vowel-formant band-passes with a
    // slow amplitude swell — an "aum"-like sustained voice.
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.09;
    droneGain.connect(dest);

    const formants = [440, 1000];
    for (const [i, fHz] of formants.entries()) {
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = fHz;
      f.Q.value = 6;
      f.connect(droneGain);
      for (const detune of [-4, 4]) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = 110;
        osc.detune.value = detune + i * 2;
        osc.connect(f);
        osc.start();
      }
    }

    const swell = ctx.createOscillator();
    swell.frequency.value = 0.14;
    const swellGain = ctx.createGain();
    swellGain.gain.value = 0.04;
    swell.connect(swellGain);
    swellGain.connect(droneGain.gain);
    swell.start();

    // Fire bed: low brown-noise hiss.
    const hiss = this.noise("brown");
    const hissLp = ctx.createBiquadFilter();
    hissLp.type = "lowpass";
    hissLp.frequency.value = 1600;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.05;
    hiss.connect(hissLp);
    hissLp.connect(hissGain);
    hissGain.connect(dest);

    // Fire crackle: random high-passed pops.
    this.every(140, () => {
      if (this.activeId !== id) return;
      if (Math.random() < 0.5) {
        this.blip(dest, {
          type: "square",
          freq: 1200 + Math.random() * 2400,
          peak: 0.03 + Math.random() * 0.04,
          attack: 0.001,
          dur: 0.03 + Math.random() * 0.04,
          pan: Math.random() * 1.2 - 0.6,
          filter: { type: "highpass", freq: 900 },
        });
      }
    });
  }

  /** Engagement: a continuous tanpura-style drone holding a steady chord. */
  private buildEngagement(id: VoiceId, dest: GainNode): void {
    const ctx = this.ctx!;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1300;
    lp.connect(dest);

    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.06;
    droneGain.connect(lp);

    // Sustained chord: low Sa, Sa, Pa, Sa' — two detuned voices each for depth.
    const chord = [65.41, 130.81, 196.0, 261.63];
    for (const freq of chord) {
      for (const detune of [-3, 3]) {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = freq;
        osc.detune.value = detune;
        osc.connect(droneGain);
        osc.start();
      }
    }

    // Slow shimmer so the chord breathes.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.1;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(droneGain.gain);
    lfo.start();

    // Tanpura pluck cycle — the characteristic buzzing re-trigger of strings.
    const strings = [130.81, 130.81, 196.0, 65.41];
    let s = 0;
    this.every(1100, () => {
      if (this.activeId !== id) return;
      const f = strings[s % strings.length];
      s++;
      this.blip(dest, {
        type: "sawtooth",
        freq: f,
        peak: 0.05,
        attack: 0.03,
        dur: 1.6,
        filter: { type: "lowpass", freq: 1100 },
      });
    });
  }

  /** Reception: an airy glass pad with occasional high chime bells. */
  private buildReception(id: VoiceId, dest: GainNode): void {
    const ctx = this.ctx!;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2600;
    lp.connect(dest);

    // Clean major-chord pad, very soft.
    const padGain = ctx.createGain();
    padGain.gain.value = 0.025;
    padGain.connect(lp);
    for (const freq of [261.63, 329.63, 392.0]) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      osc.connect(padGain);
      osc.start();
    }

    // Occasional glassy chimes.
    const bells = [1046.5, 1318.5, 1567.98, 2093.0];
    this.every(2600, () => {
      if (this.activeId !== id) return;
      if (Math.random() < 0.7) {
        this.blip(dest, {
          type: "sine",
          freq: bells[Math.floor(Math.random() * bells.length)],
          peak: 0.04,
          attack: 0.005,
          dur: 1.8,
          pan: Math.random() * 1.2 - 0.6,
        });
      }
    });
  }

  /** Legacy: a warm low hearth drone with a distant, wistful bell motif. */
  private buildLegacy(id: VoiceId, dest: GainNode): void {
    const ctx = this.ctx!;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    lp.connect(dest);

    // Warm low drone.
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.035;
    droneGain.connect(lp);
    for (const freq of [98.0, 146.83]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(droneGain);
      osc.start();
    }

    // Faint fireside hiss.
    const hiss = this.noise("brown");
    const hissLp = ctx.createBiquadFilter();
    hissLp.type = "lowpass";
    hissLp.frequency.value = 700;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.02;
    hiss.connect(hissLp);
    hissLp.connect(hissGain);
    hissGain.connect(dest);

    // Distant, sparse bell motif — memory in a quiet room.
    const motif = [523.25, 587.33, 659.25, 783.99, 880.0];
    this.every(3200, () => {
      if (this.activeId !== id) return;
      if (Math.random() < 0.6) {
        this.blip(dest, {
          type: "sine",
          freq: motif[Math.floor(Math.random() * motif.length)],
          peak: 0.035,
          attack: 0.01,
          dur: 2.4,
          pan: Math.random() * 0.5 - 0.25,
          filter: { type: "lowpass", freq: 2500 },
        });
      }
    });
  }
}
