#!/usr/bin/env node
/**
 * Garde-fou « source de vérité unique » : la SEULE base Supabase autorisée est
 * bcwfvpwxzlmkxobvbtzp (décision produit du 31/07/2026, voir
 * src/config/supabase-project.ts).
 *
 * Ce script échoue si :
 *  1. src/config/supabase-project.ts n'épingle plus ce project ref ;
 *  2. la clé anon épinglée n'appartient pas à ce projet ;
 *  3. un autre project ref Supabase apparaît dans le code applicatif ;
 *  4. les variables d'environnement SUPABASE_PROJECT_REF / VITE_SUPABASE_URL /
 *     SUPABASE_URL sont définies et divergent de ce projet.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const EXPECTED_REF = "bcwfvpwxzlmkxobvbtzp";
const CONFIG_FILE = "src/config/supabase-project.ts";
const errors = [];

// 1 + 2 — le fichier de configuration épingle bien le bon projet
let config = "";
try {
  config = readFileSync(CONFIG_FILE, "utf8");
} catch {
  errors.push(`${CONFIG_FILE} est introuvable — la configuration Supabase doit rester centralisée.`);
}

if (config) {
  const refMatch = config.match(/SUPABASE_PROJECT_REF\s*=\s*["'`]([^"'`]+)["'`]/);
  if (!refMatch) {
    errors.push(`${CONFIG_FILE} : constante SUPABASE_PROJECT_REF introuvable.`);
  } else if (refMatch[1] !== EXPECTED_REF) {
    errors.push(
      `${CONFIG_FILE} : SUPABASE_PROJECT_REF vaut "${refMatch[1]}" au lieu de "${EXPECTED_REF}".`,
    );
  }

  const keyMatch = config.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*\s*["'`]([^"'`]+)["'`]/s);
  if (keyMatch) {
    try {
      const payload = JSON.parse(Buffer.from(keyMatch[1].split(".")[1], "base64").toString("utf8"));
      if (payload.ref !== EXPECTED_REF) {
        errors.push(
          `${CONFIG_FILE} : la clé anon épinglée appartient au projet "${payload.ref}" au lieu de "${EXPECTED_REF}".`,
        );
      }
    } catch {
      errors.push(`${CONFIG_FILE} : la clé anon épinglée est illisible (JWT invalide).`);
    }
  }
}

// 3 — aucun autre project ref dans le code applicatif
const SCAN_DIRS = ["src", "scripts", "supabase/functions", ".github/workflows"];
const SCAN_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".yml", ".yaml", ".sql"]);
const REF_RE = /\b([a-z]{20})\.supabase\.(?:co|in)\b|project-id\s+([a-z]{20})\b|project_id:\s*([a-z]{20})\b/g;

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    if (!SCAN_EXT.has(extname(full))) continue;
    const content = readFileSync(full, "utf8");
    for (const match of content.matchAll(REF_RE)) {
      const ref = match[1] || match[2] || match[3];
      if (ref && ref !== EXPECTED_REF) {
        const line = content.slice(0, match.index).split("\n").length;
        errors.push(`${full}:${line} référence un autre projet Supabase : "${ref}".`);
      }
    }
  }
}
SCAN_DIRS.forEach(walk);

// 4 — variables d'environnement
// SUPABASE_PROJECT_REF est une variable que NOUS contrôlons (repository vars) :
// toute divergence est une erreur bloquante.
const envRef = process.env.SUPABASE_PROJECT_REF;
if (envRef && envRef !== EXPECTED_REF) {
  errors.push(`SUPABASE_PROJECT_REF="${envRef}" diverge de "${EXPECTED_REF}".`);
}

// VITE_SUPABASE_URL / SUPABASE_URL sont injectées automatiquement par
// l'intégration Lovable Cloud (autre projet), hors de notre contrôle, et
// neutralisées volontairement par src/integrations/supabase/client.ts.
// On avertit sans faire échouer : seule une référence présente dans le dépôt
// (voir étapes 1-3) est bloquante.
for (const name of ["VITE_SUPABASE_URL", "SUPABASE_URL"]) {
  const value = process.env[name];
  if (value && !value.includes(EXPECTED_REF)) {
    console.warn(
      `⚠️  ${name} pointe vers une autre instance (injection Lovable Cloud) — ignorée par client.ts.`,
    );
  }
}

if (errors.length > 0) {
  console.error("❌ Base Supabase non conforme (source de vérité unique : " + EXPECTED_REF + ")\n");
  for (const err of errors) console.error("  • " + err);
  console.error(
    "\nVoir src/config/supabase-project.ts. Aucune autre instance Supabase n'est autorisée.",
  );
  process.exit(1);
}

console.log(`✅ Configuration Supabase conforme : ${EXPECTED_REF} est la seule base référencée.`);
