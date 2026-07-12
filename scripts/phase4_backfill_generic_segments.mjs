#!/usr/bin/env node
/**
 * phase4_backfill_generic_segments.mjs
 *
 * ICORTEX — Phase 3/4 (restructuration exercice-central) — outil d'administration
 * (PAS un script de migration à usage unique : conçu pour être relancé à tout
 * moment, sur n'importe quel environnement Supabase, à chaque fois qu'un besoin
 * se présente — voir cas d'usage ci-dessous).
 *
 * Relie chaque segment stocké dans `workouts.metadata.segments` (disciplines
 * génériques hors musculation/Course — Cardio, HYROX, Activité accompagnée,
 * Autre, et toute discipline future de même nature) au référentiel universel
 * `exercise_reference`, en écrivant `segments[i].exerciseId` — même contrat
 * additif que `SessionSegment.exerciseId` (src/lib/fitness/engines/types.ts) et
 * même logique de résolution que `ExerciseResolutionService`
 * (src/services/exerciseResolution.ts) : canonicalisation du libellé
 * (`canonicalizeExerciseLabel`, dupliquée ci-dessous car ce script tourne hors
 * du graphe de modules de l'application — toute évolution de la règle dans
 * exerciseResolution.ts DOIT être reportée ici) puis correspondance insensible
 * à la casse contre une référence existante de la même discipline, ou création
 * d'une seule nouvelle référence sinon.
 *
 * Pourquoi ce script existe alors que le dry-run du 2026-07-12 ne trouve rien à
 * backfiller aujourd'hui (voir cortex-phase3-progress-2026-07.md) : conservé
 * comme outil réutilisable, pas comme migration ponctuelle. Utile lors de futurs
 * imports de données, de migrations entre environnements (staging → prod ou
 * inversement), de restaurations de sauvegarde, si d'anciennes données sont
 * réintroduites, ou simplement comme filet de sécurité si un chemin d'écriture
 * futur oublie de résoudre `exerciseId` (voir le gap `useAddWorkout` déjà
 * rencontré et corrigé le 2026-07-12).
 *
 * IDEMPOTENT : ne touche jamais un segment dont `exerciseId` est déjà renseigné
 * (non null). Relancer ce script sur un environnement déjà à jour est un no-op
 * garanti — sûr à exécuter à répétition, y compris en routine.
 *
 * GÉNÉRIQUE, PAS DE LOGIQUE PAR DISCIPLINE : la liste des disciplines traitées
 * est lue dynamiquement depuis la table `disciplines`, à l'exclusion de
 * `muscu` (table `exercises`, backfill dédié : voir
 * supabase/scripts/phase3_step3_backfill_historique.sql) et `course` (table
 * `workout_segments`, même script). Toute discipline générique future
 * (`metadata.segments`) est automatiquement couverte sans modification de ce
 * script.
 *
 * Usage :
 *   node scripts/phase4_backfill_generic_segments.mjs                 # dry-run (par défaut) — aucune écriture
 *   node scripts/phase4_backfill_generic_segments.mjs --apply         # exécute réellement les écritures
 *   node scripts/phase4_backfill_generic_segments.mjs --json          # rapport en JSON seul (utilisable en CI), combinable avec --apply
 *
 * Variables d'environnement requises (n'importe quel projet Supabase) :
 *   SUPABASE_URL               — ex. https://<project-ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  — clé service_role (jamais la clé anonyme : ce
 *                                 script lit/écrit toutes les séances de tous
 *                                 les utilisateurs, RLS doit être contourné)
 *
 * Exit codes :
 *   0 — analyse ou écriture terminée sans erreur (y compris no-op idempotent)
 *   1 — configuration invalide (variables d'environnement manquantes) ou
 *       erreur irrécupérable pendant l'exécution
 */
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const JSON_ONLY = process.argv.includes("--json");
const PAGE_SIZE = 500;

