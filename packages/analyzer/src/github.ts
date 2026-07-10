/**
 * Reconnaissance d'URL GitHub et récupération des métadonnées de dépôt (PRD §21.1).
 *
 * Deux responsabilités distinctes :
 *   1. `parseRepoUrl` — analyse purement lexicale d'une URL / d'un raccourci GitHub
 *      vers `{ owner, repo }`. Aucune I/O ; refuse tout hôte autre que github.com
 *      (au MVP, seul GitHub public est cloné, §21.1) par une `InvalidRepoUrlError`.
 *   2. `fetchRepoMetadata` — interroge l'API REST GitHub pour les seules métadonnées
 *      NON dérivables du commit (licence SPDX, casse canonique du nom, branche par
 *      défaut). C'est l'« entrée injectée 3 » de FR-026 (spec §10.1) : mutable, jamais
 *      recalculée dans les tests de reproductibilité. L'accès réseau passe par un
 *      `GitHubPort` injectable ; en cas d'échec (hors-ligne, 404, quota), la fonction
 *      DÉGRADE proprement — licence `null`, avertissement — sans avorter l'analyse
 *      (FR-024, §17.1 : un artefact conforme est tout de même produit).
 */

import { InvalidRepoUrlError } from "./errors.js";

/** Référence d'un dépôt GitHub, résolue depuis une URL ou un raccourci. */
export interface RepoRef {
  readonly owner: string;
  readonly repo: string;
}

/** Métadonnées de dépôt lues de l'API GitHub (forme réduite au strict nécessaire). */
export interface GitHubRepoData {
  /** `owner/name` avec la casse canonique renvoyée par GitHub. */
  readonly fullName: string;
  /** URL canonique https du dépôt. */
  readonly htmlUrl: string;
  readonly defaultBranch: string;
  /** Identifiant SPDX (ex. `MIT`), ou `null` si non détectée / `NOASSERTION`. */
  readonly licenseSpdxId: string | null;
}

/** Port d'accès à l'API GitHub, injectable pour des tests hors-ligne. */
export interface GitHubPort {
  /** Renvoie les métadonnées de `GET /repos/{owner}/{repo}`. */
  fetchRepo(ref: RepoRef): Promise<GitHubRepoData>;
}

/** Fragment de configuration dérivé des métadonnées GitHub, à fusionner (config.ts). */
export interface RepoMetadata {
  readonly repository: {
    readonly owner: string;
    readonly name: string;
    readonly url: string;
    readonly defaultBranch?: string;
    readonly license: string | null;
  };
  readonly warnings: readonly string[];
}

/** `owner` GitHub : alphanumérique et tirets, ne commence pas par un tiret. */
const OWNER_RE = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
/** `repo` GitHub : alphanumérique, tiret, point, souligné ; ni `.` ni `..` seuls. */
const REPO_RE = /^[A-Za-z0-9._-]+$/;

/**
 * Vrai si l'entrée RESSEMBLE à une URL de dépôt (schéma, `git@`, ou hôte `github.com`).
 * Sert au CLI à choisir entre le flux « URL » et le flux « chemin local » : une entrée
 * qui ressemble à une URL mais échoue à `parseRepoUrl` doit lever, pas retomber en local.
 */
export function looksLikeRepoUrl(input: string): boolean {
  const s = input.trim();
  return (
    /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s) || // schéma://
    s.startsWith("git@") ||
    /^(www\.)?github\.com\//i.test(s) // hôte nu (insensible à la casse, comme parseRepoUrl)
  );
}

/**
 * Analyse une URL / un raccourci GitHub en `{ owner, repo }`. Formes acceptées :
 * `https://github.com/o/r(.git)?(/…)?`, `http://…`, `ssh://git@github.com/o/r.git`,
 * `git@github.com:o/r.git`, `github.com/o/r`. Tout segment au-delà de `owner/repo`
 * (ex. `/tree/main`) est IGNORÉ : la branche/le tag se pinne par `--ref`, jamais par
 * l'URL. Un hôte autre que github.com, ou une forme invalide, lève `InvalidRepoUrlError`.
 */
