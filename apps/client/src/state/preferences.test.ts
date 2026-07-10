import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, type Preferences } from "./store";
import {
  cameraSwayEnabled,
  deriveComfort,
  fpsControlsEnabled,
  transitionsActive,
} from "./preferences";

/** Fabrique des préférences à partir des défauts + surcharges. */
function prefs(patch: Partial<Preferences>): Preferences {
  return { ...DEFAULT_PREFERENCES, ...patch };
}

describe("transitionsActive (PRD §17.3)", () => {
  it("actif quand les transitions sont activées et la réduction des mouvements coupée", () => {
    expect(transitionsActive(prefs({ transitionsEnabled: true, reduceMotion: false }))).toBe(true);
  });

  it("la réduction des mouvements coupe les transitions même si elles restent « activées »", () => {
    expect(transitionsActive(prefs({ transitionsEnabled: true, reduceMotion: true }))).toBe(false);
  });

  it("inactif quand les transitions sont explicitement désactivées", () => {
    expect(transitionsActive(prefs({ transitionsEnabled: false, reduceMotion: false }))).toBe(false);
  });
});

describe("cameraSwayEnabled", () => {
  it("le balancement suit l'inverse de la réduction des mouvements", () => {
    expect(cameraSwayEnabled(prefs({ reduceMotion: false }))).toBe(true);
    expect(cameraSwayEnabled(prefs({ reduceMotion: true }))).toBe(false);
  });
});

describe("fpsControlsEnabled (PRD §23.1)", () => {
  it("les contrôles FPS reflètent le déplacement libre", () => {
    expect(fpsControlsEnabled(prefs({ freeMovement: true }))).toBe(true);
  });

  it("le mode « sans déplacement libre » désactive les contrôles FPS", () => {
    expect(fpsControlsEnabled(prefs({ freeMovement: false }))).toBe(false);
  });

  it("est indépendant de la réduction des mouvements", () => {
    expect(fpsControlsEnabled(prefs({ freeMovement: true, reduceMotion: true }))).toBe(true);
  });
});

describe("deriveComfort", () => {
  it("agrège l'état de confort dérivé", () => {
    const comfort = deriveComfort(
      prefs({
        reduceMotion: true,
        transitionsEnabled: true,
        freeMovement: false,
        moveSpeed: 2,
        visualQuality: "low",
      }),
    );
    expect(comfort).toEqual({
      transitionsActive: false, // coupé par la réduction des mouvements
      cameraSwayEnabled: false,
      fpsControlsEnabled: false, // coupé par « sans déplacement libre »
      moveSpeed: 2,
      visualQuality: "low",
    });
  });

  it("reflète les défauts confortables (tout actif, qualité élevée)", () => {
    expect(deriveComfort(DEFAULT_PREFERENCES)).toEqual({
      transitionsActive: true,
      cameraSwayEnabled: true,
      fpsControlsEnabled: true,
      moveSpeed: 1,
      visualQuality: "high",
    });
  });
});
