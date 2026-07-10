// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { buildWorldIndex } from "../state/selectors";
import { getCameraPose, mmToSceneUnits, useWorldStore } from "../state/store";
import { EYE_HEIGHT } from "./fpsControls";
import { Scene } from "./Scene";
import { Camera } from "./Camera";
import { loadSchemaWorld } from "./schemaWorldFixture";

const world = loadSchemaWorld();
const index = buildWorldIndex(world);
const hall = index.hall;
if (hall === undefined) throw new Error("Le monde `schema` doit avoir un hall");

type MeshFlags = { isInstancedMesh?: boolean };
type SceneNode = { instance: unknown };
const isInstanced = (node: SceneNode): boolean =>
  (node.instance as MeshFlags).isInstancedMesh === true;

// Prépare le store comme après un chargement de monde, avec une téléportation d'apparition
// en attente (ce que fait `openWorld` : la scène pose la caméra puis la consomme).
beforeAll(() => {
  useWorldStore.setState({
    world,
    worldIndex: index,
    worldStatus: "ready",
    currentSpatialNodeId: hall.id,
    selectedFileNodeId: null,
    pendingTeleport: { spatialNodeId: hall.id, selectedFileNodeId: null },
  });
});

describe("scène complète (Scene + Camera) sur le monde `schema`", () => {
  it("se monte et avance ses images sans exception", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <>
        <Scene />
        <Camera />
      </>,
    );
    // Deux images de boucle de rendu : intègre la caméra et applique la pose.
    await renderer.advanceFrames(2, 1 / 60);

    // La scène a bien monté des objets fichiers instanciés (au moins un groupe).
    expect(renderer.scene.findAll(isInstanced).length).toBeGreaterThan(0);

    await renderer.unmount();
  });

  it("consomme la téléportation d'apparition : caméra au centre du hall, pose vidée", async () => {
    // Réarme la téléportation d'apparition avant ce montage.
    useWorldStore.setState({ pendingTeleport: { spatialNodeId: hall.id, selectedFileNodeId: null } });

    const renderer = await ReactThreeTestRenderer.create(<Camera />);
    await renderer.advanceFrames(2, 1 / 60);

    const pose = getCameraPose();
    expect(pose.position[0]).toBeCloseTo(mmToSceneUnits(hall.position.x), 3);
    expect(pose.position[2]).toBeCloseTo(mmToSceneUnits(hall.position.z), 3);
    expect(pose.position[1]).toBeCloseTo(mmToSceneUnits(hall.position.y) + EYE_HEIGHT, 3);

    // La téléportation a été consommée (le store n'en porte plus).
    expect(useWorldStore.getState().pendingTeleport).toBeNull();

    await renderer.unmount();
  });
});
