/**
 * Écran de refus PROPRE d'un artefact (FR-027, PRD §16.2).
 *
 * Le cas central est la version de schéma inconnue : au lieu d'un écran blanc ou
 * d'une exception, on affiche un message explicite (version trouvée / versions
 * supportées) et une sortie (retour galerie). Les autres défaillances typées
 * (JSON illisible, schéma invalide, réseau) sont couvertes par le même écran.
 */

import type { ReactElement } from "react";
import type { WorldError } from "../data/loader";

/** Titre + explication d'un `WorldError` (discriminé par `kind`). */
function describe(error: WorldError): { title: string; detail: ReactElement } {
  switch (error.kind) {
    case "unsupported-schema-version":
      return {
        title: "Version de schéma non supportée",
        detail: (
          <>
            <p>
              Cet artefact déclare la version de schéma <code>{String(error.found)}</code>, que ce
              client ne sait pas lire.
            </p>
            <p>
              Versions supportées :{" "}
              <code>{error.supported.length === 0 ? "aucune" : error.supported.join(", ")}</code>.
              Régénérez le monde avec un pipeline compatible, ou mettez à jour l'explorateur.
            </p>
          </>
        ),
      };
    case "malformed-json":
      return {
        title: "Artefact illisible",
        detail: <p>Le fichier <code>world.json</code> n'est pas un JSON valide : {error.message}</p>,
      };
    case "invalid-schema":
      return {
        title: "Artefact non conforme",
        detail: (
          <p>
            Le fichier respecte la version attendue mais viole le schéma
            {error.issues.length > 0 ? ` (${String(error.issues.length)} problème(s) détecté(s))` : ""}.
          </p>
        ),
      };
    case "network":
      return {
        title: "Chargement impossible",
        detail: (
          <p>
            Le monde n'a pas pu être récupéré
            {error.status !== null ? ` (HTTP ${String(error.status)})` : ""} : {error.message}
          </p>
        ),
      };
    default: {
      // Exhaustivité : tout nouveau `kind` provoquera une erreur de compilation ici.
      const _exhaustive: never = error;
      return { title: "Erreur inconnue", detail: <p>{String(_exhaustive)}</p> };
    }
  }
}

/** Écran plein d'erreur ; `onDismiss` ramène à la galerie. */
export function VersionError({
  error,
  onDismiss,
}: {
  error: WorldError;
  onDismiss: () => void;
}): ReactElement {
  const { title, detail } = describe(error);
  return (
    <div className="cw-screen" role="alertdialog" aria-labelledby="cw-err-title" aria-modal="false">
      <div className="cw-screen-card">
        <h1 id="cw-err-title">
          {/* L'icône double la couleur (règle : jamais d'info par la seule couleur). */}
          <span className="cw-badge-danger" aria-hidden="true">
            ⚠
          </span>
          {title}
        </h1>
        {detail}
        <div style={{ marginTop: 20 }}>
          <button type="button" className="cw-btn cw-btn-primary" onClick={onDismiss}>
            Retour à la galerie
          </button>
        </div>
      </div>
    </div>
  );
}
