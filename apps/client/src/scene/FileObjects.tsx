/**
 * Objets fichiers en géométries INSTANCIÉES, regroupées par `(theme, ObjectKind)`
 * (PRD §9.5) : une `InstancedMesh` par groupe visible, jamais un mesh par fichier.
 * Le survol et le clic sélectionnent le fichier (écrivent `selectedFileNodeId` dans
 * le store) ; une étiquette légère montre le nom au survol.
 *
 * Composant de SCÈNE : uniquement du three (l'étiquette est un sprite, pas du DOM).
 */

import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Object3D, type BufferGeometry, MeshStandardMaterial } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { SpatialNode } from "@codeworld/world-schema";
import type { WorldIndex } from "../state/selectors";
import { useSelectedFileNodeId, useWorldStore } from "../state/store";
import { PALETTE } from "../palette";
import { groupFileObjects, type FileInstance, type FileObjectGroup } from "./instancing";
import { geometryFromDescriptor } from "./primitives";
import { resolveDescriptor } from "./themeFallback";
import { HoverLabel } from "./HoverLabel";
import { SelectionHighlight } from "./SelectionHighlight";

/** Objet 3D réutilisé pour composer les matrices d'instance (aucune allocation par instance). */
function useMatrixDummy(): Object3D {
  return useMemo(() => new Object3D(), []);
}

/** Signale un survol d'instance : `sourceNodeId` et sa position monde, ou `null`. */
type HoverHandler = (instance: FileInstance | null) => void;

/** Une `InstancedMesh` pour un groupe `(theme, kind)`. */
function InstanceGroup({
  group,
  onHover,
  onSelect,
}: {
  group: FileObjectGroup;
  onHover: HoverHandler;
  onSelect: (sourceNodeId: string) => void;
}): ReactElement {
  const dummy = useMatrixDummy();
  const meshRef = useRef<import("three").InstancedMesh>(null);

  // Géométrie + matériau construits une fois par groupe (partagés par les instances).
  const { geometry, material } = useMemo(() => {
    const desc = resolveDescriptor(group.theme, group.kind);
    const geo: BufferGeometry = geometryFromDescriptor(desc);
    const mat = new MeshStandardMaterial({ color: PALETTE[desc.color] });
    return { geometry: geo, material: mat };
  }, [group.theme, group.kind]);

  // Libération des ressources GPU au démontage.
  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  // Écriture des matrices d'instance (position + lacet), après (re)montage.
  useEffect(() => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    group.instances.forEach((inst, i) => {
      dummy.position.set(inst.position[0], inst.position[1], inst.position[2]);
      dummy.rotation.set(0, inst.yaw, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = group.instances.length;
  }, [group.instances, dummy]);

  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>): FileInstance | undefined =>
    e.instanceId === undefined ? undefined : group.instances[e.instanceId];

  // La géométrie et le matériau sont attachés en `primitive` (objets EXTERNES que
  // R3F ne libère pas), et non passés en `args` : quand le nombre d'instances change,
  // R3F recrée l'InstancedMesh (redimensionne son buffer) SANS disposer nos ressources
  // partagées ; on les libère nous-mêmes au démontage du groupe.
  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, group.instances.length]}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        const inst = pick(e);
        if (inst !== undefined) onHover(inst);
      }}
      onPointerOut={() => {
        onHover(null);
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        const inst = pick(e);
        if (inst !== undefined) onSelect(inst.sourceNodeId);
      }}
    >
      <primitive object={geometry} attach="geometry" />
      <primitive object={material} attach="material" />
    </instancedMesh>
  );
}

/** Props de `FileObjects`. */
export interface FileObjectsProps {
  /** Salles montées (zone active) dont on rend les objets. */
  rooms: readonly SpatialNode[];
  /** Index du monde (résolution des noms de fichiers pour l'étiquette). */
  index: WorldIndex;
}

/**
 * Rend tous les objets fichiers des salles actives en `InstancedMesh` groupées. Le
 * survol met à jour une étiquette et la sélection (dédupliquée : une écriture store
 * seulement au changement d'objet, jamais à chaque image).
 */
export function FileObjects({ rooms, index }: FileObjectsProps): ReactElement {
  const groups = useMemo(() => groupFileObjects(rooms), [rooms]);
  const selectFile = useWorldStore((s) => s.selectFile);
  // Le CLIC ouvre le panneau de code (sélection + ouverture, FR-007) ; le SURVOL ne fait que présélectionner.
  const openFile = useWorldStore((s) => s.openFile);
  const selectedFileNodeId = useSelectedFileNodeId();

  const [hovered, setHovered] = useState<FileInstance | null>(null);
  // Dernier objet survolé : évite d'écrire le store à chaque image (seulement au changement).
  const lastHoverId = useRef<string | null>(null);

  const handleHover: HoverHandler = (instance) => {
    const id = instance?.sourceNodeId ?? null;
    if (lastHoverId.current === id) return;
    lastHoverId.current = id;
    setHovered(instance);
    if (id !== null) selectFile(id);
  };

  const hoveredName =
    hovered === null ? null : (index.nodeById.get(hovered.sourceNodeId)?.name ?? null);

  return (
    <group>
      {groups.map((group) => (
        <InstanceGroup
          key={`${group.theme} ${group.kind}`}
          group={group}
          onHover={handleHover}
          onSelect={openFile}
        />
      ))}
      {hovered !== null && hoveredName !== null ? (
        <HoverLabel position={hovered.position} text={hoveredName} />
      ) : null}
      <SelectionHighlight groups={groups} selectedFileNodeId={selectedFileNodeId} />
    </group>
  );
}
