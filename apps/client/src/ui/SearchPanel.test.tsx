// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SearchDoc, World } from "@codeworld/world-schema";
import { useWorldStore } from "../state/store";
import { SearchPanel } from "./SearchPanel";
import { IDS, loadWorldIntoStore, makeWorld, resetStore } from "./testkit";

afterEach(() => {
  cleanup();
  resetStore();
});

/** Documents de recherche couvrant le monde de fixture, dont un symbole (phase 1). */
const DOCS: SearchDoc[] = [
  { ref: IDS.root, path: "", name: "acme-repo", kind: "directory" },
  { ref: IDS.src, path: "src", name: "src", kind: "directory" },
  { ref: IDS.docs, path: "docs", name: "docs", kind: "directory" },
  { ref: IDS.fileA, path: "src/a.ts", name: "a.ts", kind: "file", language: "TypeScript", category: "service", symbolNames: ["computeLayout"] },
  { ref: IDS.readme, path: "docs/README.md", name: "README.md", kind: "file", language: "Markdown", category: "documentation" },
];

/** Monde de fixture doté d'un index de recherche peuplé. */
function worldWithSearch(): World {
  const world = makeWorld();
  return { ...world, search: { version: 0, documents: DOCS } };
}

/** Charge le monde (au hall) et positionne l'état d'ouverture de la recherche. */
function setup(searchOpen: boolean): void {
  loadWorldIntoStore(worldWithSearch(), IDS.hall);
  useWorldStore.setState({ searchOpen });
}

function typeQuery(text: string): void {
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: text } });
}

describe("SearchPanel", () => {
  it("ne rend rien quand la recherche est fermée", () => {
    setup(false);
    render(<SearchPanel />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("trouve un fichier par nom et un symbole, avec prévisualisation du chemin", () => {
    setup(true);
    render(<SearchPanel />);

    typeQuery("README");
    const readme = screen.getByRole("option", { name: /README\.md/ });
    expect(readme.textContent).toContain("docs/README.md");

    // Le symbole `computeLayout` (indexé) retrouve le fichier qui le porte.
    typeQuery("computeLayout");
    expect(screen.getByRole("option", { name: /a\.ts/ })).toBeDefined();
  });

  it("un résultat téléporte vers la salle qui le contient et le sélectionne", () => {
    setup(true);
    render(<SearchPanel />);

    typeQuery("README");
    fireEvent.click(screen.getByRole("option", { name: /README\.md/ }));

    const s = useWorldStore.getState();
    expect(s.pendingTeleport).toEqual({ spatialNodeId: IDS.docsRoom, selectedFileNodeId: IDS.readme });
    expect(s.currentSpatialNodeId).toBe(IDS.docsRoom);
  });

  it("règle des deux actions : au plus deux transitions de store de l'ouverture à l'arrivée", () => {
    setup(false);
    render(<SearchPanel />);

    let transitions = 0;
    const unsubscribe = useWorldStore.subscribe(() => {
      transitions += 1;
    });

    // Action 1 : ouvrir la recherche (raccourci clavier).
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(useWorldStore.getState().searchOpen).toBe(true);

    // Frappe : état LOCAL au panneau, aucune transition de store.
    typeQuery("README");

    // Action 2 : choisir le résultat → écrit la cible d'arrivée.
    fireEvent.click(screen.getByRole("option", { name: /README\.md/ }));
    unsubscribe();

    expect(useWorldStore.getState().pendingTeleport).toEqual({
      spatialNodeId: IDS.docsRoom,
      selectedFileNodeId: IDS.readme,
    });
    expect(transitions).toBe(2);
  });

  it("le raccourci Ctrl/Cmd+K ouvre la recherche", () => {
    setup(false);
    render(<SearchPanel />);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(useWorldStore.getState().searchOpen).toBe(true);
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("le filtre par type restreint les résultats", () => {
    setup(true);
    render(<SearchPanel />);

    typeQuery("src");
    expect(screen.getByRole("option", { name: /a\.ts/ })).toBeDefined();

    fireEvent.change(screen.getByLabelText("Filtrer par type"), { target: { value: "directory" } });

    expect(screen.queryByRole("option", { name: /a\.ts/ })).toBeNull();
    expect(screen.getByRole("option", { name: /^src/ })).toBeDefined();
  });
});
