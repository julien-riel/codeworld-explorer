/**
 * Panneau de code 2D (PRD §11.2, §11.3, FR-007).
 *
 * À l'ouverture d'un fichier, on charge son contenu À LA DEMANDE (`fileContentUrl`,
 * jamais embarqué dans l'artefact) et on l'affiche dans Monaco en LECTURE SEULE. Monaco
 * est CHARGÉ DIFFÉRÉ (`lazy` + `Suspense`) : l'éditeur, lourd, ne pèse pas sur le
 * démarrage tant qu'aucun fichier n'est ouvert. Ce panneau est du DOM pur (arbre 2D
 * séparé de la scène, PRD §11.3) : il ne rend aucun objet three.
 */

import { lazy, Suspense, useEffect, useState, type ReactElement } from "react";
import type { SourceNode, World } from "@codeworld/world-schema";
import { fileContentUrl } from "../data/loader";
import { useWorldStore } from "../state/store";
import { useSelectedFile } from "./hooks";
import { useWorld, useWorldPath } from "./hooks";
import { formatBytes, githubBlobUrl, preferredRef, worldBaseDir } from "./format";

// Import DIFFÉRÉ de l'éditeur : son bundle n'est demandé qu'au premier fichier ouvert.
// La cible (`./monacoEditor`) sert Monaco et ses workers DEPUIS LE BUNDLE (jamais un CDN,
// PRD §19.1) ; sa configuration ne s'exécute donc qu'ici, à la demande.
const MonacoEditor = lazy(() => import("./monacoEditor"));

/** `SourceNode.language` (nom analyzer) → identifiant de langage Monaco. */
function monacoLanguage(language: string | undefined): string {
  if (language === undefined) return "plaintext";
  const map: Record<string, string> = {
    TypeScript: "typescript",
    JavaScript: "javascript",
    TSX: "typescript",
    JSX: "javascript",
    JSON: "json",
    Markdown: "markdown",
    HTML: "html",
    CSS: "css",
    YAML: "yaml",
    Python: "python",
    Rust: "rust",
    Go: "go",
    Shell: "shell",
  };
  return map[language] ?? "plaintext";
}

/** État du chargement du contenu d'un fichier. */
type ContentState =
  | { status: "loading" }
  | { status: "ready"; text: string }
  | { status: "empty" }
  | { status: "error"; message: string };

/** Corps du panneau, monté par fichier (`key`) : isole l'effet de chargement. */
function CodePanelBody({
  file,
  world,
  worldPath,
  onClose,
}: {
  file: SourceNode;
  world: World;
  worldPath: string;
  onClose: () => void;
}): ReactElement {
  const [content, setContent] = useState<ContentState>({ status: "loading" });
  const hash = file.contentHash;

  useEffect(() => {
    // Pas de contenu à charger : dossier, fichier exclu ou binaire.
    if (hash === undefined) {
      setContent({ status: "empty" });
      return;
    }
    const controller = new AbortController();
    const url = fileContentUrl(worldBaseDir(worldPath), hash);
    setContent({ status: "loading" });
    fetch(url, { signal: controller.signal })
      .then((response) =>
        response.ok
          ? response.text()
          : Promise.reject(new Error(`HTTP ${String(response.status)}`)),
      )
      .then((text) => {
        setContent({ status: "ready", text });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setContent({ status: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      controller.abort();
    };
  }, [hash, worldPath]);

  const ref = preferredRef(world.snapshot.commitSha, world.repository.defaultBranch);
  const githubHref = githubBlobUrl({ repoUrl: world.repository.url, ref, path: file.path });
  const size = formatBytes(file.sizeBytes);

  return (
    <section className="cw-panel cw-code" aria-label={`Fichier ${file.name}`}>
      <div className="cw-code-head">
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <h2 title={file.path}>{file.path === "" ? file.name : file.path}</h2>
          <div className="cw-code-meta">
            <span>{file.language ?? "texte"}</span>
            {size !== "" && <span>{size}</span>}
            <a className="cw-link" href={githubHref} target="_blank" rel="noreferrer noopener">
              Ouvrir sur GitHub ↗
            </a>
            <button
              type="button"
              className="cw-link"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
              onClick={() => {
                void navigator.clipboard?.writeText(file.path);
              }}
            >
              Copier le chemin
            </button>
          </div>
        </div>
        <button type="button" className="cw-btn" onClick={onClose} aria-label="Fermer le panneau de code">
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <div className="cw-code-body">
        {content.status === "loading" && <p className="cw-code-status">Chargement du contenu…</p>}
        {content.status === "empty" && (
          <p className="cw-code-status">Ce fichier n'a pas de contenu consultable.</p>
        )}
        {content.status === "error" && (
          <p className="cw-code-status" role="alert" style={{ color: "var(--cw-danger)" }}>
            <span aria-hidden="true">⚠ </span>
            Contenu indisponible : {content.message}
          </p>
        )}
        {content.status === "ready" && (
          <Suspense fallback={<p className="cw-code-status">Chargement de l'éditeur…</p>}>
            <MonacoEditor
              value={content.text}
              language={monacoLanguage(file.language)}
              theme="vs-dark"
              height="100%"
              options={{
                readOnly: true,
                domReadOnly: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: "on",
                fontSize: 13,
              }}
            />
          </Suspense>
        )}
      </div>
    </section>
  );
}

/** Panneau de code : rendu uniquement quand un fichier est ouvert (`codePanelOpen`). */
export function CodePanel(): ReactElement | null {
  const open = useWorldStore((s) => s.codePanelOpen);
  const file = useSelectedFile();
  const world = useWorld();
  const worldPath = useWorldPath();
  const setCodePanelOpen = useWorldStore((s) => s.setCodePanelOpen);

  if (!open || file === null || file.nodeType !== "file" || world === null || worldPath === null) {
    return null;
  }

  return (
    <CodePanelBody
      key={file.id}
      file={file}
      world={world}
      worldPath={worldPath}
      onClose={() => {
        setCodePanelOpen(false);
      }}
    />
  );
}
