#!/usr/bin/env node
/**
 * check-bounded-reads.mjs
 *
 * GARDE-FOU : empêche la réintroduction d'une LECTURE SERVEUR NON BORNÉE.
 *
 * Pourquoi ce contrôle existe : PostgREST applique un plafond `max-rows`
 * (1 000 par défaut chez Supabase) qui tronque une réponse **sans aucune
 * erreur**. Une lecture `from(...).select(...)` sans `limit`, `range`,
 * `single`/`maybeSingle` ni pagination ne renvoie donc pas « toutes les
 * lignes » mais « les N premières », et rien ne le signale — ni au code, ni
 * en console, ni dans les logs. C'est arrivé au moins trois fois :
 *   - `exercise_sets` lors de l'hydratation offline (MAJ-08, chantier 3) ;
 *   - `exercises` dans `useLastExerciseSession` (E1, chantier 9) ;
 *   - `exercise_reference` (1 477 lignes) et `exercise_media` (2 566) dans
 *     le catalogue (AUD-01/AUD-02, chantier A) — soit un tiers du catalogue
 *     et la moitié des médias qui n'arrivaient jamais au client.
 *
 * Le correctif ponctuel ne suffit pas : rien n'empêche la prochaine lecture
 * d'être écrite de la même façon. Ce script rend la règle exécutable.
 *
 * ── CE QU'IL CONSIDÈRE COMME SÛR (et pourquoi) ────────────────────────────
 * Le contrôle n'interdit PAS d'écrire des requêtes : il exige seulement que
 * la cardinalité soit MAÎTRISÉE, par l'un de ces mécanismes légitimes :
 *   - `single()` / `maybeSingle()` — cardinalité 1 exigée par la requête
 *     elle-même, PostgREST échoue si elle est dépassée ;
 *   - `limit(n)` / `range(a, b)` — borne explicite ;
 *   - `select(..., { head: true })` — comptage seul, aucune ligne renvoyée ;
 *   - un appel enveloppé par un helper de pagination connu
 *     (`fetchAllRows`, `fetchAllRowsForIds` de `src/lib/supabase/pagedRead.ts`) :
 *     c'est lui qui applique `range()` page après page et prouve la
 *     complétude via `count: "exact"` ;
 *   - toute ÉCRITURE (`insert`/`update`/`upsert`/`delete`), même suivie d'un
 *     `select()` de retour : la cardinalité y est celle des lignes écrites ;
 *   - les RPC (`supabase.rpc(...)`), qui ne passent pas par ce motif.
 *
 * ── LA BASELINE (cliquet) ─────────────────────────────────────────────────
 * Le dépôt porte encore des lectures non bornées hors du périmètre du
 * chantier A. Les interdire d'un coup ferait échouer la CI sans rapport avec
 * la modification en cours — c'est le meilleur moyen de faire désactiver le
 * contrôle. Elles sont donc listées dans `bounded-reads-baseline.json`, et
 * le script échoue dans DEUX directions :
 *   - une lecture non bornée NOUVELLE (fichier/table absent de la baseline,
 *     ou plus nombreuse qu'annoncé) → régression, échec ;
 *   - une entrée de baseline qui ne correspond plus à rien (lecture bornée
 *     depuis, ou supprimée) → échec aussi, pour que la baseline ne puisse
 *     pas pourrir ni servir d'échappatoire permanente.
 * La baseline ne peut donc que DÉCROÎTRE, et jamais silencieusement.
 *
 * ── CE QU'IL NE FAIT PAS ──────────────────────────────────────────────────
 * L'analyse est lexicale, pas sémantique : elle ne suit pas un builder
 * stocké dans une variable puis complété plus loin. Ce motif n'existe pas
 * dans `src/` aujourd'hui (vérifié), et le contrôle d'auto-cohérence
 * ci-dessous (`MIN_EXPECTED_READS`) échoue si l'analyseur cesse de voir ce
 * qu'il voyait — un garde-fou qui ne trouve plus rien doit crier, pas
 * réussir en silence.
 *
 * Usage :
 *   node scripts/check-bounded-reads.mjs
 *
 * Exit codes :
 *   0 — aucune lecture non bornée hors baseline, et baseline à jour
 *   1 — régression détectée (nouvelle lecture non bornée) ou baseline périmée
 *   2 — le contrôle lui-même n'a pas pu s'exécuter (scan vide, baseline illisible)
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SRC_DIR = join(ROOT, "src");
const BASELINE_FILE = join(import.meta.dirname, "bounded-reads-baseline.json");

/**
 * Plancher d'auto-cohérence. Si l'analyseur voit moins de lectures que ça,
 * c'est qu'il a cessé de fonctionner (refactor de style, changement de
 * client) et non que le dépôt s'est vidé — on échoue en code 2 plutôt que
 * de « réussir » sur un scan aveugle.
 */
