# Spécification normative — Contrat `world.json` v0

**Statut :** normatif (implémentable sans clarification supplémentaire)
**Cible :** `packages/world-schema` (types TypeScript, validation Zod, sérialisation canonique, moteur de layout)
**Portée :** phase 0, sprints 1 à 3. Les entités des sprints 5 à 7 (symboles, relations, résumés, visites) sont **nommées et réservées**, mais **absentes** de l'artefact v0.
**Référence PRD :** v3.0, sections 9, 10, 11, 12, 14, 15, 16, 18, 19, 27.3, 30, 33.
**Langue :** identifiants, noms de fichiers et API en anglais ; prose, invariants et justifications en français.

Les mots **DOIT**, **NE DOIT PAS**, **DEVRAIT**, **PEUT** ont leur sens habituel de spécification (RFC 2119, en français).

---

## 0. Résumé des décisions structurantes

Cette spécification arbitre trois conceptions concurrentes. Les choix retenus, une fois pour toutes :

1. **Géométrie entière uniquement.** Aucune valeur flottante n'atteint l'artefact. Longueurs en **millimètres** (`mm`), rotations en **quarts de tour** (`0|1|2|3`), confiances en **pour-mille** (`0..1000`). Un entier se sérialise sans ambiguïté ; « identique octet pour octet » devient trivialement vérifiable.
2. **Layout sur treillis entier, sans trigonométrie.** Le placement des salles est un pavage récursif de plots carrés sur une grille ; les objets sont posés sur une grille intérieure. **Aucun `Math.sin`/`Math.cos`** : la norme ECMA-262 n'impose pas la précision des fonctions transcendantes, donc leur résultat n'est pas identique bit à bit entre Node et le navigateur. Un layout radial (polaire) violerait FR-026 dès qu'il tourne dans deux moteurs différents.
3. **Identifiants dérivés du chemin, système de référence unique.** `id = "n_" + idHash(normalizePath(path))`, formule unique tranchée en §4.2. Pas de second système d'index entier dans l'artefact v0 (voir §4.4).
4. **Graine de layout dépendante de la seule configuration, jamais du commit** (voir §5.3 et ADR-0003).
5. **Aucun horodatage d'exécution dans l'artefact.** Seul `snapshot.committedAt` (date du committer, propriété reproductible du commit) subsiste ; le temps réel d'exécution vit dans un sidecar hors FR-026 (voir ADR-0002).
6. **Index de recherche : documents canoniques que nous contrôlons, reconstruits en mémoire par le client.** On n'embarque jamais le dump sérialisé de MiniSearch (voir §3.8 et ADR-0001).
7. **Contenus de fichiers hors artefact**, adressés par `contentHash` dans `files/<contentHash>` (voir §11).
8. **PRNG : mulberry32**, 32 bits, pur, semé explicitement par un mot dérivé du hachage du chemin (voir §5).

---

## 1. Vue d'ensemble et frontières

### 1.1 Fichiers produits

```
world.json               Artefact principal. Métadonnées + arborescence +
                         classifications + layout + index de recherche.
                         SEUL fichier couvert par FR-026 (octet pour octet).
files/<contentHash>      Octets bruts des fichiers analysés, dé-dupliqués par
                         hash, servis statiquement, chargés à la demande.
                         HORS FR-026 (copies déterministes des octets source).
world.build.json         Sidecar de provenance d'exécution (heure réelle, hôte,
                         durées, hash de l'artefact). HORS FR-026. Voir §10.4.
```

### 1.2 Ce que le client lit

Le client ne lit jamais autre chose que `world.json` et, à la demande, les blobs `files/<contentHash>`. Il ne lit `world.build.json` pour aucune décision reproductible.

### 1.3 Frontière de reproductibilité (FR-026)

FR-026 porte **exclusivement sur les octets NON compressés de `world.json`**. Sont hors périmètre : `world.build.json`, les blobs `files/<hash>`, et toute compression de transport (gzip/brotli, dont le déterminisme n'est pas garanti). La règle de test exacte est en §10.

---

## 2. Conventions transverses

### 2.1 Unités et systèmes de coordonnées

- **Longueur :** entier de millimètres (`mm`), `1000 mm = 1 m`.
- **Rotation :** entier `Orientation ∈ {0, 1, 2, 3}` = quarts de tour horaires autour de l'axe `y`. `0` = orientation de référence (face au `-z`, dit « nord »).
- **Confiance :** entier `0..1000` (pour-mille). `750` signifie confiance 0,75.
- **Espace monde :** repère main droite, `y` vertical (vers le haut), plan de sol `XZ`. Les murs sont nommés par leur normale sortante : `north = -z`, `south = +z`, `east = +x`, `west = -x`.
- **Position de salle :** centre au sol de la salle, en coordonnées **monde**.
- **Position d'objet fichier :** en coordonnées **locales** au centre-sol de sa salle. Déplacer une salle ne change donc jamais les coordonnées de ses objets (stabilité d'ancrage).

### 2.2 Aucun flottant

Toute grandeur numérique de l'artefact **DOIT** être un entier sûr (`Number.isSafeInteger`). La validation Zod impose `.int()` partout ; la sérialisation canonique lève si un non-entier fuit (§6). Il n'existe donc pas de politique d'arrondi de flottants à documenter : il n'y a pas de flottant.

### 2.3 Présence et absence des champs

- Les collections de premier niveau de `World` qui existent en v0 (`nodes`, `classifications`, `search.documents`) sont **toujours présentes**, vides (`[]`) si vides, jamais omises.
- Les entités **réservées** des sprints 5 à 7 (`symbols`, `relations`, `summaries`, `tour`) sont **optionnelles** et **absentes** en v0 (jamais émises, pas même à `[]`). Voir §3.9.
- Un champ optionnel d'objet est **omis** (clé absente) selon une condition **unique et énumérée** ; il n'est **jamais** émis à `null` pour signifier « absent » (`null` a un sens propre uniquement là où le type le déclare explicitement, p. ex. `parentId`).
- Tous les objets sont validés en mode `.strict()` (clé inconnue rejetée).

### 2.4 Ordre canonique des tableaux

La sérialisation ne réordonne jamais un tableau (§6). C'est le **producteur** qui trie chaque tableau-ensemble par une clé définie ici. Clés de tri (toutes en ordre de code-unit UTF-16, sauf mention contraire) :

| Tableau | Clé de tri |
|---|---|
| `World.nodes` | `path` (la racine, `path === ""`, est donc première) |
| `World.classifications` | `sourceNodeId` |
| `World.search.documents` | `ref` |
| `WorldLayout.spatialNodes` | `id` |
| `SpatialNode.portals` | `(wallRank, offset)` avec `wallRank : north=0, east=1, south=2, west=3` |
| `SpatialNode.objects` | `sourceNodeId` |
| `Classification.evidence` | `(kind, detail)` |

---

## 3. Entités

Les extraits TypeScript ci-dessous sont **normatifs** pour les noms, types et cardinalités. `z.*` renvoie aux contraintes Zod correspondantes.

### 3.0 Constantes exportées

