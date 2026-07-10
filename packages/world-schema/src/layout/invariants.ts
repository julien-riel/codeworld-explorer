/**
 * Garde géométrique du moteur de layout : `assertLayoutInvariants` (layout-engine-v0
 * §11). Exécutée à l'écriture de l'artefact (garde de pipeline, appelée par
 * `computeLayout` §9.1) ET dans les tests (défense en profondeur).
 *
 * Chaque invariant I1…I12 est une FONCTION NOMMÉE, testée séparément, qui lève
 * `LayoutInvariantError` en nommant l'invariant violé et les nœuds fautifs. Aucun
 * invariant n'est jamais affaibli pour faire passer un test : si `computeLayout`
 * viole un invariant, c'est `computeLayout` qu'il faut corriger.
 *
 * La garde reçoit `(layout, tree, options)` :
 *   - `layout` porte la géométrie produite (§3.7 du contrat) ;
 *   - `tree` fournit les données SOURCE que le layout ne réplique pas — `depth`
 *     (I4), identité de la racine et complétude par dossier (I7), ids de fichiers
 *     non exclus (I8) ;
 *   - `options` fournit `maxRenderDepth` (I4) ainsi que `cellSize`/`clearance` (I9).
 *
 * Écart signalé au §9.1 : le pseudo-code appelle `assertLayoutInvariants(layout,
 * tree)` (2 arguments). C'est insuffisant — I4 a besoin de `maxRenderDepth` et I9
 * de `cellSize`/`clearance`, tous deux absents de l'artefact. La signature à trois
 * arguments est donc la forme correcte (voir §10 pour la source des constantes).
 */

import { div } from "../integer.js";
import { LayoutInvariantError } from "../errors.js";
import { thresholdPoint, segmentIntersectsAABB } from "./geometry.js";
import type { Aabb2, Point2 } from "./types.js";
import { KIND_FOOTPRINT } from "./tables.js";
import type { LayoutOptions } from "./options.js";
import type { LayoutTree, LayoutDir } from "./compute.js";
import type { WorldLayout, SpatialNode, FileObject } from "../schema.js";

/** Origine de tous les segments de visibilité : le centre-sol de la salle (§6.4). */
const CENTER: Point2 = { x: 0, z: 0 };

/**
 * AABB au sol d'une salle, en coordonnées MONDE (§11, I3). `dimensions.x`/`z` sont
 * pairs (S impair × cellSize pair), donc les demi-extents sont exacts.
 */
function roomFloorAabb(n: SpatialNode): Aabb2 {
  const hx = div(n.dimensions.x, 2);
  const hz = div(n.dimensions.z, 2);
  return { xMin: n.position.x - hx, xMax: n.position.x + hx, zMin: n.position.z - hz, zMax: n.position.z + hz };
}

/**
 * AABB au sol PHYSIQUE d'un objet, orientation appliquée (§11, I2). L'emprise
 * `footprint` est en repère MODÈLE ; pour un quart de tour est/ouest (orientation
 * 1 ou 3) les composantes sont TRANSPOSÉES, de sorte que la boîte reflète la
 * géométrie réellement rendue. Oublier cette transposition rend le test aveugle
 * aux emprises asymétriques (`readme-stand`, `console` : 3000×1500).
 */
function objectFootprintAabb(o: FileObject): Aabb2 {
  const transposed = o.orientation === 1 || o.orientation === 3;
  const ex = transposed ? o.footprint.z : o.footprint.x;
  const ez = transposed ? o.footprint.x : o.footprint.z;
  const hx = div(ex, 2);
  const hz = div(ez, 2);
  return { xMin: o.position.x - hx, xMax: o.position.x + hx, zMin: o.position.z - hz, zMax: o.position.z + hz };
}

// ── I1 — Extent (règle des 15 s, §11) ──

