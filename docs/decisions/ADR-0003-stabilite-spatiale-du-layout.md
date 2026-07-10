# ADR-0003 — Stabilité spatiale du moteur de layout

**Statut :** accepté
**Date :** 2026-07-10
**Portée :** phase 0, sprints 1 à 3
**Références :** PRD v3.0 §9.1, §9.4, §25 (« Disposition instable entre analyses »), §32 Q10, §14.2, §19.2, FR-005 ; spec `docs/spec/world-schema-v0.md` §5, §7, §8

## Contexte

PRD §9.1 dit que la disposition est « générée à partir du chemin, du commit et de la configuration ». Mais un layout qui change à chaque commit détruit la mémoire spatiale — précisément le risque §25 et la question ouverte §32 Q10 (« Quel mécanisme garantit que les espaces importants restent au même endroit entre commits ? »). Le moteur de layout doit par ailleurs être une **fonction pure** exécutable à l'identique dans Node et le navigateur (§14.2, §19.2), donc sans `Math.random`, sans `Date`, sans trigonométrie (voir plus bas).

## Décision

1. **La graine dépend de la SEULE configuration, jamais du commit.**
   `seed = config.layoutSeed` (défaut `"cwe-v0"`, inclus dans `configurationHash`). Le commit ne détermine que *quels nœuds existent*, jamais leurs positions. On dévie sciemment de la lettre de §9.1 (retrait du commit) au profit de son intention (§6 « environnement stable et mémorable », §25, §32 Q10).
2. **Flux PRNG par nœud, dérivé du chemin.**
   `prngOf(path) = mulberry32(readUint32BE(sha256(seed ‖ 0x00 ‖ path)[0..4]))`. Placement **indépendant de l'ordre de parcours** (parallélisable, robuste au refactoring de l'analyseur) et **stable entre commits** (path stable ⇒ tirages stables).
3. **Slotting par hachage + sondage « le plus petit chemin gagne », à TOUS les niveaux.**
   Quartiers de niveau supérieur, sous-dossiers imbriqués et objets fichiers sont tous placés par `hashSlot(path, modulus)` avec sondage déterministe. En cas de collision de créneau, le `path` lexicographiquement le plus petit **conserve** le créneau ; l'occupant sortant **ne bouge jamais**. Ajouter/retirer un frère ne déplace donc aucun frère existant (sauf collision exacte, bornée à un sondage).
4. **Tailles par paliers avec hystérésis.**
   Le côté de grille (salle et grille d'enfants) dépend d'un **palier** du compte, pas du compte exact. Ajouter un fichier/sous-dossier qui ne franchit pas de palier ne redimensionne rien, donc ne rehash rien.
5. **Positions d'objets LOCALES à la salle.**
   Déplacer une salle ne change jamais les coordonnées de ses objets.
6. **Layout sur treillis entier, sans trigonométrie** (pavage de plots carrés). Motif décisif : `Math.sin/cos` n'a pas de précision imposée par ECMA-262, donc un layout polaire ne serait pas identique bit à bit entre moteurs → violerait FR-026. Le pavage entier garantit aussi la non-superposition par plots disjoints.

## Invariants de stabilité (testables)

Soit `T` un arbre et `T'` = `T` avec **une** feuille ajoutée (ou retirée). Après `computeLayout` :

- **Ajout d'un sous-dossier à `d`, sans franchir de palier de `d` :** toutes les positions des autres sous-dossiers de `d` sont **identiques** ; le nouveau réclame un créneau libre ; aucun déplacement.
- **Ajout d'un fichier à `d`, sans franchir de palier :** tous les `FileObject` existants de `d` gardent une position **identique** ; le nouveau réclame une cellule libre.
- **Franchissement de palier de `d` :** seules les positions **internes à `d`** peuvent changer (rehash) ; la position de `d` et **toutes** les autres salles/objets restent identiques.
- **Dans tous les cas :** tout nœud hors du sous-arbre de `d` conserve une position identique (les quartiers de niveau supérieur étant placés par hachage du path, pas par index).

Ces tests de propriété répondent directement à §25 et §32 Q10.

## Conséquences

- Les repères survivent à un commit : tant qu'un dossier garde son `path` et que la population de son parent ne franchit pas de palier, sa zone ne bouge pas.
- Le moteur reste une **fonction pure** partagée pipeline/navigateur, testable par snapshot (PRD §16.4, §33), sans dépendance Node ni entropie.
- **Ancrage seulement sous identité de path :** renommer/déplacer un dossier change son `path`, donc son `id` **et** sa position — la zone se déplace. Une table d'alias `path → identité` pour préserver l'ancre à travers les refactorings est **reportée après v0** et doit être signalée aux parties prenantes.
- **Sparseness assumée :** cellules-enfants uniformes (dimensionnées sur le plus grand plot) et slotting par hachage laissent des trous → mondes plus épars, marche un peu plus longue. La primauté recherche/téléportation/mini-carte (déjà dans le PRD) le compense. À surveiller par télémétrie du taux de « re-trouvaille ».
- Franchir un palier rehash l'intérieur d'une salle : rare, borné à une salle, documenté.

## Alternatives écartées

- **Inclure le commit dans la graine** (lettre de §9.1) : reshuffle à chaque commit, détruit la mémoire spatiale. Rejeté ; déviation consignée ici.
- **Distances radiales par `reach()` bottom-up** (biais perf-client) : la croissance d'un sous-arbre modifie la distance parent→enfant et cascade les positions des cousins. Rejeté au profit d'un pavage à cellules stables par paliers.
- **Placement intra-dossier par index de tri de nom** (biais déterminisme) : insérer un fichier décale tous les objets après le point d'insertion. Rejeté au profit du slotting par hachage, qui rend chaque objet individuellement stable.
- **Flux PRNG global unique consommé séquentiellement** : rend le résultat dépendant de l'ordre de parcours (anti-déterministe au refactoring). Rejeté au profit d'un flux par nœud.
- **PRNG 64 bits (SplitMix64/BigInt)** : `BigInt` plus lent en chemin chaud, sans bénéfice ici. Retenu : **mulberry32** (32 bits, `Math.imul`, portable).
