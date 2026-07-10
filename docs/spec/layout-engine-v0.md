# Spécification normative — Moteur de layout `world.json` v0

**Statut :** normatif (implémentable sans clarification supplémentaire)
**Cible :** `packages/world-schema` (moteur de layout, fonction pure `computeLayout`).
**Portée :** phase 0, sprints 1 à 3. Thèmes rendus en géométries procédurales instanciées, aucun asset externe.
**Référence PRD :** v3.0, §9.1, §9.2, §9.4, §9.5, §10.2, §14.2, §17.2, §27.3.
**Référence contrat :** `docs/spec/world-schema-v0.md` (§2 unités, §3.7 entités spatiales, §4 identifiants, §5 graine/PRNG, §6 sérialisation, §13 ThemeKit).
**Référence décision :** `docs/decisions/ADR-0003-stabilite-spatiale-du-layout.md`.
**Langue :** identifiants et API en anglais ; prose, invariants et justifications en français.

Les mots **DOIT**, **NE DOIT PAS**, **DEVRAIT**, **PEUT** ont leur sens RFC 2119.

> **Autorité.** Ce document **remplace** les sections 7 (« Moteur de layout »), 8 (« Pagination, largeur et
> profondeur »), les tables de la section 13 (`roleOfFile`, `OBJECT_OF`, `KIND_FOOTPRINT`) **et l'annexe
> section 14 (« `LayoutOptions` — constantes par défaut »)** de `world-schema-v0.md`. En cas de divergence sur
> ces sujets, **le présent document fait foi**. En particulier, le **§10 ci-dessous est l'unique définition
> normative de `LayoutOptions`** et **périme** le §14 du contrat : les valeurs `clearance = 500`,
> `floorHeight = 8000`, `roomSideTiers` au format de paires `[[4,3],[16,5],[36,7],[60,9]]`, la constante
> `maxFilesPerRoom = 60` et l'invariant « `(9-1)² = 64 ≥ 60` » du §14 sont **caduques** ; les valeurs faisant
> foi sont celles du §10 (`clearance = 1000`, `floorHeight = 6000`, `roomSideTiers = [3,5,7,9,11]` — scalaires
> impairs —, `maxFilesPerRoom` **supprimée**, avec `roomHeight`, `plazaThreshold`, `galleryThreshold`,
> `reservedSlotCount` ajoutées). Il ne redéfinit **pas** les entités (`SpatialNode`, `Portal`, `FileObject`),
> qui restent celles du §3.7 du contrat.

> **Principe de conception.** Tout invariant est vrai **par construction**, jamais rétabli par une boucle de
> réparation. Toute primitive nommée est définie jusqu'au dernier octet dans ce document. Aucune
> trigonométrie, aucun flottant, aucune division non exacte : arithmétique **entière** de bout en bout.

---

## Sommaire

1. Signature et pureté de `computeLayout`
2. Modèle spatial en bandes (schéma ASCII du plot)
3. Chaîne de salles et capacités
4. Créneaux de mur, murs et offsets (formule du seuil 2D)
5. Slotting déterministe
6. Placement des fichiers et visibilité par construction (test segment × AABB entier)
7. Profondeur et niveaux
8. Tables complètes (`roleOfFile`, `OBJECT_OF`, `KIND_FOOTPRINT`, `pickSpaceType`, `orientation`)
9. Pseudo-code intégral
10. `LayoutOptions` (constantes)
11. Invariants `assertLayoutInvariants`
12. Terminaison, complexité et non-chevauchement
13. Écarts au mandat
14. Objections examinées et écartées

---

## 1. Signature et pureté de `computeLayout`

```ts
function computeLayout(
  tree: LayoutTree,                                 // arbre des dossiers/fichiers NON exclus
  classifications: ReadonlyMap<string, Category>,   // clé = sourceNodeId d'un dossier
  seed: string,                                     // = config.layoutSeed (constante de corpus)
  options: LayoutOptions,                           // §10
): WorldLayout;                                     // entité §3.7 du contrat
```

### 1.1 Entrée `LayoutTree`

`LayoutTree` est la vue des `SourceNode` **non exclus** (§3.5.2 du contrat), dérivée en amont, sans dépendance
disque ni horloge :

```ts
interface LayoutTree {
  root: LayoutDir;
}
interface LayoutDir {
  id: string;                 // = SourceNode.id (n_…) du dossier
  path: string;               // path POSIX/NFC normalisé (§4.1 du contrat) ; racine = ""
  depth: number;              // profondeur SOURCE réelle (racine = 0), JAMAIS plafonnée
  isRoot: boolean;            // true SSI path === ""
  childDirs: LayoutDir[];     // sous-dossiers directs non exclus, ORDRE D'ENTRÉE QUELCONQUE
  files: LayoutFile[];        // fichiers directs non exclus, ORDRE D'ENTRÉE QUELCONQUE
}
interface LayoutFile {
  id: string;                 // = SourceNode.id (n_…) du fichier
  path: string;
  name: string;               // dernier segment du path
}
```

`childDirs` et `files` **PEUVENT** arriver dans n'importe quel ordre : `computeLayout` les **retrie par
`path`** (§5) avant tout placement. C'est ce tri, et lui seul, qui rend la sortie indépendante de l'ordre
d'itération de l'analyseur.

### 1.2 Pureté (invariant dur)

`computeLayout` est une **fonction pure** :

- aucune source d'entropie : ni `Math.random`, ni `Date`, ni `crypto`, ni `node:*` (lint de pureté, §10.3 du
  contrat) ;
- aucune fonction transcendante : ni `Math.sin`, ni `Math.cos`, ni `Math.sqrt` sur flottant, ni `**` sur
  flottant. `sqrt` entier et `ceil` de division sont fournis en §9 en arithmétique entière ;
- toutes les grandeurs produites sont des **entiers de millimètres** (positions, dimensions, offsets) ou des
  petits entiers (`Orientation ∈ {0,1,2,3}`, `level`, `page`) ;
- même entrée ⇒ **même sortie octet pour octet** dans Node et le navigateur (FR-026).

Les seules primitives « externes » employées sont **`sha256`** (octets → 32 octets) et **`base32`**,
vendorisées en TypeScript pur (§5 du contrat), déterministes bit à bit. `mulberry32` **n'est pas utilisé** par
le layout v0 : tout le hasard apparent provient d'un **hachage de `path`** (slotting, §5), pas d'un flux PRNG
séquentiel. Le layout v0 est donc trivialement parallélisable et insensible à l'ordre de parcours.

### 1.3 Sortie

`computeLayout` retourne un `WorldLayout` (§3.7 du contrat) dont `spatialNodes` est **trié par `id`**, chaque
`SpatialNode.portals` trié par `(wallRank, offset)` et chaque `SpatialNode.objects` trié par `sourceNodeId`
(§2.4 du contrat). Le producteur émet ces tableaux déjà triés ; la sérialisation ne réordonne rien.

---

## 2. Modèle spatial en bandes

### 2.1 Le plot d'un dossier est un rectangle à deux bandes

Chaque dossier `d` occupe un **plot rectangulaire** disjoint des plots de ses frères. Le plot est composé, le
long de l'axe `z` (du nord `-z` vers le sud `+z`), de :

1. une marge (`margin`) ;
2. la **bande « salles »** : la chaîne de salles de `d` (`primary → annex1 → …`) alignée sur l'axe `x`,
   salles séparées par `margin` ;
3. un **couloir** de profondeur `margin` ;
4. la **bande « enfants »** : une grille régulière de `G` colonnes × `R` lignes de **cellules carrées** de côté
   `childCell(d)`, chaque cellule accueillant le plot d'un sous-dossier direct ;
5. une marge (`margin`).

Les deux bandes sont **centrées sur l'axe `x`** du plot. Comme elles occupent des intervalles de `z`
**disjoints** et que les cellules enfants sont **uniformes** (donc disjointes), **aucun chevauchement
salle/salle ni salle/enfant n'est possible** (preuve inductive §12.3, revérifiée par l'invariant I3, §11).
C'est la correction du bloquant principal de la conception précédente.

### 2.2 Grille des enfants — `G`, `R`, `childCell`

Soit `C = |childDirs(d)|` (nombre de sous-dossiers directs non exclus).

```
G(C) = isqrtCeil(C)            # colonnes = plafond de la racine carrée entière de C
R(C) = ceilDiv(C, G(C))        # lignes
```

`isqrtCeil` et `ceilDiv` sont définis en arithmétique **entière** au §9.4. Si `C == 0`, alors `G = R = 0`
(pas de bande enfants). La grille compte `G·R ≥ C` cellules ; les `G·R − C` cellules excédentaires restent
**vides**. Aucune table `childGridTier` n'existe : `G` et `R` se calculent directement.

`childCell(d)` (mm) = côté **uniforme** d'une cellule enfant :

```
childCell(d) = max over c in childDirs(d) of  max( plotWidth(c), plotDepth(c) )     # 0 si C == 0
```

Les cellules étant uniformes et dimensionnées sur le plus grand plot enfant, tout plot enfant **rentre** dans
sa cellule (`plotWidth(c) ≤ childCell(d)` et `plotDepth(c) ≤ childCell(d)`), et les cellules ne se
chevauchent jamais.

### 2.3 Dimensions du plot (calcul ascendant, post-ordre)

Soit la chaîne de salles de `d` (§3), de dimensions carrées `S_k · cellSize` pour la salle `k` (`S_k` impair,
côté en cellules). On pose :

```
chainWidth(d) = Σ_k (S_k · cellSize)  +  (pageCount(d) − 1) · margin      # salles alignées sur x
chainDepth(d) = max_k (S_k · cellSize)                                    # profondeur de la bande salles
```

Puis :

```
plotWidth(d) = max( chainWidth(d), G(C) · childCell(d) )  +  2 · margin
plotDepth(d) = chainDepth(d)  +  margin  +  R(C) · childCell(d)  +  2 · margin
```

Le `+ 2·margin` de `plotWidth` = une marge à gauche + une à droite. Le `+ 2·margin` de `plotDepth` = la marge
du haut (avant les salles) + la marge du bas (après les enfants) ; le `+ margin` intercalé est le **couloir**
entre les deux bandes. Le plot contient donc trois marges verticales : haut, couloir, bas.

Toutes ces grandeurs sont **paires** (preuve : `cellSize` et `margin` sont pairs, `S_k` impair ⇒ `S_k·cellSize`
pair ; sommes, `max` et produits de pairs restent pairs). Les divisions par 2 employées au placement (§9) sont
donc **exactes**.

### 2.4 Schéma ASCII d'un plot

Convention d'axes vue du dessus (depuis `+y`) : `+x` vers la **droite**, `+z` vers le **bas**, donc `−z`
(« nord ») en **haut**. Exemple : `d` a une chaîne de 3 salles (`primary`, `annex1`, `annex2`) et 6
sous-dossiers (`G = 3`, `R = 2`).