/**
 * I1 : pour tout `SpatialNode`, `dimensions.x ≤ L` et `dimensions.z ≤ L`, avec
 * `L = 2·maxRoomHalfExtent` (valeur portée par l'artefact). Vrai par construction
 * (`S ≤ 11 ⇒ dimension ≤ 44000 ≤ 96000`).
 */
export function assertExtent(layout: WorldLayout): void {
  const L = 2 * layout.maxRoomHalfExtent;
  for (const n of layout.spatialNodes) {
    if (n.dimensions.x > L || n.dimensions.z > L) {
      throw new LayoutInvariantError(
        "I1",
        `dimensions (${String(n.dimensions.x)}×${String(n.dimensions.z)}) dépassent L=${String(L)}`,
        [n.id],
      );
    }
  }
}

// ── I2 — Visibilité des portes (§11) ──

/**
 * I2 : aucun objet n'occulte une porte depuis le centre. Pour toute salle, tout
 * portail et tout objet, le segment `centre → seuil(portail)` ne coupe PAS l'AABB
 * physique de l'objet (orientation appliquée, cf. `objectFootprintAabb`). Vrai par
 * construction (§6.1 : objets uniquement dans `freeCells`) ; ce test le revérifie
 * sur l'artefact, sur la géométrie RENDUE.
 */
export function assertVisibility(layout: WorldLayout): void {
  for (const n of layout.spatialNodes) {
    if (n.objects.length === 0 || n.portals.length === 0) continue;
    const boxes = n.objects.map((o) => ({ o, box: objectFootprintAabb(o) }));
    for (const p of n.portals) {
      const seuil = thresholdPoint(p.wall, p.offset, n.dimensions.x, n.dimensions.z);
      for (const { o, box } of boxes) {
        if (segmentIntersectsAABB(CENTER, seuil, box)) {
          throw new LayoutInvariantError(
            "I2",
            `objet ${o.sourceNodeId} (orientation ${String(o.orientation)}) occulte le portail ${p.id} de la salle ${n.id}`,
            [n.id],
          );
        }
      }
    }
  }
}

// ── I3 — Non-chevauchement des salles (§11) ──

/**
 * I3 : deux salles quelconques ont des AABB au sol DISJOINTES. Vrai par
 * construction (plots et cellules disjoints, bandes à `z` disjoints ; preuve
 * §12.3). Balayage O(n²) sur `spatialNodes` : suffisant aux tailles v0 (§12.2).
 */
export function assertRoomsDisjoint(layout: WorldLayout): void {
  const nodes = layout.spatialNodes;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    if (a === undefined) continue; // inatteignable (i < length) ; satisfait noUncheckedIndexedAccess
    const ba = roomFloorAabb(a);
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      if (b === undefined) continue;
      const bb = roomFloorAabb(b);
      const disjoint =
        ba.xMax <= bb.xMin || bb.xMax <= ba.xMin || ba.zMax <= bb.zMin || bb.zMax <= ba.zMin;
      if (!disjoint) {
        throw new LayoutInvariantError("I3", `salles ${a.id} et ${b.id} se chevauchent`, [a.id, b.id]);
      }
    }
  }
}

// ── Extraction des données SOURCE de l'arbre (I4, I7, I8) ──

/** Un dossier de l'arbre, réduit aux champs lus par les invariants source. */
interface DirInfo {
  readonly id: string;
  readonly depth: number;
  readonly isRoot: boolean;
}

/** Parcours de l'arbre : dossiers (id, depth, isRoot) et ids de fichiers non exclus. */
function collectTree(dir: LayoutDir, dirs: DirInfo[], fileIds: string[]): void {
  dirs.push({ id: dir.id, depth: dir.depth, isRoot: dir.isRoot });
  for (const f of dir.files) fileIds.push(f.id);
  for (const c of dir.childDirs) collectTree(c, dirs, fileIds);
}

// ── I4 — Profondeur de rendu (§11) ──

