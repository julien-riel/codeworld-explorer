/**
 * Store Zustand — source UNIQUE de vérité partagée entre les deux arbres React
 * (scène R3F et interface 2D), qui ne communiquent QUE par ce store (PRD §11.3, §19.4).
 *
 * ── Pose caméra HORS de React (contrainte de framerate, PRD §9.5, §11.3) ──
 * La pose de la caméra est mutée à CHAQUE image par la boucle de rendu ; la faire
 * transiter par un `setState` React re-rendrait l'UI 2D 60 fois/s et dégraderait le
 * framerate. Elle vit donc dans un CONTENEUR TRANSITOIRE (`cameraPose`, objet mutable
 * de module) : la scène écrit dedans EN PLACE (aucun re-render), et les rares
 * consommateurs 2D (mini-carte) le lisent dans leur propre boucle rAF. Le store
 * Zustand ne porte QUE l'état discret (salle courante, sélection, préférences…), et
 * les composants de scène s'y abonnent par sélecteurs FINS via `useWorldStore.subscribe`
 * (middleware `subscribeWithSelector`), jamais à l'objet entier.
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { World } from "@codeworld/world-schema";
import {
  loadGallery,
  loadWorld,
  normalizeWorldError,
  type Gallery,
  type WorldError,
} from "../data/loader";
import {
  buildWorldIndex,
  resolveTeleport,
  type TeleportResolution,
  type TeleportTarget,
  type WorldIndex,
} from "./selectors";

// ── Échelle scène : 1 unité three = 1 mètre = 1000 mm (appliquée PARTOUT) ──

/** Nombre de millimètres par unité de la scène three. Échelle produit unique. */
export const MM_PER_SCENE_UNIT = 1000;

/** Convertit des millimètres (repère monde) en unités three (mètres). */
export function mmToSceneUnits(mm: number): number {
  return mm / MM_PER_SCENE_UNIT;
}

// ── Pose caméra transitoire (hors React) ──

/** Pose caméra en unités three. Mutée EN PLACE par la boucle de rendu, jamais via setState. */
export interface CameraPose {
  /** Position de l'œil `[x, y, z]` en unités three. */
  position: [number, number, number];
  /** Lacet (rotation autour de +y), radians. */
  yaw: number;
  /** Tangage, radians. */
  pitch: number;
}

// Singleton de module : hauteur d'œil ~1,6 m au départ. La scène le repositionne au spawn.
const cameraPose: CameraPose = { position: [0, 1.6, 0], yaw: 0, pitch: 0 };

/**
 * Retourne le conteneur transitoire de pose caméra (le MÊME objet à chaque appel).
 * Le muter ne déclenche AUCUN re-render : c'est le canal réservé à la boucle rAF.
 */
export function getCameraPose(): CameraPose {
  return cameraPose;
}

// ── Préférences (persistées par dépôt/commit) ──

/** Qualité visuelle de la scène (budget de rendu, PRD §16.1). */
export type VisualQuality = "low" | "medium" | "high";

/** Préférences utilisateur, persistées localement par couple dépôt/commit (PRD §14.3, §23.2). */
export interface Preferences {
  /** Réduction des mouvements : supprime balancement de caméra et transitions (PRD §23.2). */
  reduceMotion: boolean;
  /** Multiplicateur de la vitesse de déplacement (1 = `layout.normalSpeed`). */
  moveSpeed: number;
  /** Animations de transition activées (désactivables, PRD §9.4). */
  transitionsEnabled: boolean;
  /** Qualité visuelle (budget de rendu par zone). */
  visualQuality: VisualQuality;
  /**
   * Déplacement libre (contrôles FPS) autorisé. `false` = mode « sans déplacement
   * libre » : on ne navigue plus que par mini-carte, recherche et liste hiérarchique
   * (PRD §23.1). La caméra lit l'état DÉRIVÉ correspondant (`preferences.ts`).
   */
  freeMovement: boolean;
}

/** Bornes de `moveSpeed` (PRD §23.2 : vitesse ajustable, sans extrême désorientant). */
export const MIN_MOVE_SPEED = 0.25;
export const MAX_MOVE_SPEED = 4;

/** Préférences par défaut, déterministes (pas d'auto-détection, pour des tests stables). */
export const DEFAULT_PREFERENCES: Preferences = {
  reduceMotion: false,
  moveSpeed: 1,
  transitionsEnabled: true,
  visualQuality: "high",
  freeMovement: true,
};

