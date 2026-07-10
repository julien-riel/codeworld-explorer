import type { ObjectKind, ThemeId } from "@codeworld/world-schema";
import { describe, expect, it } from "vitest";
import { PALETTE, themeAccentName } from "../palette";
import { OBJECT_KINDS, PROCEDURAL_THEMES, proceduralThemeKit } from "./procedural";
import { registerProceduralKits } from "./register";
import { getThemeKit, KIND_FOOTPRINT } from "./ThemeKit";

const PALETTE_NAMES = new Set(Object.keys(PALETTE));
const RESERVED_THEMES: readonly ThemeId[] = [
  "factory",
  "design-gallery",
  "library",
  "laboratory",
];

describe("proceduralThemeKit.resolve", () => {
  it("est TOTALE sur les 3 thèmes v0 × 7 kinds (aucune valeur non résolue)", () => {
    let count = 0;
    for (const theme of PROCEDURAL_THEMES) {
      for (const kind of OBJECT_KINDS) {
        const d = proceduralThemeKit.resolve(theme, kind);
        expect(d).toBeDefined();
        expect(d.size.x).toBeGreaterThan(0);
        expect(d.size.y).toBeGreaterThan(0);
        expect(d.size.z).toBeGreaterThan(0);
        count += 1;
      }
    }
    expect(count).toBe(21);
  });

  it("ne produit que des couleurs de la palette (jamais un hex nu)", () => {
    for (const theme of PROCEDURAL_THEMES) {
      for (const kind of OBJECT_KINDS) {
        expect(PALETTE_NAMES.has(proceduralThemeKit.resolve(theme, kind).color)).toBe(true);
      }
    }
  });

  it("n'emploie qu'un vocabulaire de formes restreint (box/cylinder/cone)", () => {
    const allowed = new Set(["box", "cylinder", "cone"]);
    for (const theme of PROCEDURAL_THEMES) {
      for (const kind of OBJECT_KINDS) {
        expect(allowed.has(proceduralThemeKit.resolve(theme, kind).shape)).toBe(true);
      }
    }
  });

  it("partage la géométrie : deux appels sur le même couple => MÊME référence (instancing)", () => {
    for (const theme of PROCEDURAL_THEMES) {
      for (const kind of OBJECT_KINDS) {
        expect(proceduralThemeKit.resolve(theme, kind)).toBe(
          proceduralThemeKit.resolve(theme, kind),
        );
      }
    }
  });

  it("retourne des descripteurs gelés (immuables, car partagés entre instances)", () => {
    const d = proceduralThemeKit.resolve("neutral", "file-code");
    expect(Object.isFrozen(d)).toBe(true);
    expect(Object.isFrozen(d.size)).toBe(true);
  });

  it("tient la primitive DANS le footprint réservé (aucun débordement de cellule)", () => {
    for (const theme of PROCEDURAL_THEMES) {
      for (const kind of OBJECT_KINDS) {
        const d = proceduralThemeKit.resolve(theme, kind);
        const fp = KIND_FOOTPRINT[kind];
        expect(d.size.x).toBeLessThanOrEqual(fp.x);
        expect(d.size.z).toBeLessThanOrEqual(fp.z);
      }
    }
  });

  it("reflète l'emprise asymétrique de readme-stand/console (x > z), les fichiers restant carrés", () => {
    for (const theme of PROCEDURAL_THEMES) {
      for (const kind of OBJECT_KINDS) {
        const d = proceduralThemeKit.resolve(theme, kind);
        if (kind === "readme-stand" || kind === "console") {
          expect(d.size.x).toBeGreaterThan(d.size.z);
        } else {
          expect(d.size.x).toBe(d.size.z);
        }
      }
    }
  });

  it("colore les repères architecturaux avec l'accent de la salle", () => {
    for (const theme of PROCEDURAL_THEMES) {
      const accent = themeAccentName(theme);
      expect(proceduralThemeKit.resolve(theme, "readme-stand").color).toBe(accent);
      expect(proceduralThemeKit.resolve(theme, "console").color).toBe(accent);
    }
    expect(proceduralThemeKit.resolve("project-hall", "readme-stand").color).toBe(
      "themeProjectHall",
    );
    expect(proceduralThemeKit.resolve("control-room", "console").color).toBe("themeControlRoom");
    expect(proceduralThemeKit.resolve("neutral", "readme-stand").color).toBe("themeNeutral");
  });

  it("donne aux objets fichiers une couleur SÉMANTIQUE stable d'un thème à l'autre", () => {
    const fileKinds: readonly ObjectKind[] = [
      "file-generic",
      "file-code",
      "file-config",
      "file-doc",
      "file-test",
    ];
    for (const kind of fileKinds) {
      const ref = proceduralThemeKit.resolve("neutral", kind).color;
      for (const theme of PROCEDURAL_THEMES) {
        expect(proceduralThemeKit.resolve(theme, kind).color).toBe(ref);
      }
    }
    expect(proceduralThemeKit.resolve("neutral", "file-code").color).toBe("accent");
    expect(proceduralThemeKit.resolve("neutral", "file-test").color).toBe("success");
  });

  it("reste TOTALE et retombe sur `neutral` pour les thèmes réservés (jamais de crash)", () => {
    for (const theme of RESERVED_THEMES) {
      for (const kind of OBJECT_KINDS) {
        expect(proceduralThemeKit.resolve(theme, kind)).toBe(
          proceduralThemeKit.resolve("neutral", kind),
        );
      }
    }
  });
});

describe("proceduralThemeKit.footprint", () => {
  it("correspond exactement aux emprises du contrat (KIND_FOOTPRINT)", () => {
    for (const kind of OBJECT_KINDS) {
      expect(proceduralThemeKit.footprint(kind)).toBe(KIND_FOOTPRINT[kind]);
    }
    expect(proceduralThemeKit.footprint("readme-stand")).toEqual({ x: 3000, z: 1500 });
    expect(proceduralThemeKit.footprint("console")).toEqual({ x: 3000, z: 1500 });
    expect(proceduralThemeKit.footprint("file-code")).toEqual({ x: 2000, z: 2000 });
  });
});

describe("registerProceduralKits", () => {
  it("enregistre le kit procédural pour les 3 thèmes v0", () => {
    registerProceduralKits();
    for (const theme of PROCEDURAL_THEMES) {
      expect(getThemeKit(theme)).toBe(proceduralThemeKit);
    }
  });

  it("est idempotent (deux appels laissent le même kit actif)", () => {
    registerProceduralKits();
    registerProceduralKits();
    expect(getThemeKit("neutral")).toBe(proceduralThemeKit);
  });
});