```ts
export const SCHEMA_VERSION = 0;                          // version que ce build PRODUIT
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [0]; // versions que ce build LIT
export const LAYOUT_VERSION = 0;                          // version de l'algorithme de layout
```

### 3.1 Objet racine `World`

```ts
interface World {
  manifest: Manifest;
  repository: Repository;
  snapshot: Snapshot;
  nodes: SourceNode[];              // requis, trié par path ; inclut la racine
  classifications: Classification[];// requis, trié par sourceNodeId ; dossiers uniquement
  layout: WorldLayout;              // requis
  search: SearchIndex;              // requis
  // ── Réservé sprints 5–7, ABSENT en v0 (voir §3.9) ──
  symbols?: Symbol[];
  relations?: Relation[];
  summaries?: SemanticSummary[];
  tour?: GuidedTour;
}
```

### 3.2 `Manifest`

```ts
interface Manifest {
  schemaVersion: number;    // === SCHEMA_VERSION ; Zod : z.literal(0)
  analyzerVersion: string;  // semver de packages/analyzer ; entre dans l'identité FR-026
  layoutVersion: number;    // === LAYOUT_VERSION
  configurationHash: string;// sha256 hex de la configuration effective (§5.4)
}
```

**Invariant (tension 1) :** le `generatedAt` de PRD §18.2 est **retiré**. Aucun horodatage d'exécution n'apparaît dans le `Manifest`. Voir ADR-0002.

Le champ `schemaVersion` est un **point d'ancrage éternel** : son nom et son emplacement (`manifest.schemaVersion`) NE DOIVENT JAMAIS changer entre versions majeures, car le contrôle de version (FR-027, §9) le lit **avant** toute validation Zod.

### 3.3 `Repository`

```ts
interface Repository {
  provider: "github";
  owner: string;
  name: string;
  url: string;              // URL canonique du dépôt (https)
  defaultBranch: string;
  license: string | null;   // identifiant SPDX, ou null si inconnue
}
```

### 3.4 `Snapshot`

```ts
interface Snapshot {
  commitSha: string;        // 40 hex ; Zod : /^[0-9a-f]{40}$/
  branch: string;
  committedAt: string;      // committer date NORMALISÉE en UTC seconde, suffixe 'Z' (§3.4.1)
}
```

**Invariant (tension 1) :** `analyzedAt` de PRD §18.2 est **remplacé** par `committedAt`, propriété déterministe du commit (elle est hachée dans le SHA). Zod : `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/`. Voir ADR-0002.

#### 3.4.1 Normalisation de `committedAt` (déterministe)

La source est la committer date du commit, obtenue par `git show -s --format=%cI <sha>`. Cette source émet l'instant **avec l'offset local du committer** (`2026-07-09T14:32:07+02:00`, jamais `Z`). Émettre cette valeur brute échouerait la validation Zod ci-dessus pour tout commit non-UTC. Le producteur **DOIT** donc normaliser avant écriture, par la fonction pure suivante (aucune dépendance à l'horloge ou au fuseau de la machine d'analyse) :

1. Parser la valeur `%cI` en un instant absolu (partie date-heure locale **et** offset `±HH:MM` ou `Z`).
2. **Convertir en UTC** : soustraire l'offset (`instantUTC = instantLocal − offset`). Le résultat est l'instant absolu exprimé au méridien de Greenwich.
3. **Tronquer aux secondes entières** : `%cI` n'émet pas de fraction de seconde ; aucune n'est donc conservée. Si une source future en portait, elle est **supprimée** (troncature vers zéro, jamais d'arrondi).
4. **Formater** en `YYYY-MM-DDTHH:MM:SSZ` : quatre chiffres d'année (les commits Git antérieurs à l'an 1000 ou postérieurs à 9999 sont **hors périmètre** et rejetés par une erreur typée `NonNormalizableDateError`), deux chiffres zéro-remplis pour chaque autre champ, séparateur `T`, suffixe littéral `Z`.

L'exemple `2026-07-09T14:32:07+02:00` produit exactement `2026-07-09T12:32:07Z`. Le test de reproductibilité (§10.3, point 4) compare `snapshot.committedAt` à la **valeur normalisée** de `git show -s --format=%cI`, jamais à la sortie brute de Git.

### 3.5 `SourceNode`

```ts
type NodeType = "directory" | "file";

interface SourceNode {
  id: string;               // "n_" + idHash(normalizePath(path)) (§4.2)
  parentId: string | null;  // null pour la racine uniquement
  path: string;             // POSIX, NFC, relatif racine, sans "./" ni "/" final ; racine = ""
  name: string;             // dernier segment ; racine = repository.name (affichage seul)
  nodeType: NodeType;
  depth: number;            // profondeur SOURCE réelle (racine = 0), JAMAIS plafonnée
  childCount?: number;      // dossiers NON exclus : nombre d'enfants directs (inclus + exclus) ; omis sur dossier exclu (§3.5.1)
  language?: string;        // fichiers non exclus uniquement, si détecté
  sizeBytes?: number;       // fichiers uniquement ; entier ≥ 0
  contentHash?: string;     // fichiers non exclus uniquement : sha256 hex → files/<contentHash>
  excludedReason?: string;  // présent SSI exclu (§3.5.1)
}
```

#### 3.5.1 Conditions d'omission (énumérées, donc canoniques)

