// App lifecycle for the native shell and the browser (Docs/10 section 2.3, Audio).
// Native (Capacitor): the App plugin's pause and resume events. Browser (and a second signal in the
// WebViews): document visibilitychange. Both feed the same idempotent handlers.
// src/core never imports this file or Capacitor; only the game layer does.
import { App } from "@capacitor/app";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";

export interface LifecycleHandlers {
  onPause(): void;
  onResume(): void;
}

/** Wires pause and resume; returns a detach function. Safe to call in a plain browser. */
export function attachLifecycle(h: LifecycleHandlers): () => void {
  let inFront = document.visibilityState === "visible";
  const pause = (): void => {
    if (!inFront) return;
    inFront = false;
    h.onPause();
  };
  const resume = (): void => {
    if (inFront) return;
    inFront = true;
    h.onResume();
  };
  const onVisibility = (): void => (document.visibilityState === "visible" ? resume() : pause());
  document.addEventListener("visibilitychange", onVisibility);

  const handles: Promise<PluginListenerHandle>[] = [];
  if (Capacitor.isNativePlatform()) {
    handles.push(App.addListener("pause", pause), App.addListener("resume", resume));
  }

  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    for (const p of handles) void p.then((l) => l.remove()).catch(() => undefined);
  };
}
