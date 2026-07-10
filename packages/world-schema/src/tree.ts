/**
 * Invariants d'intégrité de l'arbre `SourceNode` (contrat §3.5.3).
 *
 * Zod ne valide que des FORMES ; il n'assure aucune intégrité RÉFÉRENTIELLE.
 * `assertTreeInvariants` est la garde de pipeline (et de test) qui vérifie les
 * sept conditions et lève `TreeInvariantError` avec les `path`/`id` fautifs.
 */

import type { SourceNode } from "./schema.js";
import { nodeId, DEFAULT_ID_HASH_LENGTH } from "./ids.js";
import { TreeInvariantError } from "./errors.js";

/** Chemin du parent : `p` privé de son dernier segment ; racine `""` pour un enfant direct (contrat §3.5.3). */
function parentPath(p: string): string {
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
}

/**
 * Vérifie les sept invariants d'arbre (contrat §3.5.3). L'ordre d'évaluation
 * garantit qu'une violation de cycle (6) est signalée AVANT l'incohérence
 * parent↔chemin (3) qu'elle implique nécessairement, de sorte que chaque
 * violation est diagnostiquée par sa propre règle.
 *
 * @param idHashLength longueur d'empreinte de l'artefact (uniforme, contrat §4.3) ;
 *   sert à recalculer `nodeId(path)` pour l'identité dérivée (5) et la cohérence (3).
 * @throws TreeInvariantError à la première violation détectée.
 */
export function assertTreeInvariants(
  nodes: readonly SourceNode[],
  idHashLength: number = DEFAULT_ID_HASH_LENGTH,
): void {
  // ── 1. Racine unique : exactement un `parentId === null`, de `path === ""`. ──
  const roots = nodes.filter((n) => n.parentId === null);
  if (roots.length !== 1) {
    throw new TreeInvariantError(
      "root-unique",
      roots.map((n) => n.path),
      roots.map((n) => n.id),
      `Racine non unique : ${String(roots.length)} nœud(s) à parentId null (attendu : 1).`,
    );
  }
  const root = roots[0];
  if (root === undefined || root.path !== "") {
    throw new TreeInvariantError(
      "root-path",
      [root?.path ?? "<absent>"],
      root === undefined ? [] : [root.id],
      "La racine (parentId null) doit avoir path === \"\".",
    );
  }

  // ── 4. Unicité des chemins. ──
  const byPath = new Set<string>();
  for (const n of nodes) {
    if (byPath.has(n.path)) {
      throw new TreeInvariantError("path-unique", [n.path], [n.id], `Chemin en double : « ${n.path} ».`);
    }
    byPath.add(n.path);
  }

  // ── 5. Identité dérivée : id === nodeId(path). Aucun id forgé hors formule. ──
  for (const n of nodes) {
    const expected = nodeId(n.path, idHashLength);
    if (n.id !== expected) {
      throw new TreeInvariantError(
        "id-derived",
        [n.path],
        [n.id, expected],
        `Identité incohérente pour « ${n.path} » : id=${n.id}, attendu ${expected}.`,
      );
    }
  }

  // ── 2. Références résolues : tout parentId non nul désigne un id présent. ──
  const byId = new Set(nodes.map((n) => n.id));
  for (const n of nodes) {
    if (n.parentId !== null && !byId.has(n.parentId)) {
      throw new TreeInvariantError(
        "parent-resolved",
        [n.path],
        [n.id, n.parentId],
        `parentId non résolu pour « ${n.path} » : ${n.parentId} absent.`,
      );
    }
  }

  // ── 6. Absence de cycle : en remontant parentId, on atteint la racine. ──
  // Vérifiée AVANT la cohérence parent↔chemin (3), qu'un cycle viole toujours.
  const parentById = new Map(nodes.map((n) => [n.id, n.parentId]));
  for (const n of nodes) {
    let current: string | null = n.parentId;
    let steps = 0;
    while (current !== null) {
      if (steps > nodes.length) {
        throw new TreeInvariantError(
          "no-cycle",
          [n.path],
          [n.id],
          `Cycle d'ascendance détecté depuis « ${n.path} » (${n.id}).`,
        );
      }
      // `current` est un id résolu (invariant 2) : `.get` renvoie donc `string | null`.
      current = parentById.get(current) ?? null;
      steps += 1;
    }
  }

  // ── 3. Cohérence parent↔chemin : parentId === nodeId(parentPath(path)). ──
  for (const n of nodes) {
    if (n.parentId === null) continue;
    const expectedParent = nodeId(parentPath(n.path), idHashLength);
    if (n.parentId !== expectedParent) {
      throw new TreeInvariantError(
        "parent-path-coherent",
        [n.path, parentPath(n.path)],
        [n.parentId, expectedParent],
        `parentId de « ${n.path} » (${n.parentId}) ≠ nodeId(« ${parentPath(n.path)} ») (${expectedParent}).`,
      );
    }
  }

  // ── 7. Tri par path en ordre de code-unit UTF-16 (contrat §2.4). ──
  for (let i = 1; i < nodes.length; i += 1) {
    const prev = nodes[i - 1];
    const curr = nodes[i];
    if (prev !== undefined && curr !== undefined && prev.path > curr.path) {
      throw new TreeInvariantError(
        "sorted-by-path",
        [prev.path, curr.path],
        [prev.id, curr.id],
        `Tri rompu : « ${prev.path} » précède « ${curr.path} ».`,
      );
    }
  }
}