const MIN_EXPECTED_READS = 60;

/** Méthodes qui bornent la cardinalité par elles-mêmes. */
const BOUNDING_METHODS = new Set(["limit", "range", "single", "maybeSingle"]);

/** Une chaîne qui en contient une n'est pas une lecture : c'est une écriture. */
const WRITE_METHODS = new Set(["insert", "update", "upsert", "delete"]);

/**
 * Helpers de pagination du projet. Un `from(...).select(...)` construit à
 * l'intérieur de l'un d'eux est borné PAR LUI (c'est le helper qui applique
 * `range()` et prouve la complétude par `count: "exact"`).
 */
const PAGINATION_HELPERS = new Set(["fetchAllRows", "fetchAllRowsForIds"]);

/** Fichiers ignorés : tests (cardinalité maîtrisée par les fixtures). */
function isIgnored(relPath) {
  return /\.(test|spec)\.(ts|tsx)$/.test(relPath);
}

export function listSourceFiles(dir = SRC_DIR, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      listSourceFiles(full, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    const rel = relative(ROOT, full);
    if (isIgnored(rel)) continue;
    out.push({ path: rel, content: readFileSync(full, "utf8") });
  }
  return out;
}

/**
 * Neutralise commentaires et CONTENU des chaînes (remplacés par des espaces,
 * longueur et lignes préservées). Sans ça, un `.select(...)` cité dans un
 * commentaire — il y en a beaucoup dans ce dépôt — serait pris pour du code.
 */
