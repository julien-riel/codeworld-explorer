/**
 * Fil d'Ariane cliquable (PRD §9.3, FR-009) + retour au hall (FR-010).
 *
 * Chaque segment est le chemin GitHub d'un dossier ancêtre de la salle courante ;
 * un clic téléporte vers la salle de ce dossier (`requestTeleport`). Le dernier
 * segment (position courante) n'est pas cliquable et porte `aria-current`.
 */

import type { ReactElement } from "react";
import { useWorldStore } from "../state/store";
import { useBreadcrumb } from "./hooks";
import { segmentLabel } from "./format";

export function Breadcrumb(): ReactElement | null {
  const chain = useBreadcrumb();
  const requestTeleport = useWorldStore((s) => s.requestTeleport);
  const returnToHall = useWorldStore((s) => s.returnToHall);

  if (chain.length === 0) return null;

  const lastIndex = chain.length - 1;

  return (
    <nav className="cw-breadcrumb" aria-label="Fil d'Ariane">
      <button type="button" className="cw-btn" onClick={returnToHall} title="Retour au hall principal">
        <span aria-hidden="true">⌂</span> Hall principal
      </button>
      <ol
        style={{ display: "contents", listStyle: "none", margin: 0, padding: 0 }}
      >
        {chain.map((node, i) => {
          const isCurrent = i === lastIndex;
          const label = segmentLabel(node.name, node.path);
          return (
            <li key={node.id} style={{ display: "contents" }}>
              {i > 0 && (
                <span className="cw-crumb-sep" aria-hidden="true">
                  ›
                </span>
              )}
              <button
                type="button"
                className="cw-crumb"
                aria-current={isCurrent ? "location" : undefined}
                disabled={isCurrent}
                onClick={() => {
                  requestTeleport({ kind: "node", sourceNodeId: node.id });
                }}
              >
                {label}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
