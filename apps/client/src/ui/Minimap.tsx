/**
 * Mini-carte + point-and-click cartographique (PRD §9.3, §14.3, FR-010 ; sprint 3).
 *
 * Composant de l'INTERFACE 2D (arbre DOM, HORS du <Canvas>) : il ne rend aucun objet
 * three et ne communique avec la scène que par le store. Il projette les `spatialNodes`
 * du monde sur un plan à l'échelle (helpers PURS de `minimap/projection`), marque la
 * salle courante, les salles visitées et la position du joueur.
 *
 * ── Téléportation, pas de marche (PRD §23.1) ──
 * Cliquer une salle écrit une cible via `requestTeleport` : l'intégration exécute la
 * téléportation. TOUTE salle est ainsi atteignable sans déplacement libre, ce qui couvre
 * le mode « sans déplacement libre ». La téléportation est instantanée (aucune animation
 * ici), donc conforme au mode réduction des mouvements.
 *
 * ── Marqueur joueur HORS de React ──
 * La pose caméra change à chaque image ; la lire via un `setState` re-rendrait l'UI 2D
 * 60 fois/s. Le marqueur est donc positionné dans une boucle rAF qui lit le conteneur
 * transitoire (`getCameraPose`) et mute directement le `style.transform` de l'élément,
 * sans passer par React.
 */

import { useEffect, useMemo, useRef, type ReactElement } from "react";
import type { SpatialNode } from "@codeworld/world-schema";
import type { WorldIndex } from "../state/selectors";
import {
  getCameraPose,
  MM_PER_SCENE_UNIT,
  useCurrentSpatialNodeId,
  useWorldStore,
} from "../state/store";
import { PALETTE } from "../palette";
import { useWorld, useWorldIndex } from "./hooks";
import { segmentLabel } from "./format";
import {
  buildProjection,
  projectPoint,
  projectRoom,
  toMinimapRoom,
  type Viewport,
} from "./minimap/projection";
import "./minimap.css";

// ── Cadre pixel de la carte (constantes de rendu, projection déterministe) ──
const VIEWPORT: Viewport = { width: 232, height: 196, padding: 14 };
/** Taille pixel minimale d'une salle, pour qu'elle reste visible et cliquable. */
const MIN_ROOM_PX = 10;

/** Nom lisible d'une salle : « Hall principal » pour le hall, sinon le nom du dossier. */
function roomLabel(index: WorldIndex, spatial: SpatialNode): string {
  if (spatial.role === "hall") return "Hall principal";
  const source = index.nodeById.get(spatial.sourceNodeId);
  return segmentLabel(source?.name ?? "", source?.path ?? "");
}

export function Minimap(): ReactElement | null {
  const world = useWorld();
  const index = useWorldIndex();
  const currentId = useCurrentSpatialNodeId();
  // Slices FINES (primitives / références stables) : jamais l'objet store entier.
  const recent = useWorldStore((s) => s.recent);
  const minimapOpen = useWorldStore((s) => s.minimapOpen);
  const toggleMinimap = useWorldStore((s) => s.toggleMinimap);
  const requestTeleport = useWorldStore((s) => s.requestTeleport);
  const reduceMotion = useWorldStore((s) => s.preferences.reduceMotion);
  const freeMovement = useWorldStore((s) => s.preferences.freeMovement);

  const spatialNodes = world?.layout.spatialNodes ?? null;

  // Projection construite une fois par monde (entrée stable : la liste des salles).
  const projection = useMemo(
    () => (spatialNodes === null ? null : buildProjection(spatialNodes.map(toMinimapRoom), VIEWPORT)),
    [spatialNodes],
  );

  // ── Marqueur joueur : boucle rAF qui mute le transform, hors de React ──
  const playerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!minimapOpen || projection === null || typeof requestAnimationFrame === "undefined") return;
    let raf = 0;
    const tick = (): void => {
      const el = playerRef.current;
      if (el !== null) {
        const pose = getCameraPose();
        const p = projectPoint(
          projection,
          pose.position[0] * MM_PER_SCENE_UNIT,
          pose.position[2] * MM_PER_SCENE_UNIT,
        );
        // rotate(−yaw) : lacet 0 = face au nord, qui pointe vers le HAUT de la carte.
        el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) rotate(${-pose.yaw}rad)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [minimapOpen, projection]);

  if (world === null || index === null || spatialNodes === null || projection === null) return null;

  const visited = new Set(recent);

  return (
    <section className="cw-minimap" aria-label="Mini-carte">
      <button
        type="button"
        className="cw-btn"
        aria-pressed={minimapOpen}
        aria-expanded={minimapOpen}
        aria-controls="cw-minimap-panel"
        onClick={toggleMinimap}
        title="Afficher ou masquer la mini-carte"
      >
        <span aria-hidden="true">🗺️</span> Carte
      </button>

      {minimapOpen && (
        <div className="cw-minimap-panel" id="cw-minimap-panel">
          <div className="cw-minimap-head">
            <span>Plan des salles</span>
            <span className="cw-faint">{spatialNodes.length} salles</span>
          </div>

          <div
            className="cw-minimap-map"
            style={{ width: VIEWPORT.width, height: VIEWPORT.height }}
            role="group"
            aria-label="Salles du monde : activez une salle pour vous y téléporter"
          >
            {spatialNodes.map((spatial) => {
              const r = projectRoom(projection, toMinimapRoom(spatial));
              const width = Math.max(MIN_ROOM_PX, r.width);
              const height = Math.max(MIN_ROOM_PX, r.height);
              const isCurrent = spatial.id === currentId;
              const isVisited = !isCurrent && visited.has(spatial.id);
              const label = roomLabel(index, spatial);
              const stateSuffix = isCurrent ? " (vous êtes ici)" : isVisited ? " (visitée)" : "";
              const className = [
                "cw-room",
                isCurrent ? "cw-room-current" : "",
                isVisited ? "cw-room-visited" : "",
                isCurrent && !reduceMotion ? "cw-room-pulse" : "",
              ]
                .filter((c) => c !== "")
                .join(" ");
              return (
                <button
                  key={spatial.id}
                  type="button"
                  className={className}
                  style={{ left: r.cx - width / 2, top: r.cy - height / 2, width, height }}
                  aria-current={isCurrent ? "location" : undefined}
                  aria-label={`Se téléporter vers ${label}${stateSuffix}`}
                  title={label}
                  onClick={() => {
                    requestTeleport({ kind: "room", spatialNodeId: spatial.id });
                  }}
                />
              );
            })}
            {/* Marqueur du joueur : positionné par la boucle rAF (voir plus haut). */}
            <div ref={playerRef} className="cw-player" aria-hidden="true" />
          </div>

          <div className="cw-minimap-legend" aria-hidden="true">
            <span>
              <i className="cw-legend-swatch" style={{ background: PALETTE.accent }} /> Ici
            </span>
            <span>
              <i
                className="cw-legend-swatch"
                style={{ borderColor: PALETTE.accentMuted, borderWidth: 2 }}
              />{" "}
              Visitée
            </span>
            <span>
              <i className="cw-legend-swatch" /> Autre
            </span>
          </div>

          {!freeMovement && (
            <p className="cw-minimap-hint" role="note">
              Déplacement libre désactivé : activez une salle pour vous y rendre.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