export function blankCommentsAndStrings(source) {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") {
        out += " ";
        i += 1;
      }
      continue;
    }
    if (c === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        out += source[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      out += "  ";
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      out += c;
      i += 1;
      while (i < source.length && source[i] !== c) {
        if (source[i] === "\\") {
          out += "  ";
          i += 2;
          continue;
        }
        out += source[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      out += source[i] === undefined ? "" : c;
      i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** Index de la parenthèse fermante correspondant à celle ouverte en `open`. */
function matchingParen(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "(") depth += 1;
    else if (source[i] === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Méthodes chaînées AU MÊME NIVEAU après l'index donné, avec leurs
 * arguments bruts. S'arrête à la fin de l'expression (`;`/`,` au niveau 0,
 * ou une fermeture qui sort du contexte englobant).
 */
export function chainAfter(source, start) {
  const methods = [];
  let depth = 0;
  let i = start;
  while (i < source.length) {
    const c = source[i];
    if (c === "(" || c === "[" || c === "{") {
      depth += 1;
      i += 1;
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      depth -= 1;
      if (depth < 0) break;
      i += 1;
      continue;
    }
    if (depth === 0 && (c === ";" || c === ",")) break;
    if (depth === 0 && c === ".") {
      const match = /^\.\s*([A-Za-z_$][\w$]*)\s*\(/.exec(source.slice(i));
      if (match) {
        const open = i + match[0].length - 1;
        const close = matchingParen(source, open);
        methods.push({ name: match[1], args: close < 0 ? "" : source.slice(open + 1, close) });
        i = close < 0 ? i + match[0].length : close + 1;
        continue;
      }
    }
    i += 1;
  }
  return methods;
}

/**
 * Identifiants des appels ENGLOBANTS, du plus proche au plus lointain.
 * Sert à reconnaître `fetchAllRows(() => supabase.from(...).select(...))` :
 * la chaîne n'y porte pas de `range()`, c'est le helper qui l'applique.
 */
export function enclosingCallees(source, index, maxLevels = 6) {
  const callees = [];
  let depth = 0;
  for (let i = index - 1; i >= 0 && callees.length < maxLevels; i -= 1) {
    const c = source[i];
    if (c === ")" || c === "]" || c === "}") {
      depth += 1;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") {
      if (depth > 0) {
        depth -= 1;
        continue;
      }
      if (c === "(") {
        const name = calleeNameBefore(source, i);
        if (name) callees.push(name);
      }
    }
  }
  return callees;
}

/**
 * Nom de la fonction appelée dont la parenthèse ouvrante est en `open`.
 * Traverse un éventuel argument de type — `fetchAllRows<MediaSelectRow>(`,
 * `fetchAllRowsForIds<{ id: string }>(` — sans quoi le helper de pagination
 * ne serait pas reconnu et TOUTES ses lectures seraient signalées à tort.
 */
function calleeNameBefore(source, open) {
  let end = open;
  while (end > 0 && /\s/.test(source[end - 1])) end -= 1;
  if (source[end - 1] === ">") {
    let depth = 0;
    let i = end - 1;
    for (; i >= 0; i -= 1) {
      if (source[i] === ">") depth += 1;
      else if (source[i] === "<") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (i < 0) return null;
    end = i;
    while (end > 0 && /\s/.test(source[end - 1])) end -= 1;
  }
  const match = /([A-Za-z_$][\w$]*)$/.exec(source.slice(Math.max(0, end - 120), end));
  return match ? match[1] : null;
}

/**
 * Toutes les lectures PostgREST d'un ensemble de fichiers.
 *
 * Ancres : `.from(` (le client Supabase) et `pagedFrom(` (l'enveloppe locale
 * de `use-fitness.ts`, qui masquerait sinon une lecture au contrôle).
 * `Array.from(...)` est écarté naturellement : sa chaîne ne porte pas de
 * `select()`.
 */
export function extractReads(files) {
  const reads = [];
  for (const file of files) {
    const code = blankCommentsAndStrings(file.content);
    for (const anchor of code.matchAll(/(?:\.\s*from|\bpagedFrom)\s*\(/g)) {
      const open = anchor.index + anchor[0].length - 1;
      const close = matchingParen(code, open);
      if (close < 0) continue;

      const chain = chainAfter(code, close + 1);
      const names = chain.map((m) => m.name);
      if (!names.includes("select")) continue;
      if (names.some((n) => WRITE_METHODS.has(n))) continue;

      // Nom de table : lu dans la source d'ORIGINE (les littéraux ont été
      // blanchis dans `code`). Un nom calculé est conservé tel quel — il
      // identifie la lecture dans la baseline, il n'a pas besoin d'être résolu.
      const rawArgs = file.content.slice(open + 1, close).trim();
      const literal = /^["'`]([^"'`]+)["'`]$/.exec(rawArgs);
      const table = literal ? literal[1] : rawArgs.split(/[\s,]/)[0] || "?";

      const selectArgs = chain.find((m) => m.name === "select")?.args ?? "";
      const enclosing = enclosingCallees(code, anchor.index);

      reads.push({
        file: file.path,
        line: code.slice(0, anchor.index).split("\n").length,
        table,
        chain: names,
        bounded:
          names.some((n) => BOUNDING_METHODS.has(n)) ||
          /\bhead\s*:\s*true\b/.test(selectArgs) ||
          enclosing.some((name) => PAGINATION_HELPERS.has(name)),
      });
    }
  }
  return reads;
}

/**
 * Agrège les lectures non bornées en `fichier::table → nombre`.
 * La clé volontairement SANS numéro de ligne : une baseline qui bouge à
 * chaque déplacement de code serait ingérable, donc contournée.
 */
export function aggregateUnbounded(reads) {
  const counts = new Map();
  for (const read of reads) {
    if (read.bounded) continue;
    const key = `${read.file}::${read.table}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Compare l'état réel à la baseline. `added` = régression à corriger,
 * `stale` = baseline à mettre à jour (lecture bornée depuis, ou supprimée).
 */
export function compareWithBaseline(counts, baseline) {
  const expected = new Map(Object.entries(baseline));
  const added = [];
  const stale = [];
  for (const [key, count] of counts) {
    const allowed = expected.get(key) ?? 0;
    if (count > allowed) added.push({ key, count, allowed });
  }
  for (const [key, allowed] of expected) {
    const actual = counts.get(key) ?? 0;
    if (actual < allowed) stale.push({ key, actual, allowed });
  }
  return { added, stale };
}

function main() {
  let files;
  try {
    files = listSourceFiles();
  } catch (error) {
    console.error(`✖ Scan impossible : ${error.message}`);
    process.exit(2);
  }

  const reads = extractReads(files);
  if (reads.length < MIN_EXPECTED_READS) {
    console.error(
      `✖ Auto-cohérence : ${reads.length} lecture(s) détectée(s), moins que le plancher ` +
        `de ${MIN_EXPECTED_READS}. L'analyseur ne voit plus le code — corrige-le avant de continuer.`,
    );
    process.exit(2);
  }

  let baseline;
  try {
    baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8")).allowed;
    if (!baseline || typeof baseline !== "object") throw new Error("clé `allowed` absente");
  } catch (error) {
    console.error(`✖ Baseline illisible (${BASELINE_FILE}) : ${error.message}`);
    process.exit(2);
  }

  const counts = aggregateUnbounded(reads);
  const { added, stale } = compareWithBaseline(counts, baseline);

  if (added.length === 0 && stale.length === 0) {
    console.log(
      `✔ ${reads.length} lecture(s) PostgREST analysée(s) — ` +
        `${reads.length - [...counts.values()].reduce((a, b) => a + b, 0)} bornée(s), ` +
        `aucune lecture non bornée hors baseline.`,
    );
    process.exit(0);
  }

  if (added.length > 0) {
    console.error("\n✖ LECTURE(S) SERVEUR NON BORNÉE(S) INTRODUITE(S) :\n");
    for (const { key, count, allowed } of added) {
      const [file, table] = key.split("::");
      console.error(`  ${file} — table \`${table}\` : ${count} lecture(s), ${allowed} tolérée(s)`);
    }
    console.error(
      "\n  Une lecture sans `limit`/`range`/`single`/`maybeSingle` est tronquée EN SILENCE\n" +
        "  au-delà du plafond `max-rows` de PostgREST. Corrige-la avec l'un de ces moyens :\n" +
        "    - `maybeSingle()` si la cardinalité est réellement de 1 ;\n" +
        "    - `limit(n)` si un plafond métier explicite a du sens ;\n" +
        "    - `fetchAllRows(...)` / `fetchAllRowsForIds(...)` (src/lib/supabase/pagedRead.ts)\n" +
        "      pour lire l'intégralité d'un jeu de données, avec preuve de complétude.\n",
    );
  }

  if (stale.length > 0) {
    console.error("\n✖ BASELINE PÉRIMÉE — ces entrées ne correspondent plus au code :\n");
    for (const { key, actual, allowed } of stale) {
      const [file, table] = key.split("::");
      console.error(
        `  ${file} — table \`${table}\` : ${actual} lecture(s) non bornée(s), ${allowed} attendue(s)`,
      );
    }
    console.error(
      "\n  La lecture a été bornée ou supprimée : mets `scripts/bounded-reads-baseline.json`\n" +
        "  à jour. La baseline ne doit que DÉCROÎTRE — c'est ce qui l'empêche de pourrir.\n",
    );
  }

  process.exit(1);
}

// Exécuté seulement en CLI : les fonctions ci-dessus sont importées par les tests.
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main();