/**
 * I4 : pour tout `n`, `0 ≤ level ≤ maxRenderDepth` et
 * `depthFlattened == (depthOf(sourceNodeId) > maxRenderDepth)`, avec
 * `level == min(depth, maxRenderDepth)`. Joint `spatialNodes` à `tree` par
 * `sourceNodeId` : le layout ne réplique pas `depth`, d'où le paramètre `tree`.
 */
export function assertRenderDepth(layout: WorldLayout, tree: LayoutTree, options: LayoutOptions): void {
  const maxRenderDepth = options.maxRenderDepth;
  const dirs: DirInfo[] = [];
  collectTree(tree.root, dirs, []);
  const depthOf = new Map<string, number>();
  for (const d of dirs) depthOf.set(d.id, d.depth);

  for (const n of layout.spatialNodes) {
    const depth = depthOf.get(n.sourceNodeId);
    if (depth === undefined) {
      throw new LayoutInvariantError("I4", `salle ${n.id} sans dossier source ${n.sourceNodeId}`, [n.id]);
    }
    const expectedLevel = depth < maxRenderDepth ? depth : maxRenderDepth;
    if (n.level < 0 || n.level > maxRenderDepth) {
      throw new LayoutInvariantError("I4", `level ${String(n.level)} hors [0, ${String(maxRenderDepth)}]`, [n.id]);
    }
    if (n.level !== expectedLevel) {
      throw new LayoutInvariantError(
        "I4",
        `level ${String(n.level)} ≠ min(depth ${String(depth)}, ${String(maxRenderDepth)}) = ${String(expectedLevel)}`,
        [n.id],
      );
    }
    const expectedFlattened = depth > maxRenderDepth;
    if (n.depthFlattened !== expectedFlattened) {
      throw new LayoutInvariantError(
        "I4",
        `depthFlattened ${String(n.depthFlattened)} ≠ (depth ${String(depth)} > ${String(maxRenderDepth)})`,
        [n.id],
      );
    }
  }
}

// ── I5 — Connexité depuis le hall (§11) ──

/**
 * I5 : un parcours du graphe des portails (arêtes = `toSpatialNodeId`) depuis
 * l'unique salle `role == "hall"` atteint TOUTES les salles. Lève si aucun hall
 * n'existe (condition de démarrage) ou si une salle reste inatteignable.
 */
export function assertConnected(layout: WorldLayout): void {
  const nodes = layout.spatialNodes;
  const byId = new Map<string, SpatialNode>();
  for (const n of nodes) byId.set(n.id, n);

  const hall = nodes.find((n) => n.role === "hall");
  if (hall === undefined) {
    throw new LayoutInvariantError("I5", "aucune salle de rôle « hall » pour amorcer le parcours");
  }

  const seen = new Set<string>();
  const stack: string[] = [hall.id];
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (node === undefined) continue; // arête pendante : signalée par I6, pas ici
    for (const p of node.portals) stack.push(p.toSpatialNodeId);
  }

  if (seen.size !== nodes.length) {
    const unreachable = nodes.filter((n) => !seen.has(n.id)).map((n) => n.id);
    throw new LayoutInvariantError(
      "I5",
      `${String(nodes.length - seen.size)} salle(s) inatteignable(s) depuis le hall`,
      unreachable,
    );
  }
}

// ── I6 — Réciprocité des portails (§11) ──

/**
 * I6 : pour tout portail `p` de la salle A vers B, il existe dans B un portail `q`
 * vers A de MÊME `kind`. Vrai par construction (`addPortalPair` crée toujours les
 * deux). Lève si le vis-à-vis manque, ou si B référencé n'existe pas.
 */
export function assertPortalReciprocity(layout: WorldLayout): void {
  const byId = new Map<string, SpatialNode>();
  for (const n of layout.spatialNodes) byId.set(n.id, n);

  for (const a of layout.spatialNodes) {
    for (const p of a.portals) {
      const b = byId.get(p.toSpatialNodeId);
      if (b === undefined) {
        throw new LayoutInvariantError(
          "I6",
          `portail ${p.id} de ${a.id} pointe vers une salle inexistante ${p.toSpatialNodeId}`,
          [a.id],
        );
      }
      const reciprocal = b.portals.some((q) => q.toSpatialNodeId === a.id && q.kind === p.kind);
      if (!reciprocal) {
        throw new LayoutInvariantError(
          "I6",
          `portail ${p.id} (${a.id} → ${b.id}, ${p.kind}) sans réciproque de même kind dans ${b.id}`,
          [a.id, b.id],
        );
      }
    }
  }
}