- `childCount` présent **SSI** `nodeType === "directory"` **et** le dossier n'est pas exclu. Un **dossier exclu n'est pas inventorié** (on n'énumère jamais l'intérieur d'un `node_modules` ou d'un dossier `vendored`), donc son nombre d'enfants directs est inconnu et `childCount` est **omis**. Comportement du client : sur un dossier sans `childCount` (c'est-à-dire exclu), le client n'affiche aucun compteur d'enfants et ne prétend jamais « 0 enfant » ; il s'appuie sur `excludedReason` pour marquer « non analysé » (§3.5.2). Le dossier exclu apparaît donc comme une feuille non explorable de l'arbre.
- `language`, `sizeBytes`, `contentHash` présents **SSI** `nodeType === "file"` **et** le fichier n'est pas exclu. (`sizeBytes` PEUT en outre être présent sur un fichier exclu ; en v0, il est omis sur les fichiers exclus pour rester simple.)
- `excludedReason` présent **SSI** le nœud n'est pas analysé (exclusion volontaire **ou** échec). Vocabulaire fermé v0, réparti en deux familles disjointes :
  - **Exclusions volontaires** (le nœud a été écarté par décision de configuration ou de politique, sans qu'aucune erreur ne survienne) : `"vendored" | "binary" | "too-large" | "generated" | "config-exclude"`.
  - **Échecs d'analyse** (le nœud aurait dû être analysé mais ne l'a pas pu) : `"read-error"` (fichier ou dossier illisible : permissions, I/O, lien cassé) et `"parse-error"` (contenu lu mais dont l'analyse a échoué : encodage invalide, syntaxe irrécupérable).
- `parentId === null` **SSI** le nœud est la racine.

#### 3.5.2 Exclusions (FR-003, FR-025)

Un fichier ou dossier non analysé apparaît dans `nodes` avec `excludedReason` renseigné, **sans** `contentHash`. Les éléments non analysés sont ainsi visibles dans le fil d'Ariane et la recherche, marqués « non analysé » (FR-025), mais :
- un **dossier non analysé** ne reçoit **aucun** `SpatialNode` (son sous-arbre n'est pas spatialisé) ;
- un **fichier non analysé** ne reçoit **aucun** `FileObject` (voir §3.7.4).

**Distinction exclusion volontaire / échec (FR-024, FR-025).** Un échec d'analyse **partiel** (fichier illisible, erreur de parsing) **NE DOIT PAS** faire échouer le build : il produit un artefact **ouvrable** où l'élément fautif porte un `excludedReason` de la famille **échec** (`"read-error"`, `"parse-error"`), les autres éléments restant pleinement analysés. Le client **distingue** les deux familles par la seule valeur de `excludedReason` (vocabulaire fermé, §3.5.1) : les codes de la famille **exclusion volontaire** s'affichent en marquage neutre « non analysé (exclu) » ; les codes de la famille **échec** s'affichent en marquage d'alerte « non analysé (erreur d'analyse) », pour que l'utilisateur sache qu'il manque de la donnée par accident, non par politique. Aucune autre source d'information n'est requise : la partition est portée par le code lui-même.

#### 3.5.3 Invariants d'arbre `assertTreeInvariants(nodes)`

Zod ne valide que des **formes** ; il n'assure aucune **intégrité référentielle** de l'arbre. La fonction `assertTreeInvariants(nodes: SourceNode[])` est exécutée à l'écriture (garde de pipeline) **et** dans les tests ; elle lève une erreur typée `TreeInvariantError` (portant le ou les `id`/`path` fautifs) si l'une des conditions suivantes n'est pas vérifiée :

1. **Racine unique :** il existe **exactement un** nœud tel que `parentId === null`, et son `path === ""`.
2. **Références résolues :** pour tout nœud non racine, `parentId` référence l'`id` d'un nœud **présent** dans `nodes`.
3. **Cohérence parent↔chemin :** pour tout nœud non racine de `path` `p`, `parentId === nodeId(parentPath(p))`, où `parentPath(p)` est `p` privé de son dernier segment `/…` (la racine `""` pour un enfant direct de la racine). Le `parentId` désigne donc bien le nœud du **chemin parent**, pas un dossier arbitraire.
4. **Unicité des chemins :** les `path` sont deux à deux distincts.
5. **Identité dérivée :** pour tout nœud, `id === nodeId(path)` (§4.2). Aucun `id` n'est forgé hors formule.
6. **Absence de cycle :** en remontant `parentId` depuis n'importe quel nœud, on atteint la racine en un nombre fini d'étapes ; aucun nœud n'est son propre ancêtre. (Conséquence directe de 1–3 sur un ensemble fini, mais vérifiée explicitement.)
7. **Tri :** `nodes` est trié par `path` en ordre de code-unit UTF-16 (§2.4).

*Test :* fixtures ciblées (parent manquant, `id` incohérent, doublon de `path`, cycle injecté) → chacune lève `TreeInvariantError` ; fixture saine → passe. Cette batterie est **distincte** de `assertInvariants(layout)` du moteur de layout (déplacée vers `docs/spec/layout-engine-v0.md`), qui ne couvre que la géométrie.

### 3.6 `Classification` (dossiers uniquement)

```ts
type Category =
  | "root" | "controller" | "route" | "service" | "domain" | "ui" | "utility"
  | "model" | "repository" | "data" | "configuration" | "test" | "documentation"
  | "asset" | "build" | "generated" | "vendor" | "unknown";  // taxonomie PRD §12.2

type DecisionSource = "config" | "rule" | "static" | "ai";    // couches PRD §12.1

interface Classification {
  sourceNodeId: string;                        // référence un SourceNode de type directory
  category: Category;
  confidence: number;                          // pour-mille 0..1000 (entier)
  decisionSource: DecisionSource;
  evidence: { kind: string; detail: string }[];// trié par (kind, detail)
  overriddenByConfig: boolean;
}
```

**Portée v0 (rappel de mission) :** en phase 0, la classification est fournie par des **règles déterministes triviales** (nom de dossier → catégorie). Le schéma porte néanmoins `confidence`, `decisionSource` et `evidence` (§12.3 du PRD). Règles v0 :
- correspondance exacte d'un nom de dossier dans la table `THEME_OF` (§13.2) → `decisionSource: "rule"`, `confidence: 1000`, `evidence: [{ kind: "folder-name", detail: <nom> }]` ;
- racine → `category: "root"`, `confidence: 1000` ;
- aucun match → `category: "unknown"`, `confidence: 0`, `evidence: []` ;
- une entrée de configuration explicite prime → `decisionSource: "config"`, `overriddenByConfig: true`.

La couche `"ai"` n'est **jamais** produite en v0.

### 3.7 `WorldLayout`, `SpatialNode`, `Portal`, `FileObject`

```ts
type SpaceType = "hall" | "room" | "plaza" | "gallery" | "corridor" | "warehouse" | "floor-stack";
// v0 PRODUIT : hall, room, plaza, gallery. Les autres sont réservés.

type ThemeId =
  | "project-hall" | "control-room" | "neutral"    // v0 : ces trois-là
  | "factory" | "design-gallery" | "tool-workshop"
  | "object-museum" | "archive-warehouse" | "machine-room"
  | "laboratory" | "library";                       // réservés (PRD §10.1)

type SpatialRole = "hall" | "primary" | "annex";
// hall = racine ; primary = tout autre dossier ; annex = page de pagination (§3.7.1).
// Aucun rôle synthétique de regroupement en v0 (refonte du layout, voir docs/spec/layout-engine-v0.md).

type PortalKind  = "door" | "stair" | "elevator" | "portal";
// v0 PRODUIT exclusivement "door" et "stair". "elevator" et "portal" sont RÉSERVÉS
// (nommés pour figer l'identité FR-026), jamais émis en v0.

interface WorldLayout {
  layoutVersion: number;      // === LAYOUT_VERSION
  seed: string;               // = config.layoutSeed (INDÉPENDANT du commit, §5.3)
  normalSpeed: number;        // mm/s, écho de LayoutOptions (invariant 15 s), entier
  maxRoomHalfExtent: number;  // mm, plafond centre→mur (invariant 15 s), entier
  spatialNodes: SpatialNode[];// trié par id
}

interface SpatialNode {
  id: string;                 // "s_" + idHash(sourceNodeId + "|" + role + "|" + page) (§4.2)
  sourceNodeId: string;       // le DOSSIER représenté (les fichiers sont des objets, pas des nœuds)
  role: SpatialRole;          // exactement un {hall|primary} par dossier (§3.7.1)
  page: number;               // 0 pour primary/hall ; k≥1 pour l'annexe de pagination k
  pageCount: number;          // nombre total de pages de ce dossier (≥ 1)
  spaceType: SpaceType;
  theme: ThemeId;
  level: number;              // = min(depth, maxRenderDepth) ; profondeur de RENDU (§3.7.5)
  depthFlattened: boolean;    // = (depth > maxRenderDepth) ; aucun rattachement à un ancêtre
  position: Vec3i;            // centre-sol, MONDE, mm
  orientation: Orientation;   // 0|1|2|3
  dimensions: Vec3i;          // extents pleins, mm ; x,z ≤ 2·maxRoomHalfExtent
  portals: Portal[];          // trié par (wallRank, offset)
  objects: FileObject[];      // trié par sourceNodeId
}

interface Portal {
  id: string;                 // "p_" + idHash(fromSpatialNodeId + "->" + toSpatialNodeId + "|" + kind) (§4.2)
  toSpatialNodeId: string;
  kind: PortalKind;
  wall: "north" | "south" | "east" | "west";
  offset: number;             // mm le long du mur depuis le coin de référence (§3.7.6)
  width: number;              // mm
  height: number;             // mm
}

interface FileObject {
  sourceNodeId: string;       // le FICHIER
  position: Vec3i;            // LOCAL au centre-sol de la salle, mm
  orientation: Orientation;
  kind: ObjectKind;           // vocabulaire d'objets (défini dans layout-engine-v0.md), résolu par le ThemeKit
  footprint: { x: number; z: number }; // emprise mm, issue de KIND_FOOTPRINT (layout-engine-v0.md)
}

type Vec3i = { x: number; y: number; z: number }; // entiers mm ; Zod : z.object({...}).strict()
```

#### 3.7.1 Cardinalité des salles (FR-005)

Chaque dossier non exclu **DOIT** posséder **exactement un** `SpatialNode` de rôle `hall` (racine) ou `primary` (autres). Ce nœud est la cible unique du fil d'Ariane, de la mini-carte et de la téléportation. Le rôle `annex` (pagination, moteur déplacé vers `docs/spec/layout-engine-v0.md`) **partage** le `sourceNodeId` d'un dossier existant ; il n'invente jamais d'identité de dossier. Il n'existe **que deux** rôles porteurs d'identité de dossier (`hall`/`primary`) et un rôle spatial supplémentaire (`annex`) ; aucun rôle synthétique de regroupement.

#### 3.7.2 Réciprocité des portails

Toute connexion entre deux salles crée un `Portal` dans **chacune** des deux salles (l'un vers l'autre). Le graphe des portails **DOIT** être connexe depuis la salle `hall` (invariant et test dans `docs/spec/layout-engine-v0.md`).

#### 3.7.3 `dimensions` et invariant 15 s

Pour tout `SpatialNode`, `dimensions.x ≤ 2·maxRoomHalfExtent` et `dimensions.z ≤ 2·maxRoomHalfExtent`. Le dépassement déclenche la **pagination** (rôle `annex`), jamais l'agrandissement. La mécanique de pagination et l'invariant des 15 s sont spécifiés dans `docs/spec/layout-engine-v0.md`.

#### 3.7.4 Objets fichiers

Chaque fichier **non exclu** d'un dossier **DOIT** être représenté par **exactement un** `FileObject`, dans la salle `primary` du dossier ou l'une de ses `annex` (bijection fichiers non exclus ↔ FileObjects, sur l'ensemble des pages). Les fichiers exclus n'ont pas de `FileObject` (§3.5.2).

#### 3.7.5 Étage de rendu `level`, `position.y` et `depthFlattened`

Pour tout `SpatialNode` représentant un dossier de profondeur source `depth` (= `SourceNode.depth`, jamais plafonnée, §3.5) :

- `level = min(depth, maxRenderDepth)` (`maxRenderDepth` = §14). C'est la profondeur de **rendu** ; deux dossiers de profondeur source `> maxRenderDepth` partagent le même `level`.
- `position.y = level · floorHeight` (`floorHeight` = §14, entier mm). La hauteur d'une salle est **entièrement** fonction de son `level` ; rien d'autre ne l'influence.
- `depthFlattened = (depth > maxRenderDepth)`. Ce booléen signale seulement que le rendu a plafonné la hauteur. **Aucun rattachement à un ancêtre** n'est induit : le dossier profond conserve sa propre salle, sa propre position au sol et son portail parent normal. `depthFlattened` ne modifie ni `sourceNodeId`, ni le graphe de portails, ni l'identité du dossier.

La géométrie exacte du sol (position `x`,`z`) est produite par le moteur de layout (`docs/spec/layout-engine-v0.md`) ; seules les règles ci-dessus, qui touchent des champs de l'artefact, sont normatives ici.

#### 3.7.6 Système de référence de `Portal.offset`

`Portal.offset` est un entier mm mesuré **le long du mur** depuis le **coin de référence** de ce mur, en parcours **horaire vu du dessus** (repère main droite, `y` vers le haut, §2.1). Le sens positif de chaque mur est canonique :

| `wall` | normale | coin de référence | `offset` croît vers |
|---|---|---|---|
| `north` | `-z` | coin **ouest** | `+x` |
| `east` | `+x` | coin **nord** | `+z` |
| `south` | `+z` | coin **est** | `-x` |
| `west` | `-x` | coin **sud** | `-z` |

Ainsi `offset` est toujours positif et croît dans le sens horaire du périmètre. `0 ≤ offset ≤ (longueur du mur − width)` (le portail tient entièrement dans le mur). Ce système fixe sans ambiguïté la position du portail et donc les octets de l'artefact.

### 3.8 `SearchIndex`

```ts
interface SearchIndex {
  version: number;            // version du format d'index (v0 : 0)
  documents: SearchDoc[];     // trié par ref
}

interface SearchDoc {
  ref: string;                // sourceNodeId (symbolId en phase 1)
  path: string;
  name: string;
  kind: "directory" | "file";
  language?: string;          // omis si absent
  category?: Category;        // omis si le ref n'est pas un dossier classé
  symbolNames?: string[];     // RÉSERVÉ phase 1 (symboles exportés, trié) ; ABSENT en v0
}
```

#### 3.8.1 Règle de peuplement (couverture, bijection, `ref`)

La §3.8 fige la **forme** d'un `SearchDoc` ; la règle de **peuplement** qui suit fige quels nœuds en produisent un, afin que FR-011 et le test de recherche soient exécutables :

- **Couverture totale.** **Chaque** `SourceNode` de `World.nodes` produit **exactement un** `SearchDoc`, **y compris la racine et les nœuds exclus**. Un élément exclu reste ainsi trouvable dans la recherche et signalé « non analysé » (FR-025). Aucun autre nœud n'en produit ; aucun `SourceNode` n'en est privé.
- **Bijection.** L'application `SourceNode.id → SearchDoc.ref` est une **bijection** entre `World.nodes` et `World.search.documents`. En v0, `ref === sourceNode.id` (un `sourceNodeId`) ; la ré-affectation de `ref` à un `symbolId` est réservée à la phase 1 (les symboles **s'ajouteront** aux documents de nœuds, sans en retirer).
- **Champs dérivés du nœud.** `path`, `name`, `kind` recopient le `SourceNode`. `language` est présent **SSI** le `SourceNode` porte `language` (donc jamais sur un dossier ni un fichier exclu). `category` est présent **SSI** le nœud est un dossier possédant une `Classification` (§3.6) ; il recopie alors `Classification.category`. `symbolNames` est **absent** en v0 (§3.8).

*Test (FR-011) :* asserter `documents.length === nodes.length` ; asserter que l'ensemble des `ref` est **exactement** l'ensemble des `id` de `nodes` (bijection, aucun orphelin, aucun doublon) ; asserter la présence/absence de `language` et `category` selon les conditions énumérées ci-dessus ; asserter le tri de `documents` par `ref` (§2.4).

**Décision (tension 9) :** on **n'embarque pas** le dump sérialisé de MiniSearch dans `world.json`. Sa forme sérialisée dépend de la version de la bibliothèque et n'est pas garantie canonique — cela coupleraient FR-026 à MiniSearch. On embarque des `SearchDoc` que **nous** contrôlons et sérialisons canoniquement ; **le client reconstruit l'index MiniSearch en mémoire** au chargement (après la première image pour tenir le budget §16.1). Voir ADR-0001.

### 3.9 Entités réservées (sprints 5 à 7) — nommées, optionnelles, absentes en v0

Ces formes sont **figées dès v0** pour éviter tout bump majeur en phase 1 (le plan §8 exige « extensions par champs optionnels versionnés »). Le producteur v0 **NE LES ÉMET JAMAIS** : leurs clés sont absentes de l'artefact, donc les octets restent stables (§2.3).

```ts
type RefTarget = { kind: "node"; id: string } | { kind: "symbol"; id: string };

interface Symbol {                 // sprint 5
  id: string; sourceNodeId: string; name: string; qualifiedName: string;
  symbolType: string; startLine: number; endLine: number; exported: boolean;
}
interface Relation {               // sprint 5 (imports directs)
  sourceRef: RefTarget; targetRef: RefTarget; relationType: string;
  confidence: number;              // pour-mille
  evidence: { kind: string; detail: string }[];
}
interface SemanticSummary {        // sprint 7
  targetRef: RefTarget; summary: string;  // texte normalisé LF
  modelId: string; promptVersion: string; sourceRefs: RefTarget[];
}
interface GuidedTour {             // sprint 7
  title: string;
  steps: { target: RefTarget; text: string; sourceRefs: RefTarget[] }[]; // ordre métier préservé
  generatedBy: string;
}
```

Zod : `symbols`, `relations`, `summaries` sont des tableaux `.optional()` ; `tour` est un objet `.optional()`. Un artefact v0 valide est un artefact **sans** ces clés.

---

## 4. Dérivation des identifiants

### 4.1 Normalisation du chemin

`normalizePath(raw): string` :
1. séparateurs POSIX (`/`) ;
2. suppression d'un éventuel `./` initial et d'un `/` final ;
3. relatif à la racine du dépôt (la racine a `path === ""`) ;
4. normalisation Unicode **NFC** (`String.prototype.normalize("NFC")`) ;
5. casse **préservée** (Git est sensible à la casse).

**Note de déterminisme (Unicode) :** la version des données Unicode utilisée par `normalize` fait partie de l'environnement d'analyse et est donc couverte par `manifest.analyzerVersion` (FR-026 garantit l'identité « pour une même version d'analyseur »). Le **client ne renormalise jamais** un `path` : il le traite comme une chaîne opaque reçue. Une éventuelle divergence de version Unicode entre pipeline et navigateur ne peut donc pas altérer un artefact chargé, puisque le layout v0 est calculé dans le pipeline et livré, pas recalculé côté client.

### 4.2 Fonction d'identité

**Formule d'identité UNIQUE, tranchée au caractère près** (source de vérité pour §0.3, §3.5, §3.7 et §4.3) :

```
sha256(x)        : sha256 des octets UTF-8 de x → 32 octets (impl pure TS, §5.1)
base32(bytes)    : encodage RFC 4648, alphabet minuscule "abcdefghijklmnopqrstuvwxyz234567",
                   SANS padding (aucun '='). 32 octets = 256 bits → 52 caractères.
idHash(s)        = base32( sha256( utf8(s) ) ).slice(0, idHashLength)   // idHashLength caractères, défaut 16
```

- **Entrée** `s` : la chaîne à hacher, encodée en **UTF-8**. **Algorithme** : `sha256` sur ces octets → 32 octets. **Encodage** : `base32` RFC 4648 minuscule sans padding de la **totalité** des 32 octets → 52 caractères. **Découpe** : les `idHashLength` **premiers caractères** de cette chaîne base32 (`.slice(0, idHashLength)`, jamais une découpe des octets). **Alphabet** : `abcdefghijklmnopqrstuvwxyz234567`. **Casse** : minuscule. **Padding** : aucun. La notation `[0..n]` employée ailleurs dans ce fichier désigne exactement `.slice(0, n)` (les `n` premiers **caractères**).
- **Défaut** `idHashLength = 16` caractères = 16 × 5 = **80 bits** (§4.3).
- Identifiants dérivés, tous par la **même** `idHash` :

```
nodeId(path)       = "n_" + idHash( normalizePath(path) )
spatialNodeId(...) = "s_" + idHash( sourceNodeId + "|" + role + "|" + page )        // §3.7
portalId(...)      = "p_" + idHash( fromSpatialNodeId + "->" + toSpatialNodeId + "|" + kind ) // §3.7
```

- La racine (`path === ""`) suit **la même formule** : `nodeId("")`. Aucun identifiant magique (`n_root` proscrit) ; la racine se reconnaît par `parentId === null`. Un cas particulier de moins = un bug de moins.
- Zod : `/^n_[a-z2-7]{8,32}$/` (la longueur exacte, `idHashLength`, est uniforme dans un artefact donné ; le `8,32` couvre un éventuel `idHashLength` reconfiguré, §4.3, borné à `[8, 32]`).

### 4.3 Longueur et collisions

- Longueur par défaut : **80 bits** (`idHashLength = 16` caractères base32, découpe `.slice(0, 16)` de §4.2). Pour ≤ 10 000 nœuds (PRD §27.3), la probabilité de collision est `≈ n²/2^81 ≈ 4·10⁻¹⁷`.
- Plage configurable : `idHashLength ∈ [8, 32]` caractères, cohérente avec la borne Zod `{8,32}` (§4.2).
- **Politique de collision (déterministe, testable) :** à l'écriture, le pipeline **assert** l'unicité globale des `id`. En cas de collision (astronomiquement improbable), il lève une erreur typée `IdCollisionError` listant les chemins en conflit. Le **remède documenté** est d'augmenter `config.idHashLength` (par pas de caractères base32), ce qui, faisant partie de `configurationHash`, est un changement **délibéré et versionné** — pas une mutation silencieuse.
- **Test synthétique :** l'assertion d'unicité globale s'exécute **avant** la sérialisation et la validation Zod. Le test force une collision en construisant une fixture de deux chemins dont les 8 premiers caractères base32 de `sha256` coïncident, avec `idHashLength = 8` (la plus courte longueur valide, §4.2), puis assert le type `IdCollisionError`. Test de propriété : unicité des `id` sur tout le corpus.

**Rejeté :** le suffixe `-1/-2` (proposition « perf-client ») casse l'alphabet base32 et l'uniformité de longueur, compliquant le traitement opaque côté client. Le recalcul global automatique et silencieux (proposition « déterminisme ») change les octets de nœuds sans rapport, sans signal de version : on lui préfère l'échec explicite + le levier versionné.

### 4.4 Un seul système de référence

Toutes les références internes de l'artefact utilisent l'`id` chaîne (jamais un index entier dans un tableau). **Rejeté :** le double système `id` (durable) + `nodeIndex` (position dans le tableau trié) de la proposition « perf-client ». Motifs :
- un modèle de référence unique = moins de surface de bug et pas de validation de bornes d'index ;
- artefact auto-descriptif : toute référence est signifiante isolément (deep links, favoris, débogage) ;
- les fixtures écrites à la main et les snapshots (sprints 1–2) sont bien plus lisibles avec des `id` ;
- la compression (gzip/brotli) neutralise l'essentiel du surcoût de taille des `id` répétés ; le budget §27.3 est tenu avec marge.

L'index entier reste une **optimisation future possible**, introduite derrière un bump de `schemaVersion` si un profilage le justifie — pas en v0.

---

## 5. Graine, hachage et PRNG

### 5.1 Primitives pures vendorisées

`packages/world-schema` vendorise en **TypeScript pur** :
- **sha256** (octets → 32 octets), sans `node:crypto` ;
- **mulberry32**, PRNG 32 bits.

Interdits durs, vérifiés par lint dans ce paquet : `Math.random`, `Date`, `process`, `fs`, `node:*`, `crypto`. La sortie **DOIT** être identique bit à bit dans Node et le navigateur.

### 5.2 mulberry32

Algorithme exact (arithmétique 32 bits non signée ; `Math.imul` est déterministe et disponible partout) :

```ts
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0);          // entier uint32 dans [0, 2^32)
  };
}
```

Le PRNG rend des **entiers uint32**. On n'utilise **jamais** de conversion en `[0,1)` (pas de flottant). Tirage entier non biaisé dans `[0, m)` par rejet :

```ts
function nextIntBelow(next: () => number, m: number): number {
  const limit = (0x100000000 - (0x100000000 % m)) >>> 0; // plus grand multiple de m < 2^32
  let x: number;
  do { x = next(); } while (x >= limit);
  return x % m;
}
```

### 5.3 Graine et flux par nœud (tension 4)

- **Graine racine :** `seed = config.layoutSeed` (constante de corpus, défaut `"cwe-v0"`). Elle **N'INCLUT NI le commit NI l'heure**. Le commit ne détermine que *quels nœuds existent*, jamais leurs positions. Voir ADR-0003.
- **Flux propre à chaque nœud :** un nœud dérive son état PRNG de son chemin, indépendamment de l'ordre de parcours :

```
nodeStreamSeed(path) = readUint32BE( sha256( utf8(seed) ++ [0x00] ++ utf8(normalizePath(path)) )[0..4] )
prngOf(path)         = mulberry32( nodeStreamSeed(path) )
```

`readUint32BE(b)` = `((b[0]<<24)|(b[1]<<16)|(b[2]<<8)|b[3]) >>> 0`.

- **Slotting par hachage** (placement, moteur dans `docs/spec/layout-engine-v0.md`) indépendant du flux PRNG, avec séparation de domaine par un octet distinct et un compteur de rejet :

```
hashSlot(path, modulus) :
  for i = 0, 1, 2, ... :
    h = sha256( utf8(seed) ++ [0x01] ++ uint32BE(i) ++ utf8(normalizePath(path)) )
    x = readUint32BE(h[0..4])
    limit = 0x100000000 - (0x100000000 % modulus)
    if x < limit : return x % modulus
```

`uint32BE(i)` = les 4 octets big-endian de `i`.

Conséquences : placement **indépendant de l'ordre de parcours** (parallélisable) et **stable entre commits** (path stable ⇒ tirages stables).

### 5.4 `configurationHash`

```
effectiveConfig = {
  exclusionRules,        // règles FR-003 (globs, catégories exclues)
  visualMappings,        // table THEME_OF (§13.2) et paramètres de thème
  layoutSeed,            // config.layoutSeed
  layoutOptions,         // §14 (toutes les constantes de layout)
  idHashLength,          // défaut 16
  taxonomyVersion,       // version de la taxonomie §12.2
  ai: { modelId, promptVersion } // réservé ; présent dès v0 pour figer l'identité
}
configurationHash = sha256Hex( canonicalStringify(effectiveConfig) )   // §6
```

---

## 6. Sérialisation canonique

### 6.1 `canonicalStringify(value): string`

Règles, tranchées au caractère près :

- **null / booléens :** `"null"`, `"true"`, `"false"`.
- **Nombres :** seuls des entiers sûrs. Garde d'exécution : lever `NonCanonicalNumberError` si `!Number.isFinite(v) || !Number.isSafeInteger(v)`. Émission : `String(v)`. (`String(-0) === "0"` en JavaScript, identique à `JSON.stringify(-0)` ; aucun `-0` n'atteint donc la sortie, aucune notation scientifique, aucun point décimal.)
- **Chaînes :** via `JSON.stringify(str)` appliqué à la chaîne seule. Son échappement est **entièrement spécifié par ECMA-262** (guillemet et antislash échappés ; `\b \t \n \f \r` en formes courtes ; autres caractères de contrôle `< U+0020` en `\u00XX` ; tout le reste émis littéralement en UTF-8) et **identique entre moteurs**. Tout texte multiligne embarqué (résumés, phase 1) est **normalisé CRLF/CR → LF en amont**.
- **Tableaux :** `"[" + éléments.map(canonicalStringify).join(",") + "]"`. **L'ordre est préservé** (le producteur l'a déjà trié, §2.4).
- **Objets :** `keys = Object.keys(v).filter(k => v[k] !== undefined).sort(compareCodeUnit)` ; puis `"{" + keys.map(k => JSON.stringify(k)+":"+canonicalStringify(v[k])).join(",") + "}"`. Les clés à valeur `undefined` sont **filtrées** (jamais `null` de substitution).
- `compareCodeUnit(a, b)` : `a < b ? -1 : a > b ? 1 : 0` (comparaison native JS = code-unit UTF-16). Nos clés étant ASCII, ce tri est trivial et sans ambiguïté.
- Toute autre valeur (`undefined`, `function`, `symbol`, `bigint`) au sommet lève `NonCanonicalValueError`.