/** Borne `moveSpeed` dans `[MIN_MOVE_SPEED, MAX_MOVE_SPEED]`. */
export function clampMoveSpeed(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PREFERENCES.moveSpeed;
  return Math.min(MAX_MOVE_SPEED, Math.max(MIN_MOVE_SPEED, value));
}

/** État persisté par dépôt/commit : préférences + favoris + récents (PRD §14.3). */
export interface PersistedRepoState {
  preferences: Preferences;
  /** `sourceNodeId` favoris. */
  favorites: string[];
  /** `spatialNodeId` des salles récemment visitées, plus récent en tête. */
  recent: string[];
}

// ── Persistance localStorage (tolérante : absence de storage, JSON corrompu, quota) ──

const PERSIST_KEY = "codeworld:repo-state:v1";

/** Accès défensif à localStorage (peut manquer : SSR, tests node, navigation privée). */
function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function isVisualQuality(v: unknown): v is VisualQuality {
  return v === "low" || v === "medium" || v === "high";
}

function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Coerce une valeur non fiable (localStorage) en `Preferences` valides. */
function toPreferences(v: unknown): Preferences {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  return {
    reduceMotion: typeof o.reduceMotion === "boolean" ? o.reduceMotion : DEFAULT_PREFERENCES.reduceMotion,
    moveSpeed: typeof o.moveSpeed === "number" ? clampMoveSpeed(o.moveSpeed) : DEFAULT_PREFERENCES.moveSpeed,
    transitionsEnabled:
      typeof o.transitionsEnabled === "boolean"
        ? o.transitionsEnabled
        : DEFAULT_PREFERENCES.transitionsEnabled,
    visualQuality: isVisualQuality(o.visualQuality) ? o.visualQuality : DEFAULT_PREFERENCES.visualQuality,
    freeMovement: typeof o.freeMovement === "boolean" ? o.freeMovement : DEFAULT_PREFERENCES.freeMovement,
  };
}

