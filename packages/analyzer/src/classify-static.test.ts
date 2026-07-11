/**
 * Tests unitaires de la couche 3 (heuristiques statiques). `classifyDirectoryStatic` est
 * une fonction PURE : on lui donne les profils statiques des fichiers d'un dossier et on
 * vérifie le verdict, la confiance bornée, les preuves triées, et le refus des cas ambigus.
 */

import { describe, expect, it } from "vitest";
import { classifyDirectoryStatic, type StaticFileProfile } from "./classify-static.js";

const ID = "n_aaaaaaaa"; // id de dossier factice (forme ^n_[a-z2-7]{8,32}$ non requise ici)

/** Fabrique un profil de fichier minimal, avec valeurs par défaut vides. */
function file(partial: Partial<StaticFileProfile>): StaticFileProfile {
  return {
    name: partial.name ?? "index.ts",
    language: partial.language ?? "TypeScript",
    symbols: partial.symbols ?? [],
    importModules: partial.importModules ?? [],
  };
}

describe("classifyDirectoryStatic — signaux de nom de fichier (forts)", () => {
  it("classe « *.controller.ts » en controller", () => {
    const c = classifyDirectoryStatic(ID, [file({ name: "orders.controller.ts" })]);
    expect(c?.category).toBe("controller");
    expect(c?.decisionSource).toBe("static");
    expect(c?.overriddenByConfig).toBe(false);
    // Un seul signal fort (poids 3) → confiance 400 + 75*(3-2) = 475.
    expect(c?.confidence).toBe(475);
    expect(c?.evidence).toContainEqual({ kind: "file-name", detail: "orders.controller.ts" });
  });

  it("classe « *.service.ts » en service et « *.spec.ts » en test", () => {
    expect(classifyDirectoryStatic(ID, [file({ name: "user.service.ts" })])?.category).toBe("service");
    expect(classifyDirectoryStatic(ID, [file({ name: "user.spec.ts" })])?.category).toBe("test");
  });

  it("n'est pas trompé par une sous-chaîne sans points encadrants", () => {
    // « myservices.ts » ne contient pas « .service. » → aucun signal de nom de fichier.
    expect(classifyDirectoryStatic(ID, [file({ name: "myservices.ts" })])).toBeNull();
  });
});

describe("classifyDirectoryStatic — signaux d'import de framework (forts)", () => {
  it("classe un import react en ui", () => {
    const c = classifyDirectoryStatic(ID, [file({ name: "widget.ts", importModules: ["react"] })]);
    expect(c?.category).toBe("ui");
    expect(c?.evidence).toContainEqual({ kind: "framework-import", detail: "react" });
  });

  it("réduit un sous-chemin ou un scope à sa racine de paquet", () => {
    expect(classifyDirectoryStatic(ID, [file({ importModules: ["react/jsx-runtime"] })])?.category).toBe("ui");
    expect(classifyDirectoryStatic(ID, [file({ importModules: ["@angular/core"] })])?.category).toBe("ui");
  });

  it("mappe express→route, typeorm→repository, mongoose→model, vitest→test", () => {
    expect(classifyDirectoryStatic(ID, [file({ importModules: ["express"] })])?.category).toBe("route");
    expect(classifyDirectoryStatic(ID, [file({ importModules: ["typeorm"] })])?.category).toBe("repository");
    expect(classifyDirectoryStatic(ID, [file({ importModules: ["mongoose"] })])?.category).toBe("model");
    expect(classifyDirectoryStatic(ID, [file({ importModules: ["vitest"] })])?.category).toBe("test");
  });

  it("ignore les imports relatifs et les modules inconnus", () => {
    const c = classifyDirectoryStatic(ID, [
      file({ importModules: ["./local", "../shared", "lodash", "node:fs"] }),
    ]);
    expect(c).toBeNull();
  });

  it("ne compte un même module qu'une fois par fichier", () => {
    const c = classifyDirectoryStatic(ID, [
      file({ importModules: ["react", "react", "react/jsx-runtime"] }),
    ]);
    // Un seul signal fort react (dédupliqué) → 475, pas davantage.
    expect(c?.confidence).toBe(475);
  });
});