```ts
function serializeWorld(world: World): Uint8Array {
  return new TextEncoder().encode(canonicalStringify(world));  // UTF-8, SANS BOM
}
```

### 6.2 Forme du fichier

- **Minifié** : aucun blanc insignifiant.
- **UTF-8, sans BOM.**
- **Sauts de ligne :** aucun (sortie sur une ligne) ; les `\n` internes aux chaînes sont échappés.
- **Aucun saut de ligne final.** Le contenu du fichier **EST exactement** `serializeWorld(world)` — rien n'est ajouté. (Invariant « le fichier = la sortie de la fonction », le plus simple à tester.)

Un `world.pretty.json` indenté, **non canonique**, PEUT être émis séparément pour le débogage ; il n'a aucune autorité.

### 6.3 Hachage

```ts
function hashWorld(world: World): string {   // sha256 hex des octets canoniques
  return sha256Hex(serializeWorld(world));
}
```

---

## 7. Moteur de layout

**Déplacée vers `docs/spec/layout-engine-v0.md`.** Tout le moteur de layout (signature `computeLayout`, modèle spatial, placement, tailles, objets fichiers, invariants géométriques et batterie `assertInvariants(layout)`) est spécifié dans ce fichier dédié. Le présent contrat ne fixe que la **forme** des entités de layout (§3.7) et les constantes par défaut (§14).