```
  origin (min x, min z)          axe +x vers la droite, +z vers le bas (-z = nord = haut)
  +---------------------------- plotWidth -----------------------------+
  |                                                                    |   ^ margin (haut)
  |                            margin (haut)                           |   v
  |       +----------+    +----------+    +----------+                 |   . . . . . . . . .
  |       | primary  |----|  annex1  |----|  annex2  |                 |   chainDepth
  |       | (S0*cs)  | m  | (S1*cs)  | m  | (S2*cs)  |                 |   = max S_k*cs
  |       +----------+    +----------+    +----------+                 |   . . . . . . . . .
  |                            margin (couloir)                        |   margin (couloir)
  |    +--------+  +--------+  +--------+                               |   . . . . . . . . .
  |    | cell00 |  | cell01 |  | cell02 |   (ligne 0)                  |
  |    | child  |  | child  |  | child  |                             |   R * childCell
  |    +--------+  +--------+  +--------+                               |
  |    +--------+  +--------+  +--------+                              |
  |    | cell10 |  | cell11 |  | cell12 |   (ligne 1)                  |   . . . . . . . . .
  |    +--------+  +--------+  +--------+                               |   margin (bas)
  |                            margin (bas)                            |
  +--------------------------------------------------------------------+

  - chaine de salles : alignee sur x, centree, salles separees par « m » = margin
  - bande enfants    : grille G x R de cellules carrees de cote childCell, centree sur x
  - chaque cellule contient le plot (<= childCell x childCell) d'un sous-dossier, centre dans la cellule
```

Les deux bandes partagent le **même axe `x` central** (`xcenter = origin.x + plotWidth/2`). La bande salles
occupe un intervalle de `z` situé **au-dessus** (plus petit `z`) du couloir ; la bande enfants **en dessous**
(plus grand `z`). Aucune cellule enfant ne partage un `z` avec une salle.

---

## 3. Chaîne de salles et capacités

### 3.1 Un dossier = une chaîne linéaire de salles

Le rôle `group-hub` est **supprimé** du schéma. Le vocabulaire de rôle du layout v0 est **exactement** :

```ts
type SpatialRole = "hall" | "primary" | "annex";
```

Chaque dossier `d` non exclu se réalise en une **chaîne linéaire** de salles

```
primary(hall si racine)  →  annex1  →  annex2  →  …  →  annex_{pageCount-1}
```

reliée par des **portails de chaînage** (§4.4). Règles de rôle :

- salle `k = 0` : `role = "hall"` si `d.isRoot`, sinon `role = "primary"` ;
- salles `k ≥ 1` : `role = "annex"`, `page = k` ;
- **toutes** les salles de la chaîne partagent le **même `sourceNodeId`** (`d.id`) et la même `pageCount`
  (= longueur de la chaîne). Il existe **exactement un** `hall|primary` par dossier (FR-005 intact) ; les
  annexes n'inventent jamais d'identité de dossier.

### 3.2 Deux capacités par salle

Une salle est une grille intérieure de `S × S` **cellules** carrées de côté `cellSize` (`S` **impair**, §4).
Elle possède deux capacités distinctes :

- une capacité de **portes** : le nombre de créneaux de mur disponibles pour des portes **vers les
  sous-dossiers** ;
- une capacité de **fichiers** : le nombre de cellules libres où poser des `FileObject`.

Les **sous-dossiers** (triés par `path`) consomment des créneaux de porte ; les **fichiers** (triés par `path`)
consomment des cellules libres. Quand une salle est pleine — trop de portes **OU** trop de fichiers — on ouvre
une **annexe** et on y déverse le surplus. La chaîne se prolonge autant que nécessaire.

### 3.3 Fonction `doorCapacity(S)`

Les créneaux de mur d'une salle sont les cellules de **périmètre non-coin** : `4·(S − 2)` au total (§4.2).
Trois créneaux sont **réservés** (indices canoniques 0, 1, 2 ; §4.2) au portail vers le parent et aux deux
portails de chaînage (précédent / suivant). Les créneaux restants portent les portes vers les enfants :

```
doorCapacity(S) = 4·(S − 2) − 3
```

| `S` | créneaux totaux `4·(S−2)` | réservés | `doorCapacity(S)` |
|----:|--------------------------:|---------:|------------------:|
|   3 |  4 | 3 |  1 |
|   5 | 12 | 3 |  9 |
|   7 | 20 | 3 | 17 |
|   9 | 28 | 3 | 25 |
|  11 | 36 | 3 | 33 |

La réservation est **fixe** (toujours 3 créneaux, quels que soient l'usage réel du dossier), ce qui rend
`doorCapacity` une fonction **pure de `S`**, sans dépendance circulaire à la topologie de la chaîne. Une salle
qui n'utilise pas l'un de ses créneaux réservés (la racine n'a pas de parent ; la `primary` n'a pas de
précédent de chaîne) le **laisse simplement vide** : c'est un gaspillage borné et déterministe, assumé pour la
simplicité.

### 3.4 Fonction `fileCapacity(S, portals)`

La capacité de fichiers d'une salle est le **nombre exact de cellules libres** de sa grille, une fois les
portails placés :

```
fileCapacity(S, portals) = | computeFreeCells(S, portals) |            # §6.3
```

`computeFreeCells` (§6.3) retire de la grille `S × S` : (a) la cellule centrale, et (b) toute cellule dont
l'AABB élargie de `clearance` intersecte le segment `centre → seuil` d'un portail. `fileCapacity` **dépend
donc des portails effectivement placés** (paramètre `portals`), conformément au mandat : plus une salle porte
de portes, plus des lignes de vue traversent la grille, moins il reste de cellules pour les fichiers.

### 3.5 Choix de `S` : point fixe ascendant, débordement par annexe

Les paliers de côté sont la liste **ascendante d'entiers impairs** `roomSideTiers = [3, 5, 7, 9, 11]` (§10). Le
plus grand palier `S_max = 11` donne une salle de `11·cellSize = 44000 mm`, en deçà du plafond
`2·maxRoomHalfExtent = 96000 mm` (§7.4 du contrat) : le **plafond est donc respecté par construction** pour
tout palier, et c'est la capacité (portes/fichiers) qui déclenche l'annexe avant le plafond.

Pour remplir **une** salle à partir des files de portes et de fichiers restantes, on applique
`fillRoom` (§9.6) :

1. on **souhaite** placer toutes les portes restantes (`nDoors`) et tous les fichiers restants (`nFiles`) ;
2. on parcourt les paliers **par ordre croissant** ; pour le palier `S`, on place `min(nDoors, doorCapacity(S))`
   portes sur leurs créneaux (§4, §5), on calcule `computeFreeCells(S, portals)`, et on retient `S` **dès que**
   `doorCapacity(S) ≥ nDoors` **et** `fileCapacity(S, portals) ≥ nFiles` (les deux capacités satisfaites) ;
3. si **aucun** palier ne satisfait les deux (même `S_max`), on prend `S = S_max`, on place
   `dTake = min(nDoors, doorCapacity(S_max))` portes et `fTake = min(nFiles, fileCapacity(S_max, portals))`
   fichiers, et le **surplus part en annexe** (itération suivante de `buildChain`, §9.5).

Le mot « hystérésis » n'a **aucun** sens ici : `fillRoom` est une fonction pure de `(nDoors, nFiles, paths)`,
elle ne connaît pas le layout précédent. Ce sont de simples **paliers**. Ajouter un élément qui ne fait pas
franchir de palier ne change ni `S` ni la partition, donc ne déplace rien (stabilité, §5.4 et ADR-0003).

**Terminaison (une phrase, prouvée §12).** Chaque itération de `buildChain` place au moins un élément
(`dTake ≥ 1` dès qu'il reste une porte car `doorCapacity(3) = 1 ≥ 1` ; sinon `fTake ≥ 1` car une salle sans
porte enfant a au moins une cellule libre), et la première itération crée toujours la salle `primary` même si
les deux files sont vides ; les files étant finies, la chaîne est finie.

---

## 4. Créneaux de mur, murs et offsets

### 4.1 Murs, coin de référence et sens positif de `offset`

Chaque salle est carrée : `w = dimensions.x = S·cellSize`, `d = dimensions.z = S·cellSize`. Le repère est
**local au centre-sol** de la salle : `x ∈ [−w/2, +w/2]`, `z ∈ [−d/2, +d/2]`, centre en `(0, 0)`.

Les quatre murs sont nommés par leur **normale sortante** (§2.1 du contrat). `offset` (mm) est mesuré le long
du mur **depuis un coin de référence**, et **croît toujours dans le sens du parcours horaire** vu du dessus
(depuis `+y`) :

| mur | normale | plan du mur | coin de référence | sens de `offset` croissant |
|---|---|---|---|---|
| `north` | `−z` | `z = −d/2` | ouest (`x = −w/2`) | vers l'est, `+x` |
| `east`  | `+x` | `x = +w/2` | nord (`z = −d/2`)  | vers le sud, `+z` |
| `south` | `+z` | `z = +d/2` | est (`x = +w/2`)   | vers l'ouest, `−x` |
| `west`  | `−x` | `x = −w/2` | sud (`z = +d/2`)   | vers le nord, `−z` |

`wallRank` pour le tri canonique des portails (§2.4 du contrat) : `north = 0, east = 1, south = 2, west = 3`.

### 4.2 Créneaux de mur canoniques (`S` impair)

Les cellules de périmètre **non-coin** sont les créneaux. Chaque mur en compte `S − 2`, soit `4·(S − 2)` au
total. On énumère les créneaux dans l'**ordre canonique** : mur par `wallRank` croissant (north, east, south,
west), puis, à l'intérieur d'un mur, par **`offset` croissant**. Les cellules de la grille sont indexées
`(col, row)`, `col, row ∈ {0, …, S−1}` ; le milieu est `mid = (S − 1) / 2` (entier car `S` impair).

```
slotList(S) =
    [ north : (col=i, row=0)      pour i = 1, 2, …, S−2 ]          # offset croissant en +x
 ++ [ east  : (col=S−1, row=j)    pour j = 1, 2, …, S−2 ]          # offset croissant en +z
 ++ [ south : (col=i, row=S−1)    pour i = S−2, S−3, …, 1 ]        # offset croissant en −x
 ++ [ west  : (col=0, row=j)      pour j = S−2, S−3, …, 1 ]        # offset croissant en −z
```

`slotList(S)` a exactement `4·(S − 2)` entrées, d'index **global** `0 … 4·(S−2) − 1`.

**Créneaux réservés (indices fixes).** Toujours réservés, dans cet ordre :

- index `0` → portail **vers le parent** (utilisé par la `primary`/`hall` ; laissé vide si racine) ;
- index `1` → portail de **chaînage précédent** (utilisé par une `annex` ; laissé vide par la `primary`) ;
- index `2` → portail de **chaînage suivant** (utilisé si une salle suivante existe ; laissé vide sinon).

Les **portes vers les enfants** occupent les indices `3 … 4·(S−2) − 1`, soit `doorCapacity(S) = 4·(S−2) − 3`
créneaux, affectés par slotting de hachage (§5.2). Pour `S = 3` (un seul créneau par mur), les réservés
tombent naturellement sur north/east/south et l'unique porte enfant sur west.

### 4.3 Offset d'un créneau, puis seuil 2D

Soit `cellSize = W`. L'`offset` (position du **centre** de la porte le long du mur, depuis le coin de
référence) pour un créneau, en fonction de son indice `i`/`j` de `slotList` :

```
offset(north, col=i)  = i·W + W/2
offset(east,  row=j)  = j·W + W/2
offset(south, col=i)  = (S−1−i)·W + W/2
offset(west,  row=j)  = (S−1−j)·W + W/2
```

`W` étant pair, `W/2` est entier ; tous les offsets sont entiers. Le **seuil 2D** `threshold(wall, offset)` —
point de la porte sur le mur, cible du segment de visibilité — se calcule **uniquement** à partir de
`(wall, offset, w, d)` :

```
thresholdPoint(wall, offset, w, d):
    north:  (tx, tz) = ( −w/2 + offset ,  −d/2         )
    east :  (tx, tz) = ( +w/2         ,  −d/2 + offset )
    south:  (tx, tz) = ( +w/2 − offset,  +d/2         )
    west :  (tx, tz) = ( −w/2         ,  +d/2 − offset )
```

