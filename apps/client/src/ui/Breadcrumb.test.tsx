// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useWorldStore } from "../state/store";
import { Breadcrumb } from "./Breadcrumb";
import { IDS, loadWorldIntoStore, makeWorld, resetStore } from "./testkit";

afterEach(() => {
  cleanup();
  resetStore();
});

describe("Breadcrumb", () => {
  it("rend les segments d'ancêtres de la salle courante, position marquée aria-current", () => {
    loadWorldIntoStore(makeWorld(), IDS.srcRoom);
    render(<Breadcrumb />);

    // Chaîne racine → src : deux segments cliquables (le dernier est la position).
    expect(screen.getByRole("button", { name: "acme-repo" })).toBeDefined();
    const current = screen.getByRole("button", { name: "src" });
    expect(current.getAttribute("aria-current")).toBe("location");
    expect((current as HTMLButtonElement).disabled).toBe(true);
  });

  it("un clic sur un segment déclenche requestTeleport vers ce nœud", () => {
    loadWorldIntoStore(makeWorld(), IDS.srcRoom);
    const requestTeleport = vi.fn();
    useWorldStore.setState({ requestTeleport });
    render(<Breadcrumb />);

    fireEvent.click(screen.getByRole("button", { name: "acme-repo" }));
    expect(requestTeleport).toHaveBeenCalledWith({ kind: "node", sourceNodeId: IDS.root });
  });

  it("le bouton « Hall principal » déclenche returnToHall", () => {
    loadWorldIntoStore(makeWorld(), IDS.srcRoom);
    const returnToHall = vi.fn();
    useWorldStore.setState({ returnToHall });
    render(<Breadcrumb />);

    fireEvent.click(screen.getByRole("button", { name: /Hall principal/ }));
    expect(returnToHall).toHaveBeenCalledTimes(1);
  });

  it("ne rend rien hors d'un monde", () => {
    resetStore();
    const { container } = render(<Breadcrumb />);
    expect(container.firstChild).toBeNull();
  });
});