---

## 8. Pagination, largeur et profondeur

**Déplacée vers `docs/spec/layout-engine-v0.md`.** La pagination (rôle `annex`), la gestion de la largeur et l'aplatissement de profondeur relèvent du moteur de layout. Les seules règles portant sur les octets de l'artefact et donc normatives ici sont la sémantique de `level`, `position.y` et `depthFlattened` (§3.7.5) et les cardinalités de salles (§3.7.1).

---

## 9. Chargement et refus de version (FR-027)

### 9.1 API typée

Le contrôle de version se fait **avant** toute validation Zod (le champ `manifest.schemaVersion` est lu en premier), et l'échec est une **erreur typée discriminée**, pas un `throw` générique.

```ts
type WorldLoadError =
  | { kind: "malformed-json"; message: string }
  | { kind: "unsupported-schema-version"; found: number; supported: readonly number[]; message: string }
  | { kind: "invalid-schema"; issues: import("zod").ZodIssue[]; message: string };

type LoadResult =
  | { ok: true; world: World }
  | { ok: false; error: WorldLoadError };

function loadWorld(rawJson: string): LoadResult;
```

Séquence de `loadWorld` :
1. `JSON.parse` ; en cas d'échec → `{ ok:false, error:{ kind:"malformed-json", message } }`.
2. Lire `manifest.schemaVersion`. S'il est absent ou n'est pas un nombre → `{ kind:"unsupported-schema-version", found: NaN, supported: SUPPORTED_SCHEMA_VERSIONS, message }`.
3. Si `!SUPPORTED_SCHEMA_VERSIONS.includes(schemaVersion)` → `{ kind:"unsupported-schema-version", found, supported, message }`. **On ne lance pas Zod sur des données de version inconnue.**
4. Sinon, `WorldSchema.safeParse` ; échec → `{ kind:"invalid-schema", issues, message }` ; succès → `{ ok:true, world }`.

