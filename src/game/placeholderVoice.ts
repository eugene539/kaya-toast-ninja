// PLACEHOLDER VOICE: development only, never shipped (D-123 item 5). Uses the device's own offline
// speech synthesis (localService voices only, so nothing leaves the device). Phase 1 replaces this
// with recorded clips keyed by spoken-line id.
/** Voices load asynchronously in some browsers; call once at boot. */
export function warmVoices(): void {
  try {
    window.speechSynthesis?.getVoices();
  } catch {
    /* optional */
  }
}

export function speakPlaceholder(text: string): void {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices().filter((v) => v.localService);
    const pick = voices.find((v) => v.lang === "en-GB") ?? voices.find((v) => v.lang.startsWith("en"));
    if (!pick) return; // no offline voice on offer (or not loaded yet): stay silent
    u.voice = pick;
    u.lang = "en-GB";
    u.rate = 0.9;
    synth.speak(u);
  } catch {
    /* speech is optional */
  }
}

/** App went to the background: stop any line mid-sentence. */
export function stopPlaceholderSpeech(): void {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* speech is optional */
  }
}