// ── I7 — FR-005 : cardinalité des salles par dossier (§11) ──

/**
 * I7 : pour tout dossier non exclu, exactement UN `SpatialNode` de rôle
 * `{hall|primary}` ; le `hall` est réservé à la racine ; toute salle a un rôle ∈
 * `{hall, primary, annex}` ; par groupe (même `sourceNodeId`) les `page` couvrent
 * `0 … pageCount−1` sans trou et `pageCount` est identique. La racine et l'ensemble
 * des dossiers viennent de `tree`.
 */
export function assertRoomCardinality(layout: WorldLayout, tree: LayoutTree): void {
  const dirs: DirInfo[] = [];
  collectTree(tree.root, dirs, []);
  const rootId = tree.root.id;
  const dirIds = new Set(dirs.map((d) => d.id));

  // Rôle valide et groupement par sourceNodeId.
  const groups = new Map<string, SpatialNode[]>();
  for (const n of layout.spatialNodes) {
    if (n.role !== "hall" && n.role !== "primary" && n.role !== "annex") {
      throw new LayoutInvariantError("I7", `rôle inconnu « ${String(n.role)} »`, [n.id]);
    }
    const g = groups.get(n.sourceNodeId);
    if (g === undefined) groups.set(n.sourceNodeId, [n]);
    else g.push(n);
  }

  // Aucune salle orpheline : tout sourceNodeId est un dossier de l'arbre.
  for (const sourceNodeId of groups.keys()) {
    if (!dirIds.has(sourceNodeId)) {
      throw new LayoutInvariantError("I7", `salle(s) sans dossier source ${sourceNodeId}`);
    }
  }

  // Chaque dossier a exactement un groupe, avec exactement une salle identité.
  for (const d of dirs) {
    const group = groups.get(d.id);
    if (group === undefined || group.length === 0) {
      throw new LayoutInvariantError("I7", `dossier ${d.id} sans aucune salle`);
    }
    const identities = group.filter((n) => n.role === "hall" || n.role === "primary");
    if (identities.length !== 1) {
      throw new LayoutInvariantError(
        "I7",
        `dossier ${d.id} a ${String(identities.length)} salle(s) hall|primary (attendu : 1)`,
        group.map((n) => n.id),
      );
    }
    const identity = identities[0];
    if (identity === undefined) continue; // inatteignable (length === 1)
    const expectedRole = d.id === rootId ? "hall" : "primary";
    if (identity.role !== expectedRole) {
      throw new LayoutInvariantError(
        "I7",
        `dossier ${d.id} : salle identité de rôle ${identity.role}, attendu ${expectedRole} (hall réservé à la racine)`,
        [identity.id],
      );
    }

    // pageCount identique + pages 0 … pageCount−1 sans trou.
    const pageCount = identity.pageCount;
    const pages = new Set<number>();
    for (const n of group) {
      if (n.pageCount !== pageCount) {
        throw new LayoutInvariantError(
          "I7",
          `dossier ${d.id} : pageCount incohérent (${String(n.pageCount)} ≠ ${String(pageCount)})`,
          [n.id],
        );
      }
      pages.add(n.page);
    }
    if (pages.size !== pageCount || group.length !== pageCount) {
      throw new LayoutInvariantError(
        "I7",
        `dossier ${d.id} : ${String(group.length)} salle(s) pour pageCount ${String(pageCount)}`,
        group.map((n) => n.id),
      );
    }
    for (let k = 0; k < pageCount; k++) {
      if (!pages.has(k)) {
        throw new LayoutInvariantError("I7", `dossier ${d.id} : page ${String(k)} manquante`, group.map((n) => n.id));
      }
    }
  }
}

