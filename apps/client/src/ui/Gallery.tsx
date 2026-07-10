/**
 * Écran de galerie (PRD §7.1) : liste des mondes pré-analysés. Chaque fiche montre
 * nom, nœuds, salles, fichiers et taille d'artefact ; un clic charge le monde
 * (`openWorld`) et l'utilisateur arrive dans le hall.
 */

import type { ReactElement } from "react";
import { useGallery, useWorldStore } from "../state/store";
import { formatBytes } from "./format";

/** Une statistique de fiche : valeur mise en avant + libellé (jamais couleur seule). */
function Stat({ value, label }: { value: string; label: string }): ReactElement {
  return (
    <span>
      <b>{value}</b> {label}
    </span>
  );
}

export function Gallery(): ReactElement {
  const gallery = useGallery();
  const status = useWorldStore((s) => s.galleryStatus);
  const error = useWorldStore((s) => s.galleryError);
  const openWorld = useWorldStore((s) => s.openWorld);

  return (
    <div className="cw-gallery">
      <header style={{ textAlign: "center" }}>
        <h1>CodeWorld Explorer</h1>
        <p className="cw-muted">Un dépôt GitHub, un monde 3D à explorer. Choisissez un monde.</p>
      </header>

      {status === "loading" && <p className="cw-muted">Chargement de la galerie…</p>}

      {status === "error" && (
        <p role="alert" style={{ color: "var(--cw-danger)" }}>
          <span aria-hidden="true">⚠ </span>
          Impossible de charger la galerie{error !== null ? ` : ${error}` : "."}
        </p>
      )}

      {status === "ready" && gallery !== null && gallery.worlds.length === 0 && (
        <p className="cw-muted">Aucun monde disponible.</p>
      )}

      {gallery !== null && gallery.worlds.length > 0 && (
        <ul className="cw-gallery-grid" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {gallery.worlds.map((entry) => (
            <li key={entry.path} style={{ display: "contents" }}>
              <button
                type="button"
                className="cw-card"
                onClick={() => {
                  void openWorld(entry.world);
                }}
                aria-label={`Ouvrir le monde ${entry.name}`}
              >
                <h2>{entry.name}</h2>
                <div className="cw-card-stats">
                  <Stat value={String(entry.nodes)} label="nœuds" />
                  <Stat value={String(entry.rooms)} label="salles" />
                  <Stat value={String(entry.files)} label="fichiers" />
                  <Stat value={formatBytes(entry.artifactBytes)} label="artefact" />
                </div>
                <span className="cw-link" aria-hidden="true">
                  Explorer →
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
