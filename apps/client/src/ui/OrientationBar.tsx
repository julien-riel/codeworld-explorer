/**
 * Barre d'orientation permanente (PRD §9.3) : chemin GitHub courant, nom de zone,
 * thème appliqué, accès à la recherche, historique récent. Toujours visible dans un
 * monde chargé, elle donne le « vous êtes ici » que réclament les règles anti-friction.
 */

import type { ReactElement } from "react";
import { PALETTE, themeAccentName } from "../palette";
import { useWorldStore } from "../state/store";
import { useCurrentRoom, useWorldIndex } from "./hooks";
import { segmentLabel, themeLabel } from "./format";

/** Nom lisible d'une zone : « Hall principal » pour le hall, sinon le nom du dossier. */
function zoneName(role: string, name: string, path: string): string {
  if (role === "hall") return "Hall principal";
  return segmentLabel(name, path);
}

export function OrientationBar(): ReactElement | null {
  const index = useWorldIndex();
  const room = useCurrentRoom();
  const recent = useWorldStore((s) => s.recent);
  const requestTeleport = useWorldStore((s) => s.requestTeleport);
  const toggleSearch = useWorldStore((s) => s.toggleSearch);
  const searchOpen = useWorldStore((s) => s.searchOpen);
  const toggleSettings = useWorldStore((s) => s.toggleSettings);
  const settingsOpen = useWorldStore((s) => s.settingsOpen);

  if (index === null || room === null) return null;

  const source = index.nodeById.get(room.sourceNodeId);
  const path = source?.path ?? "";
  const zone = zoneName(room.role, source?.name ?? "", path);
  const dotColor = PALETTE[themeAccentName(room.theme)];

  // Récents : salles distinctes de la salle courante, les plus récentes en tête.
  const recentRooms = recent
    .filter((id) => id !== room.id)
    .map((id) => index.spatialById.get(id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined)
    .slice(0, 4);

  return (
    <header className="cw-orient" aria-label="Orientation">
      <span className="cw-zone">{zone}</span>

      <span className="cw-meta" aria-label="Chemin GitHub courant">
        <span aria-hidden="true">📁</span>
        <code style={{ background: "none", color: "inherit" }}>{path === "" ? "/" : path}</code>
      </span>

      <span className="cw-meta" aria-label={`Thème : ${themeLabel(room.theme)}`}>
        <span className="cw-theme-dot" style={{ background: dotColor }} aria-hidden="true" />
        {themeLabel(room.theme)}
      </span>

      <span className="cw-spacer" />

      {recentRooms.length > 0 && (
        <nav className="cw-recent" aria-label="Historique récent">
          <span className="cw-faint" style={{ fontSize: 12 }}>
            Récent :
          </span>
          {recentRooms.map((r) => {
            const rSource = index.nodeById.get(r.sourceNodeId);
            const label = zoneName(r.role, rSource?.name ?? "", rSource?.path ?? "");
            return (
              <button
                key={r.id}
                type="button"
                className="cw-btn"
                style={{ fontSize: 12, padding: "2px 8px" }}
                onClick={() => {
                  requestTeleport({ kind: "room", spatialNodeId: r.id });
                }}
              >
                {label}
              </button>
            );
          })}
        </nav>
      )}

      <button
        type="button"
        className="cw-btn"
        aria-pressed={searchOpen}
        onClick={toggleSearch}
        title="Rechercher (chemins, fichiers)"
      >
        <span aria-hidden="true">🔍</span> Rechercher
      </button>

      <button
        type="button"
        className="cw-btn"
        aria-pressed={settingsOpen}
        onClick={toggleSettings}
        title="Options de confort et d'accessibilité"
      >
        <span aria-hidden="true">⚙️</span> Options
      </button>
    </header>
  );
}