- Les `kind` sont des identifiants **anglais stables** ; les `message` sont en **français** pour l'UI (le client affiche un écran de refus dédié pour `unsupported-schema-version` et ne charge jamais partiellement).
- Zod épingle aussi `manifest.schemaVersion: z.literal(0)` en défense en profondeur.
- Une variante **lançante** typée est fournie pour le pipeline : `parseWorld(raw): World` lève `WorldLoadException extends Error` (portant `.error: WorldLoadError`).

*Tests :* version supportée + 1 → `unsupported-schema-version` (pas une erreur Zod) ; JSON invalide → `malformed-json` ; version bonne mais corps malformé → `invalid-schema`.

**Rejeté** (proposition « déterminisme ») : deux classes `throw` distinctes. Le résultat discriminé (Result) est plus ergonomique côté client, force le traitement des trois cas, et se teste sans `try/catch`.

---

## 10. Déterminisme et FR-026 — règle de test exacte

### 10.1 Tuple d'identité (à entrées fixées)

Un artefact est entièrement déterminé par :

```
(repository, snapshot.commitSha, manifest.configurationHash,
 manifest.analyzerVersion, manifest.schemaVersion, manifest.layoutVersion)
```

Tout est **porté par l'artefact** (sauf les octets source, identifiés par le commit) : l'artefact est auto-descriptif. Aucune valeur d'exécution n'y figure (§3.2, §3.4).

