#!/usr/bin/env node
/**
 * audit-migration-drift.mjs
 *
 * Audit de détection des dérives entre Git et Supabase.
 *
 * Détecte automatiquement :
 * 1. Migration appliquée en Supabase mais absente de Git
 * 2. Migration dans Git mais non appliquée en Supabase
 * 3. Incohérence de versions
 * 4. Migrations supprimées dans Git mais présentes en base
 *
 * Usage :
 *   node scripts/audit-migration-drift.mjs
 *   SUPABASE_PROJECT_REF=bcwf... SUPABASE_ACCESS_TOKEN=... node scripts/audit-migration-drift.mjs
 *
 * Exit codes :
 *   0 — aucune dérive
 *   1 — dérive détectée (audit requis)
 *   2 — erreur de configuration/connectivité
 */

import { execFileSync, execSync } from 'node:child_process';
import { readdirSync, readFileSync, appendFileSync } from 'node:fs';
import { join, basename } from 'node:path';

// ─── Config ──────────────────────────────────────────────────────────────────
const ROOT = process.cwd();
const MIG_DIR = join(ROOT, 'supabase/migrations');
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'bcwfvpwxzlmkxobvbtzp';
const COLORS = process.stdout.isTTY;

const c = {
  red: (s) => (COLORS ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s) => (COLORS ? `\x1b[33m${s}\x1b[0m` : s),
  green: (s) => (COLORS ? `\x1b[32m${s}\x1b[0m` : s),
  bold: (s) => (COLORS ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s) => (COLORS ? `\x1b[2m${s}\x1b[0m` : s),
  blue: (s) => (COLORS ? `\x1b[36m${s}\x1b[0m` : s),
};

// ─── State ───────────────────────────────────────────────────────────────────
let gitMigrations = new Set();
let remoteMigrations = new Set();
const driftIssues = [];

function addDrift(type, migration, details) {
  driftIssues.push({ type, migration, details });
}

// ─── Récupérer les migrations Git ────────────────────────────────────────────
function loadGitMigrations() {
  try {
    const files = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();
    gitMigrations = new Set(files.map((f) => f.match(/^(\d+)/)?.[1] ?? ''));
    if (gitMigrations.has('')) gitMigrations.delete('');
    return files.length;
  } catch (e) {
    console.error('❌ Impossible de lire les migrations Git');
    console.error('   ' + e.message);
    process.exit(2);
  }
}

// ─── Récupérer les migrations Supabase ────────────────────────────────────────
function loadRemoteMigrations() {
  try {
    const output = execFileSync('supabase', ['migration', 'list', '--linked', '--output', 'json'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const migrations = JSON.parse(output);
    if (!Array.isArray(migrations)) {
      console.error('❌ Format inattendu de supabase migration list');
      console.error('   Réponse : ' + output.slice(0, 200));
      process.exit(2);
    }

    // Extraire les versions uniques avec leur statut
    const byVersion = new Map();
    for (const m of migrations) {
      const version = m.version || m.name || '';
      if (!version) continue;
      const status = m.status || 'UNKNOWN';
      if (!byVersion.has(version)) {
        byVersion.set(version, { status, timestamp: m.timestamp });
      }
    }

    remoteMigrations = new Map(byVersion);
    return byVersion.size;
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.error('❌ CLI Supabase non disponible (supabase gen types fonctionne-t-il ?)');
      process.exit(2);
    }
    if (e.stderr?.includes('not linked')) {
      console.error('❌ Aucun projet Supabase lié');
      console.error('   Exécute : supabase link --project-ref ' + PROJECT_REF);
      process.exit(2);
    }
    console.error('❌ Impossible de récupérer les migrations Supabase');
    console.error('   ' + (e.stderr?.toString?.() || e.message || e));
    process.exit(2);
  }
}

// ─── Détecter les migrations supprimées dans Git ───────────────────────────────
function detectDeletedMigrations() {
  try {
    const deleted = execSync(
      'git log --all --diff-filter=D --name-only --pretty=format: -- "supabase/migrations/*.sql" 2>/dev/null | grep -v "^$" | sort -u || true',
      { encoding: 'utf8', cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] }
    )
      .trim()
      .split('\n')
      .filter(Boolean);

    return new Set(deleted.map((p) => basename(p).match(/^(\d+)/)?.[1] ?? '').filter(Boolean));
  } catch {
    return new Set();
  }
}

