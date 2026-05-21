#!/usr/bin/env node
/**
 * validate-supabase.mjs
 *
 * Analyse statique + auto-correction des migrations Supabase.
 * Usage :
 *   node scripts/validate-supabase.mjs           # analyse uniquement
 *   node scripts/validate-supabase.mjs --fix     # analyse + corrections automatiques
 *   node scripts/validate-supabase.mjs --ci      # mode CI (fix + exit 1 si non corrigeable)
 *
 * Exit codes :
 *   0 — aucun problème, ou tous corrigés automatiquement
 *   1 — erreurs critiques nécessitant une intervention manuelle
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execSync } from 'node:child_process';

// ─── Config ──────────────────────────────────────────────────────────────────
const ROOT     = process.cwd();
const MIG_DIR  = join(ROOT, 'supabase/migrations');
const FIX      = process.argv.includes('--fix') || process.argv.includes('--ci');
const CI_MODE  = process.argv.includes('--ci');
const COLORS   = process.stdout.isTTY;

const c = {
  red:    s => COLORS ? `\x1b[31m${s}\x1b[0m` : s,
  yellow: s => COLORS ? `\x1b[33m${s}\x1b[0m` : s,
  green:  s => COLORS ? `\x1b[32m${s}\x1b[0m` : s,
  bold:   s => COLORS ? `\x1b[1m${s}\x1b[0m`  : s,
  dim:    s => COLORS ? `\x1b[2m${s}\x1b[0m`  : s,
};

// ─── State ───────────────────────────────────────────────────────────────────
const issues = [];

function issue(level, code, file, msg) {
  issues.push({ level, code, file, msg, fixed: false });
}
function markFixed(code, file) {
  const i = [...issues].reverse().find(x => x.code === code && x.file === file);
  if (i) i.fixed = true;
}

// ─── Load migrations ─────────────────────────────────────────────────────────
const files = readdirSync(MIG_DIR).filter(f => f.endsWith('.sql')).sort();

function readSql(name) { return readFileSync(join(MIG_DIR, name), 'utf8'); }
function writeSql(name, content) { writeFileSync(join(MIG_DIR, name), content, 'utf8'); }

function patch(name, fn) {
  const before = readSql(name);
  const after  = fn(before);
  if (after !== before) { writeSql(name, after); return true; }
  return false;
}

const migrations = files.map(name => ({
  name,
  version: name.match(/^(\d+)/)?.[1] ?? '',
}));

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 1 — Timestamps dupliqués / ordre non chronologique
// ─────────────────────────────────────────────────────────────────────────────
{
  const versions = migrations.map(m => m.version);
  const seen = new Set();
  for (const v of versions) {
    if (seen.has(v))
      issue('error', 'DUPLICATE_VERSION', 'migrations/', `Timestamp dupliqué : ${v}`);
    seen.add(v);
  }
  for (let i = 1; i < versions.length; i++) {
    if (versions[i] < versions[i - 1])
      issue('error', 'ORDER_VIOLATION', 'migrations/',
        `Ordre cassé : ${versions[i]} < ${versions[i - 1]}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 2 — touch_updated_at() définie avant toute utilisation
// ─────────────────────────────────────────────────────────────────────────────
{
  let definedAt = null;
  for (const m of migrations) {
    const sql = readSql(m.name);
    if (/CREATE OR REPLACE FUNCTION public\.touch_updated_at/i.test(sql) && !definedAt)
      definedAt = m.version;
    if (/EXECUTE FUNCTION public\.touch_updated_at/i.test(sql) && !definedAt)
      issue('error', 'FUNCTION_UNDEFINED', m.name,
        'touch_updated_at() utilisée avant d\'être définie dans les migrations');
  }
  if (!definedAt)
    issue('error', 'FUNCTION_MISSING', 'migrations/',
      'public.touch_updated_at() introuvable dans les migrations');
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 3 — CREATE TABLE sans IF NOT EXISTS
// ─────────────────────────────────────────────────────────────────────────────
for (const m of migrations) {
  const sql = readSql(m.name);
  if (/\bCREATE TABLE\b(?!\s+IF NOT EXISTS)/i.test(sql)) {
    issue('warn', 'TABLE_NO_IF_NOT_EXISTS', m.name, 'CREATE TABLE sans IF NOT EXISTS');
    if (FIX && patch(m.name, s =>
      s.replace(/\bCREATE TABLE\b(?!\s+IF NOT EXISTS)/gi, 'CREATE TABLE IF NOT EXISTS')
    )) markFixed('TABLE_NO_IF_NOT_EXISTS', m.name);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 4 — CREATE INDEX sans IF NOT EXISTS
// ─────────────────────────────────────────────────────────────────────────────
for (const m of migrations) {
  const sql = readSql(m.name);
  if (/\bCREATE(?:\s+UNIQUE)?\s+INDEX\b(?!\s+IF NOT EXISTS)/i.test(sql)) {
    issue('warn', 'INDEX_NO_IF_NOT_EXISTS', m.name, 'CREATE INDEX sans IF NOT EXISTS');
    if (FIX && patch(m.name, s =>
      s.replace(/\bCREATE(\s+UNIQUE)?\s+INDEX\b(?!\s+IF NOT EXISTS)/gi,
        (_, u) => `CREATE${u ?? ''} INDEX IF NOT EXISTS`)
    )) markFixed('INDEX_NO_IF_NOT_EXISTS', m.name);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 5 — CREATE FUNCTION sans OR REPLACE
// ─────────────────────────────────────────────────────────────────────────────
for (const m of migrations) {
  const sql = readSql(m.name);
  if (/\bCREATE FUNCTION\b/i.test(sql)) {
    issue('warn', 'FUNCTION_NO_OR_REPLACE', m.name, 'CREATE FUNCTION sans OR REPLACE');
    if (FIX && patch(m.name, s =>
      s.replace(/\bCREATE FUNCTION\b/gi, 'CREATE OR REPLACE FUNCTION')
    )) markFixed('FUNCTION_NO_OR_REPLACE', m.name);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 6 — CREATE TRIGGER sans DROP TRIGGER IF EXISTS immédiatement avant
// ─────────────────────────────────────────────────────────────────────────────
for (const m of migrations) {
  let sql = readSql(m.name);
  // Regex robuste multi-ligne : capture nom trigger + table
  const re = /CREATE TRIGGER\s+(\w+)(?:[\s\S]*?)(?:BEFORE|AFTER|INSTEAD OF)[\s\S]*?ON\s+([\w.]+)/gi;
  let match;
  let filePatched = false;
  re.lastIndex = 0;
  while ((match = re.exec(sql)) !== null) {
    const [, trigName, tableName] = match;
    const pre = sql.slice(Math.max(0, match.index - 120), match.index);
    if (!/DROP TRIGGER IF EXISTS/i.test(pre)) {
      issue('warn', 'TRIGGER_NO_DROP', m.name,
        `CREATE TRIGGER ${trigName} sans DROP TRIGGER IF EXISTS`);
      if (FIX && !filePatched) {
        const drop = `DROP TRIGGER IF EXISTS ${trigName} ON ${tableName};\n`;
        sql = sql.slice(0, match.index) + drop + sql.slice(match.index);
        writeSql(m.name, sql);
        markFixed('TRIGGER_NO_DROP', m.name);
        filePatched = true;
        re.lastIndex = match.index + drop.length + match[0].length;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 7 — CREATE POLICY sans DROP POLICY IF EXISTS immédiatement avant
// ─────────────────────────────────────────────────────────────────────────────
for (const m of migrations) {
  let sql = readSql(m.name);
  const re = /CREATE POLICY\s+"([^"]+)"\s+ON\s+([\w.]+)/gi;
  let match;
  let filePatched = false;
  re.lastIndex = 0;
  while ((match = re.exec(sql)) !== null) {
    const [, policyName, tableName] = match;
    const pre = sql.slice(Math.max(0, match.index - 120), match.index);
    if (!/DROP POLICY IF EXISTS/i.test(pre)) {
      issue('warn', 'POLICY_NO_DROP', m.name,
        `CREATE POLICY "${policyName}" sans DROP POLICY IF EXISTS`);
      if (FIX && !filePatched) {
        const drop = `DROP POLICY IF EXISTS "${policyName}" ON ${tableName};\n`;
        sql = sql.slice(0, match.index) + drop + sql.slice(match.index);
        writeSql(m.name, sql);
        markFixed('POLICY_NO_DROP', m.name);
        filePatched = true;
        re.lastIndex = match.index + drop.length + match[0].length;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 8 — ALTER PUBLICATION ADD TABLE sans protection duplicate_object
// ─────────────────────────────────────────────────────────────────────────────
for (const m of migrations) {
  const sql = readSql(m.name);
  // Chercher ALTER PUBLICATION hors d'un bloc DO (supporte $$ et $)
  const inDo = /DO\s+\$[\$]?[\s\S]*?ALTER PUBLICATION[\s\S]*?EXCEPTION[\s\S]*?END/i.test(sql);
  if (/ALTER PUBLICATION\s+\w+\s+ADD TABLE/i.test(sql) && !inDo) {
    issue('warn', 'PUBLICATION_NO_GUARD', m.name,
      'ALTER PUBLICATION ADD TABLE sans protection EXCEPTION WHEN duplicate_object');
    if (FIX && patch(m.name, s =>
      s.replace(
        /^(ALTER PUBLICATION\s+(\w+)\s+ADD TABLE\s+([\w.]+);)$/gm,
        `DO $$\nBEGIN\n  ALTER PUBLICATION $2 ADD TABLE $3;\nEXCEPTION WHEN duplicate_object THEN NULL;\nEND $$;`
      )
    )) markFixed('PUBLICATION_NO_GUARD', m.name);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 9 — Migrations supprimées dans l'historique git
// ─────────────────────────────────────────────────────────────────────────────
try {
  const deleted = execSync(
    'git log --all --diff-filter=D --name-only --pretty=format: -- "supabase/migrations/*.sql" 2>/dev/null | grep -v "^$" || true',
    { encoding: 'utf8', cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] }
  ).trim().split('\n').filter(Boolean);
  const localSet = new Set(files);
  for (const path of deleted) {
    const name = basename(path);
    if (!localSet.has(name))
      issue('warn', 'MIGRATION_DELETED', name,
        `Supprimée dans git mais potentiellement dans schema_migrations remote`);
  }
} catch { /* git indisponible */ }

