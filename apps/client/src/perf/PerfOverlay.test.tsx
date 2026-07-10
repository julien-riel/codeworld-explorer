// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { buildWorldIndex } from "../state/selectors";
import { useWorldStore } from "../state/store";
import { registerProceduralKits } from "../theme/register";
import { loadSchemaWorld } from "../scene/schemaWorldFixture";
import { PerfOverlay, PERF_OVERLAY_KEY } from "./PerfOverlay";

registerProceduralKits();

const world = loadSchemaWorld();
const index = buildWorldIndex(world);

afterEach(() => {
  cleanup();
});

describe("<PerfOverlay>", () => {
  it("est masqué au départ et n'affiche rien", () => {
    render(<PerfOverlay />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("s'affiche/se masque à la touche F3 et montre les compteurs statiques de la zone", () => {
    useWorldStore.setState({ worldIndex: index, currentSpatialNodeId: index.hall?.id ?? null });
    render(<PerfOverlay />);

    fireEvent.keyDown(window, { key: PERF_OVERLAY_KEY });
    const panel = screen.getByRole("status");
    expect(panel.textContent).toContain("InstancedMesh");
    expect(panel.textContent).toContain("instances");
    // C'est bien du DOM : aucun objet three (canvas) rendu par l'overlay.
    expect(panel.querySelector("canvas")).toBeNull();

    // Deuxième F3 : masque de nouveau.
    fireEvent.keyDown(window, { key: PERF_OVERLAY_KEY });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