// ── I8 — Couverture des fichiers (bijection, §11) ──

/**
 * I8 : l'ensemble des `objects[*].sourceNodeId` sur toutes les salles est
 * EXACTEMENT l'ensemble des ids de fichiers non exclus de `tree`, sans doublon
 * (chaque fichier ↔ un `FileObject`).
 */
export function assertFileBijection(layout: WorldLayout, tree: LayoutTree): void {
  const fileIds: string[] = [];
  collectTree(tree.root, [], fileIds);
  const expected = new Set(fileIds);

  const seen = new Set<string>();
  for (const n of layout.spatialNodes) {
    for (const o of n.objects) {
      if (seen.has(o.sourceNodeId)) {
        throw new LayoutInvariantError("I8", `fichier ${o.sourceNodeId} placé en double`, [n.id]);
      }
      seen.add(o.sourceNodeId);
      if (!expected.has(o.sourceNodeId)) {
        throw new LayoutInvariantError("I8", `objet ${o.sourceNodeId} sans fichier source non exclu`, [n.id]);
      }
    }
  }
  if (seen.size !== expected.size) {
    const missing = [...expected].filter((id) => !seen.has(id));
    throw new LayoutInvariantError("I8", `${String(missing.length)} fichier(s) non exclu(s) sans FileObject : ${missing.join(", ")}`);
  }
}

// ── I9 — Emprises conformes à la table (§11) ──

/**
 * I9 : pour tout objet, `footprint == KIND_FOOTPRINT[kind]` (égalité de la valeur
 * en repère MODÈLE — jamais transposée, cf. §8.3 O1) et
 * `max(footprint.x, footprint.z) + clearance ≤ cellSize`. Le `max` étant symétrique,
 * l'inégalité est invariante par transposition : I9 n'a besoin d'aucun ajustement
 * d'orientation, à la différence de I2. Lit `cellSize`/`clearance` dans `options`.
 */
export function assertFootprints(layout: WorldLayout, options: LayoutOptions): void {
  const { cellSize, clearance } = options;
  for (const n of layout.spatialNodes) {
    for (const o of n.objects) {
      const ref = KIND_FOOTPRINT[o.kind];
      if (o.footprint.x !== ref.x || o.footprint.z !== ref.z) {
        throw new LayoutInvariantError(
          "I9",
          `objet ${o.sourceNodeId} (${o.kind}) : footprint ${String(o.footprint.x)}×${String(o.footprint.z)} ≠ table ${String(ref.x)}×${String(ref.z)}`,
          [n.id],
        );
      }
      const m = o.footprint.x > o.footprint.z ? o.footprint.x : o.footprint.z;
      if (m + clearance > cellSize) {
        throw new LayoutInvariantError(
          "I9",
          `objet ${o.sourceNodeId} (${o.kind}) : max(${String(o.footprint.x)},${String(o.footprint.z)})+${String(clearance)} > cellSize ${String(cellSize)}`,
          [n.id],
        );
      }
    }
  }
}

// ── I10 — PortalKind produits en v0 (§11) ──

/**
 * I10 : tout portail a `kind ∈ {"door","stair"}` (jamais `"elevator"`/`"portal"`
 * en v0), et `stair ⟺ level(A) ≠ level(B)` (chaînage/même dossier ⇒ door ;
 * parent→enfant sous le plafond ⇒ stair ; au plafond ⇒ door). Joint les deux
 * extrémités par `toSpatialNodeId`.
 */
