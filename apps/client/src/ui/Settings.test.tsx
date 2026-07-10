// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DEFAULT_PREFERENCES, loadRepoState, useWorldStore } from "../state/store";
import { Settings } from "./Settings";
import { resetStore } from "./testkit";

/** localStorage en mémoire (jsdom n'en fournit pas de persistant entre tests). */
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

const KEY = "acme/repo@abc";

/** Ouvre le panneau, lié à un dépôt (préférences persistables), sur les défauts. */
function openSettings(): void {
  act(() => {
    useWorldStore.setState({
      preferenceKey: KEY,
      preferences: DEFAULT_PREFERENCES,
      settingsOpen: true,
    });
  });
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createFakeStorage());
  resetStore();
});

afterEach(() => {
  cleanup();
  resetStore();
  vi.unstubAllGlobals();
});

const cb = (name: string): HTMLInputElement => screen.getByLabelText(name);

describe("Settings — visibilité", () => {
  it("ne rend rien quand le panneau est fermé", () => {
    useWorldStore.setState({ settingsOpen: false });
    const { container } = render(<Settings />);
    expect(container.firstChild).toBeNull();
  });

  it("le bouton de fermeture referme le panneau", () => {
    openSettings();
    render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: "Fermer les options" }));
    expect(useWorldStore.getState().settingsOpen).toBe(false);
  });
});

describe("Settings — reflète les préférences courantes", () => {
  it("coche les interrupteurs selon l'état du store", () => {
    act(() => {
      useWorldStore.setState({
        preferenceKey: KEY,
        preferences: { ...DEFAULT_PREFERENCES, reduceMotion: true, freeMovement: false },
        settingsOpen: true,
      });
    });
    render(<Settings />);
    expect(cb("Réduction des mouvements").checked).toBe(true);
    expect(cb("Déplacement libre").checked).toBe(false);
    expect(cb("Transitions animées").checked).toBe(true);
  });
});

describe("Settings — chaque préférence est persistée et relue (FR-022)", () => {
  it("réduction des mouvements : écrite dans le store et dans le storage", () => {
    openSettings();
    render(<Settings />);
    fireEvent.click(cb("Réduction des mouvements"));

    expect(useWorldStore.getState().preferences.reduceMotion).toBe(true);
    expect(loadRepoState(KEY).preferences.reduceMotion).toBe(true);
  });

  it("transitions animées : désactivables et persistées", () => {
    openSettings();
    render(<Settings />);
    fireEvent.click(cb("Transitions animées"));

    expect(useWorldStore.getState().preferences.transitionsEnabled).toBe(false);
    expect(loadRepoState(KEY).preferences.transitionsEnabled).toBe(false);
  });

  it("déplacement libre : bascule le mode « sans déplacement libre » et le persiste", () => {
    openSettings();
    render(<Settings />);
    fireEvent.click(cb("Déplacement libre"));

    expect(useWorldStore.getState().preferences.freeMovement).toBe(false);
    expect(loadRepoState(KEY).preferences.freeMovement).toBe(false);
  });

  it("vitesse de déplacement : le curseur écrit une valeur bornée et persistée", () => {
    openSettings();
    render(<Settings />);
    fireEvent.change(screen.getByLabelText("Vitesse de déplacement"), {
      target: { value: "2.5" },
    });

    expect(useWorldStore.getState().preferences.moveSpeed).toBe(2.5);
    expect(loadRepoState(KEY).preferences.moveSpeed).toBe(2.5);
  });

  it("qualité visuelle : le choix radio est écrit et persisté", () => {
    openSettings();
    render(<Settings />);
    fireEvent.click(screen.getByLabelText("Basse"));

    expect(useWorldStore.getState().preferences.visualQuality).toBe("low");
    expect(loadRepoState(KEY).preferences.visualQuality).toBe("low");
  });

  it("relit les valeurs persistées après un rechargement simulé du store", () => {
    openSettings();
    render(<Settings />);
    fireEvent.click(cb("Réduction des mouvements"));
    fireEvent.click(cb("Déplacement libre"));

    // Rechargement simulé : on repart des défauts en mémoire puis on relit le storage.
    const persisted = loadRepoState(KEY).preferences;
    act(() => useWorldStore.setState({ preferences: DEFAULT_PREFERENCES }));
    act(() => useWorldStore.setState({ preferences: persisted }));

    expect(cb("Réduction des mouvements").checked).toBe(true);
    expect(cb("Déplacement libre").checked).toBe(false);
  });
});

describe("Settings — état dérivé exposé (PRD §17.3)", () => {
  it("la réduction des mouvements affiche que les transitions sont désactivées", () => {
    openSettings();
    render(<Settings />);
    // Avant : l'aide décrit des transitions actives.
    expect(screen.queryByText("Désactivées par la réduction des mouvements.")).toBeNull();

    fireEvent.click(cb("Réduction des mouvements"));

    expect(screen.getByText("Désactivées par la réduction des mouvements.")).toBeDefined();
  });
});
