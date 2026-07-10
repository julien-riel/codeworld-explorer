/**
 * CLI du pipeline d'assets : `codeworld-assets normalize <entrée> --out <sortie>
 * --manifest <fichier>` (PRD §10.4, §30.4, FR-029).
 *
 * La commande lit un GLB/glTF, applique le pipeline de normalisation, écrit le
 * GLB optimisé, puis consigne la provenance de l'asset dans le manifeste versionné.
 * Le manifeste ENTIER est revalidé après ajout : une licence non-CC0 fait échouer
 * la commande (FR-029), l'asset n'est pas consigné.
 */

import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import { parseArgs } from "node:util";

import {
  parseManifest,
  emptyManifest,
  type Manifest,
  type AssetProvenance,
} from "./manifest.js";
import { normalizeKit, DEFAULT_TARGET_SIZE } from "./normalize.js";

/** Empreinte sha256 hexadécimale minuscule d'un fichier. */
async function sha256File(path: string): Promise<string> {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

/** Charge un manifeste existant, ou en renvoie un vide si le fichier est absent. */
async function loadManifest(path: string): Promise<Manifest> {
  try {
    const raw = await readFile(path, "utf8");
    return parseManifest(JSON.parse(raw));
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "ENOENT"
    ) {
      return emptyManifest();
    }
    throw err;
  }
}

/** Options analysées de la sous-commande `normalize`. */
interface NormalizeCliOptions {
  input: string;
  out: string;
  manifest: string;
  id?: string;
  name?: string;
  source: string;
  pack: string;
  author: string;
  url: string;
  license: string;
  targetSize?: number;
}

function parseNormalizeArgs(argv: string[]): NormalizeCliOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: "string" },
      manifest: { type: "string" },
      id: { type: "string" },
      name: { type: "string" },
      source: { type: "string" },
      pack: { type: "string" },
      author: { type: "string" },
      url: { type: "string" },
      license: { type: "string", default: "CC0-1.0" },
      "target-size": { type: "string" },
    },
  });

  const input = positionals[0];
  if (!input) throw new Error("entrée manquante : usage `normalize <entrée> --out … --manifest …`");
  const require = (v: string | undefined, flag: string): string => {
    if (!v) throw new Error(`option requise manquante : --${flag}`);
    return v;
  };

  const options: NormalizeCliOptions = {
    input,
    out: require(values.out, "out"),
    manifest: require(values.manifest, "manifest"),
    source: require(values.source, "source"),
    pack: require(values.pack, "pack"),
    author: require(values.author, "author"),
    url: require(values.url, "url"),
    license: values.license ?? "CC0-1.0",
  };
  if (values.id !== undefined) options.id = values.id;
  if (values.name !== undefined) options.name = values.name;
  if (values["target-size"] !== undefined) {
    options.targetSize = Number(values["target-size"]);
  }
  return options;
}

/** Exécute la sous-commande `normalize` : pipeline + consignation de provenance. */
export async function runNormalize(argv: string[]): Promise<AssetProvenance> {
  const opts = parseNormalizeArgs(argv);

  const sha256 = await sha256File(opts.input);
  const transforms = await normalizeKit({
    input: opts.input,
    output: opts.out,
    targetSize: opts.targetSize ?? DEFAULT_TARGET_SIZE,
  });

  const base = basename(opts.input, extname(opts.input));
  // On construit l'entrée sans champs facultatifs indéfinis (exactOptionalPropertyTypes).
  const asset = {
    id: opts.id ?? base,
    name: opts.name ?? base,
    source: opts.source,
    pack: opts.pack,
    author: opts.author,
    license: opts.license,
    url: opts.url,
    sha256,
    transforms,
  } as const;

  const manifest = await loadManifest(opts.manifest);
  // Remplace toute entrée de même id, puis revalide le manifeste ENTIER (FR-029).
  const assets = [
    ...manifest.assets.filter((a) => a.id !== asset.id),
    asset as unknown as AssetProvenance,
  ];
  const next = parseManifest({ assets });

  await writeFile(opts.manifest, JSON.stringify(next, null, 2) + "\n", "utf8");
  return next.assets.find((a) => a.id === asset.id)!;
}

/** Point d'entrée : dispatch de la sous-commande. */
export async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  switch (command) {
    case "normalize":
      await runNormalize(rest);
      return;
    default:
      throw new Error(
        `commande inconnue : ${command ?? "(aucune)"} ; commandes : normalize`,
      );
  }
}

// Exécution directe (node dist/cli.js …). Import en tant que module : aucun effet.
if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}
