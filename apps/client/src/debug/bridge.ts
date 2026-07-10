/**
 * Pont de DEBUG optionnel (hors production par défaut). Activé uniquement quand
 * l'URL porte `?debug` : il expose sur `window.__codeworld` un accès LECTURE SEULE à
 * l'échantillon de perf en direct (compteurs `renderer.info`, FPS) et au store, pour
 * l'inspection manuelle et le smoke navigateur (`apps/client/verification`).
 *
 * Il n'altère aucun comportement de l'application : il ne fait qu'OBSERVER. La scène
 * et l'UI continuent de ne communiquer que par le store ; ce pont ne rend aucun DOM
 * ni objet three.
 */

import { getPerfSample, type PerfSample } from "../perf/monitor";
import { useWorldStore, type WorldStore } from "../state/store";

/** Surface de debug exposée sur `window.__codeworld`. Lecture seule. */
export interface CodeworldDebug {
  /** Instantané courant des compteurs de rendu (`renderer.info`) et du FPS. */
  perf: () => PerfSample;
  /** Instantané de l'état discret du store (sélection, salle, statut…). */
  state: () => WorldStore;
}

/** Installe le pont de debug si `?debug` est présent dans l'URL. Idempotent. */
export function installDebugBridge(): void {
  if (typeof window === "undefined") return;
  try {
    if (!new URLSearchParams(window.location.search).has("debug")) return;
  } catch {
    return;
  }
  const bridge: CodeworldDebug = {
    perf: () => getPerfSample(),
    state: () => useWorldStore.getState(),
  };
  (window as unknown as { __codeworld?: CodeworldDebug }).__codeworld = bridge;
}
