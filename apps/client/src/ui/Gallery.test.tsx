// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useWorldStore } from "../state/store";
import { Gallery } from "./Gallery";
import { makeGallery, resetStore } from "./testkit";

afterEach(() => {
  cleanup();
  resetStore();
});

describe("Gallery", () => {
  it("liste les mondes du store avec leurs statistiques", () => {
    useWorldStore.setState({ gallery: makeGallery(), galleryStatus: "ready" });
    render(<Gallery />);

    expect(screen.getByRole("button", { name: "Ouvrir le monde schema" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Ouvrir le monde zod" })).toBeDefined();
    // Compteurs affichés (couverture des fiches).
    expect(screen.getByText("748")).toBeDefined();
    expect(screen.getByText("563")).toBeDefined();
  });

  it("un clic sur une fiche charge le monde correspondant (entry.world)", () => {
    useWorldStore.setState({ gallery: makeGallery(), galleryStatus: "ready" });
    const openWorld = vi.fn(() => Promise.resolve());
    useWorldStore.setState({ openWorld });
    render(<Gallery />);

    fireEvent.click(screen.getByRole("button", { name: "Ouvrir le monde zod" }));
    expect(openWorld).toHaveBeenCalledWith("zod/world.json");
  });

  it("montre une erreur de galerie sans planter", () => {
    useWorldStore.setState({ galleryStatus: "error", galleryError: "réseau coupé" });
    render(<Gallery />);
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText(/réseau coupé/)).toBeDefined();
  });
});
