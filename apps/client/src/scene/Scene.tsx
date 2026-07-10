/**
 * Racine de la SCÈNE 3D (à l'intérieur de `<Canvas>`). Elle lit le graphe spatial
 * par sélecteurs FINS du store et REND le monde : lumières simples (sans ombres
 * dynamiques coûteuses, PRD §9.5), sol et murs des salles montées, portails, et
 * objets fichiers instanciés.
 *
 * Chargement PAR ZONE (PRD §9.5) : seules la salle courante et ses voisines
 * immédiates sont montées. Les objets fichiers, eux, sont regroupés et instanciés à
 * la racine (matrices monde), pas dans les groupes de salle.
 *
 * Contrainte dure (PRD §11.3, §19.4) : ce composant et toute sa descendance ne
 * rendent AUCUN DOM ; ils communiquent avec l'UI 2D uniquement par le store.
 */

import { useMemo, type ReactElement } from "react";
import { mmToSceneUnits, useCurrentSpatialNodeId, useWorldStore } from "../state/store";
import { orientationToYaw } from "./roomGeometry";
import { computeActiveZone } from "./zoneLoading";
import { Room } from "./Room";
import { Portals } from "./Portals";
import { FileObjects } from "./FileObjects";

/** Lumières de scène : diffuses et sans ombres (budget de rendu, PRD §9.5). */
function SceneLights(): ReactElement {
  return (
    <>
      <hemisphereLight args={[0xffffff, 0x2a2f38, 0.55]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[8, 20, 6]} intensity={0.7} />
    </>
  );
}

/** Racine de la scène. Se limite aux lumières si aucun monde n'est chargé. */
export function Scene(): ReactElement {
  const index = useWorldStore((s) => s.worldIndex);
  const currentSpatialNodeId = useCurrentSpatialNodeId();

  const zone = useMemo(
    () => computeActiveZone(index, currentSpatialNodeId),
    [index, currentSpatialNodeId],
  );

  if (index === null) {
    return <SceneLights />;
  }

  return (
    <>
      <SceneLights />

      {/* Salles montées : chacune dans un groupe placé à sa position/orientation monde. */}
      {zone.rooms.map((room) => (
        <group
          key={room.id}
          position={[
            mmToSceneUnits(room.position.x),
            mmToSceneUnits(room.position.y),
            mmToSceneUnits(room.position.z),
          ]}
          rotation={[0, orientationToYaw(room.orientation), 0]}
        >
          <Room room={room} isCurrent={room.id === zone.currentId} />
          <Portals room={room} />
        </group>
      ))}

      {/* Objets fichiers : instanciés en repère monde, regroupés par (theme, kind). */}
      <FileObjects rooms={zone.rooms} index={index} />
    </>
  );
}
