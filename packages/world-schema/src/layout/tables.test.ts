import { describe, it, expect } from "vitest";
import {
  asciiLower,
  roleOfFile,
  THEME_OF,
  OBJECT_OF,
  OBJECT_THEMES,
  KIND_FOOTPRINT,
  pickSpaceType,
  objectOrientation,
  CATEGORIES,
  THEME_IDS,
  OBJECT_KINDS,
  FILE_ROLES,
  type SpaceTypeInput,
} from "./tables.js";
import { DEFAULT_LAYOUT_OPTIONS } from "./options.js";

describe("asciiLower", () => {
  it("abaisse UNIQUEMENT A..Z (U+0041..U+005A)", () => {
    expect(asciiLower("ABCXYZ")).toBe("abcxyz");
    expect(asciiLower("Package.JSON")).toBe("package.json");
    expect(asciiLower("aZ9_-.")).toBe("az9_-.");
    // les bornes exactes de la plage
    expect(asciiLower("@A[")).toBe("@a["); // @ = 0x40 (hors), A = 0x41, [ = 0x5B (hors)
  });

  it("laisse intacts les caractères non-ASCII, y compris casés", () => {
    expect(asciiLower("ÉÀÇ")).toBe("ÉÀÇ");
    expect(asciiLower("İ")).toBe("İ"); // U+0130
    expect(asciiLower("ẞΣ")).toBe("ẞΣ"); // U+1E9E, U+03A3
    expect(asciiLower("AÉ_İ")).toBe("aÉ_İ"); // seul le A bascule
  });

  it("laisse intacts les caractères hors BMP (paires de substitution)", () => {
    expect(asciiLower("😀")).toBe("😀"); // U+1F600
    expect(asciiLower("𝐀")).toBe("𝐀"); // U+1D400, MATHEMATICAL BOLD CAPITAL A
    expect(asciiLower("A😀𝐀Z")).toBe("a😀𝐀z");
  });

  it("se distingue de toLowerCase sur l'İ turc (U+0130)", () => {
    // toLowerCase produit "i̇" (i + point suscrit combinant), dépendant de la version
    // Unicode du moteur ; asciiLower laisse l'İ intact — c'est tout l'intérêt.
    expect(asciiLower("İ")).not.toBe("İ".toLowerCase());
    expect(asciiLower("İ")).toBe("İ");
    // mais s'accorde avec toLowerCase sur de l'ASCII pur
    expect(asciiLower("HELLO")).toBe("HELLO".toLowerCase());
  });
});

describe("roleOfFile — cascade ordonnée et exhaustive", () => {
  it("règle 1 : readme (prime sur doc)", () => {
    expect(roleOfFile("README")).toBe("readme");
    expect(roleOfFile("readme")).toBe("readme");
    expect(roleOfFile("README.md")).toBe("readme"); // prime sur la règle 2
    expect(roleOfFile("Readme.txt")).toBe("readme");
    expect(roleOfFile("readme.rst")).toBe("readme");
  });

  it("règle 2 : doc", () => {
    for (const n of ["guide.md", "a.mdx", "x.markdown", "y.rst", "z.adoc", "notes.txt"]) {
      expect(roleOfFile(n)).toBe("doc");
    }
  });

  it("règle 3 : test (prime sur config/code)", () => {
    expect(roleOfFile("foo.test.ts")).toBe("test"); // prime sur code
    expect(roleOfFile("bar.spec.js")).toBe("test");
    expect(roleOfFile("x.test.json")).toBe("test"); // prime sur config
    expect(roleOfFile("Comp.SPEC.tsx")).toBe("test"); // insensible à la casse ASCII
  });

  it("règle 4 : config (extensions et noms complets)", () => {
    for (const n of [
      "package.json", "config.yaml", "x.yml", "a.toml", "settings.ini", ".env",
      "app.cfg", "web.conf", "pom.xml", "yarn.lock", "db.properties",
    ]) {
      expect(roleOfFile(n)).toBe("config");
    }
    for (const n of [".gitignore", ".npmrc", ".editorconfig", "Dockerfile", "Makefile"]) {
      expect(roleOfFile(n)).toBe("config");
    }
  });

  it("règle 5 : code", () => {
    for (const n of [
      "index.ts", "app.tsx", "main.js", "a.jsx", "b.mjs", "c.cjs", "s.py", "r.rb",
      "g.go", "l.rs", "M.java", "K.kt", "s.scala", "x.c", "h.h", "f.cpp", "hd.hpp",
      "u.cc", "p.cs", "w.php", "sw.swift", "run.sh", "boot.bash",
    ]) {
      expect(roleOfFile(n)).toBe("code");
    }
  });

  it("règle 6 : défaut generic", () => {
    for (const n of ["LICENSE", "noext", "photo.png", "data.bin", "archive.tar", "font.woff2"]) {
      expect(roleOfFile(n)).toBe("generic");
    }
  });

  it("extension = sous-chaîne après le DERNIER point", () => {
    expect(roleOfFile("a.b.ts")).toBe("code"); // ext = ts
    expect(roleOfFile("weird.name.png")).toBe("generic"); // ext = png
  });
});

