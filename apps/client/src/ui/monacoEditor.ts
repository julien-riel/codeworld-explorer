/**
 * Chargement LOCAL de l'éditeur Monaco (PRD §19.1 : « aucun serveur applicatif »,
 * produit STATIQUE / HORS LIGNE). Par défaut, le loader de `@monaco-editor/react`
 * télécharge Monaco depuis le CDN jsdelivr : incompatible avec un client qui ne doit
 * dépendre d'AUCUN hôte externe au runtime. Ce module :
 *
 *   1. pointe le loader vers le paquet `monaco-editor` DÉJÀ présent dans le bundle
 *      (`loader.config({ monaco })`) — plus aucune requête réseau vers un CDN ;
 *   2. sert les web workers Monaco depuis le bundle via la syntaxe `?worker` de Vite.
 *
 * Il est importé UNIQUEMENT en `lazy` (voir `CodePanel`) : Monaco, lourd, n'est demandé
 * qu'à l'ouverture du premier fichier et ne pèse pas sur le démarrage. La configuration
 * ci-dessous s'exécute une seule fois, à l'évaluation de ce module.
 */

import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

// Workers servis depuis le bundle (jamais un hôte externe). Chaque `?worker` devient un
// chunk local que Vite charge à la demande. La coloration (tokenisation Monarch) tourne
// sur le thread principal ; ces workers ne servent qu'aux services de langage optionnels.
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    switch (label) {
      case "json":
        return new jsonWorker();
      case "css":
      case "scss":
      case "less":
        return new cssWorker();
      case "html":
      case "handlebars":
      case "razor":
        return new htmlWorker();
      case "typescript":
      case "javascript":
        return new tsWorker();
      default:
        // Langage sans worker dédié : on retombe sur le worker d'éditeur de base
        // (suffisant pour un affichage en lecture seule), jamais sur le CDN.
        return new editorWorker();
    }
  },
};

// Le loader utilise l'instance locale ; il ne télécharge plus rien depuis jsdelivr.
loader.config({ monaco });

// Réexporte le composant éditeur : ce module est la cible du `lazy` du CodePanel.
export default Editor;
