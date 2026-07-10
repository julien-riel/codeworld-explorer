import { describe, expect, it } from "vitest";
import type { SearchHit } from "./searchIndex";
import { groupHits } from "./grouping";

function hit(ref: string, kind: SearchHit["kind"]): SearchHit {
  return { ref, path: ref, name: ref, kind, language: undefined, category: undefined, score: 1, terms: [] };
}

describe("groupHits", () => {
  it("regroupe par type, fichiers avant dossiers, en omettant les groupes vides", () => {
    const groups = groupHits([
      hit("d1", "directory"),
      hit("f1", "file"),
      hit("f2", "file"),
    ]);

    expect(groups.map((g) => g.kind)).toEqual(["file", "directory"]);
    expect(groups[0]?.label).toBe("Fichiers");
    expect(groups[0]?.hits.map((h) => h.ref)).toEqual(["f1", "f2"]);
    expect(groups[1]?.label).toBe("Dossiers");
    expect(groups[1]?.hits.map((h) => h.ref)).toEqual(["d1"]);
  });

  it("préserve l'ordre de pertinence à l'intérieur d'un groupe", () => {
    const groups = groupHits([hit("f_high", "file"), hit("f_low", "file")]);
    expect(groups[0]?.hits.map((h) => h.ref)).toEqual(["f_high", "f_low"]);
  });

  it("retourne [] sans résultats", () => {
    expect(groupHits([])).toEqual([]);
  });
});