describe("classifyDirectoryStatic — signaux de symbole (modérés)", () => {
  it("classe un « *Service » par suffixe de symbole", () => {
    const c = classifyDirectoryStatic(ID, [
      file({ name: "svc.ts", symbols: [{ name: "PaymentService", symbolType: "class", exported: true }] }),
    ]);
    expect(c?.category).toBe("service");
    // Un seul signal modéré (poids 2) → confiance plancher 400.
    expect(c?.confidence).toBe(400);
    expect(c?.evidence).toContainEqual({ kind: "symbol-name", detail: "PaymentService" });
  });

  it("détecte un composant PascalCase dans un fichier TSX", () => {
    const c = classifyDirectoryStatic(ID, [
      file({
        name: "Button.tsx",
        language: "TSX",
        symbols: [{ name: "Button", symbolType: "constant", exported: true }],
      }),
    ]);
    expect(c?.category).toBe("ui");
    expect(c?.evidence).toContainEqual({ kind: "component", detail: "Button" });
  });

  it("n'assimile pas une CONSTANTE en capitales à un composant", () => {
    const c = classifyDirectoryStatic(ID, [
      file({
        name: "constants.tsx",
        language: "TSX",
        symbols: [{ name: "MAX_ITEMS", symbolType: "constant", exported: true }],
      }),
    ]);
    expect(c).toBeNull();
  });

  it("n'assimile pas un composant hors JSX (fichier .ts)", () => {
    const c = classifyDirectoryStatic(ID, [
      file({ name: "model.ts", language: "TypeScript", symbols: [{ name: "Graph", symbolType: "class", exported: true }] }),
    ]);
    expect(c).toBeNull();
  });
});

describe("classifyDirectoryStatic — agrégation, ambiguïté et bornes", () => {
  it("cumule les signaux concordants et plafonne la confiance à 850", () => {
    const files: StaticFileProfile[] = [];
    for (let i = 0; i < 6; i++) files.push(file({ name: `a${String(i)}.controller.ts` }));
    const c = classifyDirectoryStatic(ID, files);
    expect(c?.category).toBe("controller");
    expect(c?.confidence).toBe(850); // 6 signaux forts saturent le plafond
  });

  it("renvoie null sur une égalité de tête (ambiguïté)", () => {
    const c = classifyDirectoryStatic(ID, [
      file({ name: "a.controller.ts" }),
      file({ name: "b.service.ts" }),
    ]);
    expect(c).toBeNull();
  });

  it("tranche en faveur de la catégorie strictement dominante", () => {
    const c = classifyDirectoryStatic(ID, [
      file({ name: "a.controller.ts" }),
      file({ name: "b.controller.ts" }),
      file({ name: "c.service.ts" }),
    ]);
    expect(c?.category).toBe("controller");
  });

  it("renvoie null quand aucun signal ne se dégage", () => {
    expect(classifyDirectoryStatic(ID, [])).toBeNull();
    expect(classifyDirectoryStatic(ID, [file({ name: "helpers.ts" })])).toBeNull();
  });

  it("plafonne le nombre de preuves et les trie par (kind, detail)", () => {
    const symbols = Array.from({ length: 20 }, (_, i) => ({
      name: `Svc${String(i).padStart(2, "0")}Service`,
      symbolType: "class" as const,
      exported: true,
    }));
    const c = classifyDirectoryStatic(ID, [file({ symbols })]);
    expect(c?.category).toBe("service");
    expect(c?.evidence.length).toBeLessThanOrEqual(8);
    const sorted = [...(c?.evidence ?? [])].sort((a, b) =>
      a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.detail < b.detail ? -1 : a.detail > b.detail ? 1 : 0,
    );
    expect(c?.evidence).toEqual(sorted);
  });

  it("est déterministe : deux appels identiques donnent le même verdict", () => {
    const files = [
      file({ name: "a.controller.ts", importModules: ["@nestjs/common"] }),
      file({ name: "b.controller.ts" }),
    ];
    expect(classifyDirectoryStatic(ID, files)).toEqual(classifyDirectoryStatic(ID, files));
  });
});