Toutes les composantes sont entières (`w/2`, `d/2`, `offset` entiers). Vérification (north, `col = i`) :
`−w/2 + offset = −S·W/2 + i·W + W/2 = (i − mid)·W`, qui est exactement l'abscisse du centre de la cellule
`(i, 0)`, sur le mur nord `z = −d/2`. Cohérent.

### 4.4 Portails de chaînage et portails parent/enfant

- **Chaînage** (salle `k` ↔ salle `k+1`) : portail dans la salle `k` sur son créneau réservé **2** (suivant),
  portail réciproque dans la salle `k+1` sur son créneau réservé **1** (précédent). `kind = "door"` (même
  `level`, §7).
- **Parent/enfant** : le sous-dossier `c` reçoit sa porte dans **une** salle précise de la chaîne du parent
  (celle qui porte sa porte, décidée par `buildChain`, §9.5), sur un créneau enfant (index `≥ 3`). Le portail
  réciproque est dans la `primary` de `c` sur son créneau réservé **0** (parent). `kind` selon les `level`
  (§7 : `stair` si niveaux différents, `door` sinon).

Chaque connexion crée donc **deux** portails (réciprocité §3.7.2 du contrat), avec des `id` dérivés de
`(fromSpatialNodeId, toSpatialNodeId, kind)` (§3.7 du contrat). Les `width`/`height` des portes sont des
constantes (`doorWidth`, `doorHeight`, §10) ; `doorWidth ≤ cellSize` garantit que la porte tient dans son
créneau.

---

## 5. Slotting déterministe

### 5.1 `hash32(path)`

Le layout n'utilise **aucun** flux PRNG séquentiel : tout le placement dérive d'un **hachage du `path`**. On
définit un mot 32 bits par chemin, avec séparation de domaine (octet `0x02`, distinct des octets `0x00`/`0x01`
du §5.3 du contrat) et dépendance à la seule graine `seed = config.layoutSeed` (constante de corpus, stable
entre commits, ADR-0003) :

```
hash32(path) = readUint32BE( sha256( utf8(seed) ++ [0x02] ++ utf8(normalizePath(path)) )[0..4] )
```

`sha256`, `normalizePath` et `readUint32BE` sont ceux du contrat (§4.1, §5.1, §5.3). `hash32` est **pur** et
identique bit à bit entre moteurs.

### 5.2 Règle unique de slotting (`slotInto`)

Une **seule** règle sert au placement des **cellules de fichier**, des **créneaux de porte d'enfant** et des
**cellules de la grille d'enfants** :

```
slotInto(candidates, m):
    # candidates : liste d'objets porteurs d'un `path` — DÉJÀ triés par path CROISSANT (code-unit UTF-16)
    # m          : nombre de créneaux (modulus). Pré-condition : |candidates| ≤ m.
    occupied = tableau de m booléens, tous false
    result   = map candidate → indice de créneau
    for cand in candidates:            # dans l'ordre de tri
        slot = hash32(cand.path) mod m
        while occupied[slot] is true:
            slot = (slot + 1) mod m     # sondage linéaire
        occupied[slot] = true
        result[cand] = slot
    return result
```

Points normatifs :

- **Le tri par `path` croissant est la seule cause d'indépendance à l'ordre d'entrée.** `computeLayout` trie
  toujours `childDirs` et `files` par `path` avant d'appeler `slotInto`. Sans ce tri, le résultat serait
  ambigu ; avec lui, il est unique.
