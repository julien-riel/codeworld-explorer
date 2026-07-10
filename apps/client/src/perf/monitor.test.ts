import { describe, expect, it } from "vitest";
import {
  commitPerfSample,
  DEFAULT_FPS_WINDOW,
  FpsMeter,
  getPerfSample,
  readRendererInfo,
  type RendererInfoLike,
  type RenderCounts,
} from "./monitor";

describe("FpsMeter", () => {
  it("retourne 0 tant qu'aucune image n'a été échantillonnée", () => {
    expect(new FpsMeter().fps()).toBe(0);
  });

  it("moyenne des durées d'image constantes → FPS exact", () => {
    const meter = new FpsMeter(10);
    for (let i = 0; i < 10; i += 1) meter.sample(1 / 60);
    expect(meter.fps()).toBeCloseTo(60, 6);
  });

  it("moyenne des durées variables via Σdt (16.67 ms + 33.33 ms → 40 FPS)", () => {
    const meter = new FpsMeter(2);
    meter.sample(1 / 60);
    meter.sample(1 / 30);
    // 2 images / (1/60 + 1/30) s = 2 / 0.05 = 40 FPS.
    expect(meter.fps()).toBeCloseTo(40, 6);
  });

  it("ne garde que la fenêtre glissante (les vieilles durées sortent)", () => {
    const meter = new FpsMeter(3);
    // Trois images lentes puis trois rapides : seules les rapides comptent.
    meter.sample(1); // 1 s
    meter.sample(1);
    meter.sample(1);
    meter.sample(1 / 120);
    meter.sample(1 / 120);
    meter.sample(1 / 120);
    expect(meter.fps()).toBeCloseTo(120, 6);
  });

  it("ignore les durées non finies ou ≤ 0", () => {
    const meter = new FpsMeter(4);
    meter.sample(0);
    meter.sample(-1);
    meter.sample(Number.NaN);
    meter.sample(Number.POSITIVE_INFINITY);
    expect(meter.fps()).toBe(0);
    meter.sample(1 / 50);
    expect(meter.fps()).toBeCloseTo(50, 6);
  });

  it("reset vide la fenêtre", () => {
    const meter = new FpsMeter();
    meter.sample(1 / 60);
    meter.reset();
    expect(meter.fps()).toBe(0);
    expect(DEFAULT_FPS_WINDOW).toBeGreaterThan(0);
  });
});

/** Fabrique un `renderer.info` factice (aucun GL requis). */
function fakeInfo(overrides: Partial<RendererInfoLike["render"]> = {}): RendererInfoLike {
  return {
    render: { frame: 7, calls: 42, triangles: 1234, points: 0, lines: 3, ...overrides },
    memory: { geometries: 11, textures: 5 },
    programs: [{}, {}],
  };
}

describe("readRendererInfo", () => {
  it("aplatit render/memory/programs en compteurs plats", () => {
    const counts = readRendererInfo(fakeInfo());
    expect(counts).toEqual({
      frame: 7,
      drawCalls: 42,
      triangles: 1234,
      points: 0,
      lines: 3,
      geometries: 11,
      textures: 5,
      programs: 2,
    });
  });

  it("traite `programs` null comme 0", () => {
    const info: RendererInfoLike = { ...fakeInfo(), programs: null };
    expect(readRendererInfo(info).programs).toBe(0);
  });
});

describe("échantillon transitoire", () => {
  it("rend TOUJOURS la même référence (jamais remplacée)", () => {
    expect(getPerfSample()).toBe(getPerfSample());
  });

  it("commitPerfSample écrit compteurs + FPS EN PLACE", () => {
    const counts: RenderCounts = {
      frame: 100,
      drawCalls: 190,
      triangles: 4548,
      points: 1,
      lines: 2,
      geometries: 20,
      textures: 4,
      programs: 6,
    };
    const before = getPerfSample();
    commitPerfSample(counts, 58.5);
    // Muté en place : la référence est inchangée mais les champs sont à jour.
    expect(getPerfSample()).toBe(before);
    expect(getPerfSample().drawCalls).toBe(190);
    expect(getPerfSample().triangles).toBe(4548);
    expect(getPerfSample().fps).toBeCloseTo(58.5, 6);
  });
});