**FR-026 vaut à ENTRÉES FIXÉES.** Le champ `repository` (§3.3) contient `defaultBranch` et `license`, qui sont des **métadonnées GitHub MUTABLES** : elles ne sont **pas** dérivables du commit et peuvent changer côté GitHub sans qu'aucun octet du dépôt à ce commit n'ait bougé (renommage de la branche par défaut, mise à jour du fichier de licence détecté par l'API, etc.). Deux analyses du **même commit** à deux instants différents pourraient donc diverger si ces valeurs étaient lues en direct. FR-026 ne garantit l'identité octet-pour-octet que **pour un jeu d'entrées identiques**, énuméré ici de façon canonique :

1. l'**arbre source** au commit `snapshot.commitSha` (les octets de tous les fichiers et la structure de répertoires) ;
2. la **committer date** normalisée (§3.4.1), dérivée du commit ;
3. les **métadonnées de dépôt** non dérivables du commit : `repository.provider`, `repository.owner`, `repository.name`, `repository.url`, `repository.defaultBranch`, `repository.license` ;
4. la **configuration effective** `effectiveConfig` (§5.4), résumée par `manifest.configurationHash` ;
5. les **versions** `analyzerVersion`, `schemaVersion`, `layoutVersion`.

Les entrées 1, 2, 4 et 5 sont reproductibles par construction. L'entrée 3 est le seul apport mutable : elle est traitée comme une **entrée injectée**, pas comme un fait recalculé à chaque exécution. Le test de reproductibilité (§10.3, point 1) **DOIT** injecter ces métadonnées depuis une **fixture figée**, jamais depuis un appel réseau à l'API GitHub ; un lint interdit tout accès réseau dans le pipeline de test de reproductibilité. Une évolution effective de `defaultBranch` ou `license` produit légitimement un nouvel artefact : c'est un changement d'entrée, pas une violation de FR-026.

### 10.2 Règle FR-026 (normative, testable)

> Pour un même `(dépôt, commit, configuration, version d'analyseur)`, les octets **non compressés** de `world.json` sont **identiques**. Formellement : `serializeWorld(computeWorld(entrée))` produit le **même `Uint8Array`** à chaque exécution, et `hashWorld` est stable.

Périmètre : `world.json` **seul**. Exclus : `world.build.json`, `files/<hash>`, et toute compression de transport.

### 10.3 Mécanismes de test

1. **Double exécution :** lancer le pipeline deux fois sur une fixture (arbre figé **et** métadonnées de dépôt `repository` injectées depuis la fixture — jamais depuis un appel réseau à l'API GitHub, cf. §10.1 entrée 3) ; asserter l'égalité **octet à octet** des deux `serializeWorld(...)` **et** `hashWorld(run1) === hashWorld(run2)`.
2. **Snapshot doré :** stocker le `hashWorld` attendu de chaque monde de test dans un fichier texte hex committé (insensible aux fins de ligne ; immunisé contre le remaniement d'un éditeur). La CI échoue si un octet change sans bump explicite de `analyzerVersion` / `layoutVersion` / `schemaVersion`. On PEUT en complément committer les octets dorés (`world.golden.json`, marqués `-text -diff` dans `.gitattributes`).
3. **Gardes d'exécution :** `canonicalStringify` lève sur non-entier / NaN / Infini / `-0` résiduel ; Zod applique `.int()` et `.strict()`. Un flottant qui « fuit » du layout fait échouer le build immédiatement.
4. **Lint anti-horodatage :** aucune clé de `world.json` ne correspond à un motif d'horloge murale, **sauf** `committedAt`, dont le test vérifie l'égalité avec la committer date git **normalisée** (§3.4.1) — c'est-à-dire `normalizeCommittedAt(git show -s --format=%cI <sha>)`, **jamais** la sortie brute de Git (qui porte l'offset local `±HH:MM` et échouerait la comparaison pour tout commit non-UTC).
5. **Lint de pureté :** `packages/world-schema` ne référence ni `Math.random`, ni `Date`, ni `node:*`, ni `crypto`.

**On ne compare JAMAIS des octets compressés** (gzip/brotli non garantis déterministes) : on compresse pour le transport, on hache l'artefact décompressé. À documenter dans le harnais de test.

### 10.4 Sidecar de provenance `world.build.json` (hors FR-026)

```
{ buildAt, host, analyzerVersion, durationsMs, artifactSha256 }
```

Seul endroit où vit l'heure réelle d'exécution. Fichier séparé, jamais comparé par FR-026, jamais lu par le client pour une décision reproductible. Voir ADR-0002.

---

## 11. Contenus de fichiers et budget (tension 9)

- `SourceNode.contentHash` = sha256 hex des octets bruts du fichier → adresse `files/<contentHash>` (recommandé : shard de 2 caractères, `files/ab/abcd…`). Dé-duplication par hash. L'artefact n'embarque **jamais** de texte de fichier.
- Blobs `files/<hash>` : **hors** FR-026 (copies déterministes des octets source, identifiés par le commit).
- **Garde de budget (PRD §27.3) :** le pipeline échoue le build si `world.json` **compressé** dépasse **15 Mo**. Leviers de repli, dans l'ordre :
  1. sortir `summaries` (phase 1) vers un sidecar canonique `world.summaries.json`, référencé par content-hash dans `world.json` ;
  2. sortir `search.documents` vers un sidecar canonique `world.search.json`, idem ;
  3. élaguer les symboles non exportés de l'index (phase 1).
- Tout sidecar canonique **DOIT** être sérialisé par **notre** `canonicalStringify` (hash déterministe) ; sa **référence par content-hash dans `world.json` est couverte par FR-026** (un changement est détecté), mais ses octets propres sont hors comparaison directe.
- En v0, aucun levier n'est déclenché (mondes curés de petite taille). `search.documents` reste **inline**.

---

## 12. Versionnement du schéma

- `SCHEMA_VERSION` est un **entier majeur monotone**. Il est le **seul** champ vérifié par le client avant validation (§9).
- **Compatibilité :** une évolution **rétrocompatible** (ajout de champs **optionnels**) se fait **sans** bump majeur, en enrichissant `SUPPORTED_SCHEMA_VERSIONS` si nécessaire. Une évolution **incompatible** (retrait/renommage/changement de sémantique d'un champ requis) **DOIT** incrémenter `SCHEMA_VERSION`.
- `LAYOUT_VERSION` est indépendant : un changement de l'algorithme ou d'une constante de `LayoutOptions` (§14) l'incrémente et autorise un re-layout du corpus. `layoutVersion` fait partie de l'identité FR-026.
- Le nom et l'emplacement de `manifest.schemaVersion` sont **immuables pour toujours** (contrat d'ancrage de FR-027, §3.2).
- Toute évolution passe par `packages/world-schema` avec bump de version et migration des mondes de test — jamais de champ ad hoc (plan §5).

---

## 13. ThemeKit, thèmes et vocabulaire d'objets

### 13.1 Abstraction ThemeKit (décision produit)

Le rendu 3D des thèmes passe par une abstraction **`ThemeKit`** (code partagé client, **hors artefact**) :

```ts
interface ThemeKit {
  resolve(theme: ThemeId, kind: ObjectKind): PrimitiveDescriptor; // géométrie de rendu
  footprint(kind: ObjectKind): { x: number; z: number };          // = KIND_FOOTPRINT (layout-engine-v0.md)
}
```

- **Backend v0 : procédural.** `resolve` renvoie des primitives instanciées (boîtes, cylindres) + dimensions + couleur de palette. **Aucun asset externe téléchargé.**
- **Backend futur : glTF.** Le même `(theme, kind)` pointera plus tard vers un mesh CC0 **sans changer le schéma**. Le pipeline `gltf-transform` et le manifeste de provenance (FR-029) sont écrits et testés **à vide** en phase 0, prêts à recevoir les kits CC0.
- Seule la donnée nécessaire au **layout** (l'emprise `footprint`) est partagée avec `packages/world-schema` via `KIND_FOOTPRINT` (versionné avec `layoutVersion`), car le layout en a besoin pour la réservation d'espace et le test de visibilité (voir `docs/spec/layout-engine-v0.md`). La géométrie complète reste au rendu.

### 13.2 Table `THEME_OF` (catégorie → thème), v0

| Catégorie | Thème v0 |
|---|---|
| `root` | `project-hall` |
| `controller`, `route` | `control-room` |
| tout le reste (v0) | `neutral` |

(La table complète PRD §10.1 est réservée ; en v0 seuls trois thèmes sont produits.) Cette table fait partie de `visualMappings` dans `effectiveConfig` (§5.4).

### 13.3 Vocabulaire d'objets `ObjectKind`, table `OBJECT_OF` et `roleOfFile`

**Déplacée vers `docs/spec/layout-engine-v0.md`.** Le type `ObjectKind`, la table déterministe `OBJECT_OF(theme, roleOfFile)` et la fonction `roleOfFile` (dérivation depuis l'extension/nom) y sont définis. Le champ `FileObject.kind` (§3.7) référence ce vocabulaire.

### 13.4 `KIND_FOOTPRINT` (emprise au sol, mm)

**Déplacée vers `docs/spec/layout-engine-v0.md`.** La table `ObjectKind → { x, z }` y est définie et versionnée avec `layoutVersion`. Le champ `FileObject.footprint` (§3.7) en recopie la valeur.

---

## 14. Annexe — `LayoutOptions` (constantes par défaut)

Toutes ces constantes sont **versionnées avec `LAYOUT_VERSION`** et incluses dans `effectiveConfig` (§5.4). Les modifier = re-layout assumé du corpus.

> **Déplacée.** `LayoutOptions` est défini **une seule fois**, dans `docs/spec/layout-engine-v0.md` §10, qui en est l'unique source normative (interface, valeurs entières et invariants dérivés). Toute constante consommée par le moteur de layout se lit là-bas.
>
> `LayoutOptions` reste versionné avec `LAYOUT_VERSION` et inclus dans `effectiveConfig` (§5.4) : le modifier vaut re-layout assumé du corpus.

Deux définitions normatives d'un même jeu de constantes qui déterminent les octets de l'artefact, c'est une violation de FR-026 en attente. Il n'y en a donc qu'une.
