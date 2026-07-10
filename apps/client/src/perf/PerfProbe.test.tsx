// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { PerfProbe } from "./PerfProbe";
import { commitPerfSample, getPerfSample } from "./monitor";

/** Drapeaux three réels sous un nœud de test-renderer (cf. Scene.test). */
type SceneNode = { instance: unknown };
const isMesh = (node: SceneNode): boolean =>
  (node.instance as { isMesh?: boolean }).isMesh === true;

describe("<PerfProbe>", () => {
  it("se monte, ne rend aucun objet visible et alimente l'échantillon transitoire", async () => {
    // Repart d'un échantillon marqué pour vérifier que la sonde l'écrit bien.
    commitPerfSample(
      { frame: 0, drawCalls: -1, triangles: -1, points: 0, lines: 0, geometries: 0, textures: 0, programs: 0 },
      -1,
    );

    const renderer = await ReactThreeTestRenderer.create(<PerfProbe />);
    // Sonde de mesure : elle ne monte AUCUN mesh (composant transparent).
    expect(renderer.scene.findAll(isMesh)).toHaveLength(0);

    // Cinq images à 1/60 s → FPS glissant ≈ 60, compteurs finis lus de renderer.info.
    await renderer.advanceFrames(5, 1 / 60);

    const sample = getPerfSample();
    expect(sample.fps).toBeCloseTo(60, 0);
    expect(Number.isFinite(sample.drawCalls)).toBe(true);
    expect(Number.isFinite(sample.triangles)).toBe(true);
    // La sonde a bien réécrit la valeur sentinelle négative.
    expect(sample.drawCalls).toBeGreaterThanOrEqual(0);

    await renderer.unmount();
  });
});
