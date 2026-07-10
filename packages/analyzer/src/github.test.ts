/**
 * Tests de reconnaissance d'URL GitHub et de récupération des métadonnées (§21.1).
 * Aucun accès réseau : le `GitHubPort` est un faux injecté (hors-ligne, déterministe).
 */

import { describe, it, expect } from "vitest";
import {
  fetchRepoMetadata,
  looksLikeRepoUrl,
  parseRepoUrl,
  type GitHubPort,
  type GitHubRepoData,
} from "./github.js";
import { InvalidRepoUrlError } from "./errors.js";

describe("parseRepoUrl — formes acceptées", () => {
  const cases: [string, string, string][] = [
    ["https://github.com/colinhacks/zod", "colinhacks", "zod"],
    ["https://github.com/colinhacks/zod.git", "colinhacks", "zod"],
    ["https://github.com/colinhacks/zod/", "colinhacks", "zod"],
    ["http://github.com/colinhacks/zod", "colinhacks", "zod"],
    ["https://www.github.com/colinhacks/zod", "colinhacks", "zod"],
    ["github.com/colinhacks/zod", "colinhacks", "zod"],
    ["git@github.com:colinhacks/zod.git", "colinhacks", "zod"],
    ["ssh://git@github.com/colinhacks/zod.git", "colinhacks", "zod"],
    // Segments au-delà de owner/repo ignorés (la branche se pinne par --ref).
    ["https://github.com/facebook/react/tree/main/packages", "facebook", "react"],
    ["https://github.com/a-b/c.d_e", "a-b", "c.d_e"],
  ];
  for (const [input, owner, repo] of cases) {
    it(`analyse « ${input} »`, () => {
      expect(parseRepoUrl(input)).toEqual({ owner, repo });
    });
  }
});

describe("parseRepoUrl — refus", () => {
  const rejected = [
    "",
    "https://gitlab.com/o/r", // hôte non GitHub
    "https://github.com/onlyowner", // pas de repo
    "https://github.com/", // ni owner ni repo
    "git@github.com", // pas de « : »
    "https://github.com/-bad/repo", // owner commençant par un tiret
    "https://github.com/owner/..", // repo « .. »
  ];
  for (const input of rejected) {
    it(`refuse « ${input} »`, () => {
      expect(() => parseRepoUrl(input)).toThrow(InvalidRepoUrlError);
    });
  }
});

describe("looksLikeRepoUrl", () => {
  it("reconnaît une URL/raccourci de dépôt", () => {
    expect(looksLikeRepoUrl("https://github.com/o/r")).toBe(true);
    expect(looksLikeRepoUrl("git@github.com:o/r.git")).toBe(true);
    expect(looksLikeRepoUrl("github.com/o/r")).toBe(true);
    expect(looksLikeRepoUrl("ssh://git@github.com/o/r")).toBe(true);
  });
  it("laisse un chemin local au flux local", () => {
    expect(looksLikeRepoUrl("./mon-depot")).toBe(false);
    expect(looksLikeRepoUrl("/abs/path")).toBe(false);
    expect(looksLikeRepoUrl("owner/repo")).toBe(false); // raccourci ambigu → chemin local
  });
});

/** Port factice renvoyant des métadonnées figées. */
function stubPort(data: Partial<GitHubRepoData>): GitHubPort {
  return {
    fetchRepo(ref) {
      return Promise.resolve({
        fullName: `${ref.owner}/${ref.repo}`,
        htmlUrl: `https://github.com/${ref.owner}/${ref.repo}`,
        defaultBranch: "main",
        licenseSpdxId: null,
        ...data,
      });
    },
  };
}

describe("fetchRepoMetadata", () => {
  it("projette les métadonnées en fragment de config", async () => {
    const meta = await fetchRepoMetadata(
      { owner: "colinhacks", repo: "zod" },
      stubPort({ fullName: "colinhacks/zod", licenseSpdxId: "MIT", defaultBranch: "main" }),
    );
    expect(meta.repository).toEqual({
      owner: "colinhacks",
      name: "zod",
      url: "https://github.com/colinhacks/zod",
      defaultBranch: "main",
      license: "MIT",
    });
    expect(meta.warnings).toHaveLength(0);
  });

  it("avertit quand la licence est absente", async () => {
    const meta = await fetchRepoMetadata({ owner: "a", repo: "b" }, stubPort({ licenseSpdxId: null }));
    expect(meta.repository.license).toBeNull();
    expect(meta.warnings.some((w) => w.includes("Licence non détectée"))).toBe(true);
  });

  it("dégrade proprement si l'API échoue (hors-ligne) : licence null + avertissement", async () => {
    const failing: GitHubPort = {
      fetchRepo() {
        return Promise.reject(new Error("ENOTFOUND api.github.com"));
      },
    };
    const meta = await fetchRepoMetadata({ owner: "a", repo: "b" }, failing);
    expect(meta.repository).toEqual({
      owner: "a",
      name: "b",
      url: "https://github.com/a/b",
      license: null,
    });
    expect(meta.warnings.some((w) => w.includes("Métadonnées GitHub indisponibles"))).toBe(true);
  });
});
