import { describe, it, expect } from "vitest";
import { resolveSpecifier } from "./relations.js";

const FILES = new Set([
  "src/a.ts",
  "src/b.ts",
  "src/c.js",
  "src/widgets/index.tsx",
  "src/x.tsx",
  "index.ts",
]);

describe("resolveSpecifier (résolution lexicale, FR-026)", () => {
  it("import relatif sans extension → fichier .ts du dépôt", () => {
    expect(resolveSpecifier("src/a.ts", "./b", FILES)).toBe("src/b.ts");
  });

  it("import .js → sœur .ts (moduleResolution nodenext)", () => {
    expect(resolveSpecifier("src/a.ts", "./b.js", FILES)).toBe("src/b.ts");
  });

  it("import .js pointant un vrai fichier .js → correspondance exacte", () => {
    expect(resolveSpecifier("src/a.ts", "./c.js", FILES)).toBe("src/c.js");
  });

  it("import de dossier → index.* du dossier", () => {
    expect(resolveSpecifier("src/a.ts", "./widgets", FILES)).toBe("src/widgets/index.tsx");
  });

  it("extension .tsx déduite pour un spécificateur nu", () => {
    expect(resolveSpecifier("src/a.ts", "./x", FILES)).toBe("src/x.tsx");
  });

  it("remonte les dossiers (..) vers la racine", () => {
    expect(resolveSpecifier("src/widgets/index.tsx", "../a", FILES)).toBe("src/a.ts");
    expect(resolveSpecifier("src/a.ts", "..", FILES)).toBe("index.ts");
  });

  it("spécificateur « bare » (npm/alias) → null (externe, ignoré)", () => {
    expect(resolveSpecifier("src/a.ts", "react", FILES)).toBeNull();
    expect(resolveSpecifier("src/a.ts", "@scope/pkg", FILES)).toBeNull();
    expect(resolveSpecifier("src/a.ts", "node:path", FILES)).toBeNull();
  });

  it("cible hors de la racine (..) → null (jamais hors périmètre)", () => {
    expect(resolveSpecifier("src/a.ts", "../../etc/passwd", FILES)).toBeNull();
  });

  it("cible relative introuvable → null (pas de relation fantôme)", () => {
    expect(resolveSpecifier("src/a.ts", "./nonexistent", FILES)).toBeNull();
  });
});
