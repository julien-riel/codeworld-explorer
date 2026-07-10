/**
 * Moteur de layout : fonction pure `computeLayout` (layout-engine-v0 §9).
 *
 * Trois passes (§9.1) :
 *   1. dimensionnement ascendant (post-ordre) : G, R, childCell, plotWidth, plotDepth ;
 *   2. construction des chaînes de salles par `buildChain` (déjà faite en passe 1) ;
 *   3. placement descendant (préordre) en bandes disjointes, puis émission triée.
 *
 * Contraintes dures : aucun flottant, aucune trigonométrie, aucune division inexacte
 * (toutes les `/2` portent sur des quantités paires, §2.3) ; aucune source d'entropie
 * (tout le hasard vient de `hash32(path)` via `slotInto`, jamais d'un PRNG séquentiel).
 * Même entrée ⇒ même sortie octet pour octet (FR-026).
 */

import { LAYOUT_VERSION } from "../version.js";
import { div, min, max, ceilDiv, isqrtCeil } from "../integer.js";
import { spatialNodeId, portalId } from "../ids.js";
import { slotInto } from "./slotting.js";
import { assertLayoutInvariants } from "./invariants.js";
import { slotWallOffset, computeFreeCells, localCellCenter, wallRank } from "./geometry.js";
import type { Wall, WallOffset, Cell } from "./types.js";
import {
  THEME_OF,
  OBJECT_OF,
  KIND_FOOTPRINT,
  roleOfFile,
  pickSpaceType,
  objectOrientation,
} from "./tables.js";
import type { Category, ObjectTheme } from "./tables.js";
import type { LayoutOptions } from "./options.js";
import type { SpatialNode, ThemeId, WorldLayout } from "../schema.js";

// ── Entrée : vue des SourceNode NON exclus (layout-engine-v0 §1.1) ──

/** Fichier direct non exclu d'un dossier. */
export interface LayoutFile {
  readonly id: string; // = SourceNode.id (n_…)
  readonly path: string; // path POSIX/NFC normalisé (contrat §4.1)
  readonly name: string; // dernier segment du path
}

/** Dossier non exclu. `childDirs`/`files` arrivent dans un ordre QUELCONQUE (§1.1). */
export interface LayoutDir {
  readonly id: string; // = SourceNode.id (n_…)
  readonly path: string; // racine = ""
  readonly depth: number; // profondeur SOURCE réelle (racine = 0), JAMAIS plafonnée
  readonly isRoot: boolean; // true SSI path === ""
  readonly childDirs: readonly LayoutDir[];
  readonly files: readonly LayoutFile[];
}

/** Arbre d'entrée du moteur de layout. */
export interface LayoutTree {
  readonly root: LayoutDir;
}

// ── Structures internes du dimensionnement (passe 1) ──

/** Plan d'une salle de la chaîne : côté `S`, portes d'enfant, fichiers placés. */
interface RoomPlan {
  readonly S: number;
  /** `slotIndex` = index GLOBAL du créneau porteur dans `slotList(S)` (§9.8). */
  readonly childrenHere: readonly { readonly child: LayoutDir; readonly slotIndex: number }[];
  readonly filesHere: readonly { readonly file: LayoutFile; readonly cell: Cell }[];
}

/** Dossier dimensionné : chaîne de salles + grandeurs de plot (§9.5). */
interface SizedDir {
  readonly dir: LayoutDir;
  readonly children: readonly SizedDir[]; // aligné sur dir.childDirs
  readonly chain: readonly RoomPlan[];
  readonly pageCount: number;
  readonly G: number;
  readonly R: number;
  readonly childCell: number;
  readonly chainWidth: number;
  readonly chainDepth: number;
  readonly plotWidth: number;
  readonly plotDepth: number;
}

/** Lien parent→primary transmis à la récursion descendante (§9.10). */
interface ParentLink {
  readonly room: SpatialNode;
  readonly wall: Wall;
  readonly offset: number;
  readonly level: number;
}

/** Contexte de placement partagé (accumulateur de salles + entrées). */
interface Ctx {
  readonly seed: string;
  readonly options: LayoutOptions;
  readonly classifications: ReadonlyMap<string, Category>;
  readonly rooms: SpatialNode[];
}

/** Déballe une valeur réputée présente ; lève si un invariant interne est violé. */
function nn<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(`invariant interne violé : ${message}`);
  return value;
}

