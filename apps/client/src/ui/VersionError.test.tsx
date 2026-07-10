// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useWorldStore } from "../state/store";
import { Hud } from "./Hud";
import { VersionError } from "./VersionError";
import { resetStore } from "./testkit";

afterEach(() => {
  cleanup();
  resetStore();
});

describe("VersionError via Hud", () => {
  it("s'affiche quand le store porte une erreur de version, avec version et supportées", () => {
    useWorldStore.setState({
      worldStatus: "error",
      worldError: {
        kind: "unsupported-schema-version",
        found: 7,
        supported: [0],
        message: "Version de schéma non supportée : 7 (supportées : 0).",
      },
    });
    render(<Hud />);

    expect(screen.getByRole("alertdialog")).toBeDefined();
    expect(screen.getByText(/Version de schéma non supportée/)).toBeDefined();
    // La version trouvée et les versions supportées sont montrées (message explicite, FR-027).
    expect(screen.getByText("7")).toBeDefined();
    expect(screen.getByText("0")).toBeDefined();
  });
});

describe("VersionError", () => {
  it("montre les autres défaillances (réseau) sans écran blanc", () => {
    render(
      <VersionError
        error={{ kind: "network", status: 404, message: "introuvable" }}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText(/Chargement impossible/)).toBeDefined();
    expect(screen.getByText(/HTTP 404/)).toBeDefined();
  });

  it("le bouton de retour appelle onDismiss", () => {
    let dismissed = false;
    render(
      <VersionError
        error={{ kind: "malformed-json", message: "boom" }}
        onDismiss={() => {
          dismissed = true;
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Retour à la galerie/ }));
    expect(dismissed).toBe(true);
  });
});