// ─────────────────────────────────────────────────────────────────────────────
// Rapport
// ─────────────────────────────────────────────────────────────────────────────
const fixed    = issues.filter(i => i.fixed);
const errors   = issues.filter(i => i.level === 'error' && !i.fixed);
const warnings = issues.filter(i => i.level === 'warn'  && !i.fixed);

console.log('');
console.log(c.bold('══════════════════════════════════════════════'));
console.log(c.bold('  validate:supabase — Rapport'));
console.log(c.bold('══════════════════════════════════════════════'));
console.log('');

if (fixed.length) {
  console.log(c.green(`✅ Auto-corrections appliquées : ${fixed.length}`));
  for (const f of fixed)
    console.log(c.dim(`   [FIX] ${f.code.padEnd(26)} ${f.file}`));
  console.log('');
}

if (warnings.length) {
  console.log(c.yellow(`⚠️  Avertissements non corrigés : ${warnings.length}`));
  for (const w of warnings)
    console.log(c.yellow(`   [${w.code}] ${w.file}: ${w.msg}`));
  console.log('');
}

if (errors.length) {
  console.log(c.red(`❌ Erreurs critiques : ${errors.length}`));
  for (const e of errors)
    console.log(c.red(`   [${e.code}] ${e.file}: ${e.msg}`));
  console.log('');
  process.exit(1);
}

if (!fixed.length && !warnings.length) {
  console.log(c.green('✅ Toutes les migrations sont valides et idempotentes'));
} else {
  console.log(c.green('✅ Aucune erreur critique — les avertissements sont acceptables'));
}
console.log('');

// En mode CI, générer un résumé pour GitHub Step Summary si disponible
if (CI_MODE && process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    '## validate:supabase',
    '',
    `| Indicateur | Valeur |`,
    `|---|---|`,
    `| Migrations analysées | ${files.length} |`,
    `| Auto-corrections | ${fixed.length} |`,
    `| Avertissements | ${warnings.length} |`,
    `| Erreurs critiques | ${errors.length} |`,
    '',
  ];
  if (fixed.length) {
    lines.push('### Corrections appliquées');
    for (const f of fixed) lines.push(`- \`${f.code}\` → \`${f.file}\``);
    lines.push('');
  }
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
}
