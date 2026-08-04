#!/usr/bin/env node
/**
 * health-check.mjs
 *
 * Health Check quotidien du projet + du backend Supabase. Ne modifie jamais
 * rien (lecture seule) : Management API en GET, `database/query` avec
 * `read_only: true`, `supabase migration list` (pas de push).
 *
 * Combine :
 *   - le résultat des étapes Build / TypeScript / Lint du workflow (passées
 *     via les variables d'env BUILD_STATUS / TYPECHECK_STATUS / LINT_STATUS,
 *     valeur `success` ou autre chose = échec, cf. `steps.<id>.outcome`)
 *   - les vérifications Supabase (statut projet, migrations, Edge Functions,
 *     base de données, advisors sécurité/performance, logs des dernières 24h)
 *
 * Sortie : rapport lisible sur stdout + $GITHUB_STEP_SUMMARY, exit 1 si au
 * moins une erreur critique est détectée (fait échouer le job CI).
 *
 * Variables d'environnement requises :
 *   SUPABASE_ACCESS_TOKEN  — token personnel Management API (secret CI)
 *   SUPABASE_PROJECT_REF   — ref du projet (secret CI, sinon fallback ci-dessous)
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'bcwfvpwxzlmkxobvbtzp';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const MGMT_API = 'https://api.supabase.com';

// Liste des Edge Functions dont le déploiement est piloté par la CI — tenue
// à jour manuellement en miroir de `.github/workflows/deploy-functions.yml`.
// Les autres fonctions présentes côté Supabase (déployées manuellement,
// scripts ponctuels, etc.) sont vérifiées mais seulement en avertissement.
const EXPECTED_FUNCTIONS = [
  'analyze-pdf',
  'chat',
  'cleanup-pdfs',
  'coach-workout',
  'muscle-readiness',
  'recipe-assistant',
  'scan-fridge',
  'scan-meal',
  'parse-meal-text',
  'generate-weekly-report',
  'scheduled-weekly-report',
  'import-exercises-dataset',
  'restore-exercises-dataset-import',
  'detect-exercise-similarities',
  'admin-exercise-actions',
];

const sections = [];
const warnings = [];
const criticals = [];

function addSection(name, ok) {
  sections.push({ name, ok });
}
function warn(msg) {
  warnings.push(msg);
}
function critical(msg) {
  criticals.push(msg);
}

async function mgmt(path, init = {}) {
  if (!ACCESS_TOKEN) {
    throw new Error('SUPABASE_ACCESS_TOKEN manquant — secret non configuré sur ce workflow');
  }
  const res = await fetch(`${MGMT_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail = typeof data === 'string' ? data : JSON.stringify(data);
    throw new Error(`${init.method || 'GET'} ${path} → HTTP ${res.status} : ${detail.slice(0, 300)}`);
  }
  return data;
}

// ─── 1. Build / TypeScript / Lint (résultats des steps du workflow) ────────
function checkCiSteps() {
  const buildOk = process.env.BUILD_STATUS === 'success';
  addSection('Build', buildOk);
  if (!buildOk) critical('Build : `npm run build` a échoué');

  const typecheckOk = process.env.TYPECHECK_STATUS === 'success';
  addSection('TypeScript', typecheckOk);
  if (!typecheckOk) critical('TypeScript : `tsc --noEmit` a détecté des erreurs de typage');

  const lintOk = process.env.LINT_STATUS === 'success';
  addSection('Lint', lintOk);
  if (!lintOk) warn('Lint : `npm run lint` a des règles en échec (non bloquant)');
}

// ─── 2. Migrations : en attente, orphelines, dérive Git ↔ Supabase ─────────
function checkMigrations() {
  let ok = true;

  try {
    const raw = execFileSync(
      'supabase',
      ['migration', 'list', '--linked', '--output-format', 'json'],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
    );
    const jsonStart = raw.indexOf('{');
    const parsed = JSON.parse(jsonStart === -1 ? raw : raw.slice(jsonStart));
    const migrations = Array.isArray(parsed.migrations) ? parsed.migrations : [];

    const pending = migrations.filter((m) => m.local && !m.remote).map((m) => m.local);
    const orphaned = migrations.filter((m) => m.remote && !m.local).map((m) => m.remote);

    if (pending.length) {
      warn(`Migrations locales en attente d'application (${pending.length}) : ${pending.join(', ')}`);
    }
    if (orphaned.length) {
      ok = false;
      critical(`Migrations orphelines en base, absentes du dépôt (${orphaned.length}) : ${orphaned.join(', ')}`);
    }
  } catch (e) {
    ok = false;
    critical(`Impossible de lister les migrations Supabase : ${e.message.split('\n')[0]}`);
  }

  // Délègue la détection de dérive Git ↔ Supabase (fichier supprimé côté Git
  // mais toujours appliqué en base, etc.) au script d'audit déjà en place —
  // évite de dupliquer cette logique ici.
  try {
    execFileSync('node', ['scripts/audit-migration-drift.mjs'], { stdio: 'inherit' });
  } catch (e) {
    const code = e.status;
    if (code === 1) {
      ok = false;
      critical('Dérive Git ↔ Supabase détectée sur les migrations (voir `audit-migration-drift.mjs` ci-dessus)');
    } else {
      warn('Audit de dérive des migrations indisponible (erreur de configuration/connectivité)');
    }
  }

  addSection('Migrations', ok);
}

// ─── 3. Statut du projet Supabase ──────────────────────────────────────────
async function checkProjectStatus() {
  try {
    const project = await mgmt(`/v1/projects/${PROJECT_REF}`);
    const status = project?.status;
    const ok = status === 'ACTIVE_HEALTHY';
    addSection('Supabase (projet)', ok);
    if (!ok) critical(`Projet Supabase status="${status ?? 'inconnu'}" (attendu ACTIVE_HEALTHY)`);
  } catch (e) {
    addSection('Supabase (projet)', false);
    critical(`Statut du projet Supabase injoignable : ${e.message}`);
  }
}

// ─── 4. Edge Functions ──────────────────────────────────────────────────────
async function checkEdgeFunctions() {
  try {
    const fns = await mgmt(`/v1/projects/${PROJECT_REF}/functions`);
    const bySlug = new Map((fns ?? []).map((f) => [f.slug, f]));
    let ok = true;

    for (const slug of EXPECTED_FUNCTIONS) {
      const fn = bySlug.get(slug);
      if (!fn) {
        ok = false;
        critical(`Edge Function "${slug}" absente côté Supabase (attendue d'après deploy-functions.yml)`);
        continue;
      }
      if (fn.status !== 'ACTIVE') {
        ok = false;
        critical(`Edge Function "${slug}" status="${fn.status}" (attendu ACTIVE)`);
      }
    }

    for (const fn of fns ?? []) {
      if (fn.status !== 'ACTIVE' && !EXPECTED_FUNCTIONS.includes(fn.slug)) {
        warn(`Edge Function "${fn.slug}" (hors périmètre CI) status="${fn.status}"`);
      }
    }

    addSection('Edge Functions', ok);
  } catch (e) {
    addSection('Edge Functions', false);
    critical(`Impossible de vérifier les Edge Functions : ${e.message}`);
  }
}

// ─── 5. Base de données répond normalement ─────────────────────────────────
async function checkDatabase() {
  try {
    const result = await mgmt(`/v1/projects/${PROJECT_REF}/database/query`, {
      method: 'POST',
      body: JSON.stringify({ query: 'select 1 as ok;', read_only: true }),
    });
    const rows = Array.isArray(result) ? result : result?.result;
    const ok = Array.isArray(rows) && Number(rows[0]?.ok) === 1;
    addSection('Database', ok);
    if (!ok) critical('La requête de santé `select 1` n\'a pas retourné le résultat attendu');
    return ok;
  } catch (e) {
    addSection('Database', false);
    critical(`Base de données injoignable : ${e.message}`);
    return false;
  }
}

// ─── 6. Advisors sécurité / performance ────────────────────────────────────
async function checkAdvisors() {
  for (const type of ['security', 'performance']) {
    try {
      const data = await mgmt(`/v1/projects/${PROJECT_REF}/advisors/${type}`);
      const lints = data?.lints ?? [];
      const label = type === 'security' ? 'Security Advisors' : 'Performance Advisors';
      const errors = lints.filter((l) => l.level === 'ERROR');
      const others = lints.filter((l) => l.level !== 'ERROR');

      for (const l of errors) {
        critical(`[${label}] ${l.title} — ${l.detail ?? l.description}`);
      }
      if (others.length) {
        warn(`[${label}] ${others.length} avertissement(s) (ex: ${others.slice(0, 3).map((l) => l.title).join(', ')}${others.length > 3 ? '…' : ''})`);
      }
    } catch (e) {
      warn(`[${type === 'security' ? 'Security' : 'Performance'} Advisors] indisponible : ${e.message}`);
    }
  }
}

// ─── 7. Logs des dernières 24h ──────────────────────────────────────────────
const LOG_QUERIES = {
  // postgres_logs imbrique deux niveaux (metadata[1].parsed[1].error_severity,
  // pas metadata[1].error_severity) — vérifié après un run réel où la 1ère
  // version (nesting simple) ne remontait aucune ligne ERROR alors que des
  // erreurs Postgres réelles existaient dans la fenêtre 24h (voir l'audit du
  // 04/08/2026). event_message reste sélectionné pour le filet de sécurité
  // texte de classifyPostgres(), au cas où ce schéma bouge encore.
  postgres: `select id, timestamp, event_message,
  (metadata[1]).parsed[1].error_severity as error_severity
from postgres_logs order by timestamp desc limit 300`,
  api: `select id, timestamp, event_message,
  (metadata[1]).request[1].path as path,
  (metadata[1]).response[1].status_code as status_code
from edge_logs order by timestamp desc limit 500`,
  'edge-function': `select id, timestamp, event_message,
  (metadata[1]).function_id as function_id,
  (metadata[1]).response[1].status_code as status_code
from function_edge_logs order by timestamp desc limit 300`,
  'edge-function-runtime': `select id, timestamp, event_message,
  (metadata[1]).level as level,
  (metadata[1]).function_id as function_id
from function_logs order by timestamp desc limit 300`,
  auth: `select id, timestamp, event_message,
  (metadata[1]).level as level,
  (metadata[1]).status as status,
  (metadata[1]).error as error
from auth_logs order by timestamp desc limit 300`,
  storage: `select id, timestamp, event_message from storage_logs order by timestamp desc limit 300`,
  realtime: `select id, timestamp, event_message from realtime_logs order by timestamp desc limit 300`,
};

function extractRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.result)) return data.result;
  if (Array.isArray(data?.result?.result)) return data.result.result;
  return [];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// L'endpoint /analytics/endpoints/logs est sensible aux rafales : constaté en
// conditions réelles le 04/08/2026, enchaîner les 7 requêtes de logs sans
// délai déclenche soit un HTTP 429 ("ThrottlerException: Too Many Requests"),
// soit — pire — un HTTP 200 avec {"result":null,"error":"Backend error! Retry
// your query..."} qui NE PASSE PAS par un statut HTTP non-2xx : mgmt() seul
// ne le détecte pas, il faut vérifier le champ `error` du corps explicitement
// (sinon extractRows() retourne silencieusement [] et la source est classée
// "0 ligne / OK" à tort, quel que soit l'état réel des erreurs). D'où : un
// backoff progressif (2s/4s) sur les deux types d'échec avant d'abandonner.
async function fetchLogs(key) {
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    sql: LOG_QUERIES[key],
    iso_timestamp_start: start.toISOString(),
    iso_timestamp_end: now.toISOString(),
  });

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const data = await mgmt(`/v1/projects/${PROJECT_REF}/analytics/endpoints/logs?${params}`);
      if (data?.error) throw new Error(`backend logs error : ${data.error}`);
      return extractRows(data);
    } catch (e) {
      lastError = e;
      if (attempt < 3) await sleep(attempt * 2000);
    }
  }
  throw lastError;
}

// "constraint" seul est volontairement exclu : Postgres logue en LOG (pas en
// ERROR) le texte brut des instructions DDL des migrations, qui contiennent
// presque toutes le mot "constraint" (ADD CONSTRAINT, CHECK CONSTRAINT...) —
// un match sur ce seul mot déclencherait un faux positif à chaque migration.
// "violat" (violates .* constraint / is violated by) reste assez spécifique.
const MSG_ERROR_PATTERN =
  /\berror\b|denied|refused|violat|timeout|unauthoriz|forbidden|does not exist|no such|duplicate key|undefined column/i;

// Postgres : `error_severity` (metadata[1].parsed[1].error_severity) est la
// source principale, mais un filet de sécurité texte sur `event_message` est
// conservé en secours — si le schéma de logs Supabase change à nouveau et que
// l'extraction structurée casse silencieusement, un vrai message d'erreur
// Postgres reste détecté au lieu de disparaître en faux négatif (cf. audit du
// 04/08/2026 où ce cas précis s'est produit avec metadata[1].error_severity).
function classifyPostgres(rows) {
  const errors = rows.filter(
    (r) => ['ERROR', 'FATAL', 'PANIC'].includes(r.error_severity) || MSG_ERROR_PATTERN.test(r.event_message || '')
  );
  if (!errors.length) return { ok: true };

  const rls = errors.filter((r) => /row-level security|permission denied for/i.test(r.event_message));
  const constraint = errors.filter((r) => /violates .* constraint/i.test(r.event_message));
  const other = errors.filter((r) => !rls.includes(r) && !constraint.includes(r));

  const details = [];
  if (constraint.length) details.push(`${constraint.length} violation(s) de contrainte SQL`);
  if (rls.length) details.push(`${rls.length} erreur(s) RLS`);
  if (other.length) details.push(`${other.length} autre(s) erreur(s) Postgres`);

  return {
    ok: false,
    message: `${errors.length} nouvelle(s) erreur(s) Postgres (${details.join(', ')})`,
    sample: errors.slice(0, 5).map((r) => r.event_message),
  };
}

function classifyGenericErrorLog(rows, label) {
  const errors = rows.filter((r) => {
    const level = (r.level || r.status || '').toString().toLowerCase();
    if (level === 'error' || level === 'fatal') return true;
    return MSG_ERROR_PATTERN.test(r.event_message || '');
  });
  if (!errors.length) return { ok: true };
  return {
    ok: false,
    message: `${errors.length} nouvelle(s) erreur(s) ${label}`,
    sample: errors.slice(0, 5).map((r) => r.event_message),
  };
}

function classifyApiGateway(rows) {
  const serverErrors = rows.filter((r) => Number(r.status_code) >= 500);
  const clientErrorsByPath = new Map();
  for (const r of rows) {
    const code = Number(r.status_code);
    if (code >= 400 && code < 500) {
      clientErrorsByPath.set(r.path, (clientErrorsByPath.get(r.path) || 0) + 1);
    }
  }
  const abnormalPaths = [...clientErrorsByPath.entries()].filter(([, count]) => count > 15);

  return { serverErrors, abnormalPaths };
}

async function checkLogs() {
  const results = {};

  const sources = ['postgres', 'auth', 'edge-function', 'edge-function-runtime', 'storage', 'realtime', 'api'];
  for (const key of sources) {
    try {
      results[key] = await fetchLogs(key);
    } catch (e) {
      warn(`Logs "${key}" indisponibles : ${e.message}`);
      results[key] = null;
    }
    // Étale les 7 requêtes dans le temps pour ne pas déclencher le rate-limit
    // de l'endpoint analytics (voir commentaire de fetchLogs).
    if (key !== sources[sources.length - 1]) await sleep(1500);
  }

  // Database (postgres_logs)
  if (results.postgres) {
    const r = classifyPostgres(results.postgres);
    addSection('Database (logs)', r.ok);
    if (!r.ok) {
      critical(r.message);
      r.sample.forEach((s) => warn(`  ↳ ${s.slice(0, 200)}`));
    }
  }

  // Auth
  if (results.auth) {
    const r = classifyGenericErrorLog(results.auth, 'Auth');
    addSection('Auth', r.ok);
    if (!r.ok) {
      critical(r.message);
      r.sample.forEach((s) => warn(`  ↳ ${s.slice(0, 200)}`));
    }
  }

  // Edge Functions runtime (function_logs + function_edge_logs)
  let edgeFnOk = true;
  if (results['edge-function-runtime']) {
    const r = classifyGenericErrorLog(results['edge-function-runtime'], 'Edge Function (runtime)');
    if (!r.ok) {
      edgeFnOk = false;
      critical(r.message);
      r.sample.forEach((s) => warn(`  ↳ ${s.slice(0, 200)}`));
    }
  }
  if (results['edge-function']) {
    const gwErrors = results['edge-function'].filter((r) => Number(r.status_code) >= 500);
    if (gwErrors.length) {
      edgeFnOk = false;
      critical(`${gwErrors.length} appel(s) Edge Function en erreur 5xx (gateway)`);
    }
  }
  if (!edgeFnOk) {
    const existing = sections.find((s) => s.name === 'Edge Functions');
    if (existing) existing.ok = false;
  }

  // Storage
  if (results.storage) {
    const r = classifyGenericErrorLog(results.storage, 'Storage');
    addSection('Storage', r.ok);
    if (!r.ok) {
      critical(r.message);
      r.sample.forEach((s) => warn(`  ↳ ${s.slice(0, 200)}`));
    }
  }

  // Realtime
  if (results.realtime) {
    const r = classifyGenericErrorLog(results.realtime, 'Realtime');
    addSection('Realtime', r.ok);
    if (!r.ok) {
      critical(r.message);
      r.sample.forEach((s) => warn(`  ↳ ${s.slice(0, 200)}`));
    }
  }

  // API gateway : 4xx/5xx anormaux (répartis vers le service concerné via le path)
  if (results.api) {
    const { serverErrors, abnormalPaths } = classifyApiGateway(results.api);
    if (serverErrors.length) {
      critical(`${serverErrors.length} réponse(s) 5xx sur la gateway API (24h)`);
    }
    for (const [path, count] of abnormalPaths) {
      warn(`Volume anormal de 4xx sur "${path}" (${count} occurrences / 24h)`);
    }
  }
}

// ─── Rapport final ──────────────────────────────────────────────────────────
function printReport() {
  const lines = [];
  lines.push('');
  for (const s of sections) {
    lines.push(`${s.ok ? '✅' : '❌'} ${s.name} : ${s.ok ? 'OK' : 'FAIL'}`);
  }
  lines.push('');

  if (warnings.length) {
    lines.push('⚠️ Avertissements');
    for (const w of warnings) lines.push(`- ${w}`);
    lines.push('');
  }

  if (criticals.length) {
    lines.push('❌ Nouvelles erreurs');
    for (const c of criticals) lines.push(`- ${c}`);
    lines.push('');
  }

  lines.push('Priorité');
  if (criticals.length) {
    lines.push(`- Corriger en priorité : ${criticals[0]}`);
    if (criticals.length > 1) lines.push(`- Puis : ${criticals.length - 1} autre(s) erreur(s) critique(s) ci-dessus`);
  } else if (warnings.length) {
    lines.push(`- Rien de critique. ${warnings.length} avertissement(s) à surveiller.`);
  } else {
    lines.push('- Rien à signaler.');
  }

  const report = lines.join('\n');
  console.log(report);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = [
      '## 🩺 Health Check quotidien — CORTEX',
      '',
      '```',
      report,
      '```',
      '',
    ].join('\n');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  }
}

async function main() {
  checkCiSteps();
  checkMigrations();
  await checkProjectStatus();
  await checkEdgeFunctions();
  await checkDatabase();
  await checkAdvisors();
  await checkLogs();

  printReport();

  if (criticals.length > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('❌ Health check : erreur inattendue');
  console.error(e);
  process.exit(1);
});
