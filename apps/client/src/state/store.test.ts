import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clampMoveSpeed,
  DEFAULT_PREFERENCES,
  loadRepoState,
  MAX_MOVE_SPEED,
  MIN_MOVE_SPEED,
  repoKey,
  saveRepoState,
  useWorldStore,
} from "./store";

const worldJson = readFileSync(
  fileURLToPath(new URL("../../public/worlds/schema/world.json", import.meta.url)),
  "utf8",
);

/** localStorage en mémoire (l'environnement node n'en fournit pas). */
function createFakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string): string | null => map.get(k) ?? null,
    setItem: (k: string, v: string): void => {
      map.set(k, v);
    },
    removeItem: (k: string): void => {
      map.delete(k);
    },
    clear: (): void => {
      map.clear();
    },
    key: (i: number): string | null => [...map.keys()][i] ?? null,
    get length(): number {
      return map.size;
    },
  };
}

function stubFetch(body: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(body) })),
  );
}

let storage: ReturnType<typeof createFakeStorage>;

beforeEach(() => {
  storage = createFakeStorage();
  vi.stubGlobal("localStorage", storage);
  useWorldStore.getState().closeWorld();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("clampMoveSpeed", () => {
  it("borne dans [MIN, MAX] et retombe sur le défaut pour NaN", () => {
    expect(clampMoveSpeed(100)).toBe(MAX_MOVE_SPEED);
    expect(clampMoveSpeed(0.01)).toBe(MIN_MOVE_SPEED);
    expect(clampMoveSpeed(2)).toBe(2);
    expect(clampMoveSpeed(Number.NaN)).toBe(DEFAULT_PREFERENCES.moveSpeed);
  });
});

describe("persistance par dépôt/commit (round-trip localStorage)", () => {
  const key = "acme/repo@deadbeef";

  it("écrit puis relit à l'identique", () => {
    const state = {
      preferences: {
        reduceMotion: true,
        moveSpeed: 2,
        transitionsEnabled: false,
        visualQuality: "low" as const,
        freeMovement: false,
      },
      favorites: ["n_a", "n_b"],
      recent: ["s_1", "s_2"],
    };
    saveRepoState(key, state);
    expect(loadRepoState(key)).toEqual(state);
  });

  it("rend les défauts pour une clé absente", () => {
    expect(loadRepoState("inconnu")).toEqual({
      preferences: DEFAULT_PREFERENCES,
      favorites: [],
      recent: [],
    });
  });

  it("isole les dépôts : deux clés ne se mélangent pas", () => {
    saveRepoState("a@1", { preferences: DEFAULT_PREFERENCES, favorites: ["n_x"], recent: [] });
    saveRepoState("b@2", { preferences: DEFAULT_PREFERENCES, favorites: ["n_y"], recent: [] });
    expect(loadRepoState("a@1").favorites).toEqual(["n_x"]);
    expect(loadRepoState("b@2").favorites).toEqual(["n_y"]);
  });

  it("tolère un JSON corrompu et retombe sur les défauts", () => {
    saveRepoState(key, { preferences: DEFAULT_PREFERENCES, favorites: ["n_a"], recent: [] });
    const storageKey = storage.key(0);
    expect(storageKey).not.toBeNull();
    if (storageKey !== null) storage.setItem(storageKey, "{ corrompu");
    expect(loadRepoState(key)).toEqual({
      preferences: DEFAULT_PREFERENCES,
      favorites: [],
      recent: [],
    });
  });

  it("coerce des champs non fiables (moveSpeed borné, types filtrés)", () => {
    saveRepoState(key, {
      preferences: {
        reduceMotion: true,
        moveSpeed: 999,
        transitionsEnabled: true,
        visualQuality: "high",
        freeMovement: true,
      },
      favorites: ["n_a"],
      recent: ["s_1"],
    });
    expect(loadRepoState(key).preferences.moveSpeed).toBe(MAX_MOVE_SPEED);
  });
});

describe("openWorld — succès", () => {
  it("charge le monde, spawn au hall, préférences liées au dépôt", async () => {
    stubFetch(worldJson);
    await useWorldStore.getState().openWorld("schema/world.json");
    const s = useWorldStore.getState();

    expect(s.worldStatus).toBe("ready");
    expect(s.worldError).toBeNull();
    expect(s.world).not.toBeNull();
    // Spawn initial = hall, avec une téléportation en attente pour la scène.
    expect(s.currentSpatialNodeId).toBe(s.worldIndex?.hall?.id ?? null);
    expect(s.currentSpatialNodeId).not.toBeNull();
    expect(s.pendingTeleport?.spatialNodeId).toBe(s.currentSpatialNodeId);
    expect(s.preferences).toEqual(DEFAULT_PREFERENCES);
    const w = s.world;
    if (w !== null) expect(s.preferenceKey).toBe(repoKey(w));
  });
});

describe("openWorld — version refusée (FR-027)", () => {
  it("remonte l'erreur typée dans le store, sans exception non gérée", async () => {
    const bumped = JSON.parse(worldJson) as { manifest: { schemaVersion: number } };
    bumped.manifest.schemaVersion = 99;
    stubFetch(JSON.stringify(bumped));

    await useWorldStore.getState().openWorld("schema/world.json");
    const s = useWorldStore.getState();

    expect(s.worldStatus).toBe("error");
    expect(s.world).toBeNull();
    expect(s.worldError?.kind).toBe("unsupported-schema-version");
    if (s.worldError?.kind === "unsupported-schema-version") {
      expect(s.worldError.found).toBe(99);
    }
  });
});

describe("préférences et favoris persistés via les actions du store", () => {
  it("une préférence modifiée est persistée sous la clé du dépôt", async () => {
    stubFetch(worldJson);
    await useWorldStore.getState().openWorld("schema/world.json");
    const s = useWorldStore.getState();
    const key = s.preferenceKey;
    expect(key).not.toBeNull();

    s.setReduceMotion(true);
    s.setMoveSpeed(2);
    s.toggleFavorite("n_fav");

    if (key !== null) {
      const persisted = loadRepoState(key);
      expect(persisted.preferences.reduceMotion).toBe(true);
      expect(persisted.preferences.moveSpeed).toBe(2);
      expect(persisted.favorites).toContain("n_fav");
    }
  });

  it("un monde rouvert restaure les préférences persistées", async () => {
    stubFetch(worldJson);
    await useWorldStore.getState().openWorld("schema/world.json");
    useWorldStore.getState().setVisualQuality("low");

    // Réouverture : les préférences persistées doivent revenir.
    await useWorldStore.getState().openWorld("schema/world.json");
    expect(useWorldStore.getState().preferences.visualQuality).toBe("low");
  });
});