// La validation des variables d'environnement et la création du client Supabase
// sont différées dans `getSupabaseClient()` (appelée uniquement depuis `main()`)
// plutôt que faites au chargement du module. Cela permet d'importer les
// fonctions pures de ce fichier (canonicalizeExerciseLabel, etc.) depuis des
// tests unitaires sans exiger de connexion Supabase ni de variables
// d'environnement — voir phase4_backfill_generic_segments.test.mjs.
function getSupabaseClient() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error(
      "[phase4_backfill_generic_segments] Variables d'environnement manquantes : " +
        "SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requises (clé service_role, " +
        "jamais la clé anonyme — ce script doit lire/écrire toutes les séances de " +
        "tous les utilisateurs).",
    );
    process.exit(1);
  }

  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// ============================================================
// Canonicalisation — DUPLIQUÉE depuis src/services/exerciseResolution.ts
// (canonicalizeExerciseLabel). Ce script tourne en Node pur hors du graphe de
// modules TypeScript/Vite de l'application, donc ne peut pas importer
// directement ce fichier. Toute évolution de la règle côté application DOIT
// être reportée ici à l'identique, sous peine de désynchronisation entre le
// chemin d'écriture live et ce backfill.
// ============================================================
const CONTEXT_SUFFIX_PATTERNS = [
  // "Fractionné 1/8", "Sprint 3 / 10", "(1/8)"
  /\s*\(?\d+\s*\/\s*\d+\)?\s*$/,
  // "Farmer Carry série 1", "... serie 2", "... set 3", "... tour 4",
  // "... rep 5" / "répétition 6" (accents optionnels, singulier/pluriel)
  /\s+(?:s[ée]ries?|sets?|tours?|reps?|r[ée]p[ée]titions?)\.?\s*n?°?\s*\d+\s*$/i,
  // "Exercice #3"
  /\s*#\s*\d+\s*$/,
];

export function canonicalizeExerciseLabel(rawLabel) {
  const original = (rawLabel ?? "").trim();
  let current = original;
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of CONTEXT_SUFFIX_PATTERNS) {
      const next = current.replace(pattern, "").trim();
      if (next !== current) {
        current = next;
        changed = true;
      }
    }
  }
  return current || original;
}