describe("THEME_OF — Category → ThemeId, totale", () => {
  it("est définie pour chaque Category (aucun undefined)", () => {
    for (const c of CATEGORIES) {
      const t = THEME_OF[c];
      expect(t).toBeDefined();
      expect(THEME_IDS).toContain(t);
    }
  });

  it("mappe selon §13.2 (repli neutral, y compris unknown)", () => {
    expect(THEME_OF.root).toBe("project-hall");
    expect(THEME_OF.controller).toBe("control-room");
    expect(THEME_OF.route).toBe("control-room");
    expect(THEME_OF.unknown).toBe("neutral");
    for (const c of CATEGORIES) {
      if (c !== "root" && c !== "controller" && c !== "route") {
        expect(THEME_OF[c]).toBe("neutral");
      }
    }
  });
});

describe("OBJECT_OF — (thème v0 × rôle) → ObjectKind, table totale", () => {
  it("couvre le produit cartésien complet (aucun undefined)", () => {
    for (const theme of OBJECT_THEMES) {
      for (const role of FILE_ROLES) {
        const kind = OBJECT_OF[theme][role];
        expect(kind).toBeDefined();
        expect(OBJECT_KINDS).toContain(kind);
      }
    }
  });

  it("control-room : code et config deviennent des console", () => {
    expect(OBJECT_OF["control-room"].code).toBe("console");
    expect(OBJECT_OF["control-room"].config).toBe("console");
    expect(OBJECT_OF["control-room"].readme).toBe("readme-stand");
    expect(OBJECT_OF["control-room"].generic).toBe("file-generic");
  });

  it("project-hall et neutral sont identiques et mappent sur les file-* homonymes", () => {
    for (const role of FILE_ROLES) {
      expect(OBJECT_OF["project-hall"][role]).toBe(OBJECT_OF.neutral[role]);
    }
    expect(OBJECT_OF["project-hall"].code).toBe("file-code");
    expect(OBJECT_OF["project-hall"].config).toBe("file-config");
    expect(OBJECT_OF.neutral.doc).toBe("file-doc");
    expect(OBJECT_OF.neutral.test).toBe("file-test");
  });
});

describe("KIND_FOOTPRINT — les 7 ObjectKind, entiers", () => {
  it("est définie pour chaque ObjectKind (aucun undefined)", () => {
    for (const k of OBJECT_KINDS) {
      const fp = KIND_FOOTPRINT[k];
      expect(fp).toBeDefined();
      expect(Number.isInteger(fp.x)).toBe(true);
      expect(Number.isInteger(fp.z)).toBe(true);
    }
  });

  it("respecte max(x,z) + clearance ≤ cellSize pour tout ObjectKind", () => {
    const { clearance, cellSize } = DEFAULT_LAYOUT_OPTIONS;
    for (const k of OBJECT_KINDS) {
      const fp = KIND_FOOTPRINT[k];
      const m = fp.x > fp.z ? fp.x : fp.z;
      expect(m + clearance).toBeLessThanOrEqual(cellSize);
    }
  });
});

