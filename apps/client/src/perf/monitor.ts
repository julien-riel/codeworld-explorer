/**
 * Moniteur de rendu EN DIRECT (PRD §9.5, §16.1). Il mesure, image par image, les
 * compteurs de `renderer.info` de three (draw calls, triangles…) et un FPS en moyenne
 * glissante, et les publie dans un CONTENEUR TRANSITOIRE (comme la pose caméra) : la
 * sonde de scène l'écrit EN PLACE à chaque image, sans `setState`, pour ne pas
 * re-rendre l'UI 2D (contrainte de framerate, PRD §11.3). L'overlay de debug le lit
 * dans sa propre boucle rAF.
 *
 * Ce module est PUR (aucun three, aucun React) : la sonde `PerfProbe` (scène) et
 * l'overlay `PerfOverlay` (DOM) s'appuient dessus mais restent dans leurs arbres
 * respectifs.
 */

// ── FPS en moyenne glissante ──

/** Taille par défaut de la fenêtre d'échantillons FPS (≈ 1 s à 60 Hz). */
export const DEFAULT_FPS_WINDOW = 60;

/**
 * Moyenne glissante du FPS sur une fenêtre d'images. On moyenne les DURÉES d'image
 * (plus stable qu'une moyenne d'inverses) puis on inverse : `fps = window / Σdt`.
 */
export class FpsMeter {
  private readonly durations: number[] = [];
  private readonly window: number;
  private sum = 0;

  constructor(window: number = DEFAULT_FPS_WINDOW) {
    this.window = Math.max(1, Math.floor(window));
  }

  /** Ajoute la durée d'une image (secondes). Les valeurs non finies ou ≤ 0 sont ignorées. */
  sample(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    this.durations.push(deltaSeconds);
    this.sum += deltaSeconds;
    if (this.durations.length > this.window) {
      this.sum -= this.durations.shift() ?? 0;
    }
  }

  /** FPS moyen sur la fenêtre courante, ou 0 tant qu'aucune image n'a été échantillonnée. */
  fps(): number {
    if (this.durations.length === 0 || this.sum <= 0) return 0;
    return this.durations.length / this.sum;
  }

  /** Vide la fenêtre (changement de monde, reprise après pause). */
  reset(): void {
    this.durations.length = 0;
    this.sum = 0;
  }
}

// ── Lecture de `renderer.info` (three) ──

/** Sous-ensemble de `WebGLInfo` (three) dont dépend le moniteur ; typé pour test sans GL. */
export interface RendererInfoLike {
  render: { frame: number; calls: number; triangles: number; points: number; lines: number };
  memory: { geometries: number; textures: number };
  programs: readonly unknown[] | null;
}

/** Compteurs bruts extraits d'une image de rendu. */
export interface RenderCounts {
  frame: number;
  drawCalls: number;
  triangles: number;
  points: number;
  lines: number;
  geometries: number;
  textures: number;
  programs: number;
}

/** Extrait les compteurs de `renderer.info` en une structure plate. Fonction PURE. */
export function readRendererInfo(info: RendererInfoLike): RenderCounts {
  return {
    frame: info.render.frame,
    drawCalls: info.render.calls,
    triangles: info.render.triangles,
    points: info.render.points,
    lines: info.render.lines,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    programs: info.programs?.length ?? 0,
  };
}

// ── Échantillon transitoire (hors React) ──

/** Instantané de performance publié par la sonde et lu par l'overlay. */
export interface PerfSample extends RenderCounts {
  /** FPS en moyenne glissante. */
  fps: number;
}

// Singleton de module : mutable, JAMAIS remplacé (l'overlay garde la même référence).
const perfSample: PerfSample = {
  fps: 0,
  frame: 0,
  drawCalls: 0,
  triangles: 0,
  points: 0,
  lines: 0,
  geometries: 0,
  textures: 0,
  programs: 0,
};

/**
 * Conteneur transitoire de l'échantillon de perf (le MÊME objet à chaque appel). Le
 * muter via `commitPerfSample` ne déclenche AUCUN re-render.
 */
export function getPerfSample(): PerfSample {
  return perfSample;
}

/** Écrit EN PLACE les compteurs + le FPS dans l'échantillon transitoire. */
export function commitPerfSample(counts: RenderCounts, fps: number): void {
  perfSample.frame = counts.frame;
  perfSample.drawCalls = counts.drawCalls;
  perfSample.triangles = counts.triangles;
  perfSample.points = counts.points;
  perfSample.lines = counts.lines;
  perfSample.geometries = counts.geometries;
  perfSample.textures = counts.textures;
  perfSample.programs = counts.programs;
  perfSample.fps = fps;
}