export function parseRepoUrl(input: string): RepoRef {
  const raw = input.trim();
  if (raw === "") throw new InvalidRepoUrlError("URL de dépôt vide.");

  let host: string;
  let path: string;

  if (raw.startsWith("git@")) {
    // Forme SCP : git@github.com:owner/repo(.git)
    const rest = raw.slice("git@".length);
    const colon = rest.indexOf(":");
    if (colon < 0) throw new InvalidRepoUrlError(`Forme SSH invalide : « ${raw} » (attendu git@github.com:owner/repo).`);
    host = rest.slice(0, colon).toLowerCase();
    path = rest.slice(colon + 1);
  } else {
    // Forme URL : [scheme://][user@]host/owner/repo…
    let s = raw.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "");
    const at = s.indexOf("@");
    const firstSlash = s.indexOf("/");
    if (at >= 0 && (firstSlash < 0 || at < firstSlash)) s = s.slice(at + 1); // retire user@
    const slash = s.indexOf("/");
    if (slash < 0) throw new InvalidRepoUrlError(`URL de dépôt sans chemin : « ${raw} ».`);
    host = s.slice(0, slash).toLowerCase();
    path = s.slice(slash + 1);
  }

  // Un port explicite (« github.com:443 ») ne change pas l'hôte logique.
  const portIdx = host.indexOf(":");
  if (portIdx >= 0) host = host.slice(0, portIdx);
  if (host === "www.github.com") host = "github.com";
  if (host !== "github.com") {
    throw new InvalidRepoUrlError(`Hôte non pris en charge : « ${host} » (seul github.com est cloné au MVP, PRD §21.1).`);
  }

  const segments = path.split("/").filter((seg) => seg.length > 0);
  const owner = segments[0];
  let repo = segments[1];
  if (owner === undefined || repo === undefined) {
    throw new InvalidRepoUrlError(`URL GitHub incomplète : « ${raw} » (attendu github.com/owner/repo).`);
  }
  if (repo.endsWith(".git")) repo = repo.slice(0, -".git".length);

  if (!OWNER_RE.test(owner)) {
    throw new InvalidRepoUrlError(`Nom de propriétaire GitHub invalide : « ${owner} ».`);
  }
  if (!REPO_RE.test(repo) || repo === "." || repo === "..") {
    throw new InvalidRepoUrlError(`Nom de dépôt GitHub invalide : « ${repo} ».`);
  }
  return { owner, repo };
}

/**
 * Port par défaut : `GET https://api.github.com/repos/{owner}/{repo}` via `fetch`
 * global (Node ≥ 18). Honore `GITHUB_TOKEN` pour relever la limite de taux (§21.1).
 * L'en-tête `User-Agent` est requis par l'API GitHub. Ne suit aucune redirection vers
 * un autre hôte (défaut de `fetch`). Aucune écriture, lecture seule (§21.2).
 */
export const nodeGitHubPort: GitHubPort = {
  async fetchRepo(ref) {
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "codeworld-analyzer",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (token !== undefined && token !== "") headers.Authorization = `Bearer ${token}`;

    const url = `https://api.github.com/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`API GitHub : ${String(response.status)} ${response.statusText} sur ${ref.owner}/${ref.repo}.`);
    }
    const body = (await response.json()) as {
      full_name?: unknown;
      html_url?: unknown;
      default_branch?: unknown;
      license?: { spdx_id?: unknown } | null;
    };

    const spdx = body.license?.spdx_id;
    const licenseSpdxId =
      typeof spdx === "string" && spdx !== "" && spdx !== "NOASSERTION" ? spdx : null;

    return {
      fullName: typeof body.full_name === "string" ? body.full_name : `${ref.owner}/${ref.repo}`,
      htmlUrl: typeof body.html_url === "string" ? body.html_url : `https://github.com/${ref.owner}/${ref.repo}`,
      defaultBranch: typeof body.default_branch === "string" ? body.default_branch : "main",
      licenseSpdxId,
    };
  },
};

/**
 * Récupère les métadonnées de dépôt et les projette en fragment de configuration.
 * Toute défaillance réseau/API est NON bloquante (FR-024) : on retombe sur le nom et
 * l'URL dérivés de la référence, licence `null`, avec un avertissement clair. `owner`
 * et `name` gardent la casse canonique de GitHub quand elle est disponible.
 */
export async function fetchRepoMetadata(ref: RepoRef, port: GitHubPort = nodeGitHubPort): Promise<RepoMetadata> {
  try {
    const data = await port.fetchRepo(ref);
    const [owner, name] = splitFullName(data.fullName, ref);
    return {
      repository: {
        owner,
        name,
        url: data.htmlUrl,
        defaultBranch: data.defaultBranch,
        license: data.licenseSpdxId,
      },
      warnings:
        data.licenseSpdxId === null
          ? [`Licence non détectée pour ${owner}/${name} (license = null dans l'artefact).`]
          : [],
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      repository: {
        owner: ref.owner,
        name: ref.repo,
        url: `https://github.com/${ref.owner}/${ref.repo}`,
        license: null,
      },
      warnings: [
        `Métadonnées GitHub indisponibles pour ${ref.owner}/${ref.repo} (${detail}) : licence null, branche par défaut déduite du clone.`,
      ],
    };
  }
}

/** Découpe `owner/name` en gardant la casse canonique ; retombe sur `ref` si malformé. */
function splitFullName(fullName: string, ref: RepoRef): [string, string] {
  const slash = fullName.indexOf("/");
  if (slash <= 0 || slash === fullName.length - 1) return [ref.owner, ref.repo];
  return [fullName.slice(0, slash), fullName.slice(slash + 1)];
}
