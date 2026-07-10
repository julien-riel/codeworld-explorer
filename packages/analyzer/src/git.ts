/**
 * Clone superficiel d'un dépôt et lecture des métadonnées de commit (PRD §19.3.2, §21.1).
 *
 * On CLONE, on n'EXÉCUTE jamais le code du dépôt (§22.2) : `git clone` copie l'arbre
 * mais ne lance ni `npm install` ni script. Le port `GitPort` isole l'appel à `git`
 * (injectable pour les tests) et durcit l'environnement : aucune invite d'identifiants,
 * aucun hook, aucune configuration système NI globale héritée (sans quoi un
 * `url.<x>.insteadOf` de `~/.gitconfig` pourrait réécrire silencieusement l'URL github.com
 * validée vers un autre hôte, contournant l'allowlist §21.1), aucun sous-module suivi.
 *
 * Le commit fournit les entrées DÉTERMINISTES de FR-026 : `commitSha` (HEAD après
 * clone), la committer date brute (`%cI`, normalisée plus loin par le pipeline, spec
 * §3.4.1) et l'arbre source lui-même. La licence et la branche par défaut, elles,
 * viennent de l'API GitHub (github.ts) : ce sont les métadonnées mutables injectées.
 */

import { execFile } from "node:child_process";
import { GitCloneError } from "./errors.js";

/** Résultat d'un clone : répertoire de travail et métadonnées de commit brutes. */
export interface CloneResult {
  /** Répertoire de la copie de travail (l'appelant le supprime après analyse). */
  readonly dir: string;
  /** SHA du commit analysé (40 hexadécimaux minuscules). */
  readonly commitSha: string;
  /** Nom de la branche extraite (branche par défaut si `--ref` est absent). */
  readonly branch: string;
  /** Committer date BRUTE (`git show -s --format=%cI`, offset local), à normaliser. */
  readonly committedAtRaw: string;
}

/** Port d'exécution de `git`, injectable pour les tests (aucun `git` réel requis). */
export interface GitPort {
  /**
   * Exécute `git` avec `args` (déjà découpés, jamais interprétés par un shell) dans
   * `cwd`. Renvoie la sortie standard découpée ; rejette avec la cause en cas d'échec.
   */
  run(args: readonly string[], cwd?: string): Promise<string>;
}

/**
 * Options durcissant tout appel `git` (§22.2). Passées en `-c …` sur la ligne de
 * commande pour n'affecter QUE ce processus : jamais d'écriture dans la config de
 * l'opérateur. `core.hooksPath` vidé neutralise tout hook ; `credential.helper` vidé
 * et `GIT_TERMINAL_PROMPT=0` empêchent toute invite bloquante ou fuite d'identifiants.
 */
const GIT_HARDENING = [
  "-c", "core.hooksPath=/dev/null",
  "-c", "credential.helper=",
  "-c", "protocol.version=2",
];

/** Port par défaut : `git` du système via `execFile` (aucun shell, argv littéral). */
export const nodeGitPort: GitPort = {
  run(args, cwd) {
    return new Promise<string>((resolvePromise, reject) => {
      execFile(
        "git",
        args,
        {
          cwd,
          env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: "0",
            // Isolation COMPLÈTE de la config git de l'opérateur : NOSYSTEM écarte
            // /etc/gitconfig, GIT_CONFIG_GLOBAL=/dev/null écarte ~/.gitconfig et la config
            // XDG. Sans ce dernier, un `url.<x>.insteadOf` global réécrirait l'URL github.com
            // validée vers un autre hôte (contournement d'allowlist, §22.2) et casserait la
            // reproductibilité (le clone dépendrait de l'environnement de la machine).
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_CONFIG_GLOBAL: "/dev/null",
            GIT_ADVICE: "0",
          },
          maxBuffer: 16 * 1024 * 1024,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          if (error) {
            const detail = redactCredentials((stderr || error.message).trim());
            const shown = redactCredentials(args.filter((a) => a !== "-c").join(" "));
            reject(new GitCloneError(`Échec « git ${shown} » : ${detail}`));
            return;
          }
          resolvePromise(stdout.trim());
        },
      );
    });
  },
};

/** Masque les identifiants d'une éventuelle URL `scheme://user:pass@host` dans un texte. */
function redactCredentials(text: string): string {
  return text.replace(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^/@\s]*@/g, "$1***@");
}

/**
 * Clone `url` (superficiel, profondeur 1, branche unique) dans `destDir` et renvoie
 * les métadonnées de commit. `ref` (optionnel) sélectionne une branche ou un tag ;
 * en son absence, la branche par défaut du dépôt distant est extraite. `destDir` doit
 * être vide/inexistant. Lève `GitCloneError` sur tout échec (dépôt inexistant, réseau,
 * `git` absent) avec un message clair, jamais une trace brute.
 */
export async function shallowClone(
  url: string,
  destDir: string,
  options: { readonly ref?: string | undefined; readonly port?: GitPort | undefined } = {},
): Promise<CloneResult> {
  const port = options.port ?? nodeGitPort;

  const cloneArgs = [
    ...GIT_HARDENING,
    "clone",
    "--depth", "1",
    "--no-tags",
    "--single-branch",
    "--no-recurse-submodules",
  ];
  if (options.ref !== undefined && options.ref !== "") {
    cloneArgs.push("--branch", options.ref);
  }
  // `--` sépare les options des arguments : une URL commençant par « - » ne peut pas
  // être interprétée comme une option (injection d'options, §22.2).
  cloneArgs.push("--", url, destDir);
  await port.run(cloneArgs);

  const commitSha = await port.run([...GIT_HARDENING, "rev-parse", "HEAD"], destDir);
  if (!/^[0-9a-f]{40}$/.test(commitSha)) {
    throw new GitCloneError(`SHA de commit inattendu après clone : « ${commitSha} ».`);
  }

  let branch = await port.run([...GIT_HARDENING, "rev-parse", "--abbrev-ref", "HEAD"], destDir);
  // Tête détachée (`--branch <tag>`) : `HEAD` n'est pas un nom de branche exploitable.
  if (branch === "HEAD") branch = options.ref ?? "HEAD";

  const committedAtRaw = await port.run([...GIT_HARDENING, "show", "-s", "--format=%cI", "HEAD"], destDir);

  return { dir: destDir, commitSha, branch, committedAtRaw };
}
