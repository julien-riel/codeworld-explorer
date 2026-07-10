/**
 * Overlay de debug des budgets de rendu (PRD §9.5, §16.1). Arbre 2D CLASSIQUE, HORS
 * `<Canvas>` : il n'affiche que du DOM et lit la scène uniquement par le conteneur
 * transitoire de perf et par le store (contrainte des deux arbres, PRD §11.3, §19.4).
 *
 * Activation par une TOUCHE dédiée (`F3`). Les compteurs EN DIRECT (FPS, draw calls,
 * triangles) sont écrits par une boucle rAF qui poke le DOM par refs — jamais un
 * `setState` 60 fois/s. Les compteurs STATIQUES de la zone (InstancedMesh, instances)
 * et la comparaison aux budgets viennent du store et ne changent qu'au changement de
 * salle. La racine laisse passer les clics (`pointer-events: none`).
 */

import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { PALETTE } from "../palette";
import { useCurrentSpatialNodeId, useWorldStore } from "../state/store";
import { DEFAULT_BUDGETS } from "./budgets";
import { getPerfSample } from "./monitor";
import { zoneRenderStats } from "./staticCounts";

/** Touche d'activation de l'overlay de debug. */
export const PERF_OVERLAY_KEY = "F3";

/** Ligne label/valeur ; `live` marque une valeur poussée par la boucle rAF. */
function Row({
  label,
  value,
  valueRef,
  over,
}: {
  label: string;
  value?: string;
  valueRef?: React.Ref<HTMLSpanElement>;
  over?: boolean;
}): ReactElement {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1.5rem" }}>
      <span style={{ color: PALETTE.textMuted }}>{label}</span>
      <span
        ref={valueRef}
        style={{ color: over === true ? PALETTE.danger : PALETTE.textPrimary, fontVariantNumeric: "tabular-nums" }}
      >
        {over === true ? "⚠ " : ""}
        {value ?? "—"}
      </span>
    </div>
  );
}

/** Overlay chiffré des budgets de rendu, activable par `F3`. */
export function PerfOverlay(): ReactElement | null {
  const [visible, setVisible] = useState(false);
  const index = useWorldStore((s) => s.worldIndex);
  const currentId = useCurrentSpatialNodeId();

  // Compteurs STATIQUES de la zone active : recalculés seulement au changement de salle.
  const zone = useMemo(
    () => (index !== null && currentId !== null ? zoneRenderStats(index, currentId) : null),
    [index, currentId],
  );

  const fpsRef = useRef<HTMLSpanElement>(null);
  const drawRef = useRef<HTMLSpanElement>(null);
  const triRef = useRef<HTMLSpanElement>(null);
  const geoRef = useRef<HTMLSpanElement>(null);

  // Bascule par touche dédiée (empêche l'action navigateur par défaut de `F3`).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === PERF_OVERLAY_KEY) {
        e.preventDefault();
        setVisible((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Boucle rAF : pousse les compteurs EN DIRECT dans le DOM par refs (aucun re-render).
  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    const tick = (): void => {
      const s = getPerfSample();
      if (fpsRef.current !== null) fpsRef.current.textContent = s.fps.toFixed(0);
      if (drawRef.current !== null) drawRef.current.textContent = String(s.drawCalls);
      if (triRef.current !== null) triRef.current.textContent = s.triangles.toLocaleString("fr-FR");
      if (geoRef.current !== null) geoRef.current.textContent = `${String(s.geometries)} geo / ${String(s.textures)} tex`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-label="Budgets de rendu"
      style={{
        position: "fixed",
        top: "0.75rem",
        right: "0.75rem",
        minWidth: "15rem",
        padding: "0.6rem 0.75rem",
        borderRadius: "0.5rem",
        border: `1px solid ${PALETTE.border}`,
        background: `${PALETTE.surface}ee`,
        color: PALETTE.textPrimary,
        font: "12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace",
        pointerEvents: "none",
        zIndex: 50,
      }}
    >
      <div style={{ color: PALETTE.textFaint, marginBottom: "0.35rem" }}>RENDER · zone active (F3)</div>
      <Row label="FPS" valueRef={fpsRef} />
      <Row label="draw calls" valueRef={drawRef} />
      <Row label="triangles" valueRef={triRef} />
      <Row label="géométries" valueRef={geoRef} />
      <div style={{ height: 1, background: PALETTE.border, margin: "0.4rem 0" }} />
      {zone === null ? (
        <Row label="statique" value="aucun monde" />
      ) : (
        <>
          <Row label="salles montées" value={String(zone.roomCount)} />
          <Row
            label="InstancedMesh"
            value={`${String(zone.instancedMeshCount)} / ${String(DEFAULT_BUDGETS.maxInstancedMeshes)}`}
            over={zone.instancedMeshCount > DEFAULT_BUDGETS.maxInstancedMeshes}
          />
          <Row
            label="instances"
            value={`${String(zone.instanceCount)} / ${String(DEFAULT_BUDGETS.maxInstances)}`}
            over={zone.instanceCount > DEFAULT_BUDGETS.maxInstances}
          />
          <Row
            label="draw (statique)"
            value={`${String(zone.drawCallCount)} / ${String(DEFAULT_BUDGETS.maxDrawCalls)}`}
            over={zone.drawCallCount > DEFAULT_BUDGETS.maxDrawCalls}
          />
          <Row
            label="triangles (statique)"
            value={`${zone.triangleCount.toLocaleString("fr-FR")} / ${DEFAULT_BUDGETS.maxTriangles.toLocaleString("fr-FR")}`}
            over={zone.triangleCount > DEFAULT_BUDGETS.maxTriangles}
          />
        </>
      )}
    </div>
  );
}
