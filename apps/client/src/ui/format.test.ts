import { describe, expect, it } from "vitest";
import {
  formatBytes,
  githubBlobUrl,
  preferredRef,
  segmentLabel,
  themeLabel,
  worldBaseDir,
} from "./format";

describe("worldBaseDir", () => {
  it("retire le dernier segment du chemin de world.json", () => {
    expect(worldBaseDir("schema/world.json")).toBe("schema");
    expect(worldBaseDir("a/b/world.json")).toBe("a/b");
  });

  it("rend une chaîne vide sans dossier", () => {
    expect(worldBaseDir("world.json")).toBe("");
  });
});

describe("preferredRef", () => {
  it("préfère le commit réel", () => {
    expect(preferredRef("abc1230000000000000000000000000000000000", "main")).toBe(
      "abc1230000000000000000000000000000000000",
    );
  });

  it("retombe sur la branche pour une empreinte nulle ou vide", () => {
    expect(preferredRef("0".repeat(40), "develop")).toBe("develop");
    expect(preferredRef("", "main")).toBe("main");
  });
});

describe("githubBlobUrl", () => {
  it("compose une URL blob avec réf et chemin", () => {
    expect(
      githubBlobUrl({ repoUrl: "https://github.com/acme/repo", ref: "main", path: "src/a.ts" }),
    ).toBe("https://github.com/acme/repo/blob/main/src/a.ts");
  });

  it("ajoute l'ancre de ligne quand fournie", () => {
    expect(
      githubBlobUrl({ repoUrl: "https://github.com/acme/repo", ref: "abc", path: "a.ts", line: 42 }),
    ).toBe("https://github.com/acme/repo/blob/abc/a.ts#L42");
  });

  it("normalise le suffixe .git et le slash final, encode les segments", () => {
    expect(
      githubBlobUrl({
        repoUrl: "https://github.com/acme/repo.git/",
        ref: "main",
        path: "/dir/my file.ts",
      }),
    ).toBe("https://github.com/acme/repo/blob/main/dir/my%20file.ts");
  });
});

describe("formatBytes", () => {
  it("formate les octets en base 1024", () => {
    expect(formatBytes(479)).toBe("479 o");
    expect(formatBytes(1536)).toBe("1,5 Ko");
    expect(formatBytes(37787)).toBe("36,9 Ko");
  });

  it("rend une chaîne vide pour une valeur absente ou invalide", () => {
    expect(formatBytes(undefined)).toBe("");
    expect(formatBytes(-1)).toBe("");
  });
});

describe("segmentLabel / themeLabel", () => {
  it("montre le nom, ou « / » pour la racine sans nom", () => {
    expect(segmentLabel("src", "src")).toBe("src");
    expect(segmentLabel("", "")).toBe("/");
    expect(segmentLabel("", "dir")).toBe("dir");
  });

  it("traduit les thèmes connus, garde l'identifiant sinon", () => {
    expect(themeLabel("project-hall")).toBe("Hall de projet");
    expect(themeLabel("neutral")).toBe("Neutre");
    expect(themeLabel("inconnu")).toBe("inconnu");
  });
});
