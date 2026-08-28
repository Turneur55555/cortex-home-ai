#!/usr/bin/env node
/**
 * audit-security-invariants.mjs
 *
 * Complément à audit-migration-drift.mjs — CTX-08 (audit du 16/08/2026).
 *
 * audit-migration-drift.mjs compare uniquement des NUMÉROS de version entre
 * Git et supabase_migrations.schema_migrations. C'est insuffisant : la
 * migration 20260607103913 était enregistrée "applied" en base tout en
 * n'ayant produit AUCUN des effets attendus (policies RESTRICTIVE absentes
 * de user_stats, GRANT non révoqué sur compute_level_from_xp) — un cas que
 * la comparaison de version ne peut structurellement pas détecter, puisque
 * les DEUX côtés (Git ET la table de suivi) s'accordaient. C'est exactement
 * la dérive qui a laissé CTX-03 exploitable pendant des semaines.
 *
 * Ce script interroge directement l'état RÉEL de la base (policies, grants,
 * corps de fonctions) via l'API Management Supabase et vérifie une liste
 * d'invariants de sécurité correspondant aux correctifs appliqués le
 * 16/08/2026 (CTX-01, CTX-02, CTX-03, CTX-04, CTX-05, CTX-07). Toute
 * régression future de l'un de ces invariants — qu'elle vienne d'une
 * migration mal appliquée, d'une modification manuelle via le dashboard, ou
 * d'un rollback involontaire — fait échouer la CI, indépendamment de ce que
 * dit la table de suivi des migrations.
 *
 * Usage :
 *   SUPABASE_PROJECT_REF=... SUPABASE_ACCESS_TOKEN=... node scripts/audit-security-invariants.mjs
 *
 * Exit codes :
 *   0 — tous les invariants respectés
 *   1 — au moins un invariant violé (sécurité)
 *   2 — erreur de configuration/connectivité (secrets manquants, API injoignable)
 */

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!PROJECT_REF || !ACCESS_TOKEN) {
  console.error('❌ SUPABASE_PROJECT_REF et SUPABASE_ACCESS_TOKEN sont requis.');
  process.exit(2);
}