/** Lit la table complète des états persistés (par clé dépôt/commit). Jamais lançant. */
function readAllPersisted(): Record<string, unknown> {
  const storage = safeStorage();
  if (storage === null) return {};
  const raw = storage.getItem(PERSIST_KEY);
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Clé de préférences dérivée du manifeste : `owner/name@commitSha` (PRD §14.3). */
export function repoKey(world: World): string {
  return `${world.repository.owner}/${world.repository.name}@${world.snapshot.commitSha}`;
}

/** Charge l'état persisté d'un dépôt/commit, complété par les défauts. Jamais lançant. */
export function loadRepoState(key: string): PersistedRepoState {
  const entry = readAllPersisted()[key];
  const o = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
  return {
    preferences: toPreferences(o.preferences),
    favorites: toStringArray(o.favorites),
    recent: toStringArray(o.recent),
  };
}

/** Persiste l'état d'un dépôt/commit (fusionné dans la table). Jamais lançant. */
export function saveRepoState(key: string, state: PersistedRepoState): void {
  const storage = safeStorage();
  if (storage === null) return;
  const all = readAllPersisted();
  all[key] = state;
  try {
    storage.setItem(PERSIST_KEY, JSON.stringify(all));
  } catch {
    // Quota dépassé ou storage indisponible : on ignore, les préférences restent en mémoire.
  }
}

// ── État du store ──

/** Étape de chargement d'une ressource asynchrone. */
export type LoadStatus = "idle" | "loading" | "ready" | "error";

/** Nombre maximal de salles conservées dans l'historique récent (PRD §9.3). */
export const RECENT_LIMIT = 12;

/** Insère `id` en tête de l'historique récent, dédupliqué et plafonné. */
function pushRecent(recent: readonly string[], id: string): string[] {
  return [id, ...recent.filter((r) => r !== id)].slice(0, RECENT_LIMIT);
}

/** État + actions du store. Les composants passent par les ACTIONS, jamais par `setState`. */
export interface WorldStore {
  // ── Galerie ──
  gallery: Gallery | null;
  galleryStatus: LoadStatus;
  galleryError: string | null;

  // ── Monde courant ──
  worldPath: string | null;
  world: World | null;
  worldIndex: WorldIndex | null;
  worldStatus: LoadStatus;
  /** Erreur TYPÉE (dont version de schéma refusée, FR-027), exposée pour affichage. */
  worldError: WorldError | null;

  // ── Navigation ──
  currentSpatialNodeId: string | null;
  selectedFileNodeId: string | null;
  recent: string[];
  favorites: string[];
  /** Résolution de téléportation en attente : la scène l'anime puis la consomme. */
  pendingTeleport: TeleportResolution | null;

  // ── Préférences (persistées par dépôt/commit) ──
  preferenceKey: string | null;
  preferences: Preferences;

  // ── Interface 2D ──
  searchOpen: boolean;
  minimapOpen: boolean;
  codePanelOpen: boolean;
  settingsOpen: boolean;

  // ── Actions : galerie ──
  loadGalleryData: () => Promise<void>;

  // ── Actions : monde ──
  openWorld: (path: string) => Promise<void>;
  closeWorld: () => void;

  // ── Actions : navigation ──
  enterRoom: (spatialNodeId: string) => void;
  selectFile: (sourceNodeId: string | null) => void;
  openFile: (sourceNodeId: string) => void;
  requestTeleport: (target: TeleportTarget) => void;
  clearTeleport: () => void;
  returnToHall: () => void;
  toggleFavorite: (sourceNodeId: string) => void;

  // ── Actions : préférences ──
  setReduceMotion: (value: boolean) => void;
  setMoveSpeed: (value: number) => void;
  setTransitionsEnabled: (value: boolean) => void;
  setVisualQuality: (value: VisualQuality) => void;
  setFreeMovement: (value: boolean) => void;
  setPreferences: (patch: Partial<Preferences>) => void;

  // ── Actions : interface 2D ──
  setSearchOpen: (open: boolean) => void;
  toggleSearch: () => void;
  setMinimapOpen: (open: boolean) => void;
  toggleMinimap: () => void;
  setCodePanelOpen: (open: boolean) => void;
  toggleCodePanel: () => void;
  setSettingsOpen: (open: boolean) => void;
  toggleSettings: () => void;
}

/** Persiste l'état lié au dépôt courant, si une clé est liée. */
function persist(store: WorldStore): void {
  if (store.preferenceKey === null) return;
  saveRepoState(store.preferenceKey, {
    preferences: store.preferences,
    favorites: store.favorites,
    recent: store.recent,
  });
}

export const useWorldStore = create<WorldStore>()(
  subscribeWithSelector((set, get) => ({
    // ── État initial ──
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
    preferences: DEFAULT_PREFERENCES,

    searchOpen: false,
    minimapOpen: false,
    codePanelOpen: false,
    settingsOpen: false,

    // ── Galerie ──
    loadGalleryData: async () => {
      set({ galleryStatus: "loading", galleryError: null });
      try {
        const gallery = await loadGallery();
        set({ gallery, galleryStatus: "ready" });
      } catch (err) {
        set({
          galleryStatus: "error",
          galleryError: err instanceof Error ? err.message : String(err),
        });
      }
    },

    // ── Monde ──
    openWorld: async (path) => {
      set({
        worldPath: path,
        worldStatus: "loading",
        worldError: null,
        world: null,
        worldIndex: null,
      });
      try {
        const world = await loadWorld(path);
        const index = buildWorldIndex(world);
        const key = repoKey(world);
        const persisted = loadRepoState(key);
        const spawnId = index.hall?.id ?? world.layout.spatialNodes[0]?.id ?? null;
        set({
          world,
          worldIndex: index,
          worldStatus: "ready",
          worldError: null,
          preferenceKey: key,
          preferences: persisted.preferences,
          favorites: persisted.favorites,
          recent: persisted.recent,
          currentSpatialNodeId: spawnId,
          selectedFileNodeId: null,
          // Spawn initial au hall : la scène lit `pendingTeleport` pour poser la caméra.
          pendingTeleport: spawnId === null ? null : { spatialNodeId: spawnId, selectedFileNodeId: null },
        });
      } catch (err) {
        // FR-027 : la version refusée (et toute autre défaillance) devient un état
        // affichable, jamais une exception non gérée.
        set({
          worldStatus: "error",
          worldError: normalizeWorldError(err),
          world: null,
          worldIndex: null,
        });
      }
    },

    closeWorld: () => {
      set({
        worldPath: null,
        world: null,
        worldIndex: null,
        worldStatus: "idle",
        worldError: null,
        currentSpatialNodeId: null,
        selectedFileNodeId: null,
        pendingTeleport: null,
        codePanelOpen: false,
        settingsOpen: false,
      });
    },

    // ── Navigation ──
    enterRoom: (spatialNodeId) => {
      const index = get().worldIndex;
      if (index === null || !index.spatialById.has(spatialNodeId)) return;
      set((s) => ({ currentSpatialNodeId: spatialNodeId, recent: pushRecent(s.recent, spatialNodeId) }));
      persist(get());
    },

    selectFile: (sourceNodeId) => {
      set({ selectedFileNodeId: sourceNodeId });
    },

    openFile: (sourceNodeId) => {
      set({ selectedFileNodeId: sourceNodeId, codePanelOpen: true });
    },

    requestTeleport: (target) => {
      const index = get().worldIndex;
      if (index === null) return;
      const resolution = resolveTeleport(index, target);
      if (resolution === undefined) return;
      set((s) => ({
        currentSpatialNodeId: resolution.spatialNodeId,
        selectedFileNodeId: resolution.selectedFileNodeId,
        recent: pushRecent(s.recent, resolution.spatialNodeId),
        pendingTeleport: resolution,
        codePanelOpen: resolution.selectedFileNodeId !== null ? true : s.codePanelOpen,
      }));
      persist(get());
    },

    clearTeleport: () => {
      set({ pendingTeleport: null });
    },

    returnToHall: () => {
      const hall = get().worldIndex?.hall;
      if (hall !== undefined) {
        get().requestTeleport({ kind: "room", spatialNodeId: hall.id });
      }
    },

    toggleFavorite: (sourceNodeId) => {
      set((s) => ({
        favorites: s.favorites.includes(sourceNodeId)
          ? s.favorites.filter((f) => f !== sourceNodeId)
          : [...s.favorites, sourceNodeId],
      }));
      persist(get());
    },

    // ── Préférences ──
    setReduceMotion: (value) => {
      set((s) => ({ preferences: { ...s.preferences, reduceMotion: value } }));
      persist(get());
    },
    setMoveSpeed: (value) => {
      set((s) => ({ preferences: { ...s.preferences, moveSpeed: clampMoveSpeed(value) } }));
      persist(get());
    },
    setTransitionsEnabled: (value) => {
      set((s) => ({ preferences: { ...s.preferences, transitionsEnabled: value } }));
      persist(get());
    },
    setVisualQuality: (value) => {
      set((s) => ({ preferences: { ...s.preferences, visualQuality: value } }));
      persist(get());
    },
    setFreeMovement: (value) => {
      set((s) => ({ preferences: { ...s.preferences, freeMovement: value } }));
      persist(get());
    },
    setPreferences: (patch) => {
      set((s) => ({
        preferences: {
          ...s.preferences,
          ...patch,
          ...(patch.moveSpeed === undefined ? {} : { moveSpeed: clampMoveSpeed(patch.moveSpeed) }),
        },
      }));
      persist(get());
    },

    // ── Interface 2D ──
    setSearchOpen: (open) => {
      set({ searchOpen: open });
    },
    toggleSearch: () => {
      set((s) => ({ searchOpen: !s.searchOpen }));
    },
    setMinimapOpen: (open) => {
      set({ minimapOpen: open });
    },
    toggleMinimap: () => {
      set((s) => ({ minimapOpen: !s.minimapOpen }));
    },
    setCodePanelOpen: (open) => {
      set({ codePanelOpen: open });
    },
    toggleCodePanel: () => {
      set((s) => ({ codePanelOpen: !s.codePanelOpen }));
    },
    setSettingsOpen: (open) => {
      set({ settingsOpen: open });
    },
    toggleSettings: () => {
      set((s) => ({ settingsOpen: !s.settingsOpen }));
    },
  })),
);

// ── Sélecteurs-hooks FINS (les composants s'abonnent à des tranches, pas au tout) ──

export const useGallery = (): Gallery | null => useWorldStore((s) => s.gallery);
export const useWorldStatus = (): LoadStatus => useWorldStore((s) => s.worldStatus);
export const useWorldError = (): WorldError | null => useWorldStore((s) => s.worldError);
export const useCurrentSpatialNodeId = (): string | null =>
  useWorldStore((s) => s.currentSpatialNodeId);
export const useSelectedFileNodeId = (): string | null =>
  useWorldStore((s) => s.selectedFileNodeId);
export const usePreferences = (): Preferences => useWorldStore((s) => s.preferences);
export const useSettingsOpen = (): boolean => useWorldStore((s) => s.settingsOpen);
export const usePendingTeleport = (): TeleportResolution | null =>
  useWorldStore((s) => s.pendingTeleport);
