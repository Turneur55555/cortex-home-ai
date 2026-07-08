# Mémoire projet — cortex-home-ai

## Dernière mise à jour
2026-07-07

## Séances → suppression des traits verticaux entre sections (2026-07-07, branche `claude/sessions-hero-refinement-568s1k`)
Finition UI demandée par Nathan une fois l'architecture Séances validée (aucun moteur/hook/calcul/RPG/composant métier/animation existante/thème touché). Les traits verticaux (`SectionLink`, un `div` `h-6 w-px` en dégradé) entre les sections donnaient l'impression d'une timeline à trous car l'un des deux était rendu conditionnellement (`{data && !isLoading && data.length > 0 && <SectionLink />}`) et aucun autre trait n'existait entre les autres cartes — incohérence visuelle, pas un vrai design.
- **`SeancesTab.tsx`** : les 2 appels `<SectionLink />` (entre "Choisir une épreuve"/"La Forge" et entre le bloc erreur-chargement/"Chroniques complètes") et la fonction `SectionLink` elle-même sont supprimés — plus aucun séparateur vertical dans la page. Le conteneur racine était déjà `flex flex-col gap-5` : sans les traits, l'espacement redevient automatiquement uniforme entre **toutes** les cartes rendues (Citation → Sensei → Choisir une épreuve → La Forge → Chroniques complètes → Scan des Titans), aucun changement de classe nécessaire pour "équilibrer" les marges. Diff purement soustractif (16 lignes retirées, 0 ajoutée).
- Validé : `npx tsc --noEmit` 0 erreur, `eslint` clean, `npm run test` 145/145 verts (0 régression), `npm run build` OK.

## Séances → passe de finition Hero (2026-07-07, branche `claude/sessions-hero-refinement-568s1k`)
Nouvelle passe UX demandée par Nathan, strictement le Hero (aucun moteur/hook/Supabase/Edge Function/calcul touché) — changement de philosophie : le Hero n'est plus un point d'entrée, juste une respiration visuelle entre la nav et Sensei^IA, qui redevient le vrai point d'entrée de la page.
- **`SeancesHero.tsx` réécrit à l'os** : hauteur réduite d'environ 40% supplémentaires (`min-h-[72px]`→`44px`, `py-3`→`py-2`, `rounded-[22px]`→`rounded-2xl`). Suppression totale de la sensation de carte : filet métallique haut, bordure inset (`boxShadow` ring) et vignette réactive au hover retirés — plus aucun `whileHover`/`whileTap`, la citation flotte sans jamais inviter au tap. **Découplage complet du rang de l'utilisateur** : `RankAggregator`/`topExercises`/`getRankVisual` retirés du composant (n'était utilisé que pour une couleur d'ambiance cosmétique) — remplacés par une ambiance fixe autonome (fond dégradé sombre `#150808→#070303`, un seul halo rouge très léger en respiration extrêmement lente 16s, 4 braises discrètes faites main avec durées 17-23s). `SeancesHero` ne prend donc plus de props ; l'appel dans `SeancesTab.tsx` passe de `<SeancesHero topExercises={topExercises} />` à `<SeancesHero />` (`topExercises` reste utilisé ailleurs dans le fichier, non supprimé).
- **`LaForgeCard.tsx`** : suppression complète de l'icône marteau (`Hammer` de lucide-react, affichée en exposant) — plus aucune icône, comme demandé. La carte n'a désormais plus aucune différence structurelle avec `SenseiIACard.tsx` hormis titre/texte/action.
- Commentaire de section stale corrigé dans `SeancesTab.tsx` (`{/* HERO — LA FORGE */}` → `{/* Hero — respiration d'ambiance */}`, la Forge étant désormais une carte séparée plus bas, ce libellé prêtait à confusion).
- Validé : `npx tsc --noEmit` 0 erreur, `eslint` clean sur les 3 fichiers touchés, `npm run test` 145/145 verts (0 régression), `npm run build` OK.
- ⚠️ Test navigateur manuel impossible dans cette session (pas d'environnement de preview) — à vérifier par Nathan sur le déploiement Lovable/preview.

## Séances → refonte finale : RPG et Performances retirés, La Forge alignée sur Sensei (2026-07-07, branche `claude/seances-page-redesign-jfi73t`)
Dernière passe UX demandée par Nathan, strictement UI (aucun moteur/hook/Supabase/Edge Function/calcul touché) :
- **`SeancesHero.tsx`** : réduction d'environ 50% supplémentaire par rapport à la session précédente (`min-h-[150px]`→`72px`, `py-8`→`py-3`, `rounded-[28px]`→`[22px]`, texte `19px`→`13px`, `leading-[1.6]`→`1.45`). Particules/braises/halos/centrage intouchés — le Hero n'est plus qu'une ambiance d'introduction, ne rivalise plus visuellement avec Sensei.
- **Progression RPG entièrement retirée de Séances** (doublon avec Profil, refusé explicitement par Nathan) : suppression de la section "Progression RPG" dans `SeancesTab.tsx` (`ProfileRPGData`+`SeancesProgressionCard`+bouton "Voir toutes les maîtrises"). **Fichiers supprimés** : `src/components/fitness/SeancesProgressionCard.tsx` (n'était utilisé que là) et la route `src/routes/_authenticated/maitrises.tsx` (écran "Toutes les maîtrises", seul point d'entrée était ce bouton désormais supprimé — devenu orphelin, donc supprimé plutôt que laissé mort). `ExerciseRankStrip.tsx` conservé : toujours utilisé par `src/routes/_authenticated/progression.tsx` (Profil), son prop `layout="grid"` ajouté pour l'écran maîtrises n'a plus qu'un seul call site (`"carousel"` par défaut, non cassant).
- **Section "Les Performances" entièrement supprimée** (Ardeur/Cycle en cours/Temps forgé — jugée inutile pour préparer une séance) : retrait du bloc dans `SeancesTab.tsx` + suppression du hook `useFitnessStreak` (devenu inutilisé dans ce fichier — toujours utilisé ailleurs, ex. `ActiveWorkoutView`, non touché) + suppression de la fonction locale `PerfTile` et du calcul `weekDurationMinutes` (dead code après coup).
- **`LaForgeCard.tsx` refondue pour partager l'identité visuelle exacte de `SenseiIACard.tsx`** : même matériau (fond radial doré `rgba(234,179,8,…)`, plus l'ancien dégradé ambré/orange propre), même filet lumineux haut, même halo au hover, même structure typographique (titre serif 26px + glyphe en exposant, sous-titre 13px, footer caption uppercase). Seule différence conforme à la demande : le glyphe (icône `Hammer` en exposant à la place de "IA"), le titre ("La Forge") et le contenu (sous-titre + "Toucher pour forger"). Icône-plaque et chevron de l'ancienne version supprimés (n'existaient pas chez Sensei).
- **Hiérarchie finale de `SeancesTab.tsx`** : Hero → Sensei^IA → Choisir une épreuve → La Forge → Chroniques complètes → Scan des Titans. Les titres de section redondants avec le contenu qu'ils enveloppaient ont été retirés : "Le Palmarès" (n'enveloppait plus que "Chroniques complètes" une fois RPG/Performances partis — la fonction `PalmaresSection` est supprimée, plus de wrapper) et "État du corps" (le composant `BodyMap` mode `recovery` affiche déjà son propre titre "Scan des Titans" en interne depuis la session précédente — doublon retiré). La fonction locale `SectionTitle` est donc devenue inutilisée et supprimée.
- Validé : `npx tsc --noEmit` 0 erreur, `eslint --fix` clean sur les 3 fichiers touchés, `npm run test` 145/145 verts (0 régression), `npm run build` OK (régénère `routeTree.gen.ts` sans la route `/maitrises`, purement soustractif).
- ⚠️ **Test navigateur manuel impossible dans cette session** (même contrainte IPv6/`EAFNOSUPPORT` que les sessions précédentes — `npm run dev` reste codé en dur sur `host: "::"` par `@lovable.dev/vite-tanstack-config`) — à vérifier par Nathan sur le déploiement Lovable/preview.

