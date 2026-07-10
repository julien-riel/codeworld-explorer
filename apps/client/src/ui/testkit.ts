/**
 * Boîte à outils de test pour l'interface 2D : fabrique un `World` typé minimal,
 * l'indexe et le charge dans le store singleton. Ce n'est PAS une suite de tests
 * (aucun `*.test`), seulement des fixtures partagées par les tests `*.test.tsx`.
 */

import type {
  FileObject,
  ObjectKind,
  Portal,
  SourceNode,
  SpatialNode,
  Wall,
  World,
} from "@codeworld/world-schema";
import { buildWorldIndex } from "../state/selectors";
import { useWorldStore } from "../state/store";
import type { Gallery } from "../data/loader";

/** Empreintes de contenu factices (64 hex), pour composer les URLs de blobs. */
export const HASH_A = "a".repeat(64);
export const HASH_README = "b".repeat(64);

function dir(id: string, parentId: string | null, name: string, path: string, depth: number): SourceNode {
  return { id, parentId, path, name, nodeType: "directory", depth };
}

function file(
  id: string,
  parentId: string,
  name: string,
  path: string,
  depth: number,
  language: string,
  sizeBytes: number,
  contentHash: string,
): SourceNode {
  return { id, parentId, path, name, nodeType: "file", depth, language, sizeBytes, contentHash };
}

function portal(id: string, to: string, wall: Wall): Portal {
  return { id, toSpatialNodeId: to, kind: "door", wall, offset: 0, width: 2000, height: 3000 };
}

function obj(sourceNodeId: string, kind: ObjectKind): FileObject {
  return { sourceNodeId, position: { x: 0, y: 0, z: 0 }, orientation: 0, kind, footprint: { x: 2000, z: 2000 } };
}

function room(
  id: string,
  sourceNodeId: string,
  role: SpatialNode["role"],
  theme: SpatialNode["theme"],
  portals: Portal[],
  objects: FileObject[],
): SpatialNode {
  return {
    id,
    sourceNodeId,
    role,
    page: 0,
    pageCount: 1,
    spaceType: role === "hall" ? "hall" : "room",
    theme,
    level: 0,
    depthFlattened: false,
    position: { x: 0, y: 0, z: 0 },
    orientation: 0,
    dimensions: { x: 20000, y: 4000, z: 20000 },
    portals,
    objects,
  };
}

/** Identifiants stables du monde de fixture, exposés pour les assertions. */
export const IDS = {
  root: "n_root",
  src: "n_src",
  docs: "n_docs",
  fileA: "n_filea",
  readme: "n_readme",
  hall: "s_hall",
  srcRoom: "s_src",
  docsRoom: "s_docs",
} as const;

/**
 * Monde de fixture : racine `acme-repo` → { src → a.ts, docs → README.md },
 * 3 salles reliées en étoile au hall.
 */
export function makeWorld(): World {
  const nodes: SourceNode[] = [
    dir(IDS.root, null, "acme-repo", "", 0),
    dir(IDS.src, IDS.root, "src", "src", 1),
    dir(IDS.docs, IDS.root, "docs", "docs", 1),
    file(IDS.fileA, IDS.src, "a.ts", "src/a.ts", 2, "TypeScript", 1536, HASH_A),
    file(IDS.readme, IDS.docs, "README.md", "docs/README.md", 2, "Markdown", 200, HASH_README),
  ];
  const spatialNodes: SpatialNode[] = [
    room(IDS.hall, IDS.root, "hall", "project-hall", [
      portal("p_1", IDS.srcRoom, "north"),
      portal("p_2", IDS.docsRoom, "east"),
    ], []),
    room(IDS.srcRoom, IDS.src, "primary", "neutral", [portal("p_3", IDS.hall, "south")], [
      obj(IDS.fileA, "file-code"),
    ]),
    room(IDS.docsRoom, IDS.docs, "primary", "control-room", [portal("p_4", IDS.hall, "west")], [
      obj(IDS.readme, "readme-stand"),
    ]),
  ];
  return {
    manifest: { schemaVersion: 0, analyzerVersion: "test", layoutVersion: 0, configurationHash: "x" },
    repository: {
      provider: "github",
      owner: "acme",
      name: "repo",
      url: "https://github.com/acme/repo",
      defaultBranch: "main",
      license: null,
    },
    snapshot: {
      commitSha: "abc1230000000000000000000000000000000000",
      branch: "main",
      committedAt: "1970-01-01T00:00:00Z",
    },
    nodes,
    classifications: [],
    layout: { layoutVersion: 0, seed: "seed", normalSpeed: 6000, maxRoomHalfExtent: 48000, spatialNodes },
    search: { version: 0, documents: [] },
  };
}

/** Galerie de fixture (deux mondes). */
export function makeGallery(): Gallery {
  return {
    schemaVersion: 0,
    worlds: [
      { name: "schema", path: "schema", world: "schema/world.json", nodes: 67, rooms: 6, files: 59, artifactBytes: 37787 },
      { name: "zod", path: "zod", world: "zod/world.json", nodes: 748, rooms: 32, files: 563, artifactBytes: 409784 },
    ],
  };
}

/** Charge un monde dans le store (statut « ready ») et positionne la salle courante. */
export function loadWorldIntoStore(
  world: World,
  currentSpatialNodeId: string,
  worldPath = "schema/world.json",
): void {
  useWorldStore.setState({
    world,
    worldIndex: buildWorldIndex(world),
    worldStatus: "ready",
    worldError: null,
    worldPath,
    currentSpatialNodeId,
    selectedFileNodeId: null,
    codePanelOpen: false,
  });
}

/** Réinitialise l'état du store entre deux tests (les ACTIONS sont préservées). */
export function resetStore(): void {
  useWorldStore.setState({
    gallery: null,
    galleryStatus: "idle",
    galleryError: null,
    worldPath: null,
    world: null,
    worldIndex: null,
    worldStatus: "idle",
    worldError: null,
    currentSpatialNodeId: null,
    selectedFileNodeId: null,
    recent: [],
    favorites: [],
    pendingTeleport: null,
    preferenceKey: null,
    searchOpen: false,
    minimapOpen: false,
    codePanelOpen: false,
    settingsOpen: false,
  });
}
