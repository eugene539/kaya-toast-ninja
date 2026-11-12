// Placeholder sound effects synthesised with Web Audio (no files, no network). Real CC0 effects
// arrive in Phase 2. The context is unlocked on the first tap and resumed on any later tap.
export class Sfx {
  private ctx: AudioContext | null = null;

  /** Call from every pointer-down: creates or resumes the context inside a user gesture. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
      }
      if (this.ctx.state !== "running") void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  get unlocked(): boolean {
    return this.ctx?.state === "running";
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2500;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(hp).connect(g).connect(ctx.destination);
    src.start();
  }

  shink(): void {
    this.noise(0.18, 0.25);
    this.tone(1800, 0.2, "sine", 0.12, 3200);
  }
  click(): void {
    this.tone(660, 0.06, "square", 0.05);
  }
  pop(): void {
    this.tone(520, 0.12, "sine", 0.2, 880);
  }
  bell(): void {
    this.tone(1320, 0.9, "sine", 0.18);
    this.tone(1980, 0.7, "sine", 0.08, undefined, 0.02);
  }
  boing(): void {
    this.tone(300, 0.35, "triangle", 0.2, 120);
  }
  heal(): void {
    this.tone(400, 0.3, "sine", 0.1, 800);
  }
}
