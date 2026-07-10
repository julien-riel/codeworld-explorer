/**
 * Détection de langage PAR EXTENSION uniquement (sprint 2 : aucun AST, aucune
 * heuristique de contenu). La table est exhaustive et sans approximation : elle
 * entre dans les octets de l'artefact (FR-026), donc aucune source d'entropie,
 * aucune casse dépendante de la version Unicode.
 *
 * L'abaissement de casse est ASCII PUR (comme `asciiLower` du moteur de layout) :
 * `String.prototype.toLowerCase` dépend de la version Unicode du moteur et est banni.
 */

/** Abaisse les seuls A..Z ASCII ; tout autre code-unit passe intact. */
function asciiLower(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i);
    out += String.fromCharCode(u >= 0x41 && u <= 0x5a ? u + 0x20 : u);
  }
  return out;
}

/** Extension (après le dernier point) en minuscule ASCII, ou `""` si absente. */
export function extensionOf(name: string): string {
  const lower = asciiLower(name);
  const dot = lower.lastIndexOf(".");
  return dot === -1 ? "" : lower.slice(dot + 1);
}

/**
 * Table extension → nom de langage. Les valeurs sont des chaînes stables et
 * lisibles ; leur exactitude importe pour FR-026 (elles voyagent dans l'artefact).
 * Portée MVP (PRD §27.1) : JS/TS/JSX/TSX en priorité ; les autres langages sont
 * étiquetés pour l'affichage sans être analysés en profondeur.
 */
const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "TypeScript",
  mts: "TypeScript",
  cts: "TypeScript",
  tsx: "TSX",
  js: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  jsx: "JSX",
  json: "JSON",
  jsonc: "JSON",
  md: "Markdown",
  mdx: "Markdown",
  markdown: "Markdown",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  html: "HTML",
  htm: "HTML",
  css: "CSS",
  scss: "SCSS",
  sass: "Sass",
  less: "Less",
  py: "Python",
  rb: "Ruby",
  go: "Go",
  rs: "Rust",
  java: "Java",
  kt: "Kotlin",
  scala: "Scala",
  c: "C",
  h: "C",
  cpp: "C++",
  cc: "C++",
  hpp: "C++",
  cs: "C#",
  php: "PHP",
  swift: "Swift",
  sh: "Shell",
  bash: "Shell",
  sql: "SQL",
  graphql: "GraphQL",
  gql: "GraphQL",
  xml: "XML",
  svg: "SVG",
};

/**
 * Renvoie le langage détecté d'un fichier, ou `undefined` si l'extension n'est pas
 * connue. Le champ `language` est OMIS (jamais `null`) quand indéterminé (contrat §3.5.1).
 */
export function detectLanguage(name: string): string | undefined {
  return LANGUAGE_BY_EXTENSION[extensionOf(name)];
}
