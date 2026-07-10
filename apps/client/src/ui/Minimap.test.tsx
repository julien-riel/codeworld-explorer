// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DEFAULT_PREFERENCES, useWorldStore } from "../state/store";
import { Minimap } from "./Minimap";
import { IDS, loadWorldIntoStore, makeWorld, resetStore } from "./testkit";

afterEach(() => {
  cleanup();
  resetStore();
  // `resetStore` ne remet pas les préférences : on les restaure pour isoler les tests.
  useWorldStore.setState({ preferences: DEFAULT_PREFERENCES });
});

/** Ouvre un monde dans le store, mini-carte dépliée. */
function openWorldWithMap(current = IDS.hall): void {
  loadWorldIntoStore(makeWorld(), current);
  useWorldStore.setState({ minimapOpen: true });
}

describe("Minimap", () => {
  it("ne rend rien hors d'un monde", () => {
    const { container } = render(<Minimap />);
    expect(container.querySelector(".cw-minimap")).toBeNull();
  });

  it("un bouton bascule replie/déplie la carte", () => {
    loadWorldIntoStore(makeWorld(), IDS.hall);
    render(<Minimap />);
    // Fermée par défaut : le plan n'est pas monté.
    expect(screen.queryByRole("group", { name: /Salles du monde/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Carte/ }));
    expect(useWorldStore.getState().minimapOpen).toBe(true);
  });

  it("expose CHAQUE salle du monde comme cible cliquable (couverture §23.1)", () => {
    openWorldWithMap();
    render(<Minimap />);
    // Une cible par spatialNode : atteignabilité totale sans déplacement libre.
    const targets = screen.getAllByRole("button", { name: /Se téléporter vers/ });
    expect(targets).toHaveLength(makeWorld().layout.spatialNodes.length);
  });

  it("un clic sur une salle écrit la cible via requestTeleport (téléportation)", () => {
    openWorldWithMap();
    const requestTeleport = vi.fn();
    useWorldStore.setState({ requestTeleport });
    render(<Minimap />);

    fireEvent.click(screen.getByRole("button", { name: /Se téléporter vers src/ }));
    expect(requestTeleport).toHaveBeenCalledWith({ kind: "room", spatialNodeId: IDS.srcRoom });
  });

  it("marque la salle courante (aria-current) et les salles visitées", () => {
    loadWorldIntoStore(makeWorld(), IDS.srcRoom);
    useWorldStore.setState({ minimapOpen: true, recent: [IDS.docsRoom, IDS.srcRoom] });
    render(<Minimap />);

    const current = screen.getByRole("button", { name: /Se téléporter vers src \(vous êtes ici\)/ });
    expect(current.getAttribute("aria-current")).toBe("location");
    // docs a été visitée mais n'est pas la salle courante.
    expect(screen.getByRole("button", { name: /Se téléporter vers docs \(visitée\)/ })).toBeDefined();
  });

  it("téléporte instantanément même en mouvement réduit (pas d'animation requise)", () => {
    openWorldWithMap();
    useWorldStore.setState({ preferences: { ...useWorldStore.getState().preferences, reduceMotion: true } });
    const requestTeleport = vi.fn();
    useWorldStore.setState({ requestTeleport });
    render(<Minimap />);

    fireEvent.click(screen.getByRole("button", { name: /Se téléporter vers docs/ }));
    expect(requestTeleport).toHaveBeenCalledWith({ kind: "room", spatialNodeId: IDS.docsRoom });
  });

  it("affiche l'invite quand le déplacement libre est désactivé (mode §23.1)", () => {
    openWorldWithMap();
    useWorldStore.setState({ preferences: { ...useWorldStore.getState().preferences, freeMovement: false } });
    render(<Minimap />);
    expect(screen.getByRole("note")).toBeDefined();
    expect(screen.getByText(/Déplacement libre désactivé/)).toBeDefined();
  });
});