async function query(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Management API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

// ─── Invariants ──────────────────────────────────────────────────────────
// Chaque invariant : { code, description, sql, check(rows) → true si OK }
const INVARIANTS = [
  {
    code: 'CTX-03_USER_STATS_RESTRICTIVE',
    description: 'user_stats a 3 policies RESTRICTIVE bloquant INSERT/UPDATE/DELETE client',
    sql: `select count(*)::int as n from pg_policies
          where schemaname='public' and tablename='user_stats'
            and permissive='RESTRICTIVE' and cmd in ('INSERT','UPDATE','DELETE')`,
    check: (rows) => rows[0]?.n === 3,
  },
  {
    code: 'CTX-02_ACTIVITY_LOG_NOT_TAUTOLOGICAL',
    description: "activity_log n'a plus de policy ALL/SELECT permissive triviale pour authenticated",
    sql: `select count(*)::int as n from pg_policies
          where schemaname='public' and tablename='activity_log'
            and permissive='PERMISSIVE' and cmd in ('ALL','SELECT')
            and qual = $$(( SELECT auth.role() AS role) = 'authenticated'::text)$$`,
    check: (rows) => rows[0]?.n === 0,
  },
  {
    code: 'CTX-02_ACTIVITY_LOG_WRITE_BLOCKED',
    description: 'activity_log bloque INSERT/UPDATE/DELETE client (RESTRICTIVE)',
    sql: `select count(*)::int as n from pg_policies
          where schemaname='public' and tablename='activity_log'
            and permissive='RESTRICTIVE' and cmd in ('INSERT','UPDATE','DELETE')`,
    check: (rows) => rows[0]?.n === 3,
  },
  {
    code: 'CTX-01_PROFILES_ROLE_DEFAULT_UNPRIVILEGED',
    description: "profiles.role n'a plus 'gestionnaire'/'admin'/'consultant' comme DEFAULT",
    sql: `select column_default from information_schema.columns
          where table_schema='public' and table_name='profiles' and column_name='role'`,
    check: (rows) => {
      const def = rows[0]?.column_default ?? '';
      return !/'(gestionnaire|admin|consultant)'/.test(def);
    },
  },
  {
    code: 'CTX-01_PROFILES_ROLE_COLUMN_LOCKED',
    description: "authenticated n'a plus le privilège UPDATE sur profiles.role",
    sql: `select count(*)::int as n from information_schema.column_privileges
          where table_schema='public' and table_name='profiles' and column_name='role'
            and grantee='authenticated' and privilege_type='UPDATE'`,
    check: (rows) => rows[0]?.n === 0,
  },
  {
    code: 'CTX-04_STATS_FUNCTIONS_NOT_ANON',
    description: 'compute_fitness_stats / compute_achievement_stats non exécutables par anon',
    sql: `select count(*)::int as n from information_schema.routine_privileges
          where routine_schema='public'
            and routine_name in ('compute_fitness_stats','compute_achievement_stats')
            and grantee in ('anon','PUBLIC') and privilege_type='EXECUTE'`,
    check: (rows) => rows[0]?.n === 0,
  },
  {
    code: 'CTX-05_CATALOG_RPC_SERVICE_ROLE_ONLY',
    description: "les 6 RPC de catalogue d'exercices ne sont exécutables que par service_role",
    sql: `select count(*)::int as n from information_schema.routine_privileges
          where routine_schema='public'
            and routine_name in (
              'merge_exercise_references','undo_exercise_merge','archive_exercise_reference',
              'restore_exercise_reference','delete_exercise_reference_if_unused',
              'restore_exercise_reference_import'
            )
            and grantee in ('anon','authenticated','PUBLIC') and privilege_type='EXECUTE'`,
    check: (rows) => rows[0]?.n === 0,
  },
  {
    code: 'CTX-07_RUN_WEEKLY_BACKUPS_SERVICE_ROLE_ONLY',
    description: 'run_weekly_backups() non exécutable par anon/authenticated',
    sql: `select count(*)::int as n from information_schema.routine_privileges
          where routine_schema='public' and routine_name='run_weekly_backups'
            and grantee in ('anon','authenticated','PUBLIC') and privilege_type='EXECUTE'`,
    check: (rows) => rows[0]?.n === 0,
  },
  {
    code: 'CTX-09_RECOMPUTE_RECIPE_OWNERSHIP_GUARD',
    description: 'recompute_recipe_nutrition filtre sur le propriétaire de la recette',
    sql: `select (prosrc ilike '%auth.uid()%')::bool as guarded
          from pg_proc where proname='recompute_recipe_nutrition'
            and pronamespace='public'::regnamespace`,
    check: (rows) => rows[0]?.guarded === true,
  },
  {
    code: 'CTX-10_FOOD_SATELLITES_NOT_WORLD_READABLE',
    description: 'food_servings/barcodes/quality/synonyms ne sont plus en SELECT USING(true)',
    sql: `select count(*)::int as n from pg_policies
          where schemaname='public'
            and tablename in ('food_servings','food_barcodes','food_quality_scores','food_synonyms')
            and cmd='SELECT' and qual='true'`,
    check: (rows) => rows[0]?.n === 0,
  },
  {
    code: 'CTX-13_RECIPE_CACHE_NOT_CLIENT_READABLE',
    description: "recipe_import_cache n'a plus de policy SELECT cliente",
    sql: `select count(*)::int as n from pg_policies
          where schemaname='public' and tablename='recipe_import_cache' and cmd='SELECT'`,
    check: (rows) => rows[0]?.n === 0,
  },
  {
    code: 'CTX-16_REFERENCE_TABLES_NOT_ANON',
    description: 'disciplines/reward_catalog/exercise_families/exercise_media non lisibles par anon',
    sql: `select count(*)::int as n from information_schema.role_table_grants
          where table_schema='public'
            and table_name in ('disciplines','reward_catalog','exercise_families','exercise_media')
            and grantee='anon' and privilege_type='SELECT'`,
    check: (rows) => rows[0]?.n === 0,
  },
  {
    code: 'CTX-17_EXTENSIONS_OUT_OF_PUBLIC',
    description: 'unaccent et fuzzystrmatch ne sont plus dans le schéma public',
    sql: `select count(*)::int as n from pg_extension e
          join pg_namespace n on n.oid=e.extnamespace
          where n.nspname='public' and e.extname in ('unaccent','fuzzystrmatch')`,
    check: (rows) => rows[0]?.n === 0,
  },
];

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Audit : invariants de sécurité (état réel de production)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  let failures = 0;
  for (const inv of INVARIANTS) {
    try {
      const rows = await query(inv.sql);
      const ok = inv.check(rows);
      console.log(`${ok ? '✅' : '❌'} [${inv.code}] ${inv.description}`);
      if (!ok) {
        failures++;
        console.log(`   → résultat : ${JSON.stringify(rows)}`);
      }
    } catch (e) {
      failures++;
      console.log(`❌ [${inv.code}] Erreur de requête : ${e.message}`);
    }
  }

  console.log('');
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `\n## ${failures === 0 ? '✅' : '❌'} Invariants de sécurité\n\n${failures} échec(s) sur ${INVARIANTS.length}.\n`,
    );
  }

  if (failures > 0) {
    console.log(
      `❌ ${failures} invariant(s) de sécurité violé(s) — voir supabase/migrations/2026082914*_security_ctx*.sql et 2026082917*_security_high*.sql (audit du 16/08/2026)`,
    );
    process.exit(1);
  }
  console.log('✅ Tous les invariants de sécurité sont respectés');
}

main().catch((e) => {
  console.error('❌ Erreur fatale :', e.message);
  process.exit(2);
});