// ─── Analyser les dérives ────────────────────────────────────────────────────
function analyzeGitVsRemote() {
  const deletedInGit = detectDeletedMigrations();

  // Dérive 1 : Migration appliquée en Supabase mais absente de Git
  for (const [version, info] of remoteMigrations) {
    if (!gitMigrations.has(version)) {
      if (info.status === 'APPLIED') {
        addDrift('remote_only', version, 'Appliquée en Supabase, absente de Git (orpheline)');
      }
    }
  }

  // Dérive 2 : Migration supprimée dans Git mais toujours en base
  for (const version of deletedInGit) {
    if (remoteMigrations.has(version)) {
      const info = remoteMigrations.get(version);
      if (info.status === 'APPLIED') {
        addDrift('deleted_in_git', version, 'Supprimée dans Git mais toujours APPLIED en base');
      }
    }
  }

  // Dérive 3 : Migration dans Git mais non appliquée (warning seulement)
  for (const version of gitMigrations) {
    if (!remoteMigrations.has(version)) {
      // normal en cas de migration locale non pousée — pas de dérive
    } else {
      const info = remoteMigrations.get(version);
      if (info.status !== 'APPLIED') {
        addDrift('not_applied', version, `État : ${info.status} (attendu : APPLIED)`);
      }
    }
  }
}

// ─── Afficher le rapport ─────────────────────────────────────────────────────
function printReport(gitCount, remoteCount) {
  console.log('');
  console.log(c.bold('═══════════════════════════════════════════════════════════════'));
  console.log(c.bold('  Audit : Détection des dérives Git ↔ Supabase'));
  console.log(c.bold('═══════════════════════════════════════════════════════════════'));
  console.log('');

  console.log(
    c.blue(
      `📊 Comparaison : ${c.bold(gitCount)} migrations Git vs ${c.bold(remoteCount)} versions en base`
    )
  );
  console.log('');

  if (driftIssues.length === 0) {
    console.log(c.green('✅ Aucune dérive — Git et Supabase sont synchronisés'));
    console.log('');
    return true;
  }

  // Grouper par type
  const byType = new Map();
  for (const issue of driftIssues) {
    if (!byType.has(issue.type)) byType.set(issue.type, []);
    byType.get(issue.type).push(issue);
  }

  // Afficher par sévérité
  const remote_only = byType.get('remote_only') || [];
  const deleted_in_git = byType.get('deleted_in_git') || [];
  const not_applied = byType.get('not_applied') || [];

  if (remote_only.length) {
    console.log(c.red(`❌ CRITIQUE : ${remote_only.length} migration(s) orpheline(s) en base`));
    for (const issue of remote_only) {
      console.log(c.red(`   [${issue.migration}] ${issue.details}`));
      console.log(
        c.dim(
          `           → Correction : supabase migration repair --linked --status reverted ${issue.migration}`
        )
      );
    }
    console.log('');
  }

  if (deleted_in_git.length) {
    console.log(c.red(`❌ CRITIQUE : ${deleted_in_git.length} migration(s) supprimée(s) en Git`));
    for (const issue of deleted_in_git) {
      console.log(c.red(`   [${issue.migration}] ${issue.details}`));
      console.log(
        c.dim(`           → Vérifier l'historique Git ou restaurer via supabase migration repair`)
      );
    }
    console.log('');
  }

  if (not_applied.length) {
    console.log(c.yellow(`⚠️  ATTENTION : ${not_applied.length} migration(s) non appliquée(s)`));
    for (const issue of not_applied) {
      console.log(c.yellow(`   [${issue.migration}] ${issue.details}`));
      console.log(c.dim(`           → Vérifier le statut : git log -1 supabase/migrations/*${issue.migration}*`));
    }
    console.log('');
  }

  return false;
}

// ─── Générer le résumé GitHub Step Summary ──────────────────────────────────
function generateGithubSummary(gitCount, remoteCount) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;

  const critical = driftIssues.filter(
    (i) => i.type === 'remote_only' || i.type === 'deleted_in_git'
  );
  const statusEmoji = critical.length === 0 ? '✅' : '❌';

  const lines = [
    `## ${statusEmoji} Audit : Git ↔ Supabase Drift Detection`,
    '',
    `| Indicateur | Valeur |`,
    `|---|---|`,
    `| Migrations Git | ${gitCount} |`,
    `| Versions en base | ${remoteCount} |`,
    `| Dérives détectées | ${driftIssues.length} |`,
    `| Critiques | ${critical.length} |`,
    '',
  ];

  if (critical.length > 0) {
    lines.push('### ❌ Dérives critiques détectées');
    for (const issue of critical) {
      lines.push(`- **[${issue.migration}]** ${issue.details}`);
    }
    lines.push('');
  }

  appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
}

// ─── Main ────────────────────────────────────────────────────────────────────
function main() {
  const gitCount = loadGitMigrations();
  const remoteCount = loadRemoteMigrations();

  analyzeGitVsRemote();

  const isHealthy = printReport(gitCount, remoteCount);
  generateGithubSummary(gitCount, remoteCount);

  if (!isHealthy) {
    process.exit(1);
  }
}

main();