/** Créneaux de mur disponibles pour les portes d'enfant : `4·(S−2) − réservés` (§3.3). */
function doorCapacity(S: number, options: LayoutOptions): number {
  return 4 * (S - 2) - options.reservedSlotCount;
}

/** Tri par `path` croissant (code-unit UTF-16) — seule cause d'indépendance à l'ordre (§5.2). */
function sortByPath<T extends { readonly path: string }>(xs: readonly T[]): T[] {
  return [...xs].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

// ── Placement des portails d'une salle (§9.8) ──

interface PlacedPortals {
  /** `(wall, offset)` de TOUS les portails placés : 3 réservés + portes enfant. */
  readonly portals: readonly WallOffset[];
  /** child.path → index GLOBAL du créneau dans `slotList(S)` (= 3 + local). */
  readonly childSlot: ReadonlyMap<string, number>;
}

/**
 * Place les 3 créneaux réservés (indices 0,1,2) et les portes des `doorsHere` sur
 * leurs créneaux enfant (indices `≥ 3`), par slotting de hachage (§5.2). Les 3
 * réservés sont TOUJOURS inclus, même laissés vides, afin que `computeFreeCells` ne
 * dépende que de `(S, doorsHere)` (E1/E2). Précondition : `|doorsHere| ≤ doorCapacity(S)`.
 */
function placeCanonicalPortals(
  S: number,
  doorsHere: readonly LayoutDir[],
  seed: string,
  options: LayoutOptions,
): PlacedPortals {
  const m = doorCapacity(S, options);
  const childLocal = slotInto(
    doorsHere.map((c) => c.path),
    m,
    seed,
  );
  const childSlot = new Map<string, number>();
  const globalIdx: number[] = [0, 1, 2];
  for (const c of doorsHere) {
    const gidx = 3 + nn(childLocal.get(c.path), `childLocal[${c.path}]`);
    childSlot.set(c.path, gidx);
    globalIdx.push(gidx);
  }
  const portals: WallOffset[] = globalIdx.map((idx) => slotWallOffset(idx, S, options.cellSize));
  return { portals, childSlot };
}

// ── Choix de S et débordement (§9.7) ──

interface FilledRoom {
  readonly S: number;
  readonly dTake: number;
  readonly fTake: number;
  readonly free: readonly Cell[];
  readonly childSlot: ReadonlyMap<string, number>;
}

/**
 * Remplit UNE salle depuis les files de portes et de fichiers restantes (§9.7). On
 * parcourt les paliers `roomSideTiers` par ordre croissant et on retient le PLUS PETIT
 * `S` qui satisfait les deux capacités (toutes les portes ET tous les fichiers). Si
 * aucun palier ne tient tout, on prend `S_max` et le surplus part en annexe.
 */
function fillRoom(
  doorQ: readonly LayoutDir[],
  fileQ: readonly LayoutFile[],
  seed: string,
  options: LayoutOptions,
): FilledRoom {
  const nDoors = doorQ.length;
  const nFiles = fileQ.length;
  const tiers = options.roomSideTiers;

  for (const S of tiers) {
    const dTake = min(nDoors, doorCapacity(S, options));
    const { portals, childSlot } = placeCanonicalPortals(S, doorQ.slice(0, dTake), seed, options);
    const free = computeFreeCells(S, portals, options);
    if (dTake === nDoors && free.length >= nFiles) {
      return { S, dTake: nDoors, fTake: nFiles, free, childSlot };
    }
  }

  // Aucun palier ne tient tout : S_max, débordement en annexe (itération suivante).
  const S = nn(tiers[tiers.length - 1], "roomSideTiers non vide");
  const dTake = min(nDoors, doorCapacity(S, options));
  const { portals, childSlot } = placeCanonicalPortals(S, doorQ.slice(0, dTake), seed, options);
  const free = computeFreeCells(S, portals, options);
  const fTake = min(nFiles, free.length);
  return { S, dTake, fTake, free, childSlot };
}

// ── Chaîne de salles d'un dossier (§9.6) ──

/**
 * Construit la chaîne `primary → annex1 → …` en déversant portes et fichiers dans des
 * salles successives jusqu'à épuisement (§9.6). Chaque itération place au moins un
 * élément dès qu'il en reste (terminaison §12.1) ; la première crée toujours la salle
 * primary même si les deux files sont vides.
 */
function buildChain(d: LayoutDir, seed: string, options: LayoutOptions): RoomPlan[] {
  let doorQ = sortByPath(d.childDirs);
  let fileQ = sortByPath(d.files);
  const chain: RoomPlan[] = [];

  do {
    const { S, dTake, fTake, free, childSlot } = fillRoom(doorQ, fileQ, seed, options);
    const doorsHere = doorQ.slice(0, dTake);
    const filesHere = fileQ.slice(0, fTake);
    const fileSlot = slotInto(
      filesHere.map((f) => f.path),
      free.length,
      seed,
    );
    chain.push({
      S,
      childrenHere: doorsHere.map((c) => ({
        child: c,
        slotIndex: nn(childSlot.get(c.path), `childSlot[${c.path}]`),
      })),
      filesHere: filesHere.map((f) => ({
        file: f,
        cell: nn(free[nn(fileSlot.get(f.path), `fileSlot[${f.path}]`)], "free[fileSlot]"),
      })),
    });
    doorQ = doorQ.slice(dTake);
    fileQ = fileQ.slice(fTake);
  } while (doorQ.length > 0 || fileQ.length > 0);

  return chain;
}

// ── Passe 1 — dimensionnement ascendant, post-ordre (§9.5) ──

function sizePass(dir: LayoutDir, seed: string, options: LayoutOptions): SizedDir {
  const children = dir.childDirs.map((c) => sizePass(c, seed, options));
  const chain = buildChain(dir, seed, options);
  const pageCount = chain.length;
  const cellSize = options.cellSize;
  const margin = options.margin;

  const C = dir.childDirs.length;
  const G = isqrtCeil(C);
  const R = ceilDiv(C, G); // 0 si C == 0 (ceilDiv(0, 0) === 0)

  let childCell = 0;
  for (const c of children) childCell = max(childCell, max(c.plotWidth, c.plotDepth));
  if (C === 0) childCell = 0;

  let chainWidth = (pageCount - 1) * margin;
  let chainDepth = 0;
  for (const room of chain) {
    chainWidth += room.S * cellSize;
    chainDepth = max(chainDepth, room.S * cellSize);
  }

  const plotWidth = max(chainWidth, G * childCell) + 2 * margin;
  const plotDepth = chainDepth + margin + R * childCell + 2 * margin;

  return { dir, children, chain, pageCount, G, R, childCell, chainWidth, chainDepth, plotWidth, plotDepth };
}

// ── Émission des salles, objets et portails (§9.11) ──

/**
 * Restreint un `ThemeId` aux trois thèmes produits en v0, seul domaine de `OBJECT_OF`.
 * `THEME_OF` ne mappe jamais vers un autre thème en v0 ; le rejet est une défense en
 * profondeur, non un chemin atteignable.
 */
function toObjectTheme(theme: ThemeId): ObjectTheme {
  if (theme === "project-hall" || theme === "control-room" || theme === "neutral") return theme;
  throw new Error(`OBJECT_OF indéfini pour le thème hors-v0 « ${theme} »`);
}

function emitRoom(ctx: Ctx, sized: SizedDir, k: number, position: SpatialNode["position"], level: number): SpatialNode {
  const d = sized.dir;
  const room = nn(sized.chain[k], `chain[${k}]`);
  const role = k === 0 ? (d.isRoot ? "hall" : "primary") : "annex";
  const spaceType =
    k === 0 ? pickSpaceType(d, ctx.options.plazaThreshold, ctx.options.galleryThreshold) : "gallery";
  const category = ctx.classifications.get(d.id) ?? "unknown";
  const theme: ThemeId = THEME_OF[category];
  const S = room.S;
  const node: SpatialNode = {
    id: spatialNodeId(d.id, role, k),
    sourceNodeId: d.id,
    role,
    page: k,
    pageCount: sized.pageCount,
    spaceType,
    theme,
    level,
    depthFlattened: d.depth > ctx.options.maxRenderDepth,
    position,
    orientation: 0, // les salles ne tournent pas
    dimensions: { x: S * ctx.options.cellSize, y: ctx.options.roomHeight, z: S * ctx.options.cellSize },
    portals: [],
    objects: [],
  };
  ctx.rooms.push(node);
  return node;
}

function emitFileObject(ctx: Ctx, node: SpatialNode, file: LayoutFile, cell: Cell, S: number): void {
  const role = roleOfFile(file.name);
  const kind = OBJECT_OF[toObjectTheme(node.theme)][role];
  node.objects.push({
    sourceNodeId: file.id,
    position: localCellCenter(cell, S, ctx.options.cellSize),
    orientation: objectOrientation(cell.col, cell.row, S),
    kind,
    footprint: KIND_FOOTPRINT[kind],
  });
}

/** Crée les DEUX portails réciproques d'une connexion (§9.11, réciprocité contrat §3.7.2). */
function addPortalPair(
  ctx: Ctx,
  roomA: SpatialNode,
  wallA: Wall,
  offsetA: number,
  roomB: SpatialNode,
  wallB: Wall,
  offsetB: number,
  kind: "door" | "stair",
): void {
  const { doorWidth, doorHeight } = ctx.options;
  roomA.portals.push({
    id: portalId(roomA.id, roomB.id, kind),
    toSpatialNodeId: roomB.id,
    kind,
    wall: wallA,
    offset: offsetA,
    width: doorWidth,
    height: doorHeight,
  });
  roomB.portals.push({
    id: portalId(roomB.id, roomA.id, kind),
    toSpatialNodeId: roomA.id,
    kind,
    wall: wallB,
    offset: offsetB,
    width: doorWidth,
    height: doorHeight,
  });
}

/** Salle et créneau global porteurs de la porte du sous-dossier `c` dans la chaîne de `sized` (§9.12). */
function doorHolderOf(sized: SizedDir, c: LayoutDir): { k: number; gidx: number } {
  for (let k = 0; k < sized.pageCount; k++) {
    const room = nn(sized.chain[k], `chain[${k}]`);
    for (const entry of room.childrenHere) {
      if (entry.child.id === c.id) return { k, gidx: entry.slotIndex };
    }
  }
  throw new Error(`doorHolderOf : sous-dossier « ${c.path} » sans salle porteuse`);
}

// ── Passe 2 — placement descendant, préordre (§9.10) ──

function placePass(
  ctx: Ctx,
  sized: SizedDir,
  originX: number,
  originZ: number,
  level: number,
  parentLink: ParentLink | null,
): void {
  const { cellSize, margin, floorHeight, maxRenderDepth } = ctx.options;
  const pw = sized.plotWidth;
  const xcenter = originX + div(pw, 2);
  const roomsBandZc = originZ + margin + div(sized.chainDepth, 2);
  const childBandZ0 = originZ + margin + sized.chainDepth + margin;

  // ── Chaîne de salles, alignée et centrée sur x ──
  const roomNodes: SpatialNode[] = [];
  let xcursor = xcenter - div(sized.chainWidth, 2);
  for (let k = 0; k < sized.pageCount; k++) {
    const room = nn(sized.chain[k], `chain[${k}]`);
    const Wk = room.S * cellSize;
    const cx = xcursor + div(Wk, 2);
    const node = emitRoom(ctx, sized, k, { x: cx, y: level * floorHeight, z: roomsBandZc }, level);
    roomNodes.push(node);
    for (const entry of room.filesHere) emitFileObject(ctx, node, entry.file, entry.cell, room.S);
    xcursor = xcursor + Wk + margin;
  }

  // ── Portail parent → primary (absent pour la racine) ──
  if (parentLink !== null) {
    const S0 = nn(sized.chain[0], "chain[0]").S;
    const child = slotWallOffset(0, S0, cellSize); // créneau réservé 0 (parent) côté enfant
    const kind = level !== parentLink.level ? "stair" : "door";
    addPortalPair(
      ctx,
      parentLink.room,
      parentLink.wall,
      parentLink.offset,
      nn(roomNodes[0], "roomNodes[0]"),
      child.wall,
      child.offset,
      kind,
    );
  }

  // ── Portails de chaînage primary → annex1 → … (même level ⇒ toujours "door") ──
  for (let k = 0; k < sized.pageCount - 1; k++) {
    const Sa = nn(sized.chain[k], `chain[${k}]`).S;
    const Sb = nn(sized.chain[k + 1], `chain[${k + 1}]`).S;
    const a = slotWallOffset(2, Sa, cellSize); // réservé 2 (suivant) de k
    const b = slotWallOffset(1, Sb, cellSize); // réservé 1 (précédent) de k+1
    addPortalPair(
      ctx,
      nn(roomNodes[k], `roomNodes[${k}]`),
      a.wall,
      a.offset,
      nn(roomNodes[k + 1], `roomNodes[${k + 1}]`),
      b.wall,
      b.offset,
      "door",
    );
  }

  // ── Récursion dans la grille d'enfants ──
  if (sized.dir.childDirs.length > 0) {
    const cc = sized.childCell;
    const gridLeftX = xcenter - div(sized.G * cc, 2);
    const cellOf = slotInto(
      sortByPath(sized.dir.childDirs).map((c) => c.path),
      sized.G * sized.R,
      ctx.seed,
    );
    const sizedById = new Map<string, SizedDir>();
    for (const cs of sized.children) sizedById.set(cs.dir.id, cs);

    for (const c of sized.dir.childDirs) {
      const e = nn(cellOf.get(c.path), `cellOf[${c.path}]`);
      const col = e % sized.G;
      const row = div(e, sized.G);
      const childSized = nn(sizedById.get(c.id), `sizedById[${c.id}]`);
      const cellMinX = gridLeftX + col * cc;
      const cellMinZ = childBandZ0 + row * cc;
      const childOriginX = cellMinX + div(cc - childSized.plotWidth, 2);
      const childOriginZ = cellMinZ + div(cc - childSized.plotDepth, 2);
      const childLevel = min(level + 1, maxRenderDepth);
      const { k, gidx } = doorHolderOf(sized, c);
      const holder = slotWallOffset(gidx, nn(sized.chain[k], `chain[${k}]`).S, cellSize);
      const link: ParentLink = {
        room: nn(roomNodes[k], `roomNodes[${k}]`),
        wall: holder.wall,
        offset: holder.offset,
        level,
      };
      placePass(ctx, childSized, childOriginX, childOriginZ, childLevel, link);
    }
  }
}

// ── Orchestration `computeLayout` (§9.1) ──

/** Comparaison en ordre de code-unit UTF-16 (comparaison native des chaînes). */
function compareCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Calcule le layout complet d'un arbre de dossiers/fichiers non exclus (§9.1). Fonction
 * PURE : même `(tree, classifications, seed, options)` ⇒ même sortie octet pour octet.
 * Les identifiants spatiaux et de portails emploient l'`idHash` du contrat avec la
 * longueur par défaut (16 caractères) : la signature du moteur ne porte pas
 * `idHashLength`, qui reste fixé à son défaut de corpus.
 *
 * La sortie est déjà triée canoniquement (§2.4 du contrat) : `spatialNodes` par `id`,
 * les `portals` par `(wallRank, offset)`, les `objects` par `sourceNodeId` — la
 * sérialisation ne réordonne rien.
 */
export function computeLayout(
  tree: LayoutTree,
  classifications: ReadonlyMap<string, Category>,
  seed: string,
  options: LayoutOptions,
): WorldLayout {
  const ctx: Ctx = { seed, options, classifications, rooms: [] };

  // Passe 1 : dimensionnement ascendant (post-ordre).
  const sizedRoot = sizePass(tree.root, seed, options);

  // Passe 2 : placement descendant, monde centré sur (0, 0).
  placePass(
    ctx,
    sizedRoot,
    -div(sizedRoot.plotWidth, 2),
    -div(sizedRoot.plotDepth, 2),
    0,
    null,
  );

  // Passe 3 : tri canonique intra-nœud puis émission triée par id.
  for (const node of ctx.rooms) {
    node.portals.sort((p, q) => wallRank(p.wall) - wallRank(q.wall) || p.offset - q.offset);
    node.objects.sort((a, b) => compareCodeUnit(a.sourceNodeId, b.sourceNodeId));
  }
  ctx.rooms.sort((a, b) => compareCodeUnit(a.id, b.id));

  const layout: WorldLayout = {
    layoutVersion: LAYOUT_VERSION,
    seed,
    normalSpeed: options.normalSpeed,
    maxRoomHalfExtent: options.maxRoomHalfExtent,
    spatialNodes: ctx.rooms,
  };

  // Garde de pipeline (§9.1) : l'artefact est vérifié à l'écriture. Un invariant
  // vrai par construction est ici revérifié en défense en profondeur ; toute levée
  // signale un bug de `computeLayout`, jamais un invariant à affaiblir.
  assertLayoutInvariants(layout, tree, options);

  return layout;
}
