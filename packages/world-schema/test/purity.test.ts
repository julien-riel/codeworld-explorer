/**
 * Suite 8 — PURETÉ. Lit les sources de `packages/world-schema/src` (via une API de
 * test, `node:fs` — jamais depuis le code de production) et assert qu'aucune source
 * n'EMPLOIE `Math.random`, `Date.now`, `new Date(` ni un import de module Node
 * (`node:*`, `fs`, `path`, `crypto`) (contrat §5.1, §10.3 point 5).
 *
 * On scanne le code COMMENTAIRES RETIRÉS (une mention en commentaire — p. ex. le
 * « SANS `new Date()` » de `dates.ts` — n'est pas un emploi) mais CHAÎNES CONSERVÉES
 * (la détection d'import lit le spécifieur de module, qui est une chaîne).
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const SRC_DIR = fileURLToPath(new URL("../src", import.meta.url));

/**
 * Retire commentaires de ligne et de bloc, en PRÉSERVANT les chaînes (`'…'`, `"…"`,
 * `` `…` ``) — y compris les `//` d'une URL — via une petite machine à états. Les
 * sauts de ligne sont conservés (numéros de ligne stables pour un diagnostic).
 */
function stripComments(src: string): string {
  let out = "";
  let state: "code" | "line" | "block" | "sq" | "dq" | "tpl" = "code";
  for (let i = 0; i < src.length; i++) {
    const c = src.charAt(i);
    const c2 = src.charAt(i + 1);
    switch (state) {
      case "code":
        if (c === "/" && c2 === "/") { state = "line"; i++; }
        else if (c === "/" && c2 === "*") { state = "block"; i++; }
        else if (c === "'") { state = "sq"; out += c; }
        else if (c === '"') { state = "dq"; out += c; }
        else if (c === "`") { state = "tpl"; out += c; }
        else out += c;
        break;
      case "line":
        if (c === "\n") { state = "code"; out += c; }
        break;
      case "block":
        if (c === "*" && c2 === "/") { state = "code"; i++; }
        else if (c === "\n") out += c;
        break;
      case "sq":
      case "dq":
      case "tpl": {
        out += c;
        if (c === "\\") { out += c2; i++; }
        else if ((state === "sq" && c === "'") || (state === "dq" && c === '"') || (state === "tpl" && c === "`")) {
          state = "code";
        }
        break;
      }
    }
  }
  return out;
}

/** Motifs interdits (contrat §5.1). Évalués sur le code commentaires retirés. */
const BANNED: readonly { readonly name: string; readonly re: RegExp }[] = [
  { name: "Math.random", re: /\bMath\s*\.\s*random\b/ },
  { name: "Date.now", re: /\bDate\s*\.\s*now\b/ },
  { name: "new Date(", re: /\bnew\s+Date\s*\(/ },
  {
    name: "import de module Node",
    re: /\bfrom\s*["'](?:node:[^"']*|fs(?:\/[^"']*)?|path(?:\/[^"']*)?|crypto(?:\/[^"']*)?)["']/,
  },
  {
    name: "import()/require() de module Node",
    re: /\b(?:require|import)\s*\(\s*["'](?:node:|fs|path|crypto)/,
  },
  { name: "import à effet de bord d'un module Node", re: /\bimport\s*["'](?:node:|fs|path|crypto)/ },
];

/** Chemins relatifs de tous les fichiers `.ts` sous `src`. */
function sourceFiles(): string[] {
  return readdirSync(SRC_DIR, { recursive: true })
    .map((p) => String(p))
    .filter((p) => p.endsWith(".ts"));
}

/** Renvoie le nom du premier motif interdit rencontré, ou `null` si le code est pur. */
function firstViolation(code: string): string | null {
  const stripped = stripComments(code);
  for (const { name, re } of BANNED) {
    if (re.test(stripped)) return name;
  }
  return null;
}

describe("Pureté : aucune source de src n'emploie d'entropie, d'horloge ni de module Node", () => {
  it("le scanner détecte un emploi réel et ignore une simple mention en commentaire", () => {
    // Emplois RÉELS → détectés.
    expect(firstViolation("const x = Math.random();")).toBe("Math.random");
    expect(firstViolation("const t = Date.now();")).toBe("Date.now");
    expect(firstViolation("const d = new Date();")).toBe("new Date(");
    expect(firstViolation('import { readFileSync } from "node:fs";')).toBe("import de module Node");
    expect(firstViolation('import { join } from "path";')).toBe("import de module Node");
    expect(firstViolation('const c = require("crypto");')).toBe(
      "import()/require() de module Node",
    );
    // Simples MENTIONS en commentaire → ignorées.
    expect(firstViolation("// on n'utilise jamais new Date() ni Date.now()")).toBeNull();
    expect(firstViolation("/* SANS `new Date()`, sans Math.random */")).toBeNull();
    // Une URL avec `//` dans une chaîne n'est pas un commentaire.
    expect(firstViolation('const u = "https://example.com/path";')).toBeNull();
  });

  const files = sourceFiles();

  it("au moins tout le noyau du paquet est scanné (non vide)", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const rel of files) {
    it(`src/${rel} est pur`, () => {
      const code = readFileSync(join(SRC_DIR, rel), "utf8");
      const violation = firstViolation(code);
      expect(violation, `src/${rel} emploie « ${violation ?? ""} »`).toBeNull();
    });
  }
});