export function assertPortalKinds(layout: WorldLayout): void {
  const byId = new Map<string, SpatialNode>();
  for (const n of layout.spatialNodes) byId.set(n.id, n);

  for (const a of layout.spatialNodes) {
    for (const p of a.portals) {
      if (p.kind !== "door" && p.kind !== "stair") {
        throw new LayoutInvariantError("I10", `portail ${p.id} de kind « ${String(p.kind)} » (interdit en v0)`, [a.id]);
      }
      const b = byId.get(p.toSpatialNodeId);
      if (b === undefined) {
        throw new LayoutInvariantError("I10", `portail ${p.id} pointe vers une salle inexistante ${p.toSpatialNodeId}`, [a.id]);
      }
      const differentLevel = a.level !== b.level;
      if ((p.kind === "stair") !== differentLevel) {
        throw new LayoutInvariantError(
          "I10",
          `portail ${p.id} (${a.id} L${String(a.level)} → ${b.id} L${String(b.level)}) : kind ${p.kind} incohérent avec l'écart de level`,
          [a.id, b.id],
        );
      }
    }
  }
}

// ── I11 — Intégrité entière (défense en profondeur FR-026, §11) ──

/** Parcours récursif : lève si un nombre non entier-sûr est rencontré. */
function walkNumbers(value: unknown, path: string): void {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new LayoutInvariantError("I11", `valeur non entière sûre à ${path} : ${String(value)}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) walkNumbers(value[i], `${path}[${String(i)}]`);
    return;
  }
  if (value !== null && typeof value === "object") {
    // `as` justifié : on traverse une valeur de données quelconque de l'artefact ;
    // ses membres sont traités comme `unknown`, jamais déréférencés sans garde de type.
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) walkNumbers(record[key], `${path}.${key}`);
  }
}

/**
 * I11 : toute grandeur numérique de `layout` est un entier SÛR
 * (`Number.isSafeInteger`). Complète la garde de `canonicalStringify` (§6 du
 * contrat) : aucun flottant, `NaN` ou entier hors des entiers sûrs ne « fuit ».
 */
export function assertSafeIntegers(layout: WorldLayout): void {
  walkNumbers(layout, "layout");
}

// ── I12 — Portes dans les murs (§11) ──

/**
 * I12 : pour tout portail `p` de la salle `n`, le segment
 * `[offset − width/2, offset + width/2]` reste dans `[0, wallLength]`, avec
 * `wallLength = (wall ∈ {north,south}) ? dimensions.x : dimensions.z`. `width`
 * étant pair (`doorWidth`), `width/2` est exact.
 */
export function assertPortalsInWalls(layout: WorldLayout): void {
  for (const n of layout.spatialNodes) {
    for (const p of n.portals) {
      const wallLength = p.wall === "north" || p.wall === "south" ? n.dimensions.x : n.dimensions.z;
      const half = div(p.width, 2);
      if (p.offset < half || p.offset > wallLength - half) {
        throw new LayoutInvariantError(
          "I12",
          `portail ${p.id} : offset ${String(p.offset)} (±${String(half)}) hors du mur ${p.wall} de longueur ${String(wallLength)}`,
          [n.id],
        );
      }
    }
  }
}

// ── Agrégat : garde de pipeline (§9.1) et défense en profondeur des tests (§11) ──

/**
 * Vérifie l'ensemble des invariants géométriques I1…I12 de l'artefact de layout.
 * Exécutée à l'écriture (dans `computeLayout`, §9.1) ET dans les tests. Lève
 * `LayoutInvariantError` au PREMIER invariant violé, en le nommant et en listant
 * les nœuds fautifs. Ne modifie rien : c'est une garde, pas une réparation.
 */
export function assertLayoutInvariants(layout: WorldLayout, tree: LayoutTree, options: LayoutOptions): void {
  assertExtent(layout); // I1
  assertVisibility(layout); // I2
  assertRoomsDisjoint(layout); // I3
  assertRenderDepth(layout, tree, options); // I4
  assertConnected(layout); // I5
  assertPortalReciprocity(layout); // I6
  assertRoomCardinality(layout, tree); // I7
  assertFileBijection(layout, tree); // I8
  assertFootprints(layout, options); // I9
  assertPortalKinds(layout); // I10
  assertSafeIntegers(layout); // I11
  assertPortalsInWalls(layout); // I12
}
