/**
 * Écriture de l'artefact sur disque (contrat §18.1 du PRD, §6.2 du contrat).
 *
 *   <out>/world.json           = exactement `canonicalBytes(world)` (UTF-8, sans BOM,
 *                                sans saut de ligne final) ;
 *   <out>/files/<contentHash>  = octets bruts de chaque fichier non exclu, dé-dupliqués.
 *
 * `world.json` est écrit APRÈS toutes les gardes du pipeline : un artefact non
 * conforme n'atteint jamais le disque. Aucune horloge n'entre dans `world.json`
 * (ADR-0002) ; les blobs `files/` sont hors FR-026 (copies déterministes des sources).
 */

import { canonicalBytes, sha256Hex, type World } from "@codeworld/world-schema";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Récapitulatif d'écriture (chemins absolus, tailles) pour le journal du CLI. */
export interface WriteResult {
  readonly worldPath: string;
  readonly worldBytes: number;
  readonly fileCount: number;
  /** Empreinte sha256 hex des octets de `world.json` (pour la provenance §10.4). */
  readonly worldSha256: string;
}

/**
 * Écrit `world.json` et les contenus adressés par hash sous `outDir`. Crée les
 * répertoires au besoin. Renvoie les tailles pour le journal (hors artefact).
 */
export async function writeWorld(
  outDir: string,
  world: World,
  files: ReadonlyMap<string, Uint8Array>,
): Promise<WriteResult> {
  await mkdir(outDir, { recursive: true });

  const worldBytes = canonicalBytes(world);
  const worldPath = join(outDir, "world.json");
  await writeFile(worldPath, worldBytes);
  const worldSha256 = sha256Hex(worldBytes);

  const filesDir = join(outDir, "files");
  await mkdir(filesDir, { recursive: true });
  // Écriture triée par hash : ordre stable, sans effet sur les octets écrits.
  for (const hash of [...files.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const bytes = files.get(hash);
    if (bytes === undefined) continue;
    await writeFile(join(filesDir, hash), bytes);
  }

  return { worldPath, worldBytes: worldBytes.length, fileCount: files.size, worldSha256 };
}
