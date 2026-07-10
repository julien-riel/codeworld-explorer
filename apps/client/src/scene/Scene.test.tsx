// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { buildWorldIndex } from "../state/selectors";
import { useWorldStore } from "../state/store";
import { computeActiveZone } from "./zoneLoading";
import { groupFileObjects } from "./instancing";
import { Scene } from "./Scene";
import { loadSchemaWorld } from "./schemaWorldFixture";

const world = loadSchemaWorld();
const index = buildWorldIndex(world);
const hall = index.hall;

// `findAllByType` s'appuie sur `object.type` (= "Mesh" y compris pour InstancedMesh) ;
// on distingue donc par les drapeaux three réels de l'objet sous-jacent (`node.instance`).
type MeshFlags = { isMesh?: boolean; isInstancedMesh?: boolean };
type SceneNode = { instance: unknown };
const flags = (node: SceneNode): MeshFlags => node.instance as MeshFlags;
const isInstanced = (node: SceneNode): boolean => flags(node).isInstancedMesh === true;
const isPlainMesh = (node: SceneNode): boolean =>
  flags(node).isMesh === true && flags(node).isInstancedMesh !== true;

// Prépare le store comme après un chargement de monde : la scène lit ces tranches.
beforeAll(() => {
  useWorldStore.setState({
    world,
    worldIndex: index,
    worldStatus: "ready",
    currentSpatialNodeId: hall?.id ?? null,
    selectedFileNodeId: null,
  });
});

describe("<Scene> sur le monde `schema`", () => {
  it("se monte sans exception et produit une InstancedMesh par (theme, kind) visible", async () => {
    expect(hall).toBeDefined();
    if (hall === undefined) return;

    // Nombre attendu d'InstancedMesh = couples (theme, kind) de la zone active.
    const zone = computeActiveZone(index, hall.id);
    const expectedGroups = groupFileObjects(zone.rooms).length;
    expect(expectedGroups).toBeGreaterThan(0);

    const renderer = await ReactThreeTestRenderer.create(<Scene />);

    const instanced = renderer.scene.findAll(isInstanced);
    expect(instanced).toHaveLength(expectedGroups);

    // La scène a bien monté des salles (sols + murs) : au moins un Mesh classique.
    expect(renderer.scene.findAll(isPlainMesh).length).toBeGreaterThan(0);

    await renderer.unmount();
  });

  it("ne rend que des lumières quand aucun monde n'est chargé", async () => {
    useWorldStore.setState({ worldIndex: null, currentSpatialNodeId: null });
    const renderer = await ReactThreeTestRenderer.create(<Scene />);
    expect(renderer.scene.findAll(isInstanced)).toHaveLength(0);
    expect(renderer.scene.findAll(isPlainMesh)).toHaveLength(0);
    await renderer.unmount();

    // Restaure l'état pour d'éventuels tests suivants.
    useWorldStore.setState({
      worldIndex: index,
      currentSpatialNodeId: hall?.id ?? null,
    });
  });
});