## Séances → Hero réduit + Progression RPG immersive (2026-07-07, branche `claude/seances-ux-refinement-j6xhcp`)
Nouvelle passe de finition UX demandée par Nathan, uniquement UI (aucun moteur/hook/Edge Function/migration/calcul de statistiques touché) :
- **`SeancesHero.tsx`** : la carte-citation ne monopolise plus l'écran — hauteur réduite d'environ 37% (`min-h-[240px]`→`150px`, `py-14`→`py-8`), typographie réduite (`26px`→`19px`, `leading-[1.85]`→`1.6`). Particules/braises/halos/centrage intouchés, la citation reste l'unique contenu.
- **Progression RPG repensée** : l'ancien carousel horizontal `ExerciseRankStrip` en tête de page (swiper des dizaines de cartes, jugé peu motivant) est remplacé par une seule carte immersive **`SeancesProgressionCard.tsx`** (nouveau, `src/components/fitness/`) inspirée de la hiérarchie du Profil mais avec une identité propre à Séances (médaillon `ExerciseRankBadge` en tête plutôt qu'un avatar, cadre unique plutôt qu'un empilement de blocs nus). Affiche : rang actuel + `MasteryBar` animée vers le rang suivant, l'exercice le plus proche du niveau suivant (argmax de `rank.progress` parmi `rankAggregate.reports` hors rangs maximés), la dernière progression importante (PR récent), la prochaine récompense (`achievements.nextObjective`), un conseil personnalisé (`nextRankHint`), puis un bouton **"Voir toutes les maîtrises"**.
- **Écran dédié `/maitrises`** (nouvelle route `src/routes/_authenticated/maitrises.tsx`) : liste TOUTES les techniques pratiquées ≥2 fois en grille (pas de swipe) — réutilise `ExerciseRankStrip` telle quelle avec un nouveau prop `layout?: "carousel" | "grid"` (défaut `"carousel"`, non cassant pour l'usage existant dans `progression.tsx`) et `computeBroadActivity` (déjà existant, utilisé par Profil) appelé avec une limite large (500) au lieu de la limite vitrine (8) — aucun nouveau calcul, juste un paramètre différent au point d'appel. Retour vers `/seances` (pas `/profil`).
- **Réutilisation stricte de l'existant, zéro duplication** : `SeancesTab.tsx` cable `<ProfileRPGData>` (déjà conçu pour être consommé par plusieurs écrans) pour obtenir `rankAggregate`/`achievements` sans reconstruire le câblage `RankAggregator`+`useAchievements`+`useBadgeSystem`. La fonction `useRecentPRs` (dupliquée en interne de `RPGProgressionSection.tsx`) a été extraite en fonction pure **`computeRecentPRs`** dans `src/utils/fitness/exercise-stats.ts` (à côté de `computePRs`), réutilisée par `RPGProgressionSection.tsx` (Profil, comportement strictement inchangé) et `SeancesProgressionCard.tsx` (Séances).
- Validé : `npx tsc --noEmit` 0 erreur, `eslint` clean sur tous les fichiers touchés (2 erreurs prettier préexistantes dans `exercise-stats.ts` sur des lignes non touchées, confirmées présentes aussi sur `main` avant cette session — non corrigées pour rester dans le périmètre de la demande), `npm run test` 145/145 verts (0 régression), `npm run build` OK (régénère `routeTree.gen.ts` avec la nouvelle route `/maitrises`, purement additif).
- ⚠️ Test navigateur manuel impossible dans cette session (même contrainte IPv6/EAFNOSUPPORT que la session précédente, voir entrée du 2026-07-07 "refonte La Forge" ci-dessous) — à vérifier par Nathan sur le déploiement Lovable/preview.

## Séances → passe de finition finale (2026-07-07, branche `claude/séances-page-polish-l7pl5u`)
Dernière passe UX demandée par Nathan sur le module Séances, architecture déjà validée. Aucun moteur/hook/Supabase/RPG touché.
- **`SeancesHero.tsx`** : contenu réduit à l'os — suppression de l'eyebrow "La Forge" et du bandeau bas "Séances", il ne reste que la citation "Chaque légende est forgée une répétition à la fois.", centrée horizontalement ET verticalement (`flex items-center justify-center`, `min-h-[240px]`, `text-center`), interligne augmenté (`leading-[1.85]`) et padding vertical élargi (`py-14`). Braises/particules/halos (`RankAmbientParticles`, halos respirants) intouchés, restent en pure ambiance.
- **`BodyMap.tsx`** (mode `recovery`, "Scan des Titans") : suppression du sous-texte "basé sur tes séances" — le titre suffit désormais, header simplifié (plus de `justify-between`).
- **Nouveau composant `LaForgeCard.tsx`** : remplace l'ancien bouton minimaliste "Catalogue d'exercices" dans `SeancesTab.tsx`. Même matériau que `SenseiIACard`/`ChoisirEpreuveCard` (fond radial ambré multi-couches, filet lumineux haut, halo qui respire et s'intensifie au toucher, icône `Hammer` sur plaque en relief). Sous-titre : « Choisis les techniques qui forgeront ta prochaine épreuve. » Ouvre toujours le même `ExerciseCatalogSheet` (`setCatalogOpen(true)`), aucune logique changée.
- **Historique unifié** : suppression complète de `WeekSessions`/`WeekSessionDetail` ("Séances de la semaine", devenu redondant avec "Chroniques complètes"). "Chroniques complètes" est désormais la seule source de vérité : vue compacte (carte repliée) affiche les 5 dernières séances (`recentWorkouts = data.slice(0,5)`, nom + jour + bouton "Refaire" réutilisant `repeatLive`), vue détaillée (dépliée) inchangée (graphes `WorkoutProgressCharts` + liste complète `WorkoutCard`/`GenericHistoryCard`). Nettoyage du code mort associé : `workoutMuscleLabels`, imports `formatTonnage`/`workoutTonnage`/`exerciseToMuscles`/`MUSCLE_META`/`adaptWorkoutRow`/`BookOpen` supprimés (plus utilisés).
- Validé : `npx tsc --noEmit` 0 erreur, `eslint` clean sur les fichiers touchés, `npm run test` 145/145 verts (0 régression), `npm run build` OK.

## Séances → refonte "La Forge" (2026-07-07, branche `claude/séances-reliquary-redesign-15ojom`)
Passe UX/UI pure demandée par Nathan : le module Séances devient un vrai lieu de l'univers Reliquary. Aucun moteur, hook, Supabase ni logique métier touché — uniquement composants React/styles/hiérarchie. Une session précédente avait déjà posé les fondations (`SeancesHero`="La Forge", `SenseiIACard`, `ChoisirEpreuveCard`, palette `rankVisuals.ts`/`RankAmbientParticles`) ; cette passe termine le chantier :
- **`seances.tsx`** (route) : suppression de l'eyebrow "Module" + du `<h1>Séances</h1>` dans le contenu (le Hero "La Forge" est désormais la seule identité visible ; l'onglet de nav garde son nom "Séances", le `<title>` de page aussi — non touchés).
- **`SeancesHero.tsx`** : la Forge devient un lieu vivant plutôt qu'un simple bandeau — 2 couches de particules (proche net + lointaine floutée `blur-[1px] scale-110`, réutilise `RankAmbientParticles` avec un `seed` différent), halo "cœur du brasier" et halo lointain en respiration continue (`framer-motion animate` loop infini), vignette qui s'illumine au survol/tap (`whileHover`/`whileTap` + `group-hover`). Aucun `onClick` ajouté — explicitement pas un bouton, juste une ambiance réactive au toucher.
- **Hiérarchie réordonnée** dans `SeancesTab.tsx` : La Forge → Sensei IA → Choisir une épreuve → **Progression RPG** (remontée, ex-embarquée en bas dans "Performances") → Catalogue d'exercices (redevient outil secondaire) → Le Palmarès → État du corps → Les Performances. Nouveau composant `SectionLink` (petit trait vertical dégradé) entre les grandes zones pour suggérer un même lieu traversé plutôt que des cartes indépendantes.
- **`ExerciseRankStrip.tsx`** : header interne dupliqué ("Progression RPG" + sous-titre) supprimé — la page fournit désormais le `SectionTitle` externe. Conteneur reskinné en carte glass Reliquary (`bg-gradient-to-b from-white/[0.04] to-white/[0.01]`, `rounded-3xl`, `backdrop-blur-xl`) au lieu du style `bg-card` générique. Toujours utilisé uniquement dans `SeancesTab.tsx`.
- **Nouveaux composants génériques réutilisables** : `SectionReveal.tsx` (fondu + légère élévation au scroll via `whileInView`, `once:true`, perf-safe) et `AnimatedNumber.tsx` (compteur animé via `useMotionValue`+`animate`+`useMotionValueEvent` de framer-motion — pattern officiel pour animer du texte, pas de nouvelle dépendance). Appliqués aux sections Progression RPG/Catalogue/Palmarès/État du corps/Performances et aux 3 tuiles de `PerfTile`.
- **`PerfTile`** (dans `SeancesTab.tsx`) : accepte désormais `value: number` (+`decimals`/`suffix`) au lieu d'une string pré-formatée, affichage via `AnimatedNumber`. Reskin "plaque" (badge icône circulaire avec halo radial de la couleur d'accent). Libellés reflavorés vocabulaire Reliquary sans changer la donnée : "Série"→**"Ardeur"**, "Cette semaine"→**"Cycle en cours"**, "Durée 7j"→**"Temps forgé"** (sous-titres inchangés, restent compréhensibles).
- **`BodyMap.tsx`** — **uniquement le mode `"recovery"`** (seul mode utilisé par Séances ; le mode `"measurement"` de `CorpsTab` est intouché, `ModelViews` reçoit juste 3 nouveaux props optionnels à défauts identiques à l'existant → zéro régression Corps) :
  - `ModelViews` gagne `bodyColor`, `maxWidthPx` (défaut 400, inchangé pour Measurement), `labelClassName`.
  - `RecoveryBodyMap` reskinné en "scanner divin" : fond dégradé profond cyan/violet, trame grille fine façon scanner, balayage lumineux animé (`motion.div` translateY en boucle), 4 réticules d'angle décoratifs, titre renommé "Scan des Titans" (mystique, la donnée/légende reste identique). Hauteur réduite (~30%) via `maxWidthPx={290}` (vs 400) + paddings/marges resserrés (`p-4→p-3`, `mt-4→mt-2`, `gap-y-1.5→gap-y-1`) — conserve toutes les infos (2 vues + légende complète), plus de scroll.
  - Dans `SeancesTab.tsx`, le wrapper `<div className="p-2 rounded-3xl border...">` autour de `<BodyMap>` a été supprimé (double-boîtage avec la carte que `RecoveryBodyMap` dessine déjà elle-même) — gain de hauteur supplémentaire.
- Validé : `npx tsc --noEmit` 0 erreur, `npm run build` OK, `npm run test` 145/145 verts (0 régression), `eslint --fix` clean sur tous les fichiers touchés.
- ⚠️ **Test navigateur manuel impossible dans cette session** : le serveur dev (`npm run dev`) est codé en dur sur `host: "::", port: 8080, strictPort: true` par `@lovable.dev/vite-tanstack-config` (pensé pour le sandbox Lovable qui supporte IPv6) — l'environnement d'exécution Claude Code Remote de cette session ne supporte pas le bind IPv6 (`EAFNOSUPPORT`). Aucun `.env` avec credentials Supabase réels non plus. À vérifier par Nathan sur le déploiement Lovable/preview.

## Refonte finale Profil → hub RPG (2026-07-06, branche `claude/profile-redesign-hub-85vgk2`)
Dernière passe demandée par Nathan : le Profil devient un vrai hub personnage qui renvoie vers ses modules au lieu de les copier en place. Aucun moteur (Rang/Maîtrise, Badges, Succès), hook métier, Supabase ni Edge Function touché — uniquement architecture/composants/navigation React.
- **`ProfileHeroCard.tsx`** : le rang global (`rankAggregate.best`) n'apparaît plus qu'à UN seul endroit (sous-titre sous le pseudo) — suppression de la pastille "Rang global" dupliquée et du bloc "Niveau X / XP" (`useUserStats`, système de niveau compte séparé de la Maîtrise par exercice, source de la confusion "le niveau apparaît deux fois"). `MasteryBar` gagne une prop `showLabel` (défaut `true`, non cassant) pour masquer la pastille de pourcentage flottante dans le Hero ("suppression définitive du 0%"). La ligne de stats devient une `grid-cols-3` fixe (série/séances/succès débloqués) — plus de scroll horizontal, plus de statistique coupée.
- **Nouveau concept "Classe principale"** : `src/lib/profile/characterClass.ts` (pur) agrège le volume déjà loggé par `ExerciseFamily` (réutilise `classifyExerciseFamily()` du moteur Rang existant, aucune nouvelle règle) et mappe la famille dominante vers un nom RPG (`CHARACTER_CLASS_LABELS` : Maître des Tirages/Poussées/Fondations/Hanches/Préhension/Polyvalent — `developpe_couche`+`developpe_militaire` fusionnés sous "Poussées"). `src/components/profile/ClassCard.tsx` : carte épurée (icône + nom, rien d'autre) → tap ouvre un `AppSheet` expliquant pourquoi (part de volume, exercice principal, meilleur rang dans la famille) et comment évoluer, à partir des données déjà calculées.
- **Progression RPG trimmée** (`RPGProgressionSection.tsx`) : ne montre plus QUE 5 informations (progression globale vers le prochain rang, prochain rang, prochaine récompense, progression récente, conseil = `nextRankHint` relabellisé) — suppression du gros badge "Meilleur rang obtenu" (doublon avec le Hero), des stat chips "Rang global"/"Exercice principal"/"Catégorie dominante", de `ExerciseRankStrip` et des embeds `TrophyRoom`/`QuestsPanel` (déplacés).
- **Salle des trophées et Quêtes** : ne sont plus embarquées en entier dans Profil. Nouveaux aperçus compacts `TrophyRoomPreview.tsx` (total/%, répartition par rareté, 2-3 succès proches, 1 secret) et `QuestsPreview.tsx` (quête principale, défi du jour) sur le Profil, avec lien "Voir tout" vers deux nouvelles routes dédiées `/trophees` (héberge `<TrophyRoom>` complet inchangé) et `/quetes` (héberge `<GoalsManager>` complet inchangé). Nouvelle route `/progression` héberge le détail complet (stat chips avancées + `ExerciseRankStrip`) retiré du hub.
- **Déduplication** : `src/lib/profile/achievements/collection.ts` (nouveau, pur) extrait la fusion succès+badges historiques (`buildAchievementCollection`) hors de `TrophyRoom.tsx` — réutilisée par `TrophyRoomPreview` et le Hero (compteur "succès débloqués"). `src/components/profile/rpg/ProfileRPGData.tsx` (nouveau) extrait tout le câblage `useWorkouts→computePRs→useBadgeSystem→RankAggregator→useAchievements` (ex-`ProfilPage`/`ProfilRPGBlock`) en composant render-prop réutilisé par le hub Profil, `/progression` et `/trophees` — plus de triple câblage dupliqué. `src/components/profile/achievementIcons.ts` centralise la table icône lucide (ex-`ICON_MAP` dupliquée).
- **Documents** : `DocumentsSummaryCard.tsx` gagne un bouton "Importer" distinct de "Voir tous", qui navigue vers `/documents?upload=1` ; `documents.tsx` gagne un `validateSearch` zod (`{ upload?: boolean }`) qui pré-ouvre le `Sheet` d'upload existant — aucune duplication de l'UI d'upload.
- Validé : `npm run build` OK, `tsc --noEmit` 0 erreur, `npm run test` 66/66 verts (0 régression), `eslint` clean sur tous les fichiers touchés.
- `package-lock.json` : `html-to-image` manquait du lockfile (déjà dans `package.json`) — resynchronisé au passage via `npm install`, sans lien avec cette feature.

## Audit des branches + moteur Rang/Maîtrise + fusion analyse (2026-07-05, session Claude Cowork)
- **Audit complet des branches `claude/*`** : 7 branches confirmées fusionnées/supersedées (contenu déjà présent dans `main`, vérifié fichier par fichier, pas juste par historique Git — plusieurs avaient un historique disjoint suite à des pushs GitHub web antérieurs) → suppression **demandée à l'utilisateur** (le token de cette session n'a pas les droits de suppression de branche distante, `git push --delete` → 403). `claude/rls-regression-fix-j7iksz` (fix CI bun.lock/validate-supabase.mjs) reste **non fusionnée, à traiter séparément**. `claude/daily-reminder-migration-xDd8V` gardée temporairement : contient une feature "suppléments comme rappels" jamais retrouvée dans `main`, à décider si on la recrée proprement (branche elle-même trop divergente pour un merge direct).
- **Nouveau moteur de Rang/Maîtrise** — remplace intégralement l'ancien système d'XP cumulative (`lib/fitness/exerciseXp.ts`, **supprimé**) par `src/lib/fitness/rank/` (`types.ts`, `config.ts`, `familyClassification.ts`, `engine.ts`, `engine.test.ts`) :
  - **Rang** = niveau réel actuel (force relative 1RM estimé/poids de corps par famille d'exercice, + modificateurs volume/qualité de reps bornés), calculable dès la 1ère séance pour Mortel→Titan.
  - **Maîtrise** (0-100%, remplace le terme "XP" dans toute l'UI) = consolidation + progression vers le rang suivant (surcharge, reps, tonnage, fréquence, régularité, PR récents, expérience).
  - **Olympien et Primordial exigent une confirmation dans la durée** (`ConfirmationGate` en cascade, Primordial le plus strict : 5 séances qualifiantes étalées sur ≥60j + 15 séances d'expérience minimum ; Olympien : 3 séances/≥30j/10 séances). En dessous, une seule séance suffit. Aucune comparaison inter-utilisateurs (rejetée explicitement par Nathan).
  - Décroissance d'inactivité bornée à **1 seul palier maximum**, jamais plus, quelle que soit la durée d'arrêt (bug de cumul avec la confirmation trouvé et corrigé pendant la simulation — la confirmation ne doit regarder que les séances récentes par **nombre**, jamais re-filtrer par date par rapport à `now`, sinon elle se recombine avec la décroissance et fait chuter de plusieurs paliers).
  - Entièrement configurable (`DEFAULT_RANK_ENGINE_CONFIG`) : aucune pondération/seuil codé en dur dans `engine.ts`. Barèmes par famille (squat/presse-jambes, deadlift/tirage-hanche, développé couché, développé militaire, tirage/traction dos, isolation, poids de corps) proposés et validés par simulation sur 9 profils représentatifs avant intégration — pas de tables de force externes publiées utilisées telles quelles, seuils construits et testés dans `engine.test.ts`.
  - Branché dans `useExerciseProgression.ts` (retravaillé : lit aussi `body_tracking.weight` via `useBodyMeasurements`, poids de corps par défaut 75kg si non renseigné + avertissement UI). `ExerciseRankCard.tsx` affiche désormais "Maîtrise" (plus "XP"), un message unique vers le rang suivant (plus de liste d'objectifs, plus de statut "en cours de confirmation" visible).
  - `exerciseRanks.ts` : `xpForTier`/`rankFromXp` supprimés (dead code après le remplacement) ; `RANK_TIERS`/`exerciseDifficulty`/`DIFFICULTY_RULES` conservés (toujours utilisés par `lib/fitness/analysis/`).
- **Fusion de `claude/exercise-analysis-engine-2p9viu` dans cette branche** (cherry-pick propre, base identique à `main` au moment du merge, zéro conflit) : `ExerciseAnalysisSheet.tsx` remplace **partout** `ExerciseStatsSheet.tsx` (désormais supprimé) — `ActiveWorkoutView.tsx`, `WorkoutCard.tsx` **et** `ExerciseRankStrip.tsx` (ce 3ᵉ point d'usage n'était pas couvert par la branche d'origine, corrigé ici). Voir la section "Moteur d'analyse par exercice" ci-dessous pour le détail de cette feature — son texte y est conservé tel quel mais la mention "XP" au sujet d'`ExerciseRankCard` y est obsolète, remplacée par la Maîtrise décrite ci-dessus.
- Validé par `tsc --noEmit` (0 erreur), `npm run test` (66 tests verts dont les 25 de `lib/fitness/analysis`), `npm run build` (build prod OK). Pas de test manuel navigateur possible dans cette session (pas d'accès à un compte Supabase réel) — à vérifier par Nathan sur le déploiement Lovable.
- Déploiement edge `analyze-exercise` **non fait** depuis cette session (nécessite MCP Supabase avec droits déploiement) — le fichier repo est prêt mais pas encore poussé en prod.

## Moteur d'analyse par exercice (2026-07-05) — NOUVELLE FEATURE
Transforme chaque exercice de l'historique en fiche d'analyse intelligente. Décisions actées avec Nathan : (1) IA rédactionnelle **hybride à la demande** — moteur déterministe par défaut + bouton « Analyse IA approfondie » optionnel ; (2) objectif utilisateur **inféré + réglage explicite optionnel** ; (3) **fiche unifiée remplaçante** ; (4) livraison en une passe.

### Domaine pur — `src/lib/fitness/analysis/` (zéro React, testé)
- `types.ts` — types + labels (TrainingObjective, MuscleRole, PhysicalTrait, ExerciseAnalysis, etc.).
- `muscleRoles.ts` — `resolveMuscleRoles()` : décompose un exercice en principal/secondaire/stabilisateur. Repli 1 = `exerciseToMuscles` (mapping plat existant), repli 2 = muscles résolus par l'IA (`muscle_groups`), repli 3 = **modèle biomécanique générique** (jamais vide, `isGeneric:true`).
- `physicalImpact.ts` — vecteur largeur/épaisseur/force/hypertrophie/explosivité/stabilité/posture/mobilité, pondéré par mouvement + plage de reps réelle + objectif.
- `profile.ts` — `inferObjective()`/`buildProfileContext()` : priorité objectif explicite > signaux Corps (body_fat/muscle_mass trend) + goals > plage de reps. Utilise `body_tracking`.
- `comparison.ts` — évolution charge/reps/volume/1RM dernière séance vs précédente + PR + état (progression/stagnation/régression/nouveau) + explication. Réutilise `sets.ts`.
- `recommendations.ts` — moteur de recommandations (charge/reps/série/amplitude/excentrique/technique/fréquence/récup) selon état + reps + récup + objectif.
- `imbalance.ts` — déséquilibres déduits de la **recovery map** (aucune requête sup.) : push/pull, haut/bas, muscle négligé, récup incomplète, progression insuffisante.
- `relevance.ts` — score ★1-5 + label (essentiel/recommandé/secondaire/peu pertinent) + raisons, selon profil+objectif.
- `narrative.ts` — textes déterministes (analyse rédigée + résumé intelligent), repli par défaut instantané/offline.
- `engine.ts` — `analyzeExercise(input)` agrège tout. `index.ts` = façade publique.
- `engine.test.ts` — 25 tests (vitest). ⚠️ vitest non installable ici (registre privé Lovable `europe-west4-npm.pkg.dev` bloqué 403 par la policy réseau) → tests lancés avec un vitest isolé depuis registry.npmjs.org : **55/55 verts**. tsc du moteur pur : clean.

### Hooks — `src/hooks/`
- `useExerciseAnalysis.ts` — assemble les entrées depuis les caches existants (`useExerciseSetHistory`, `useWorkouts`→`useRecoveryMap`, `useBodyMeasurements`, `useGoals`, `useTrainingObjective`), mémoïse `analyzeExercise`. **Zéro requête supplémentaire.**
- `useDeepExerciseAI.ts` — IA à la demande via `useQuery` `enabled:false` + `refetch()`, cache `staleTime:Infinity` (pas de re-appel en rouvrant la fiche). Appelle l'edge `analyze-exercise`.
- `useTrainingObjective.ts` — objectif explicite stocké dans `user_preferences.ai_preferences` (JSON, **aucune migration** — choix délibéré vu le drift migrations documenté).

### UI — `src/components/fitness/ExerciseAnalysisSheet.tsx`
Fiche unifiée (drop-in, mêmes props qu'`ExerciseStatsSheet`) : résumé intelligent + pertinence ★, `ExerciseRankCard` (rang RPG/XP/progression réutilisé tel quel), analyse rédigée + bouton IA + sélecteur d'objectif, graphes poids/volume/1RM (repris d'ExerciseStatsSheet), comparaison, muscles par rôle (barre sollicitation + pastille récup), impact physique, recommandations, déséquilibres, détail des séries. **Branchée** dans `WorkoutCard.tsx` et `ActiveWorkoutView.tsx` (imports repointés). `ExerciseStatsSheet.tsx` conservé mais **superseded** (plus référencé en render — supprimable plus tard sur validation).

### Edge — `supabase/functions/analyze-exercise/`
Gemini 2.5 Flash, prose FR 4-6 phrases, CORS/auth/rate-limit (`analyze_exercise`, 20/h). Retourne `{ text }`. Nécessite le secret `GEMINI_API_KEY` (déjà présent). Le bouton se dégrade proprement si l'edge est indisponible (texte déterministe conservé).
- **Fichier auto-contenu (choix délibéré, source de vérité = repo)** : contrairement aux fonctions sœurs qui importent `../_shared/rate-limit.ts`, `analyze-exercise/index.ts` **inline** le rate-limit. Raison : le bundler du déploiement MCP place l'entrypoint sous `source/` et ne peut pas résoudre un import remontant `../_shared`. En gardant la logique inline, le fichier du **dépôt peut être déployé BYTE-POUR-BYTE identique** → aucune divergence repo/prod possible (demande explicite de Nathan, 2026-07-05). Le NB en tête du fichier documente ce choix.
- État déploiement : projet `bcwfvpwxzlmkxobvbtzp`, **v2 ACTIVE**, verify_jwt. `index.ts` déployé = **byte-pour-byte identique** au fichier du dépôt (vérifié via `get_edge_function` ; sha256 repo = `2c49495c…`, 7352 o). deno.json déployé = import map minimal (`@supabase/supabase-js@2.49.4`) équivalent au `functions/deno.json` partagé du repo (les compilerOptions y sont des hints de types locaux, sans effet runtime).
- ⚠️ Piège MCP rencontré : un redéploiement échoue avec `import map path does not exist … source/file:///…` si on ne passe pas `import_map_path` explicitement — **toujours fournir `import_map_path: "deno.json"`** lors d'un redéploiement de fonction existante via MCP. MCP aussi instable par moments (déconnexions).

## Nettoyage complet du code mort (2026-07-05)
- Rapport détaillé : `CLEANUP_AUDIT_REPORT.md` (racine du repo).
- Frontend : `src/ui/` supprimé, `src/lib/fitness/index.ts` (façade jamais utilisée) supprimé, `src/components/recipe/` entier supprimé (feature création de recette jamais construite — seule la lecture `useRecipes`/`useRecipe` survit), 30 composants shadcn/ui inutilisés supprimés, `RestTimer.tsx` (remplacé par `RestTimerBar.tsx`+`useRestTimer`), `BodyHighlighterRenderer.tsx` (remplacé par `MuscleMap.tsx`), `HomeDashboard.tsx`, `ReportSummaryWidget.tsx`, `useNutritionCalculator.ts`, `useProgress.ts`, `use-mobile.tsx`, `motion.ts`, `hashing.ts`, `SwipeableExerciseRow.tsx`, `recipeTypes.ts` + son test, `auth-middleware.ts`, `client.server.ts`.
- npm : 31 dépendances + 1 devDependency supprimées (radix-ui inutilisés, dnd-kit, cmdk, embla-carousel-react, react-hook-form, react-day-picker, input-otp, vaul, react-resizable-panels, @testing-library/react). `vitest` monté en v4 (faille critique corrigée, tests toujours verts). 0 vulnérabilité npm restante.
- ⚠️ **Rappel projet** : `dossiers, contrats, taches, taches_recurrentes, dossier_documents, cp_*, dsn, echeances, affiliations_mutuelle, historique_imports, imports, regles_analyse, arrets_maladie, ca_praticiens, controle_lignes, silae_sync_logs, stc, profiles, app_settings, activity_log` appartiennent au projet **Contrôle de Paie séparé** qui partage cette base — ne jamais les toucher depuis une session cortex-home-ai. `activity_log` en particulier alimentée par des triggers sur les tables paie (182 lignes), découvert pendant cet audit.
- DB : 6 tables mortes supprimées (migration `20260705120933_drop_orphaned_unused_tables`) : `training_programs`, `program_weeks`, `program_sessions`, `program_exercises` (ancienne feature "Coach IA V2 Programs", hooks déjà absents du repo), `stock_history` (feature Stocks/Maison, `use-stocks.ts` absent), `food_search_history` (jamais lue, index déjà signalé unused). Types Supabase régénérés.
- Conservé par précaution (voir rapport pour détails) : `home_subcategories` (54 lignes, écrite par un trigger mais jamais lue — à trancher côté produit), `data_backups`/`compute_fitness_stats`/`rls_auto_enable`/`cleanup_old_pdfs`/`cleanup_expired_cache`/`ensure_home_categories_for_me` (fonctions sans appelant trouvé mais profil admin/cron/sécurité, pas assez de certitude pour supprimer), 5 Edge Functions sans appel frontend mais conçues pour déclenchement externe (cron/webhook), `@cloudflare/vite-plugin`/`@tanstack/router-plugin` (liés au build Cloudflare Workers, non testables ici).
- **Bug `PROFILE_BASE_QK` confirmé et corrigé (même jour)** : `signOut()` (`use-auth.tsx`) ne vidait aucun cache react-query → fuite de données entre comptes si changement de compte sans rechargement complet. Fix : `queryClient.clear()` dans `signOut()`. `PROFILE_BASE_QK` reste utilisé en interne (clé de repli) mais n'est plus exporté.

## Audit + reconstruction complète des migrations (2026-07-05)
- Rapport détaillé : `MIGRATION_AUDIT_REPORT.md` (racine du repo).
- `supabase/migrations/` passe de 82 à **141 fichiers** : 58 migrations manquantes reconstruites verbatim depuis `supabase_migrations.schema_migrations.statements` (le SQL exact exécuté en prod, pas une approximation), 2 fichiers renommés à leur vrai timestamp prod, 1 snapshot non-historique ajouté pour 3 tables (`activity_log`, `dossier_documents`, `taches_recurrentes`) dont l'origine est introuvable.
- **120/120 migrations prod désormais présentes dans le repo avec version+nom identiques.** Aucune modification du schéma de production.
- ⚠️ Restent non résolus (voir rapport §6) : 20 migrations locales jamais trackées en prod (au moins 5 confirmées jamais appliquées : `calendar_tokens`, `daily_activity`, `compute_level_from_xp`, `award_xp_on_goal_complete`, `award_time_of_day_badges`) ; anomalie `reminders` (dropped par une migration non trackée le 19 juin mais toujours vivante avec son schéma enrichi — origine de la recréation introuvable) ; rejeu complet des 141 migrations jamais testé (pas de Docker/Supabase CLI disponibles dans cette session).

## ⚠️ IMPORTANT — Origine des IDs "SUP-XXXX-XXXX"
Ces IDs ne viennent PAS de Supabase (dashboard/support) : ils sont générés par notre propre logger client `src/lib/error-logger.ts` (`generateSupportId()`) et stockés dans la table `public.error_logs` (colonne `support_id`). Pour investiguer un "SUP-...", toujours commencer par :
```sql
select * from public.error_logs where support_id = 'SUP-...';
```
Ne PAS supposer que c'est lié à un log Postgres/Storage/Edge Function juste parce que le timing coïncide (erreur commise le 2026-07-05, corrigée ensuite).

## Fix CI storage bucket pdfs (2026-07-05, sans rapport avec les IDs SUP-)
- `.github/workflows/migrate.yml` step "Ensure storage bucket pdfs" faisait un `POST /storage/v1/bucket` à chaque run CI touchant `supabase/migrations/**`, même bucket déjà existant → `ERROR: duplicate key value violates unique constraint "buckets_pkey"` côté Postgres (bruit, sans impact utilisateur).
- Fix : `GET /storage/v1/bucket/pdfs` préalable, POST seulement si absent.

## Fix bruit hydratation React sur "/" (2026-07-05) — cause réelle des SUP-MR7LCKN4-61KC, SUP-MR7LYHIW-87MD, SUP-MR7MJHXQ-3OJ5 et consorts
- Route `/` = `src/routes/_authenticated/index.tsx`, sous `_authenticated.tsx` qui a `ssr: false` (décision actée juin 12, chantier persistance de session). Le root `__root.tsx` enrobe `<Outlet/>` dans un `<Suspense fallback={<LoadingScreen/>}>`.
- Conséquence connue et non-fatale de `ssr:false` + Suspense root : React jette parfois en prod "Minified React error #418" (mismatch hydratation) ou "#422" (Suspense boundary hydration → bascule client-side). React se rétablit tout seul en re-rendant côté client ; aucune casse fonctionnelle observée.
- `error-logger.ts` avait déjà un filtre `/hydrat/i` avec le commentaire "hydration mismatch warnings" — mais il ne matchait jamais le texte minifié de prod (`"Minified React error #418..."` ne contient pas "hydrat"). Résultat : ces erreurs bénignes généraient un `support_id`, un toast "Une erreur s'est produite" visible utilisateur, et une ligne `error_logs` à chaque occurrence (plusieurs fois par jour depuis au moins le 16 juin).
- Fix : ajout d'un pattern `/react\.dev\/errors\/4(18|19|21|22|23|25)\b/` dans `NOISE_PATTERNS` (tous les codes d'erreur React liés à l'hydratation/Suspense). Complète l'intention déjà présente du filtre `/hydrat/i`, ne change rien au comportement fonctionnel.
- Si ce bruit doit un jour être éliminé à la racine (pas juste filtré), regarder l'interaction `ssr:false` sur `_authenticated` + `<Suspense>` racine dans `__root.tsx`.

## Fix race condition exercise_sets (2026-07-05) — cause de SUP-MR1OQX7K-Y8B5, SUP-MR4KR2Y8-WMLB (duplicate key exercise_sets_exercise_id_set_number_key, /seances)
- `ActiveExerciseCard.tsx` : les boutons « Ajouter une série » et « Reprendre les charges précédentes » n'étaient gardés que par `addSet.isPending`/`updateSet.isPending`. Or `handleRestoreLastSession` boucle sur plusieurs `await addSet.mutateAsync(...)` séquentiels : `isPending` retombe à `false` entre deux itérations, ré-activant brièvement les deux boutons. Un clic pendant cette fenêtre calculait `nextNumber` depuis un `sortedSets` pas encore à jour → même `set_number` que celui en cours de création par la boucle → violation UNIQUE.
- Fix : état local `isBusy` qui couvre toute la durée de l'opération (boucle de restauration incluse), remplace les deux `disabled=` séparés.
- Défense en profondeur : `useAddExerciseSet` (`use-fitness.ts`) retry maintenant une fois sur conflit Postgres `23505` en relisant le `max(set_number)` serveur, au lieu de laisser échouer l'ajout de série (couvre aussi le cas multi-onglets/multi-appareils).

## Deux bugs déjà corrigés en direct sur la BDD prod, jamais commités en migration (2026-07-05)
- `SUP-MQZAWMJ6-3VU7` (StorageApiError "new row violates row-level security policy", /seances, 29 juin) : upload photo exercice sur chemin `user-exercise/<user_id>/...` — l'ancienne policy générique checkait `(storage.foldername(name))[1] = auth.uid()` (attendu pour un chemin plat `<user_id>/fichier`), donc toujours fausse pour ce chemin imbriqué. Une policy dédiée `exercise-images user subfolder {upload,select,delete}` (`[2] = auth.uid()`) existe **déjà en prod** et couvre le cas (RLS = OR des policies) → plus d'occurrence depuis. Migration jamais retrouvée dans le repo.
- `nutrition_meal_check` (2 occurrences, 16 juin, /fitness) : le slug `"petit-dej"` utilisé partout dans l'app (`lib/nutrition/meals.ts`) violait la contrainte CHECK de `public.nutrition.meal` qui n'acceptait que `'petit-dejeuner'`. **Déjà corrigé en prod** (`ALTER ... CHECK (meal = ANY (ARRAY['petit-dej','petit-dejeuner',...]))`) — confirmé par 34 lignes `meal='petit-dej'` en base et aucune récidive depuis. Le repo contient bien une entrée `20260616143452_fix_nutrition_meal_check_petit_dej` dans l'historique **remote** des migrations (`list_migrations`), mais **aucun fichier .sql correspondant n'existe dans `supabase/migrations/`**.

## ⚠️ DRIFT MAJEUR migrations repo vs prod (découvert 2026-07-05)
- `list_migrations` (MCP Supabase) recense **120 migrations appliquées** sur le projet `bcwfvpwxzlmkxobvbtzp`. Le dossier `supabase/migrations/` du repo n'en contient que **82**. **58 migrations existent en prod sans fichier .sql correspondant dans GitHub** (dont les deux ci-dessus), notamment tout un bloc juin 21 → juillet 3 (RLS/perf hardening, exercise_sets, coach IA v2, nutrition v2, catalogue foods, saved_meals, weekly_reports, backups...).
- Conséquence : rejouer les migrations du repo sur une base fraîche (nouvelle branche Supabase, restauration, onboarding dev) **ne reproduirait pas l'état réel de prod** et réintroduirait des bugs déjà corrigés (ex. les deux ci-dessus).
- Pas traité dans cette session (hors périmètre de la demande initiale) — nécessite un audit dédié : `supabase db diff` / comparaison migration par migration pour reconstituer les .sql manquants avant de les committer.

## ⚠️ Règle : mettre ce fichier à jour à la fin de chaque session
Toujours mettre à jour ce fichier avec les nouveaux composants, hooks, migrations, features découverts.

## Mise à jour du jour (2026-06-28) — Différentiateurs + Refactor God Hook

### Différentiateurs Séances
- `WorkoutTimer.tsx` (NOUVEAU) : composant isolé avec son propre `setInterval`. Seul lui re-render chaque seconde, plus l'arbre entier de `ActiveWorkoutView` (perf 🔴 corrigé).
- `ActiveWorkoutView.tsx` : streak badge 🔥 dans le header via `useFitnessStreak`. Prop `recoveryMap` ajoutée et passée à chaque `ActiveExerciseCard`.
- `ActiveExerciseCard.tsx` : badges ⚠ "muscle fatigué" (status="fatigued" via recoveryMap + `exerciseToMuscles`). Chip "Suggéré : X kg × N reps · RPE 7" via `recommendLoad()` (Epley inverse modulé récupération).
- `SeancesTab.tsx` : `recoveryMap` transmis à `ActiveWorkoutView`.

### Refactor God Hook use-fitness.ts (🔴 corrigé)
- `hooks/useNutritionGoals.ts` (NOUVEAU) : `NutritionGoals` type + 2 hooks
- `hooks/useBodyTracking.ts` (NOUVEAU) : 3 hooks body tracking
- `hooks/useNutritionData.ts` (NOUVEAU) : 6 hooks nutrition journalière
- `use-fitness.ts` : re-exports rétro-compat, réduit ~1013 → ~650 lignes, zéro import cassé

## Mise à jour du jour (2026-06-28) — 10 quick wins Séances
- `src/lib/fitness/config.ts` : **nouveau fichier**, constante `GYMS` partagée (`["Keep Cool", "On Air"]`). Import dans StartWorkoutSheet + WorkoutSheet.
- `seances.tsx` (route) : suppression du doublon bouton Coach IA + `ProgramSheet` (le Coach IA est déjà dans `SeancesTab.tsx`).
- `StartWorkoutSheet.tsx` : nom de séance auto-rempli (`getDefaultName()` → "Séance du Lundi soir"). Import GYMS depuis config.
- `WorkoutSheet.tsx` : suppression du `RestTimer` (inutile dans le flux rétroactif). Import GYMS depuis config. Suppression `restTimerOpen` state et import `Timer`.
- `ActiveExerciseCard.tsx` : haptic feedback `navigator.vibrate(50)` à la validation de série. Placeholder numériques remplis avec valeurs réelles (plus de "—" incompatible avec type=number). Zone de tap Trash élargie `w-5 → w-11`.
- `ActiveWorkoutView.tsx` : chronomètre séance `text-sm → text-2xl font-bold`. "Salle inconnue" cachée en UI.

## Mise à jour précédente (2026-06-25)
- SéancesTab : bloc "Séances de la semaine" rendu repliable (comme l'Historique complet), avec le bouton "Détails" conservé et le chevron d'expansion.
- CorpsTab : suppression totale de la carte IMC, du calcul BMI et des imports liés (`Scale`, `useUserPreferences`, `height_cm`).
- BDD : migration ajoutant la colonne `completed` sur `exercise_sets` pour la validation set-by-set.
- Hook `use-fitness.ts` : cast temporaire `as any` sur le payload de `useUpdateExerciseSet` le temps de régénérer les types Supabase.
- Build production OK.

---

## Ce que fait cette app
App **ICORTEX** (nom officiel dans les titres de pages) : assistant personnel multi-domaine (fitness, nutrition, maison, paie, rappels, documents). Interface premium mobile. Usage post-séance ou quotidien.

## Stack
- React + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- Supabase (auth + BDD + Storage)
- TanStack Query (react-query)
- Lovable pour la génération UI
- Claude Code pour la logique domaine
- Déploiement : Cloudflare Workers (wrangler.jsonc)

---

## Architecture actée (Sprints 1 et 2 terminés)
- MuscleId en français canonique ("pectoraux", "quadriceps") = source de vérité
- MuscleMap.tsx = seul renderer SVG canonique
- useRecoveryMap() = hook central transformation Supabase → domaine
- RECOVERY_COLORS centralisé dans recovery.ts
- resolveMuscleSlugs() gère les alias ("jambes" → ["quadriceps", "ischio", "fessiers"])
- "cardio" a le flag isCardio: true, bypass computeRecovery()
- lib/fitness/index.ts = façade point d'entrée unique du domaine

## Composants supprimés définitivement
- MuscleBodyMap → supprimé Sprint 1
- bodymap-paths.json → supprimé Sprint 1

---

## Routes existantes
- `/` → index (home avec catégories)
- `/login` → connexion (email/password + Google OAuth)
- `/reset-password` → réinitialisation mot de passe (nouveau — juin 12)
- `/_authenticated/index` → accueil connecté
- `/_authenticated/fitness` → page fitness (onglets : Séances, Corps, Nutrition)
  - `CoachSheet` → sheet IA coach
  - `CorpsTab` → MuscleMap + récupération
  - `SeancesTab` → liste séances
  - `NutritionTab` → macros du jour
- `/_authenticated/profil` → profil redesigné (mai 23)
- `/_authenticated/stocks` → inventaire maison
- `/_authenticated/rappels` → rappels (kanban + calendrier)
- `/_authenticated/documents` → PDFs utilisateur
- `/_authenticated/preferences-alimentaires` → préférences alimentaires

---

## Domaines / Features

### Fitness (Sprints 1+2+3+4)
- Séances d'entraînement + WorkoutSheet + SwipeableExerciseRow
- MuscleMap SVG récupération par muscle
- ExercisePickerSheet, ExerciseStatsSheet, WorkoutProgressCharts
- Historique exercices (migration exercise_history mai 15)
- Lieu d'entraînement sur les workouts (migration add_gym_location_to_workouts juin 9)
- Badges fitness (lib/fitness/badges.ts + useUserBadges + useBadgeSystem)
- Objectifs (useGoals, GoalsSheet)
- Streak + activité (useStreak, useUserActivity, ActivityTimeline)

### Fitness — V1 Sprint 4 (juin 13)
- `lib/fitness/strength.ts` — estimate1RM (Epley), setTonnage, workoutTonnage, formatTonnage (créé par Lovable, validé)
- `hooks/useFitnessStreak.ts` — streak ISO-week ≥ N séances/semaine (créé par Lovable, validé)
- `components/fitness/RestTimer.tsx` — composant overlay : countdown ring SVG, son (Web Audio API), vibration, presets 60/90/120/180s
- `components/fitness/WorkoutSheet.tsx` — ajout bouton "Démarrer le repos" par exercice + intégration RestTimer + gym_location conservé
- `components/fitness/WorkoutCard.tsx` — 1RM estimé par exercice (Epley, affiché dans header groupe), tuile "Tonnage" utilise formatTonnage (remplace "Volume" + formatVolume local)
- WorkoutCard local était une version obsolète — remplacé par la version GitHub premium (buildGroups, ExerciseGroup, StatTile)
- ⚠️ Fichiers locaux (Google Drive) désynchronisés vs GitHub — workflow : lire sur GitHub raw avant toute modification

### Fitness — V1 set-by-set + RPE (juin 13) — TERMINÉ
- Table exercise_sets (id, exercise_id FK, user_id, set_number, reps, weight, rpe 0-10, notes, created_at). RLS, UNIQUE(exercise_id, set_number).
- lib/fitness/sets.ts (WorkingSet, setsTonnage, bestEstimated1RM, topSet, totalReps, averageRpe, summarizeSets), hooks/useExerciseSets.ts, use-fitness.ts useAddWorkout étendu (setDetails), WorkoutSheet éditeur série-par-série.

### Nutrition
- Macros quotidiennes (NutritionSheet, PortionEditModal)
- Scan repas IA (MealScanSheet) + Scan code-barres (BarcodeScannerSheet)
- Recherche aliments via **USDA FoodData Central + catalogue Supabase** (edge `food-lookup` → `services/foodCatalog.ts`). ⚠️ Open Food Facts retiré ; `services/openFoodFacts.ts` n'est plus qu'un shim de type (ré-exporte `FoodResult` via foodCatalog). Résidus à nettoyer (commentaires, libellé visible NutritionTab L273).
- Recettes (components/recipe/ : MacroProgress, NutritionBadge, PortionSelector, RecipeMacros)
- Portions en BDD (migration nutrition_portions)
- Préférences alimentaires (route dédiée)
- useNutritionCalculator

### Maison
- Stocks / inventaire (use-stocks, historique via stock_history)
- Rooms + compartiments (lib/maison/rooms.ts, rooms_compartments_refactor)
- Home catégories + sous-catégories (useHomeCategories, useHomeSubcategories, components/home/)
- Pantry (use-pantry.ts — hook présent, route non visible)
- Transfer feature (src/features/transfer/ : TransferPanel, useTransfer, transferService, detectContent)

### Rappels
- Table reminders (priorité, statut, récurrence, favoris)
- Vues : KanbanView, CalendarView, ReminderCard, ReminderSheet, SmartInput
- Hooks : useReminders, useReminderNotifications, useReminderShortcuts
- Temps réel via Supabase realtime

### Documents / PDFs
- Upload et stockage (use-documents, use-user-pdfs)
- Storage RLS policies (migration mai 20)

### Profil
- Redesign complet (migration profile_redesign_complete mai 23)
- ProfileHeader, EditPseudoSheet, ProgressSheet, ProgressionCard, StreakSheet, AppSheet, PersonalizationPanel
- useProfile, useProgress, useUserStats
- Synchronisation pseudo profil ↔ accueil (règle CLAUDE.md)

### Préférences utilisateur (nouveau — juin 12)
- Table user_preferences créée aujourd'hui
- useUserPreferences : theme (dark/light), accent_color, units (metric/imperial), animations, notifications, ai_preferences
- Valeurs par défaut : dark, #6c63ff, metric

### Auth — Persistance de session (gros chantier juin 12)
- **Problème résolu** : sessions perdues après reload / nouveau contexte / multi-onglets
- `lib/authDiagnostics.ts`, `lib/authSession.ts` (restoreAuthSession, refreshAuthSession), client.ts persistentStorage + PKCE, use-auth.tsx scheduleRefresh, _authenticated.tsx ssr:false, routes/reset-password.tsx, e2e/auth-persistence.spec.ts

### Contrôle de Paie
- ⚠️ Projet SÉPARÉ, sans lien avec Icortex — ne pas intégrer dans cette app

### Sécurité & Perf (juin 5 + juin 12)
- Audit RLS complet (sec1-sec6), révocation accès anon, indexes manquants, optimize_rls_policies_initplan, optimize_realtime_messages_policy

---

## Règles UX importantes
- Interface fluide, design premium
- Animations légères
- Pas de popup inutile
- Responsive parfait mobile obligatoire

---

## Renderer SVG canonique
- BodyMap.tsx = seul renderer SVG actif (mode "recovery" + mode "measurement")
- Importé dans SeancesTab.tsx et CorpsTab.tsx

## Points de vigilance
- use-pantry.ts existe sans route visible → feature en cours ou à connecter
- Contrôle de Paie = projet SÉPARÉ, sans lien avec Icortex

---

## Fitness — Coach IA V2 (juin 14)
- Tables Supabase : training_programs, program_weeks (périodisation), program_sessions, program_exercises. RLS auth.uid()=user_id, index, cascades. Migrations additives appliquées en prod.
- Domaine pur : lib/fitness/periodization.ts (generateProgramWeeks, modèles linear/undulating/block, deload, phaseLabel) + lib/fitness/loadRecommendation.ts (recommendLoad : auto-régulation RPE = reps en réserve via Epley inverse, modulée par la récupération).
- hooks/usePrograms.ts : usePrograms, useProgramWeeks, useCreateProgram (peuple program_weeks via la périodisation pure), useUpdateProgram, useDeleteProgram. Cast `supabase as any` (types.ts non régénéré).
- components/fitness/ProgramSheet.tsx : création + aperçu live périodisation + liste/détail. Branché via bouton « Coach IA » dans routes/_authenticated/fitness/index.tsx (en-tête).
- 30 tests unitaires des fonctions pures : OK.

## Nutrition — V2 (juin 14)
- Tables Supabase : recipes, recipe_ingredients (FK items pour macros via *_per_100g), meal_plans. Réutilise items et shopping_list. RLS + index. Migrations additives en prod.
- Domaine pur : lib/nutrition/recipes.ts (recipeMacros, perServing, scaleServings, sumMacros) + lib/nutrition/shoppingList.ts (aggregateNeeds, buildShoppingList = besoins moins stock).
- hooks/useRecipes.ts (CRUD recettes + macros calculées) ; hooks/useMealPlan.ts (planning hebdo + useGenerateShoppingList + useSaveShoppingList vers shopping_list).
- components/fitness/MealPlanSheet.tsx : planning semaine + génération liste de courses. Branché via bouton « Planning de la semaine » dans NutritionTab.tsx.

## Process (juin 14)
- Après chaque change : tester sur le site déployé (Cloudflare Workers, worker tanstack-start-app) et indiquer le résultat à Nathan.

## V3 — Coach recovery-aware (juin 14)
- lib/fitness/recoveryAdvice.ts (pur, + recoveryAdvice.test.ts) : MUSCLE_AI_NAME (MuscleId→nom edge minuscule), worstStatus, selectionRecovery, readyAlternatives, buildAiRecoveryContext.
- CoachSheet.tsx : prop recoveryMap → pastilles de récup par muscle + avertissement muscles fatigués + suggestions muscles prêts ; envoie `recovery` à l'edge. Fix : noms de muscles passés en minuscules (aiMuscleNames) car l'edge valide en minuscules (génération muscu était cassée avant).
- SeancesTab.tsx : passe recoveryMap (déjà calculé) à CoachSheet.
- Edge supabase/functions/coach-workout : déployée v7 via MCP Supabase (normalizeMuscle + buildRecoverySection à partir de body.recovery). ⚠️ La version déployée fait foi et DIVERGE du repo (le repo n'a pas _shared/ai.ts). Modifier l'edge = redéployer via MCP, pas via GitHub. Le Publish Lovable n'écrase pas le runtime edge.
- Hébergement réel : Lovable (cortex-home-ai.lovable.app). Déploiement = Publish/Update dans le projet Lovable après commit GitHub.

## Refonte Fitness UX/UI premium (en cours — 2026-06-17)
**Décisions actées avec Nathan :**
- Nouvelle **navigation globale** = 5 modules : Accueil · Séances · Corps · Nutrition · Profil (même ordre mobile/desktop). Les onglets internes de `/fitness` (Corps/Séances/Nutrition) deviennent des routes top-level `/seances`, `/corps`, `/nutrition`. L'ancienne page `/fitness` redirige.
- **Maison (`/stocks`) et Rappels (`/rappels`) → sections dans Profil** (retirés du bottom-nav, features conservées).
- **Accueil** = dashboard fitness premium (récup, objectifs, dernières séances, stats hebdo, calories in/out, poids, badges, succès, raccourci création séance).
- **Corps** : `body_tracking` contient déjà toutes les mensurations (weight, body_fat, muscle_mass, chest, waist, hips, left/right_arm, left/right_thigh) → aucune migration, juste l'UI. IMC = poids+taille. Galerie photos avant/après **reportée**.
- **Coach IA** conservé dans Séances.
- **Design** : polir/uniformiser sans changement radical (glassmorphism léger déjà présent).
- **Déploiement** : code direct GitHub poussé via Claude in Chrome (autonomie Nathan, pas de token manuel) → Publish Lovable → test live.
- **Ordre des travaux** : Nav → Accueil → Séances → Corps → Nutrition (+nettoyage OFF) → Profil → passe design.
- ⚠️ e2e/02-navigation.spec.ts à mettre à jour (testids nav-stocks/nav-documents supprimés du bottom-nav).

## Nutrition — Saisie vocale (2026-06-28)
- **Edge function `supabase/functions/parse-meal-text/index.ts`** (déployée ACTIVE sur projet `bcwfvpwxzlmkxobvbtzp`)
  - Reçoit `{ text: string }` (3–2000 chars), parse via Gemini 2.5 Flash (tool calling `save_meal`)
  - Retourne `{ items[], meal?, confidence?, details? }` — un item par aliment identifié avec kcal/P/G/L
  - Rate limit : 30 appels/heure (action `parse_meal_text`) via `_shared/rate-limit.ts`
  - Toujours HTTP 200, erreurs dans `{ error: "..." }`
- **Composant `src/components/fitness/VoiceLogSheet.tsx`** (nouveau)
  - Push-to-talk via `onPointerDown`/`onPointerUp`/`onPointerCancel` (iOS-safe)
  - `SpeechRecognition` / `webkitSpeechRecognition`, lang `fr-FR`, continuous: false
  - Guard `hasSpeechRecognition` — masque le micro si API indisponible
  - Auto-parse au résultat final de speech
  - Textarea fallback toujours visible (séparateur "ou tape")
  - Panel de révision : modifier inline (name + 4 macros), supprimer, totaux, sélecteur repas
  - Confirmation via `useAddNutritionBatch` (batch insert)
  - Imports : `Loader2, Mic, MicOff, Plus, Sparkles, Trash2` from lucide-react
- **`NutritionTab.tsx`** : bouton « Vocal » (icône Mic) ajouté dans la rangée d'actions, `voiceOpen` state, render conditionnel `<VoiceLogSheet>`

## Nutrition — Audit complet + corrections (2026-07-03, session Claude Cowork)
Rapport : `AUDIT_NUTRITION.md` (dossier Drive). Note avant : 64/100.
- **Bug B1 corrigé (corruption)** : `SavedMealsSheet` stockait `base_*` scalés au lieu de /100 g → réédition faussait les macros. Convention documentée : `base_*` = valeurs /100 g quand `consumed_unit` = g/ml, sinon « par portion ». 6 lignes corrompues réparées en prod (whey ×5 nutrition + 1 saved_meal_item).
- **Autres fixes** : B2 cache recherche empoisonné (useFoodSearch guard abort), B3 recette ×N (consumed_quantity), B4 virgule FR (parseDecimal + editDraft dans MealScan/Voice/Favorites), B5/B6 parseISO, B7 suppression immédiate + undo par ré-insertion, B8 consumed_grams_per_unit dans saved_meal_items + RPCs, B9 clampMacroSet avant insert IA.
- **Nouveau module** : `src/lib/nutrition/meals.ts` (MEAL_SLUGS/LABELS/isMealSlug/scalePer100/clampMacroSet) — utilisé par 7 fichiers, plus de duplication.
- **Hooks typés** : types.ts complété à la main (7 tables V2 + 3 RPC) ; use-saved-meals, use-nutrition-favorites, useMealPlan, useRecipes, useFrequentFoods sans `as any`/loose client.
- **Perf** : RPC `frequent_foods` (remplace 300 lignes client), staleTime useNutrition 30s / goals 5min, edge `food-lookup` v5 (upserts USDA parallèles + rate-limit 150/h) → recherche froide ~4s → ~2,3s (vérifié logs).
- **DB (4 migrations, appliquées prod + repo)** : 20260702202410 rattrapage saved_meals/saved_meal_items/nutrition_favorites+policies, ...202431 grams_per_unit+RPCs, ...202446 frequent_foods, ...202452 drop index dupliqués (foods, nutrition_goals) + policies recipes par action.
- **GoalsSheet** : TDEE avec objectif sèche(−300)/maintien/prise(+300), plancher 1200 kcal.
- Push : 7 commits via GitHub web upload (36c7da6→596bf5b). ⚠️ tsc a ~100 erreurs préexistantes (framer-motion types, auth wrapper Lovable) non liées.
- Reste à faire (audit) : fibres persistées, courbe poids/calories, préférences alimentaires → recipe-assistant, leaked password protection (dashboard), refactor NutritionTab (687 l.).