describe("pickSpaceType — fonction totale", () => {
  const { plazaThreshold, galleryThreshold } = DEFAULT_LAYOUT_OPTIONS;
  const dir = (n: number, isRoot = false): SpaceTypeInput => ({
    isRoot,
    childDirs: new Array<number>(n).fill(0),
    files: [],
  });
  const dirF = (nDirs: number, nFiles: number): SpaceTypeInput => ({
    isRoot: false,
    childDirs: new Array<number>(nDirs).fill(0),
    files: new Array<number>(nFiles).fill(0),
  });

  it("racine → hall (prime sur tout)", () => {
    expect(pickSpaceType({ isRoot: true, childDirs: new Array<number>(99).fill(0), files: new Array<number>(99).fill(0) }, plazaThreshold, galleryThreshold)).toBe("hall");
  });

  it("C ≥ plazaThreshold → plaza (prime sur gallery)", () => {
    expect(pickSpaceType(dirF(plazaThreshold, 99), plazaThreshold, galleryThreshold)).toBe("plaza");
    expect(pickSpaceType(dir(plazaThreshold), plazaThreshold, galleryThreshold)).toBe("plaza");
    // juste sous le seuil
    expect(pickSpaceType(dir(plazaThreshold - 1), plazaThreshold, galleryThreshold)).not.toBe("plaza");
  });

  it("F ≥ galleryThreshold (et C < plaza) → gallery", () => {
    expect(pickSpaceType(dirF(0, galleryThreshold), plazaThreshold, galleryThreshold)).toBe("gallery");
    expect(pickSpaceType(dirF(0, galleryThreshold - 1), plazaThreshold, galleryThreshold)).toBe("room");
  });

  it("sinon → room", () => {
    expect(pickSpaceType(dirF(0, 0), plazaThreshold, galleryThreshold)).toBe("room");
    expect(pickSpaceType(dirF(2, 3), plazaThreshold, galleryThreshold)).toBe("room");
  });

  it("ne retourne jamais undefined sur toutes les combinaisons de branches", () => {
    for (const isRoot of [true, false]) {
      for (const c of [0, plazaThreshold - 1, plazaThreshold]) {
        for (const f of [0, galleryThreshold - 1, galleryThreshold]) {
          const st = pickSpaceType({ isRoot, childDirs: new Array<number>(c).fill(0), files: new Array<number>(f).fill(0) }, plazaThreshold, galleryThreshold);
          expect(["hall", "room", "plaza", "gallery"]).toContain(st);
        }
      }
    }
  });
});

describe("objectOrientation — l'objet fait face au centre", () => {
  it("axes cardinaux : l'objet regarde vers le centre (S=5, mid=2)", () => {
    expect(objectOrientation(2, 0, 5)).toBe(2); // nord → face sud
    expect(objectOrientation(2, 4, 5)).toBe(0); // sud → face nord
    expect(objectOrientation(0, 2, 5)).toBe(1); // ouest → face est
    expect(objectOrientation(4, 2, 5)).toBe(3); // est → face ouest
  });

  it("rupture d'égalité en diagonale : va à l'axe z (0 ou 2)", () => {
    expect(objectOrientation(0, 0, 5)).toBe(2); // NO → face sud
    expect(objectOrientation(4, 0, 5)).toBe(2); // NE → face sud
    expect(objectOrientation(0, 4, 5)).toBe(0); // SO → face nord
    expect(objectOrientation(4, 4, 5)).toBe(0); // SE → face nord
  });

  it("retourne toujours une Orientation ∈ {0,1,2,3} pour toute cellule non centrale", () => {
    for (const S of DEFAULT_LAYOUT_OPTIONS.roomSideTiers) {
      const mid = (S - 1) / 2;
      for (let row = 0; row < S; row++) {
        for (let col = 0; col < S; col++) {
          if (col === mid && row === mid) continue; // centre exclu
          expect([0, 1, 2, 3]).toContain(objectOrientation(col, row, S));
        }
      }
    }
  });
});