// ============================================================
// Exécution
// ============================================================
export async function main() {
  const supabase = getSupabaseClient();

  const report = {
    mode: APPLY ? "apply" : "dry-run",
    executedAt: new Date().toISOString(),
    disciplinesProcessed: [],
    workoutsScanned: 0,
    workoutsUpdated: 0,
    segmentsScanned: 0,
    segmentsAlreadyResolved: 0,
    segmentsSkippedNoLabel: 0,
    segmentsResolvedExistingRef: 0,
    segmentsResolvedNewRef: 0,
    newReferencesCreated: [], // { discipline, name } — dédupliqué
    errors: [],
    byDiscipline: {},
  };

  // ---- Disciplines à traiter : toutes sauf muscu/course (backfill dédié,
  // voir supabase/scripts/phase3_step3_backfill_historique.sql) ----
  const { data: disciplines, error: discErr } = await supabase.from("disciplines").select("id");
  if (discErr) throw new Error(`Lecture disciplines échouée : ${discErr.message}`);

  const targetDisciplines = (disciplines ?? [])
    .map((d) => d.id)
    .filter((id) => id !== "muscu" && id !== "course");
  report.disciplinesProcessed = targetDisciplines;

  for (const d of targetDisciplines) {
    report.byDiscipline[d] = {
      workoutsScanned: 0,
      segmentsScanned: 0,
      segmentsAlreadyResolved: 0,
      segmentsResolvedExistingRef: 0,
      segmentsResolvedNewRef: 0,
    };
  }

  // Cache en mémoire des résolutions (discipline::libellé_canonique_normalisé
  // -> id) pour éviter les allers-retours redondants sur un même libellé
  // répété dans plusieurs séances (ex. "Vélo" utilisé de nombreuses fois).
  const resolutionCache = new Map();
  const newRefNamesSeen = new Set();

  async function resolveSegmentExerciseId(discipline, rawLabel) {
    const canonical = canonicalizeExerciseLabel(rawLabel);
    const cacheKey = `${discipline}::${canonical.trim().toLowerCase()}`;
    if (resolutionCache.has(cacheKey)) {
      return { id: resolutionCache.get(cacheKey), createdNew: false };
    }

    // Recherche insensible à la casse — même règle que resolveExerciseId
    // (aucun nouveau doublon de casse ne doit être créé par ce script).
    const { data: existing, error: findErr } = await supabase
      .from("exercise_reference")
      .select("id, name")
      .eq("discipline_id", discipline)
      .ilike(
        "name",
        canonical.replace(/[\\%_]/g, (m) => `\\${m}`),
      )
      .limit(1)
      .maybeSingle();
    if (findErr) throw new Error(`Recherche exercise_reference échouée : ${findErr.message}`);

    if (existing) {
      resolutionCache.set(cacheKey, existing.id);
      return { id: existing.id, createdNew: false };
    }

    if (!APPLY) {
      // Dry-run : ne crée rien, mais renvoie un identifiant fictif stable pour
      // que le comptage "nouvelle référence" fonctionne sans écrire en base.
      resolutionCache.set(cacheKey, null);
      if (!newRefNamesSeen.has(cacheKey)) {
        newRefNamesSeen.add(cacheKey);
        report.newReferencesCreated.push({ discipline, name: canonical });
      }
      return { id: null, createdNew: true };
    }

    // onConflict sur (discipline_id, name) — même contrainte unique posée à
    // l'Étape 0 — protège contre une création en double si ce script tourne
    // en parallèle d'une écriture live sur le même libellé.
    const { data: inserted, error: insErr } = await supabase
      .from("exercise_reference")
      .upsert({ discipline_id: discipline, name: canonical }, { onConflict: "discipline_id,name" })
      .select("id, name")
      .single();
    if (insErr) throw new Error(`Création exercise_reference échouée : ${insErr.message}`);

    resolutionCache.set(cacheKey, inserted.id);
    if (!newRefNamesSeen.has(cacheKey)) {
      newRefNamesSeen.add(cacheKey);
      report.newReferencesCreated.push({ discipline, name: inserted.name });
    }
    return { id: inserted.id, createdNew: true };
  }

  for (const discipline of targetDisciplines) {
    let from = 0;
    for (;;) {
      const { data: workouts, error } = await supabase
        .from("workouts")
        .select("id, metadata")
        .eq("discipline", discipline)
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`Lecture workouts (${discipline}) échouée : ${error.message}`);
      if (!workouts || workouts.length === 0) break;

      for (const w of workouts) {
        report.workoutsScanned += 1;
        report.byDiscipline[discipline].workoutsScanned += 1;

        const segments = w.metadata?.segments;
        if (!Array.isArray(segments) || segments.length === 0) continue;

        let workoutChanged = false;
        const nextSegments = [];
        for (const seg of segments) {
          report.segmentsScanned += 1;
          report.byDiscipline[discipline].segmentsScanned += 1;

          if (!seg || typeof seg.label !== "string" || seg.label.trim() === "") {
            report.segmentsSkippedNoLabel += 1;
            nextSegments.push(seg);
            continue;
          }

          if (seg.exerciseId) {
            report.segmentsAlreadyResolved += 1;
            report.byDiscipline[discipline].segmentsAlreadyResolved += 1;
            nextSegments.push(seg);
            continue;
          }

          try {
            const { id, createdNew } = await resolveSegmentExerciseId(discipline, seg.label);
            if (createdNew) {
              report.segmentsResolvedNewRef += 1;
              report.byDiscipline[discipline].segmentsResolvedNewRef += 1;
            } else {
              report.segmentsResolvedExistingRef += 1;
              report.byDiscipline[discipline].segmentsResolvedExistingRef += 1;
            }
            if (APPLY && id) {
              nextSegments.push({ ...seg, exerciseId: id });
              workoutChanged = true;
            } else {
              nextSegments.push(seg);
            }
          } catch (e) {
            report.errors.push({
              workoutId: w.id,
              discipline,
              label: seg.label,
              message: String(e?.message ?? e),
            });
            nextSegments.push(seg);
          }
        }

        if (APPLY && workoutChanged) {
          const { error: updErr } = await supabase
            .from("workouts")
            .update({ metadata: { ...w.metadata, segments: nextSegments } })
            .eq("id", w.id);
          if (updErr) {
            report.errors.push({
              workoutId: w.id,
              discipline,
              message: `Écriture metadata échouée : ${updErr.message}`,
            });
          } else {
            report.workoutsUpdated += 1;
          }
        }
      }

      if (workouts.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  return report;
}

function printHumanReport(report) {
  const line = (s = "") => console.log(s);
  line();
  line(`=== Backfill segments génériques — mode ${report.mode.toUpperCase()} ===`);
  line(`Exécuté le : ${report.executedAt}`);
  line(`Disciplines traitées : ${report.disciplinesProcessed.join(", ") || "(aucune)"}`);
  line();
  line(`Séances scannées        : ${report.workoutsScanned}`);
  line(
    `Séances mises à jour    : ${report.workoutsUpdated}${report.mode === "dry-run" ? " (0 attendu en dry-run)" : ""}`,
  );
  line(`Segments scannés        : ${report.segmentsScanned}`);
  line(`  déjà résolus (skip)   : ${report.segmentsAlreadyResolved}`);
  line(`  sans libellé (skip)   : ${report.segmentsSkippedNoLabel}`);
  line(`  résolus (réf existante): ${report.segmentsResolvedExistingRef}`);
  line(`  résolus (nouvelle réf) : ${report.segmentsResolvedNewRef}`);
  line(
    `Nouvelles références${report.mode === "dry-run" ? " (simulées, dry-run)" : " créées"} : ${report.newReferencesCreated.length}`,
  );
  for (const r of report.newReferencesCreated) line(`  - [${r.discipline}] "${r.name}"`);
  line();
  line("Détail par discipline :");
  for (const [d, s] of Object.entries(report.byDiscipline)) {
    line(
      `  ${d}: séances=${s.workoutsScanned} segments=${s.segmentsScanned} déjà_résolus=${s.segmentsAlreadyResolved} réf_existante=${s.segmentsResolvedExistingRef} nouvelle_réf=${s.segmentsResolvedNewRef}`,
    );
  }
  if (report.errors.length > 0) {
    line();
    line(`Erreurs (${report.errors.length}) :`);
    for (const e of report.errors)
      line(
        `  - workout ${e.workoutId} [${e.discipline}]${e.label ? ` "${e.label}"` : ""} : ${e.message}`,
      );
  }
  line();
  if (report.mode === "dry-run") {
    line("Aucune écriture effectuée (dry-run). Relancer avec --apply pour appliquer.");
  }
  line();
}

// N'exécute le script (connexion Supabase + écritures potentielles) que
// lorsqu'il est lancé directement en CLI (`node scripts/...`), jamais lors
// d'un `import` (ex. depuis le fichier de tests unitaires), afin que les
// fonctions pures ci-dessus restent testables sans variables d'environnement.
const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main()
    .then((report) => {
      if (JSON_ONLY) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        printHumanReport(report);
      }
      process.exit(report.errors.length > 0 ? 1 : 0);
    })
    .catch((e) => {
      console.error(`[phase4_backfill_generic_segments] Erreur irrécupérable : ${e?.message ?? e}`);
      process.exit(1);
    });
}