- **L'occupant en place ne bouge JAMAIS.** En cas de collision, c'est le **nouveau** candidat (rencontré plus
  tard dans l'ordre de tri) qui sonde. Toute formulation « le plus petit chemin gagne le créneau » est
  **bannie** : avec le tri croissant, le plus petit chemin est traité en premier et occupe son créneau initial ;
  la règle serait redondante, et sans le tri elle serait ambiguë.
- `mod` est le **reste entier** (`slot0 = hash32 mod m`), sans échantillonnage par rejet. Le léger biais de
  modulo est sans effet sur la validité (tout créneau finit occupé de façon déterministe).

### 5.3 Où `slotInto` est appliqué

| Usage | `candidates` | `m` (modulus) | Créneaux cibles |
|---|---|---|---|
| Portes d'enfant d'une salle | sous-dossiers assignés à la salle, triés par `path` | `doorCapacity(S)` | créneaux `slotList(S)` d'index `3 … 4·(S−2)−1` |
| Cellules de fichier d'une salle | fichiers assignés à la salle, triés par `path` | `\| freeCells \|` | `freeCells` en ordre canonique (§6.3) |
| Cellules de la grille d'enfants | sous-dossiers de `d`, triés par `path` | `G·R` | cellules `(col, row)` en ordre **row-major** (§9.7) |

Chaque usage a **son propre** modulus et **son propre** ensemble de candidats ; les trois slottings sont
indépendants (un sous-dossier reçoit à la fois un créneau de porte, par `hash32 mod doorCapacity`, **et** une
cellule de grille, par `hash32 mod (G·R)` : deux calculs séparés, tous deux déterministes).

### 5.4 Portée réelle de la stabilité (ADR-0003)

Les positions sont stables **tant qu'aucun palier n'est franchi** :

- ajouter/retirer un fichier ou un sous-dossier qui ne change **ni** le `S` d'aucune salle **ni** la partition
  de la chaîne laisse **inchangées** toutes les autres positions (le nouvel élément réclame un créneau libre ;
  l'occupant en place ne bouge pas) ;
- **franchir un palier** (le `S` d'une salle change, ou la partition de la chaîne change) **redimensionne cette
  salle** et **rehash SES objets à elle** (nouveau modulus). Aucune **autre** salle n'est déplacée : la position
  d'une salle dépend du hachage des `path` de son sous-arbre et de la structure de son parent, pas d'un index
  global ;
- renommer/déplacer un dossier change son `path`, donc son `id` **et** sa position : l'ancrage n'est garanti
  que sous identité de `path` (limite documentée, ADR-0003, table d'alias reportée après v0).

---

## 6. Placement des fichiers et visibilité par construction

### 6.1 Ordre d'exécution imposé (par salle)

L'invariant « aucun objet n'occulte une porte depuis le centre » (PRD §9.4) est garanti **par construction**,
sans aucune boucle de réparation. Il n'existe **pas** de fonction `repairVisibility`. Ordre imposé, par salle :

1. **Fixer `S`** (§3.5, via `fillRoom`).
2. **Placer TOUS les portails** de la salle sur leurs créneaux de mur canoniques : les 3 réservés
   (indices 0, 1, 2) **et** les portes d'enfant (slotting §5.2). Chaque portail a un seuil 2D
   `thresholdPoint` (§4.3).
3. **Calculer `blockedCells`** = ensemble des cellules dont l'AABB, **élargie de `clearance`**, intersecte au
   moins un segment 2D `centre (0,0) → seuil d'un portail`. On inclut **tous** les portails, y compris les 3
   réservés même laissés vides : `blockedCells` ne dépend ainsi que de `(S, portails placés)`, pas de la
   topologie de la chaîne.
4. **`freeCells`** = `{ toutes les cellules } \ ( blockedCells ∪ { cellule centrale } )`, énumérées dans
   l'**ordre canonique row-major** : `row` croissant, puis `col` croissant.
5. **Placer les fichiers UNIQUEMENT dans `freeCells`** (slotting §5.2, modulus `|freeCells|`).

Comme aucun fichier n'occupe une cellule de `blockedCells`, et que l'emprise `footprint` d'un objet est
strictement contenue dans l'AABB de sa cellule élargie de `clearance` (contrainte `max(x,z) + clearance ≤
cellSize`, §8.3), **aucune emprise ne peut intersecter un segment `centre → seuil`**. L'invariant est donc vrai
par construction. Le test §11 le **revérifie** sur l'artefact (défense en profondeur).

### 6.2 `clearance`

`clearance = 1000 mm` (§10). C'est à la fois (a) la marge d'élargissement des cellules dans le calcul de
`blockedCells`, et (b) le dégagement imposé aux emprises d'objets : toute `KIND_FOOTPRINT` vérifie
`max(x, z) + clearance ≤ cellSize` (§8.3). Cette égalité de constante garantit l'inclusion `footprint ⊂ cellule
élargie` invoquée ci-dessus.

### 6.3 `computeFreeCells(S, portals)`

```
computeFreeCells(S, portals):
    W   = cellSize
    mid = (S − 1) / 2
    g   = clearance
    w   = S · W ;  d = S · W                         # dimensions de la salle
    thresholds = [ thresholdPoint(p.wall, p.offset, w, d) for p in portals ]
    free = []                                        # liste ordonnée
    for row in 0 … S−1:                              # ordre canonique : row croissant …
        for col in 0 … S−1:                          # … puis col croissant (row-major)
            if col == mid and row == mid: continue   # cellule centrale exclue
            cx = (col − mid) · W                      # centre de cellule, coord LOCALE
            cz = (row − mid) · W
            xmin = cx − W/2 − g ;  xmax = cx + W/2 + g
            zmin = cz − W/2 − g ;  zmax = cz + W/2 + g
            blocked = false
            for (tx, tz) in thresholds:
                if segmentIntersectsAABB(tx, tz, xmin, xmax, zmin, zmax):
                    blocked = true ; break
            if not blocked:
                free.append( { col, row } )
    return free                                      # ordre row-major préservé
```

### 6.4 Test d'intersection segment × AABB, en arithmétique ENTIÈRE

Le segment part **toujours** du centre `P = (0, 0)` et va au seuil `T = (tx, tz)`. La boîte est l'AABB
`[xmin, xmax] × [zmin, zmax]`. Le test est un **axe séparateur (SAT)** sur trois axes : les deux axes de la
boîte, plus la normale au segment. **Aucun flottant, aucune division, aucune trigonométrie** — uniquement des
produits croisés entiers.

```
segmentIntersectsAABB(tx, tz, xmin, xmax, zmin, zmax):   # segment P=(0,0) → T=(tx,tz)

    # Axe 1 — projection sur x : les intervalles [min(0,tx), max(0,tx)] et [xmin,xmax] doivent se chevaucher
    if max(0, tx) < xmin: return false
    if min(0, tx) > xmax: return false

    # Axe 2 — projection sur z
    if max(0, tz) < zmin: return false
    if min(0, tz) > zmax: return false

    # Axe 3 — normale au segment. Pour un point (px,pz), le côté est le produit croisé
    #   side(px,pz) = D × (point − P) = tx·pz − tz·px      (D = direction du segment = (tx,tz))
    # On évalue le signe aux 4 coins de la boîte (P étant l'origine, point − P = point) :
    s1 = tx·zmin − tz·xmin        # coin (xmin, zmin)
    s2 = tx·zmin − tz·xmax        # coin (xmax, zmin)
    s3 = tx·zmax − tz·xmin        # coin (xmin, zmax)
    s4 = tx·zmax − tz·xmax        # coin (xmax, zmax)
    if s1 > 0 and s2 > 0 and s3 > 0 and s4 > 0: return false   # tous strictement d'un côté
    if s1 < 0 and s2 < 0 and s3 < 0 and s4 < 0: return false   # tous strictement de l'autre côté

    return true    # aucun axe séparateur → le segment intersecte la boîte
```

Propriétés :

- **Entièrement entier.** `tx, tz` et les bornes de boîte sont des entiers de mm bornés par la taille d'une
  salle (`≤ S·W/2 + g ≤ 22000 + 1000`). Les produits croisés `tx·zmax − tz·xmax` restent `< 6·10⁸`, très en
  deçà de `Number.MAX_SAFE_INTEGER (≈ 9·10¹⁵)`. Aucun débordement.
- **Conservateur aux bords.** Les comparaisons d'axes utilisent `<` / `>` stricts pour *séparer* : un contact
  exact (`==`) **ne sépare pas** et compte donc comme intersection. De même un coin sur la ligne (`side == 0`)
  empêche le rejet. On bloque donc les cas limites — ce qui va dans le sens de la sûreté de visibilité.
- **Correction du test « segment » (et non « droite infinie »).** Les axes 1 et 2 bornent le segment à sa boîte
  englobante ; l'axe 3 vérifie que la droite support traverse la boîte. Les trois réunis caractérisent
  exactement l'intersection **segment × AABB** en 2D (SAT sur convexes : boîte = 2 normales, segment = 1
  normale).

### 6.5 `blockedCells` et l'invariant de visibilité

`blockedCells(S, portals) = { (col, row) : ∃ seuil T, segmentIntersectsAABB(T, AABB_élargie(col,row)) }`. Le
créneau de porte lui-même est toujours dans `blockedCells` (le segment `centre → seuil` traverse la cellule de
périmètre qui porte la porte), si bien qu'aucun fichier ne s'y pose : les cellules de fichier et les créneaux
de porte sont **disjoints par construction**, sans règle supplémentaire.

---

## 7. Profondeur et niveaux

L'imbrication géométrique en **XZ continue sans limite** : un dossier profond garde sa zone à sa place
naturelle, dans la bande enfants de son parent (FR-005). Seule la profondeur de **rendu** est plafonnée, ce qui
n'affecte **que** la coordonnée `y`.

Pour un dossier `d` de profondeur source `d.depth` (jamais plafonnée) :

```
level          = min( d.depth, maxRenderDepth )        # maxRenderDepth = 20 (§10)
position.y     = level · floorHeight                   # toutes les salles de la chaîne de d partagent ce y
depthFlattened = ( d.depth > maxRenderDepth )          # true si le plafond de rendu est dépassé
```

Toutes les salles d'une même chaîne (donc d'un même `d`) partagent le même `level`, le même `position.y` et le
même `depthFlattened`. La géométrie XZ (positions `x`, `z`) reste calculée par la récursion en bandes (§9.7),
même au-delà du plafond : deux dossiers de `depth > maxRenderDepth` restent à des positions XZ distinctes
(plots imbriqués disjoints), donc ne se superposent pas malgré un `y` identique. **Aucun mécanisme de
rattachement à un ancêtre n'existe** : pas d'ascenseur synthétique, pas de repli en liste.

`PortalKind` d'une connexion (§4.4), en fonction des `level` des deux salles reliées :

```
kind = (level(A) ≠ level(B)) ? "stair" : "door"
```

- **Chaînage** (salles d'un même dossier) : même `level` ⇒ toujours `"door"`.
- **Parent → enfant** avec `level(parent) < maxRenderDepth` : `level(enfant) = level(parent) + 1` ⇒ `"stair"`.
- **Parent → enfant** au-delà du plafond (`level(parent) = level(enfant) = maxRenderDepth`) : `"door"`.

Les `PortalKind` `"elevator"` et `"portal"` restent **réservés** : ils ne sont **jamais** produits en v0
(aucune branche du pseudo-code ne les émet). La validation Zod les accepte pour la compatibilité future, mais
un artefact v0 n'en contient aucun (invariant testé §11).

---

## 8. Tables complètes

Ces tables entrent dans les octets de l'artefact (FR-026). Elles sont **exhaustives** : aucune valeur
approximative, aucun « p. ex. », aucun « ~ ».

### 8.1 `roleOfFile(name)` — cascade ordonnée et exhaustive

`roleOfFile` associe à un nom de fichier un **rôle de fichier** `FileRole` :

```ts
type FileRole = "readme" | "doc" | "test" | "config" | "code" | "generic";
```

**Casse.** L'évaluation est **insensible à la casse ASCII uniquement** : on travaille sur
`lower = asciiLower(name)`. On n'emploie **jamais** `String.prototype.toLowerCase`, dont le case-mapping dépend
de la **version Unicode** du moteur — même aléa que `String.normalize` (couvert par `analyzerVersion`, §4.1 du
contrat) et que la trigonométrie bannie (§1.2, ADR-0003). Un nom à lettre casée **non-ASCII** (`İ`, `ẞ`, `Σ`…)
pourrait sinon donner des octets différents entre Node et le navigateur, contredisant §1.2 (« même sortie octet
pour octet »). Comme **tous** nos jetons de comparaison (extensions, noms spéciaux du tableau ci-dessous) sont
**ASCII**, `asciiLower` suffit et reste déterministe bit à bit :

```
asciiLower(s):                                  # abaissement ASCII pur, sans dépendance Unicode
    out = ""
    for each code-unit u of s:                  # itération sur les code-units UTF-16 de s
        out += codeUnitToChar( (0x41 ≤ u and u ≤ 0x5A) ? (u + 0x20) : u )   # A..Z → a..z ; sinon inchangé
    return out
```

`asciiLower` ne transforme **que** les code-units `U+0041 … U+005A` (en ajoutant `0x20`) et laisse **tout autre
code-unit inchangé**. L'**extension** est `ext =` la sous-chaîne après le **dernier** `.` de `lower`, ou `""`
s'il n'y a pas de `.`.

**Ordre d'évaluation** (la **première** règle satisfaite gagne ; la dernière est un défaut total) :

| # | Condition (sur `lower` / `ext`) | `FileRole` |
|--:|---|---|
| 1 | `lower === "readme"` **ou** `lower` commence par `"readme."` | `readme` |
| 2 | `ext ∈ { md, mdx, markdown, rst, adoc, txt }` | `doc` |
| 3 | `lower` contient `".test."` **ou** `".spec."` | `test` |
| 4 | `ext ∈ { json, yaml, yml, toml, ini, env, cfg, conf, xml, lock, properties }` **ou** `lower ∈ { .gitignore, .npmrc, .editorconfig, dockerfile, makefile }` | `config` |
| 5 | `ext ∈ { ts, tsx, js, jsx, mjs, cjs, py, rb, go, rs, java, kt, scala, c, h, cpp, hpp, cc, cs, php, swift, sh, bash }` | `code` |
| 6 | *(défaut)* | `generic` |

L'ordre est **normatif** : la règle 1 (readme) prime sur la 2 (`README.md` → `readme`, pas `doc`) ; la 3 (test)
prime sur 4/5 (`foo.test.ts` → `test`, pas `code`). Les ensembles d'extensions sont des **littéraux fermés** ;
un `ext` hors de tous les ensembles retombe sur `generic`.

### 8.2 `OBJECT_OF(theme, role)` — table complète 3 thèmes × 6 rôles

`ObjectKind` (§13.3 du contrat) :

```ts
type ObjectKind =
  | "file-generic" | "file-code" | "file-config" | "file-doc" | "file-test"
  | "readme-stand" | "console";
```

Thèmes v0 (§13.2 du contrat, `THEME_OF` inchangé : `root → project-hall` ; `controller`,`route` →
`control-room` ; tout le reste → `neutral`). Table `OBJECT_OF[theme][role]`, **totale** :

| `role` \ `theme` | `project-hall` | `control-room` | `neutral` |
|---|---|---|---|
| `readme`  | `readme-stand` | `readme-stand` | `readme-stand` |
| `doc`     | `file-doc`     | `file-doc`     | `file-doc`     |
| `test`    | `file-test`    | `file-test`    | `file-test`    |
| `config`  | `file-config`  | `console`      | `file-config`  |
| `code`    | `file-code`    | `console`      | `file-code`    |
| `generic` | `file-generic` | `file-generic` | `file-generic` |

Aucune case vide : les 18 combinaisons sont définies. Dans `control-room` (salle de contrôle), `code` et
`config` deviennent des `console` ; ailleurs, les rôles se mappent sur leurs objets `file-*` homonymes.

### 8.3 `KIND_FOOTPRINT` — emprise au sol, valeurs entières

Table `ObjectKind → { x, z }` en mm, **entiers**, aucune approximation. Contrainte respectée pour chaque
entrée : `max(x, z) + clearance ≤ cellSize`, soit `max(x, z) ≤ 4000 − 1000 = 3000`, **quelle que soit
l'orientation** (les deux composantes `≤ 3000`, donc l'objet tourné de 90° tient aussi).

| `ObjectKind` | `x` | `z` | `max(x,z)` | `+ clearance ≤ cellSize` |
|---|---:|---:|---:|---|
| `file-generic` | 2000 | 2000 | 2000 | 3000 ≤ 4000 ✅ |
| `file-code`    | 2000 | 2000 | 2000 | 3000 ≤ 4000 ✅ |
| `file-config`  | 2000 | 2000 | 2000 | 3000 ≤ 4000 ✅ |
| `file-doc`     | 2000 | 2000 | 2000 | 3000 ≤ 4000 ✅ |
| `file-test`    | 2000 | 2000 | 2000 | 3000 ≤ 4000 ✅ |
| `readme-stand` | 3000 | 1500 | 3000 | 4000 ≤ 4000 ✅ |
| `console`      | 3000 | 1500 | 3000 | 4000 ≤ 4000 ✅ |

Les 7 `ObjectKind` sont couverts. Le producteur **copie** l'emprise dans `FileObject.footprint` ; un test
assert `footprint === KIND_FOOTPRINT[kind]` (§11).

`footprint` est l'emprise en **repère modèle** (avant rotation), identique à la valeur de table quelle que soit
l'orientation. L'AABB au sol **physique** s'obtient en appliquant `orientation` (§8.5), qui **transpose** `x`/`z`
pour les orientations `1`/`3` (quart de tour est/ouest). Cette transposition ne concerne **que** le test de
visibilité I2 (§11), qui doit refléter la géométrie rendue ; elle ne change **pas** la valeur stockée. L'invariant
I9 reste donc formulé sur la valeur de table : `footprint === KIND_FOOTPRINT[kind]` (égalité de table, non-AABB)
et `max(footprint.x, footprint.z) + clearance ≤ cellSize` (le `max` est **symétrique**, donc invariant par
transposition) — I9 n'a besoin d'aucun ajustement d'orientation, à la différence de I2.

### 8.4 `pickSpaceType(d)` — fonction déterministe totale

`SpaceType` produit en v0 : `hall | room | plaza | gallery` (§3.7 du contrat). Soient `C = |childDirs(d)|` et
`F = |files(d)|`. Fonction **totale**, évaluée dans l'ordre :

```
pickSpaceType(d):
    if d.isRoot:                         return "hall"      # une seule salle "hall" dans le monde (racine)
    if C ≥ plazaThreshold:               return "plaza"     # beaucoup de sous-dossiers (PRD §10.2)
    if F ≥ galleryThreshold:             return "gallery"   # beaucoup de fichiers similaires
    return "room"
```

`plazaThreshold = 8`, `galleryThreshold = 12` (§10). L'ordre est normatif : la racine est toujours `hall` ; le
critère sous-dossiers (`plaza`) prime sur le critère fichiers (`gallery`).

**Annexes.** Une annexe n'est **jamais** laissée implicite : `spaceType(annex) = "gallery"`. C'est une règle
fixe (les annexes sont des pages de débordement, métaphore galerie/rayonnage du PRD §10.2), qui garantit en
outre qu'aucune annexe ne porte `"hall"` (le `hall` reste unique, FR-005). La `primary`/`hall` (page 0) reçoit
`pickSpaceType(d)`.

### 8.5 `orientation(cell, S)` — l'objet fait face au centre

Un `FileObject` **fait face au centre** de sa salle. Soit sa cellule `(col, row)`, de centre local
`cx = (col − mid)·cellSize`, `cz = (row − mid)·cellSize` (`mid = (S−1)/2`). L'`Orientation ∈ {0,1,2,3}` (§2.1
du contrat : `0` face `−z` nord, `1` face `+x` est, `2` face `+z` sud, `3` face `−x` ouest, quarts de tour
horaires) est celle dont la direction s'aligne le mieux avec le vecteur `objet → centre = (−cx, −cz)` :

```
orientation(col, row, S):
    cx = (col − mid) · cellSize ;  cz = (row − mid) · cellSize
    if abs(cz) ≥ abs(cx):                      # axe z dominant (l'ÉGALITÉ va au z : règle de diagonale)
        return (cz > 0) ? 0 : 2                # objet au sud (cz>0) → face nord (0) ; au nord → face sud (2)
    else:                                      # axe x dominant
        return (cx > 0) ? 3 : 1                # objet à l'est (cx>0) → face ouest (3) ; à l'ouest → face est (1)
```

**Rupture d'égalité (diagonale).** Quand `abs(cx) == abs(cz)` (objet sur une diagonale du centre), la condition
`abs(cz) ≥ abs(cx)` tranche en faveur de l'**axe z** : orientation `0` ou `2`. Le cas `cx == 0 && cz == 0` est
impossible (la cellule centrale est exclue de `freeCells`, §6.3), donc `orientation` est bien définie pour
toute cellule de fichier. `abs` est la valeur absolue entière (§9.4).

---

## 9. Pseudo-code intégral

Toute fonction appelée ci-dessous est définie **dans ce document**. Les primitives externes se limitent à
`sha256`, `base32` (contrat §4, §5) et `normalizePath` (contrat §4.1). `THEME_OF` est la table du contrat
§13.2 : une association `Category → ThemeId` dont la **valeur est une chaîne** `ThemeId`, jamais un objet
(`root → "project-hall"` ; `controller`,`route` → `"control-room"` ; **tout autre cas, y compris la clé de
repli `"unknown"` → `"neutral"`**). Elle est donc **totale** sur son domaine élargi et `THEME_OF[…]` s'utilise
directement, sans accès `.theme`.

### 9.1 Orchestration `computeLayout`

```
computeLayout(tree, classifications, seed, options):
    rooms = []                                # accumulateur global de SpatialNode (émis par emitRoom)

    # ── Passe 1 : dimensionnement ascendant (post-ordre) ──
    sizePass(tree.root)

    # ── Passe 2 : placement descendant ──
    placePass(tree.root,
              originX  = − plotWidth(tree.root) / 2,       # monde centré sur (0,0)
              originZ  = − plotDepth(tree.root) / 2,
              level    = 0,
              parentLink = none)

    # ── Passe 3 : tri canonique intra-nœud puis émission ──
    for node in rooms:
        node.portals = sort(node.portals, by = (wallRank(p.wall), p.offset))
        node.objects = sort(node.objects, by = p.sourceNodeId)            # code-unit UTF-16
    layout = {
        layoutVersion:     LAYOUT_VERSION,
        seed:              seed,
        normalSpeed:       options.normalSpeed,
        maxRoomHalfExtent: options.maxRoomHalfExtent,
        spatialNodes:      sort(rooms, by = node.id),                     # code-unit UTF-16
    }
    assertLayoutInvariants(layout, tree)      # garde de pipeline (§11) ; `tree` fournit depth/racine/fichiers
    return layout

wallRank(wall):  north→0, east→1, south→2, west→3
```

### 9.2 Identifiants (rappel du contrat §3.7, réutilisés tels quels)

Les identifiants spatiaux emploient **exactement** l'`idHash` du contrat §4.2 — même sha256, même base32 RFC 4648 minuscule sans padding, et surtout **même `idHashLength`** (défaut 16 caractères, configurable dans `[8, 32]`). La longueur des identifiants est uniforme dans un artefact donné : `n_`, `s_` et `p_` la partagent.

```
roomId(sourceNodeId, role, page) = "s_" + idHash( sourceNodeId + "|" + role + "|" + page )
portalId(fromId, toId, kind)     = "p_" + idHash( fromId + "->" + toId + "|" + kind )
```

Ne recode pas la découpe en dur à 16 caractères : `idHash` la lit dans `config.idHashLength`.

### 9.3 `hash32` et `slotInto` (rappels des §5.1 et §5.2)

```
hash32(path) = readUint32BE( sha256( utf8(seed) ++ [0x02] ++ utf8(normalizePath(path)) )[0..4] )

slotInto(candidatesSortedByPath, m):          # |candidates| ≤ m ; retourne map candidate → indice 0..m−1
    occupied = [false] * m ; result = {}
    for cand in candidatesSortedByPath:
        slot = hash32(cand.path) mod m
        while occupied[slot]: slot = (slot + 1) mod m
        occupied[slot] = true ; result[cand] = slot
    return result
```

### 9.4 Arithmétique entière (aucun flottant, aucune division inexacte)

```
min(a,b) = (a < b) ? a : b
max(a,b) = (a > b) ? a : b
abs(a)   = (a < 0) ? −a : a
div(a,b) = quotient entier de a par b (a ≥ 0, b > 0 ; troncature vers 0)
ceilDiv(a,b) = (a == 0) ? 0 : div(a + b − 1, b)

isqrtFloor(n):                                # plus grand k avec k·k ≤ n  (n ≥ 0)
    if n < 2: return n
    x = n ; y = div(x + 1, 2)
    while y < x: x = y ; y = div(x + div(n, x), 2)
    return x
isqrtCeil(n):                                 # plus petit k avec k·k ≥ n
    if n == 0: return 0
    r = isqrtFloor(n) ; return (r·r == n) ? r : r + 1
```

Toutes les divisions par 2 employées au placement (`plotWidth/2`, `plotDepth/2`, `chainWidth/2`,
`chainDepth/2`, `(G·childCell)/2`, `(cc − plotWidth(c))/2`, `(cc − plotDepth(c))/2`, `Wk/2`, `W/2`,
`dimensions.x/2`, `dimensions.z/2`, `doorWidth/2`) portent **toujours sur des quantités paires** (§2.3) : ce
sont des divisions **exactes**, jamais des troncatures.

### 9.5 Passe 1 — dimensionnement ascendant `sizePass`

```
sizePass(d):
    for c in d.childDirs: sizePass(c)                  # post-ordre : enfants dimensionnés d'abord
    d.chain      = buildChain(d)                        # §9.6
    d.pageCount  = |d.chain|
    C            = |d.childDirs|
    d.G          = isqrtCeil(C)
    d.R          = ceilDiv(C, d.G)                       # 0 si C == 0
    d.childCell  = (C == 0) ? 0
                            : max over c in d.childDirs of max( plotWidth(c), plotDepth(c) )
    d.chainWidth = Σ_{k} ( d.chain[k].S · cellSize )  +  (d.pageCount − 1) · margin
    d.chainDepth = max_{k} ( d.chain[k].S · cellSize )
    d.plotWidth  = max( d.chainWidth, d.G · d.childCell )  +  2 · margin
    d.plotDepth  = d.chainDepth  +  margin  +  d.R · d.childCell  +  2 · margin
```

`plotWidth(x)`, `plotDepth(x)`, `pageCount(x)`, `chainWidth(x)`, `chainDepth(x)`, `childCell(x)` désignent les
champs mémorisés sur `x` par `sizePass`.

### 9.6 Chaîne de salles `buildChain`

```
buildChain(d):
    doorQ = sortByPath(d.childDirs)                     # par path croissant (code-unit UTF-16)
    fileQ = sortByPath(d.files)
    chain = []
    repeat:
        (S, dTake, fTake, free, childSlot) = fillRoom(doorQ, fileQ)          # §9.7
        doorsHere = doorQ[0 : dTake]
        filesHere = fileQ[0 : fTake]
        fileSlot  = slotInto(filesHere, |free|)                             # fichier → indice dans free
        room = {
            S: S,
            childrenHere: [ { child: c, slotIndex: childSlot[c] } for c in doorsHere ],
            filesHere:    [ { file: f, cell: free[ fileSlot[f] ] } for f in filesHere ],
        }
        chain.append(room)
        doorQ = doorQ[dTake :] ; fileQ = fileQ[fTake :]
    until (doorQ is empty) and (fileQ is empty) and (|chain| ≥ 1)
    return chain
```

### 9.7 Remplissage d'une salle `fillRoom`

```
fillRoom(doorQ, fileQ):
    nDoors = |doorQ| ; nFiles = |fileQ|
    for S in roomSideTiers:                              # [3,5,7,9,11], ordre croissant
        dCap  = doorCapacity(S)                          # = 4·(S−2) − 3
        dTake = min(nDoors, dCap)
        (portals, childSlot) = placeCanonicalPortals(S, doorQ[0 : dTake])   # §9.8
        free  = computeFreeCells(S, portals)                               # §6.3
        if (dTake == nDoors) and (|free| ≥ nFiles):
            return (S, nDoors, nFiles, free, childSlot)                     # tout tient → plus petit S
    # aucun palier ne tient tout : on prend S_max et on déborde en annexe
    S     = last(roomSideTiers)                          # 11
    dCap  = doorCapacity(S) ; dTake = min(nDoors, dCap)
    (portals, childSlot) = placeCanonicalPortals(S, doorQ[0 : dTake])
    free  = computeFreeCells(S, portals)
    fTake = min(nFiles, |free|)
    return (S, dTake, fTake, free, childSlot)
```

### 9.8 Placement canonique des portails `placeCanonicalPortals`

```
placeCanonicalPortals(S, doorsHere):                    # doorsHere : sous-dossiers, triés par path
    slots = slotList(S)                                 # §4.2, |slots| = 4·(S−2)
    m     = doorCapacity(S)                             # = |slots| − 3
    childLocal = slotInto(doorsHere, m)                # child → indice 0..m−1 parmi créneaux enfant
    childSlot  = {}                                     # child → indice GLOBAL dans slots
    for c in doorsHere: childSlot[c] = 3 + childLocal[c]

    w = S · cellSize ; d = S · cellSize
    globalIdx = [0, 1, 2] ++ [ childSlot[c] for c in doorsHere ]     # 3 réservés + portes enfant
    portals = []
    for idx in globalIdx:
        (wall, offset) = slotWallOffset(slots[idx], S)
        portals.append( { wall: wall, offset: offset } )
    return (portals, childSlot)
```

`computeFreeCells` (§6.3) recalcule le seuil de chaque portail via `thresholdPoint(p.wall, p.offset, w, d)`.
Les 3 créneaux réservés sont **toujours** inclus, même si le portail correspondant reste vide, afin que `free`
ne dépende que de `(S, doorsHere)`.

### 9.9 Géométrie d'un créneau `slotWallOffset`

```
slotList(S):                                            # ordre canonique (§4.2)
    N = [ { wall:"north", col:i,   row:0   } for i in 1 … S−2 ]
    E = [ { wall:"east",  col:S−1, row:j   } for j in 1 … S−2 ]
    So= [ { wall:"south", col:i,   row:S−1 } for i in S−2 … 1 ]      # i décroissant
    Wst=[ { wall:"west",  col:0,   row:j   } for j in S−2 … 1 ]      # j décroissant
    return N ++ E ++ So ++ Wst

slotWallOffset(slot, S):                                # → (wall, offset), offset entier (§4.3)
    W = cellSize
    switch slot.wall:
        "north": return ("north", slot.col · W + W/2)
        "east" : return ("east",  slot.row · W + W/2)
        "south": return ("south", (S − 1 − slot.col) · W + W/2)
        "west" : return ("west",  (S − 1 − slot.row) · W + W/2)
```

### 9.10 Passe 2 — placement descendant `placePass`

```
placePass(d, originX, originZ, level, parentLink):     # originX/originZ = coin (min x, min z) du plot de d
    pw = plotWidth(d) ; pd = plotDepth(d)
    xcenter     = originX + pw / 2
    roomsBandZc = originZ + margin + chainDepth(d) / 2  # z du centre des salles (bande alignée sur x)
    childBandZ0 = originZ + margin + chainDepth(d) + margin

    # ── émission de la chaîne, salles alignées sur x, centrées ──
    roomNodes = []
    xcursor = xcenter − chainWidth(d) / 2
    for k in 0 … pageCount(d) − 1:
        room = d.chain[k]
        Wk   = room.S · cellSize
        cx   = xcursor + Wk / 2
        node = emitRoom(d, k, { x: cx, y: level · floorHeight, z: roomsBandZc }, level)
        roomNodes.append(node)
        for entry in room.filesHere:
            emitFileObject(node, entry.file, entry.cell, room.S)
        xcursor = xcursor + Wk + margin

    # ── portail parent → primary (absent pour la racine) ──
    if parentLink ≠ none:
        S0 = d.chain[0].S
        (cw, co) = slotWallOffset(slotList(S0)[0], S0)            # créneau réservé 0 (parent) côté enfant
        kind = (level ≠ parentLink.level) ? "stair" : "door"
        addPortalPair(parentLink.room, parentLink.wall, parentLink.offset, roomNodes[0], cw, co, kind)

    # ── portails de chaînage primary→annex1→… ──
    for k in 0 … pageCount(d) − 2:
        Sa = d.chain[k].S ; Sb = d.chain[k+1].S
        (aw, ao) = slotWallOffset(slotList(Sa)[2], Sa)           # créneau réservé 2 (suivant) de k
        (bw, bo) = slotWallOffset(slotList(Sb)[1], Sb)           # créneau réservé 1 (précédent) de k+1
        addPortalPair(roomNodes[k], aw, ao, roomNodes[k+1], bw, bo, "door")

    # ── récursion dans la grille d'enfants ──
    if |d.childDirs| > 0:
        cc        = childCell(d)
        gridLeftX = xcenter − (d.G · cc) / 2
        cellOf    = slotInto(sortByPath(d.childDirs), d.G · d.R)  # child → indice de cellule 0..G·R−1
        for c in d.childDirs:
            e   = cellOf[c]
            col = e mod d.G ; row = div(e, d.G)                   # cellule row-major
            cellMinX = gridLeftX + col · cc
            cellMinZ = childBandZ0 + row · cc
            childOriginX = cellMinX + (cc − plotWidth(c)) / 2     # plot enfant centré dans sa cellule
            childOriginZ = cellMinZ + (cc − plotDepth(c)) / 2
            childLevel   = min(level + 1, maxRenderDepth)
            (k, gidx)    = doorHolderOf(d, c)                     # §9.12
            (pwall, poff)= slotWallOffset(slotList(d.chain[k].S)[gidx], d.chain[k].S)
            link = { room: roomNodes[k], wall: pwall, offset: poff, level: level }
            placePass(c, childOriginX, childOriginZ, childLevel, link)
```

### 9.11 Émission d'une salle et d'un objet fichier

```
emitRoom(d, k, position, level):
    role      = (k == 0) ? (d.isRoot ? "hall" : "primary") : "annex"
    spaceType = (k == 0) ? pickSpaceType(d) : "gallery"                    # §8.4
    theme     = THEME_OF[ classifications.get(d.id) ?? "unknown" ]         # ThemeId (contrat §13.2)
    S         = d.chain[k].S
    node = {
        id:            roomId(d.id, role, k),
        sourceNodeId:  d.id,
        role:          role,
        page:          k,
        pageCount:     pageCount(d),
        spaceType:     spaceType,
        theme:         theme,
        level:         level,
        depthFlattened:( d.depth > maxRenderDepth ),
        position:      position,                                # Vec3i MONDE
        orientation:   0,                                       # les salles ne tournent pas
        dimensions:    { x: S · cellSize, y: roomHeight, z: S · cellSize },
        portals:       [],                                      # rempli par addPortalPair
        objects:       [],                                      # rempli par emitFileObject
    }
    rooms.append(node)
    return node

emitFileObject(node, file, cell, S):
    role = roleOfFile(file.name)                                # §8.1
    kind = OBJECT_OF[node.theme][role]                          # §8.2
    node.objects.append({
        sourceNodeId: file.id,
        position:     localCellCenter(cell, S),                 # LOCAL au centre-sol de la salle
        orientation:  orientation(cell.col, cell.row, S),       # §8.5
        kind:         kind,
        footprint:    KIND_FOOTPRINT[kind],                     # §8.3
    })

localCellCenter(cell, S):
    mid = (S − 1) / 2
    return { x: (cell.col − mid) · cellSize, y: 0, z: (cell.row − mid) · cellSize }

addPortalPair(roomA, wallA, offsetA, roomB, wallB, offsetB, kind):
    roomA.portals.append({ id: portalId(roomA.id, roomB.id, kind),
                           toSpatialNodeId: roomB.id, kind: kind,
                           wall: wallA, offset: offsetA, width: doorWidth, height: doorHeight })
    roomB.portals.append({ id: portalId(roomB.id, roomA.id, kind),
                           toSpatialNodeId: roomA.id, kind: kind,
                           wall: wallB, offset: offsetB, width: doorWidth, height: doorHeight })
```

### 9.12 `doorHolderOf`

```
doorHolderOf(d, c):                            # → (indice de salle k, indice global gidx du créneau porteur)
    for k in 0 … pageCount(d) − 1:
        for entry in d.chain[k].childrenHere:
            if entry.child == c: return (k, entry.slotIndex)
    # inatteignable : buildChain place chaque sous-dossier dans exactement une salle
```

Chaque sous-dossier apparaît dans les `childrenHere` d'**exactement une** salle de la chaîne (les portes sont
partitionnées sur des préfixes disjoints de `doorQ`), donc `doorHolderOf` est total et déterministe.

### 9.13 Fonctions de tables (rappel)

`doorCapacity(S)` = §3.3 ; `computeFreeCells` = §6.3 ; `segmentIntersectsAABB` = §6.4 ; `thresholdPoint` =
§4.3 ; `roleOfFile` = §8.1 ; `OBJECT_OF` = §8.2 ; `KIND_FOOTPRINT` = §8.3 ; `pickSpaceType` = §8.4 ;
`orientation` = §8.5. `sortByPath(xs)` trie par `path` en ordre de code-unit UTF-16 ; `sort(xs, by=key)` est un
tri par `key` en ordre de code-unit UTF-16 (numérique pour `offset`). Les `path` étant uniques, la stabilité du
tri est sans effet sur la sortie.

---

## 10. `LayoutOptions` — constantes par défaut (valeurs entières)

Toutes ces constantes sont **versionnées avec `LAYOUT_VERSION`** et incluses dans `effectiveConfig` (§5.4 du
contrat). Les modifier = re-layout assumé du corpus. Toutes sont des **entiers**.

> **Ce §10 est l'unique source normative de `LayoutOptions`.** Le §14 de `world-schema-v0.md` ne contient plus
> qu'un renvoi vers ici. Une implémentation conforme lit ses constantes **ici**, et nulle part ailleurs.

```ts
interface LayoutOptions {
  // ── grille et espacement (mm) ──
  cellSize:              number;   // 4000   côté d'une cellule intérieure (pair)
  margin:                number;   // 8000   marge de plot ; couloir ; écart entre salles chaînées (pair)
  clearance:             number;   // 1000   dégagement (élargissement de cellule ET marge d'emprise)
  // ── hauteurs (mm) ──
  roomHeight:            number;   // 4000   dimensions.y d'une salle
  floorHeight:           number;   // 6000   écart vertical entre deux level (≥ roomHeight)
  // ── portes (mm) ──
  doorWidth:             number;   // 2000   largeur de porte (≤ cellSize)
  doorHeight:            number;   // 3000   hauteur de porte (≤ roomHeight n'est PAS requis : cosmétique)
  // ── budget de déplacement (§9.4 PRD) ──
  normalSpeed:           number;   // 6000   mm/s (écho dans WorldLayout.normalSpeed)
  doorReachBudgetSeconds:number;   // 8      s (budget centre→porte)
  hopBudgetSeconds:      number;   // 3      s (budget de couloir inter-salles)
  maxRoomHalfExtent:     number;   // 48000  = normalSpeed · doorReachBudgetSeconds (écho dans WorldLayout)
  // ── paliers et seuils de forme ──
  roomSideTiers:         number[]; // [3, 5, 7, 9, 11]  côtés S impairs, ascendants
  plazaThreshold:        number;   // 8      C ≥ plazaThreshold → spaceType "plaza"
  galleryThreshold:      number;   // 12     F ≥ galleryThreshold → spaceType "gallery"
  reservedSlotCount:     number;   // 3      créneaux de mur réservés (parent, chain-prev, chain-next)
  // ── profondeur ──
  maxRenderDepth:        number;   // 20     plafond du level (y), l'imbrication XZ continue sans limite
}
```

### 10.1 Invariants dérivés à vérifier en test (cohérence des constantes)

- `maxRoomHalfExtent == normalSpeed · doorReachBudgetSeconds` → `48000 == 6000 · 8`. ✅
- `margin ≤ normalSpeed · hopBudgetSeconds` → `8000 ≤ 18000`. ✅
- **Tous les `S` de `roomSideTiers` sont impairs et strictement croissants.** `[3,5,7,9,11]`. ✅
- **Le plus grand palier respecte le plafond d'extent :** `max(roomSideTiers) · cellSize ≤ 2 · maxRoomHalfExtent`
  → `11 · 4000 = 44000 ≤ 96000`. ✅ (Le plafond est donc respecté par construction ; la capacité déclenche
  l'annexe avant lui — cf. §13.)
- `cellSize` et `margin` **pairs** (garantit les divisions exactes, §2.3). ✅
- **Contrainte d'emprise :** pour tout `kind`, `max(footprint.x, footprint.z) + clearance ≤ cellSize` →
  `3000 + 1000 ≤ 4000`. ✅
- `doorWidth ≤ cellSize` → `2000 ≤ 4000` (la porte tient dans son créneau). ✅
- `reservedSlotCount == 3` et `doorCapacity(S) = 4·(S−2) − reservedSlotCount > 0` pour tout palier
  (`S = 3 → 1`). ✅

### 10.2 Constantes retenues (récapitulatif chiffré)

| Constante | Valeur | Unité |
|---|---:|---|
| `cellSize` | 4000 | mm |
| `margin` | 8000 | mm |
| `clearance` | 1000 | mm |
| `roomHeight` | 4000 | mm |
| `floorHeight` | 6000 | mm |
| `doorWidth` | 2000 | mm |
| `doorHeight` | 3000 | mm |
| `normalSpeed` | 6000 | mm/s |
| `doorReachBudgetSeconds` | 8 | s |
| `hopBudgetSeconds` | 3 | s |
| `maxRoomHalfExtent` | 48000 | mm |
| `roomSideTiers` | `[3, 5, 7, 9, 11]` | cellules |
| `plazaThreshold` | 8 | sous-dossiers |
| `galleryThreshold` | 12 | fichiers |
| `reservedSlotCount` | 3 | créneaux |
| `maxRenderDepth` | 20 | niveaux |

---

## 11. Invariants `assertLayoutInvariants(layout, tree)`

Exécutés à l'écriture (garde de pipeline) **et** dans les tests. La garde reçoit **`(layout, tree)`** :

- `layout` porte les données **géométriques** produites (`dimensions`, `position`, `portals`,
  `objects.footprint`, `role`, `page`, `pageCount`, `level`, `depthFlattened`), toutes présentes dans
  `world.json` (§3.7 du contrat) ;
- `tree` (le `LayoutTree` d'entrée, §1.1) fournit les données **source** que le layout ne réplique pas : la
  profondeur `depth` d'un dossier (**I4**), l'identité de la racine et la complétude par dossier (**I7**), et
  l'ensemble des `id` de fichiers non exclus (**I8**).

Les invariants purement géométriques (**I1–I3, I5, I6, I9–I12**) se vérifient sur `layout` seul ; **I4, I7,
I8** joignent `layout` à `tree`. Chaque invariant est accompagné de la **manière exacte de le tester**.
`L = 2·maxRoomHalfExtent`.

### I1 — Extent (règle des 15 s, PRD §9.4)

Pour tout `SpatialNode n` : `n.dimensions.x ≤ L` et `n.dimensions.z ≤ L`.
**Test :** itérer les `spatialNodes` ; asserter les deux inégalités. Vrai par construction (`S ≤ 11 ⇒
dimension ≤ 44000 ≤ 96000`).

### I2 — Visibilité des portes (PRD §9.4, « portes visibles depuis le centre »)

Pour toute salle `n`, tout portail `p ∈ n.portals` et tout objet `o ∈ n.objects` :
`segmentIntersectsAABB( threshold(p), footprintAABB(o) ) == false`, où
`threshold(p) = thresholdPoint(p.wall, p.offset, n.dimensions.x, n.dimensions.z)` (§4.3) et `footprintAABB(o)`
est l'AABB au sol **physique** de l'objet, **orientation appliquée** : `footprint` étant l'emprise en repère
modèle (§8.3), on transpose ses composantes pour un quart de tour est/ouest —
`(ex, ez) = (o.orientation ∈ {1, 3}) ? (o.footprint.z, o.footprint.x) : (o.footprint.x, o.footprint.z)` — puis
`footprintAABB(o) = [o.position.x − ex/2, o.position.x + ex/2] × [o.position.z − ez/2, o.position.z + ez/2]`.
Les emprises **asymétriques** (`readme-stand`, `console` : `3000×1500`) posées face est/ouest (orientation `1`
ou `3`, §8.5) voient ainsi leur AABB **transposée**, de sorte que le test de défense en profondeur porte sur la
géométrie **réellement rendue**, pas sur une emprise en repère modèle.
**Test :** re-jouer le test entier §6.4 sur l'artefact ; asserter **zéro** intersection sur toutes les paires
`(portail, objet)`. Vrai par construction (§6.1 : les objets ne sont posés que dans `freeCells`, disjointes des
segments élargis de `clearance` ; la cellule élargie — carrée, `[cx ± (cellSize/2 + clearance)]` — contient
l'emprise physique dans **les deux** orientations, car `max(footprint.x, footprint.z) + clearance ≤ cellSize`,
§8.3, est invariant par transposition).

### I3 — Non-chevauchement des salles

Pour toute paire de salles `(a, b)`, `a ≠ b`, leurs AABB au sol sont disjointes :
`aMaxX ≤ bMinX` **ou** `bMaxX ≤ aMinX` **ou** `aMaxZ ≤ bMinZ` **ou** `bMaxZ ≤ aMinZ`, avec, pour toute salle
`s` : `sMinX = s.position.x − s.dimensions.x/2`, `sMaxX = s.position.x + s.dimensions.x/2`,
`sMinZ = s.position.z − s.dimensions.z/2`, `sMaxZ = s.position.z + s.dimensions.z/2`.
**Test :** double boucle sur `spatialNodes` (ou balayage par tri des intervalles) ; asserter la disjonction
2D. Vrai par construction (plots et cellules disjoints, bandes à `z` disjoints ; preuve §12.3).

### I4 — Profondeur de rendu

Pour tout `n` : `0 ≤ n.level ≤ maxRenderDepth` et `n.depthFlattened == (depthOf(n.sourceNodeId) > maxRenderDepth)`.
**Test :** joindre `spatialNodes` aux `SourceNode` par `sourceNodeId` ; comparer `level` à
`min(depth, maxRenderDepth)` et `depthFlattened` à `depth > maxRenderDepth`.

### I5 — Connexité depuis le `hall`

Un BFS/DFS du graphe des portails (arêtes = `toSpatialNodeId`) depuis l'unique salle `role == "hall"` atteint
**tous** les `spatialNodes`.
**Test :** construire le graphe depuis `spatialNodes[*].portals[*].toSpatialNodeId` ; BFS depuis le `hall` ;
asserter que le nombre de nœuds visités égale `|spatialNodes|`.

### I6 — Réciprocité des portails

Pour tout portail `p` dans la salle `A` vers `B`, il existe un portail `q` dans `B` vers `A` de même `kind`.
**Test :** pour chaque `(A, p)`, chercher dans `B = p.toSpatialNodeId` un portail `q` avec
`q.toSpatialNodeId == A.id` et `q.kind == p.kind` ; asserter la présence. Vrai par construction
(`addPortalPair` crée toujours les deux).

### I7 — FR-005 (cardinalité des salles par dossier)

Pour tout dossier non exclu, il existe **exactement un** `SpatialNode` de rôle `{hall|primary}` ; chaque
`annex` référence un `sourceNodeId` de dossier existant ; tout rôle ∈ `{hall, primary, annex}`.
**Test :** grouper `spatialNodes` par `sourceNodeId` ; asserter, par groupe, exactement un `hall|primary`,
que le `hall` est réservé à la racine, que les `page` couvrent `0 … pageCount−1` sans trou, et que
`pageCount` est identique dans tout le groupe.

### I8 — Couverture des fichiers (bijection)

L'ensemble des `objects[*].sourceNodeId` sur toutes les salles est **exactement** l'ensemble des `id` de
fichiers **non exclus**, sans doublon.
**Test :** collecter tous les `sourceNodeId` d'objets ; asserter l'égalité ensembliste avec les fichiers non
exclus du `tree`, et l'absence de doublon (chaque fichier apparaît une fois).

### I9 — Emprises conformes à la table

Pour tout objet `o` : `o.footprint == KIND_FOOTPRINT[o.kind]` et `max(o.footprint.x, o.footprint.z) +
clearance ≤ cellSize`.
**Test :** comparer chaque `footprint` à la table §8.3 ; asserter l'égalité et l'inégalité de dégagement.

### I10 — `PortalKind` produits en v0

Pour tout portail `p` : `p.kind ∈ {"door", "stair"}`. Aucun `"elevator"` ni `"portal"` n'est émis en v0.
**Test :** asserter `p.kind ∈ {"door","stair"}` sur tous les portails ; cohérence `stair ⟺ level(A) ≠
level(B)` en joignant les deux extrémités.

### I11 — Intégrité entière (défense en profondeur FR-026)

Toute grandeur numérique de `layout` est un entier sûr (`Number.isSafeInteger`).
**Test :** parcours récursif de `layout` ; asserter `Number.isSafeInteger(v)` pour tout nombre `v`. Complète la
garde de `canonicalStringify` (§6 du contrat), qui lève sur tout non-entier résiduel.

### I12 — Portes dans les murs

Pour tout portail `p` d'une salle `n` : le segment `[p.offset − p.width/2, p.offset + p.width/2]` reste dans
`[0, wallLength]` avec `wallLength = (p.wall ∈ {north,south}) ? n.dimensions.x : n.dimensions.z`.
**Test :** asserter `p.width/2 ≤ p.offset ≤ wallLength − p.width/2` pour tout portail. Vrai par construction
(offsets de créneaux non-coin ∈ `[1.5·W, (S−1.5)·W]`, `doorWidth/2 = 1000 ≤ 1.5·W = 6000`).

---

## 12. Terminaison, complexité et non-chevauchement

### 12.1 Terminaison (preuve courte)

Il n'existe **aucune** boucle de réparation. Toutes les boucles sont bornées :

1. **`fillRoom`** parcourt `roomSideTiers` (5 paliers) : boucle finie ; les branches restantes sont sans boucle.
2. **`buildChain`** (`repeat … until`) : chaque itération retire `dTake + fTake` éléments des files finies
   `doorQ`/`fileQ`, et cette quantité est **≥ 1** dès qu'il reste un élément —
   • s'il reste une porte, `dTake = min(nDoors, doorCapacity(S)) ≥ 1` car `doorCapacity(S) ≥ 1` pour tout
   palier (`doorCapacity(3) = 1`) ;
   • s'il ne reste que des fichiers (`nDoors = 0`), le débordement prend `S = 11` avec 0 porte enfant ;
   `computeFreeCells(11, {3 réservés})` possède au moins une cellule libre (3 segments courts bloquent bien
   moins que les `121 − 1` cellules non centrales), donc `fTake ≥ 1`.
   La première itération peut retirer 0 élément (dossier vide) mais crée la salle `primary`, après quoi la
   condition d'arrêt (files vides **et** `|chain| ≥ 1`) est satisfaite. Les files étant finies, la chaîne est
   finie.
3. **`sizePass`** et **`placePass`** sont des récursions en post-ordre / pré-ordre sur un **arbre fini**,
   chaque nœud visité **une** fois.
4. `isqrtFloor` converge (itération de Newton entière décroissante bornée par 0), `slotInto` termine (`≤ m`
   sondages puisque `|candidates| ≤ m`).

Donc `computeLayout` **termine** sur tout `LayoutTree` fini. ∎

### 12.2 Complexité

Soient `N` le nombre de dossiers et `F` le nombre de fichiers non exclus ; `S_max = 11`, `T = 5` paliers.

- Par dossier `d` : `buildChain` fait au plus `pageCount(d)` itérations ; chaque `fillRoom` essaie `≤ T`
  paliers, chacun coûtant `O(C_d)` (slotting des portes) `+ O(S_max² · (C_d + 3))` (`computeFreeCells`). La
  somme des `C_d` et des fichiers placés sur toute la chaîne est `O(C_d + F_d)`. Coût par dossier :
  `O((C_d + F_d) · S_max² · T)`.
- Somme sur l'arbre : `Σ_d (C_d + F_d) = O(N + F)`. D'où `sizePass` en `O((N + F) · S_max² · T)`, soit
  `O(N + F)` avec un facteur constant borné (`≤ 121 · 5 ≈ 605`).
- `placePass` visite chaque nœud une fois et fait `O(C_d)` de slotting de grille : `O(N + F)`.
- **Total temps :** `O((N + F) · S_max² · T)` = **linéaire** en la taille de l'arbre (facteur constant borné).
- **Mémoire :** `O(N + F)` (un `SpatialNode` par page, un `FileObject` par fichier non exclu).

Pour les limites du PRD §27.3 (`≤ 10 000` fichiers, `≤ 2 000` analysés), le layout est calculé bien en deçà de
la seconde et tient dans le budget d'artefact (§11 du contrat).

### 12.3 Non-chevauchement des salles (preuve par construction)

On prouve l'invariant **I3** (§11) par **induction sur la hauteur du sous-arbre** d'un dossier `d`, avec
l'hypothèse d'induction `H(d)` :

> *Toutes les salles du sous-arbre de `d` sont contenues dans le plot de `d`,
> `[originX, originX + plotWidth(d)] × [originZ, originZ + plotDepth(d)]`, et deux quelconques d'entre elles ont
> des AABB au sol disjointes.*

**Cas de base** — dossier feuille (`C = 0`) : le sous-arbre se réduit à la chaîne de `d`, traitée par (c)
ci-dessous ; il n'y a pas de bande enfants, donc (a)/(b) sont vacués. `H(d)` tient.

**Hérédité** — on suppose `H(c)` pour chaque enfant `c ∈ childDirs(d)` et on établit `H(d)` via trois
disjonctions locales.

(a) **Bandes `z`-disjointes.** Par `placePass` (§9.10), la bande salles est centrée en
`roomsBandZc = originZ + margin + chainDepth(d)/2` ; chaque salle ayant une demi-profondeur `≤ chainDepth(d)/2`,
la bande salles est contenue dans l'intervalle de `z` `[originZ + margin, originZ + margin + chainDepth(d)]`. La
bande enfants commence à `childBandZ0 = originZ + margin + chainDepth(d) + margin` (§9.10), soit **après** la fin
de la bande salles avec un écart de `margin > 0`. Aucune salle de `d` ne partage donc un `z` avec une cellule
enfant : **salle ↮ enfant**.

(b) **Cellules enfants disjointes et confinantes.** La grille est faite de cellules **carrées et uniformes** de
côté `cc = childCell(d) = max_c max(plotWidth(c), plotDepth(c))` (§2.2), posées sans recouvrement aux coins
`(gridLeftX + col·cc, childBandZ0 + row·cc)`, `col ∈ [0, G−1]`, `row ∈ [0, R−1]` (§9.10). Comme
`cc ≥ plotWidth(c)` et `cc ≥ plotDepth(c)`, le plot de `c` — centré dans sa cellule par les décalages
`(cc − plotWidth(c))/2`, `(cc − plotDepth(c))/2` (§9.10) — **rentre** dans sa cellule sans déborder. Par `H(c)`,
toutes les salles du sous-arbre de `c` sont dans le plot de `c`, donc dans la cellule de `c`. Les cellules étant
deux à deux disjointes, **les salles de deux enfants distincts sont disjointes**, et disjointes des salles de
`d` par (a). Les `G·R − C` cellules excédentaires restent **vides** (§2.2) et n'introduisent aucune salle.

(c) **Salles de la chaîne disjointes en `x`.** Les salles de `d` sont posées le long de `x` par
`xcursor ← xcursor + Wk + margin` (§9.10) : deux salles consécutives sont séparées par `margin > 0`, donc leurs
intervalles de `x` sont **disjoints**. Elles partagent la bande salles en `z`, mais la disjonction en `x`
suffit à disjoindre leurs AABB.

**Confinement (rétablit `H(d)`).** En `x` : la bande salles, large de `chainWidth(d)`, et la bande enfants,
large de `G·cc`, sont **centrées** sur `xcenter = originX + plotWidth(d)/2` ; comme
`plotWidth(d) = max(chainWidth(d), G·cc) + 2·margin` (§2.3), chacune tient dans
`[originX + margin, originX + plotWidth(d) − margin] ⊂ [originX, originX + plotWidth(d)]`. En `z` : tout est
dans `[originZ + margin, originZ + plotDepth(d) − margin]` par construction de
`plotDepth(d) = chainDepth(d) + margin + R·cc + 2·margin` (§2.3). L'hypothèse `H(d)` est donc établie. ∎

Par induction, `H(root)` tient : **aucune paire de salles ne se chevauche** dans tout l'arbre. L'invariant I3
est **vrai par construction** ; le test I3 (§11) le revérifie sur l'artefact (défense en profondeur).

---

## 13. Écarts au mandat, et pourquoi

Le mandat a été suivi intégralement sur les points structurants (bandes M1, chaîne unique M2, visibilité par
construction M3, point fixe ascendant M4, murs/offsets M5, créneaux canoniques M6, slotting M7, tables M8,
profondeur M9, conservation M10). Les points ci-dessous sont des **précisions de mise en œuvre** rendues
nécessaires pour que tout soit déterminé au dernier octet ; aucun ne contourne le mandat en silence.

### E1 — Réservation fixe de 3 créneaux, même inutilisés

Le mandat (M6) demande de réserver « le portail vers le parent, et les portails de chaînage (précédent /
suivant) ». Pour rendre `doorCapacity(S) = 4·(S−2) − 3` **pure de `S`** (sans dépendance circulaire à la
topologie de la chaîne), je réserve **toujours** ces 3 créneaux, aux indices canoniques fixes `0, 1, 2`, même
lorsqu'ils restent vides (la racine n'a pas de parent ; la `primary` n'a pas de précédent ; la dernière annexe
n'a pas de suivant). Coût : jusqu'à 3 créneaux de mur gaspillés par salle. Bénéfice : capacité et
`computeFreeCells` deviennent des fonctions pures de `(S, portes enfant)`, indépendantes de la position de la
salle dans la chaîne — condition nécessaire à la stabilité par paliers (ADR-0003).

### E2 — `blockedCells` inclut les seuils des créneaux réservés vides

Par cohérence avec E1, `computeFreeCells` calcule les segments de visibilité pour les **3 créneaux réservés
même sans portail émis**. Cela retire quelques cellules de fichier supplémentaires, mais garantit que la
capacité de fichiers d'une salle ne dépend **pas** de savoir si son parent/chaînage est réellement branché —
donc reste stable quand la chaîne s'allonge ou raccourcit à `S` constant.

### E3 — Position des portes de chaînage : logique, pas géométriquement adjacente

Les salles d'une chaîne sont posées adjacentes le long de `x`, mais leurs portes de chaînage occupent les
créneaux réservés canoniques `2` (suivant) et `1` (précédent), qui ne tombent pas nécessairement sur les murs
est/ouest en vis-à-vis. C'est sans effet sur la correction : la navigation v0 est **cinématique / point-and-
click**, sans physique de collision au-delà du confinement (PRD §9.2), donc la porte est un repère, pas un
passage physiquement franchi. Aligner les portes de chaînage sur les murs adjacents est une amélioration
**cosmétique** possible en v1, hors périmètre des octets normatifs ici.

### E4 — Le plafond d'extent n'est jamais le déclencheur d'annexe en v0

Le mandat (M4) conserve `dimensions.{x,z} ≤ 2·maxRoomHalfExtent` comme plafond dont « le dépassement déclenche
l'annexe ». Avec `roomSideTiers = [3,5,7,9,11]`, le plus grand palier donne `44000 mm < 96000 mm` : le plafond
est **respecté par construction** et c'est **toujours la capacité** (portes/fichiers) qui ouvre l'annexe, avant
le plafond. La branche « dépassement du plafond → annexe » est donc **inatteignable** en v0 ; elle reste
vérifiée comme invariant (I1). Choisir des paliers en deçà du plafond est délibéré : cela garantit le budget
des 15 s (centre→porte `≤ 22000 mm ≈ 3,7 s`) avec une large marge.

### E5 — `spaceType` d'annexe fixé à `"gallery"`

Le mandat (M8) exige qu'une annexe reçoive un `spaceType` « défini par la règle, pas laissé implicite ». Règle
retenue : **toute annexe est `"gallery"`** (page de débordement, métaphore rayonnage/galerie du PRD §10.2).
Avantage secondaire : aucune annexe ne peut porter `"hall"`, ce qui préserve trivialement l'unicité du `hall`
(FR-005). La `primary`/`hall` (page 0) reçoit `pickSpaceType(d)`.

### E6 — Disparition de `maxFilesPerRoom`

L'ancienne spec plafonnait les fichiers par salle à `maxFilesPerRoom = 60`. Dans le modèle refondu, la capacité
de fichiers est **géométrique** (`|freeCells|`), déterminée par `S` et les portes ; il n'y a donc plus de
constante `maxFilesPerRoom`. Le débordement en annexe se produit quand `|freeCells|` est insuffisant, ce qui
est un critère plus fidèle à la réalité spatiale (une salle très percée de portes tient moins de fichiers).

### E7 — « Division non exacte » : interprétation

Le mandat interdit « aucune division non exacte ». Toutes les divisions par 2 du placement portent sur des
quantités **paires** (§2.3) : elles sont **exactes**. Les autres divisions (`div`, `ceilDiv`, `mod`, `isqrt`)
sont des **opérations entières définies** (quotient/reste euclidiens, racine entière), sans flottant ni perte :
ce ne sont pas des « divisions inexactes » au sens d'un arrondi de flottant, mais des primitives entières
spécifiées au §9.4. Aucun flottant n'atteint l'artefact.

### E8 — `mulberry32` non utilisé par le layout

Le contrat (§5, M10) conserve `mulberry32` comme primitive vendorisée. Le moteur de layout v0 **ne l'appelle
pas** : tout le placement dérive de `hash32(path)` (slotting), ce qui rend le résultat indépendant de l'ordre
de parcours et trivialement parallélisable. `mulberry32` reste disponible pour d'autres usages (bruit
décoratif futur) sans entrer dans les octets du layout v0.

---

## 14. Objections examinées et écartées

Les audits adversariaux ont proposé sept corrections ; **six sont appliquées intégralement** (voir §0
Autorité, §8.1, §8.3, §9.1, §9.11, §11, §12.3). Les seuls points **écartés** ou **restreints**, avec leur
raison :

### O1 — « Permuter `footprint.x`/`z` aussi dans I9 » (défaut 7) — **écarté**

La correction proposée demandait de transposer l'emprise « dans I2 **et** I9 » pour les orientations `1`/`3`.
La transposition est appliquée à **I2** (qui construit bien une AABB physique). Elle est **écartée pour I9**,
car **I9 ne construit aucune AABB** : il vérifie (a) l'égalité de table `footprint === KIND_FOOTPRINT[kind]`
— une comparaison de la valeur en repère modèle, qui ne doit **pas** être transposée sous peine de faux
négatifs sur `readme-stand`/`console` — et (b) `max(footprint.x, footprint.z) + clearance ≤ cellSize`, dont le
`max` est **symétrique**, donc invariant par transposition. Transposer dans I9 serait au mieux inopérant, au
pire erroné. La sûreté physique est couverte par I2 (défense en profondeur) et par la construction (§6.1).
Documenté en §8.3.

### O2 — « Réécrire à l'identique le corps de `world-schema-v0.md` §14 » (défauts 1 et 4) — **restreint**

L'esprit de la correction est appliqué : **conflit résolu au dernier octet**, une seule table normative de
`LayoutOptions` (§10 de ce document). La **lettre** — éditer le fichier `world-schema-v0.md` — sort du
périmètre autorisé (seul `layout-engine-v0.md` est modifiable ici). La clause d'Autorité (en tête) **périme**
donc explicitement le §14 du contrat et déclare ses valeurs divergentes (`clearance = 500`, `floorHeight =
8000`, `roomSideTiers` en paires, `maxFilesPerRoom = 60`, invariant « `(9-1)²` ») **caduques**, redirigeant
toute implémentation conforme vers le §10. Une passe d'édition ultérieure sur le contrat devra aligner
matériellement le §14 (le supprimer ou le remplacer par un renvoi au §10) ; d'ici là, l'Autorité tranche sans
ambiguïté sur les octets.

---

**Fin de la spécification du moteur de layout v0.**
