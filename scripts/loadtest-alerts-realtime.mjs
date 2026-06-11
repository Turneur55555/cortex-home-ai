#!/usr/bin/env node
/**
 * loadtest-alerts-realtime.mjs
 *
 * Test de charge du realtime pour le module Alertes (table public.items).
 *
 * Scénario :
 *   1. Ouvre un canal Realtime sur public.items (postgres_changes *).
 *   2. Insère N items "expirés" puis les UPDATE en rafale (B vagues).
 *   3. Compte les évènements reçus, mesure la latence min/avg/p95/max,
 *      le débit, les pertes et le temps de drain final.
 *   4. Nettoie tous les items créés (best-effort).
 *
 * Usage :
 *   SUPABASE_URL=... \
 *   SUPABASE_ANON_KEY=... \
 *   LOADTEST_EMAIL=foo@bar.com \
 *   LOADTEST_PASSWORD=secret \
 *   node scripts/loadtest-alerts-realtime.mjs [--items=100] [--waves=3] [--concurrency=20]
 *
 * Variables d'env :
 *   SUPABASE_URL          (def: VITE_SUPABASE_URL via .env)
 *   SUPABASE_ANON_KEY     (def: VITE_SUPABASE_PUBLISHABLE_KEY via .env)
 *   LOADTEST_EMAIL        compte de test (RLS = items du user uniquement)
 *   LOADTEST_PASSWORD     mot de passe du compte de test
 *
 * Exit code 0 si pertes < 1 % et drain < 5 s, sinon 1.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { argv, exit, env } from 'node:process';

// ── .env loader minimal ──────────────────────────────────────────────────────
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const args = Object.fromEntries(
  argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const N_ITEMS = Number(args.items ?? 100);
const WAVES = Number(args.waves ?? 3);
const CONC = Number(args.concurrency ?? 20);

const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
const EMAIL = env.LOADTEST_EMAIL;
const PASSWORD = env.LOADTEST_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Manque SUPABASE_URL / SUPABASE_ANON_KEY (ou VITE_*).');
  exit(2);
}
if (!EMAIL || !PASSWORD) {
  console.error('Manque LOADTEST_EMAIL / LOADTEST_PASSWORD.');
  exit(2);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Auth ─────────────────────────────────────────────────────────────────────
const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
  email: EMAIL,
  password: PASSWORD,
});
if (authErr) {
  console.error('Auth échouée:', authErr.message);
  exit(2);
}
const userId = auth.user.id;
console.log(`✓ Connecté: ${EMAIL} (uid=${userId.slice(0, 8)}…)`);

// ── Compteurs ────────────────────────────────────────────────────────────────
const sentAt = new Map(); // key=`${event}:${id}` → ts ms
const latencies = []; // ms
let received = { INSERT: 0, UPDATE: 0, DELETE: 0 };
let lastEventAt = 0;

function record(eventType, id) {
  const key = `${eventType}:${id}`;
  const t0 = sentAt.get(key);
  if (t0 != null) {
    latencies.push(Date.now() - t0);
    sentAt.delete(key);
  }
  received[eventType] = (received[eventType] ?? 0) + 1;
  lastEventAt = Date.now();
}

// ── Canal Realtime ───────────────────────────────────────────────────────────
const channel = supabase
  .channel(`loadtest_items_${Date.now()}`)
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'items' },
    (payload) => {
      const row = (payload.new ?? payload.old);
      record(payload.eventType, row?.id);
    },
  );

await new Promise((resolve, reject) => {
  channel.subscribe((status, err) => {
    if (status === 'SUBSCRIBED') resolve();
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(err ?? new Error(status));
  });
});
console.log('✓ Canal Realtime souscrit');

// ── Helpers ──────────────────────────────────────────────────────────────────
async function inParallel(items, worker, conc = CONC) {
  const results = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: conc }, async () => {
      while (i < items.length) {
        const idx = i++;
        results[idx] = await worker(items[idx], idx);
      }
    }),
  );
  return results;
}

function pct(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

const stamp = Date.now();
const createdIds = [];

// ── Phase 1 : INSERT ─────────────────────────────────────────────────────────
console.log(`\n▶ Phase INSERT : ${N_ITEMS} items (concurrence ${CONC})`);
const insertStart = Date.now();
const inserts = await inParallel(
  Array.from({ length: N_ITEMS }, (_, k) => k),
  async (k) => {
    const expiration = new Date(Date.now() - 86_400_000).toISOString(); // expiré hier
    const row = {
      user_id: userId,
      name: `loadtest-${stamp}-${k}`,
      category: 'loadtest',
      module: 'maison',
      quantity: 1,
      alert_days_before: 7,
      expiration_date: expiration,
      flagged: false,
    };
    const t0 = Date.now();
    const { data, error } = await supabase.from('items').insert(row).select('id').single();
    if (error) {
      console.error('insert err:', error.message);
      return null;
    }
    sentAt.set(`INSERT:${data.id}`, t0);
    return data.id;
  },
);
inserts.filter(Boolean).forEach((id) => createdIds.push(id));
const insertElapsed = Date.now() - insertStart;
console.log(`  ✓ ${createdIds.length}/${N_ITEMS} insérés en ${insertElapsed} ms`);

// ── Phase 2 : UPDATE en vagues ──────────────────────────────────────────────
for (let w = 1; w <= WAVES; w++) {
  console.log(`\n▶ Phase UPDATE vague ${w}/${WAVES}`);
  const t0 = Date.now();
  await inParallel(createdIds, async (id) => {
    const ts = Date.now();
    sentAt.set(`UPDATE:${id}`, ts);
    const { error } = await supabase
      .from('items')
      .update({ quantity: w + 1, notes: `wave-${w}-${ts}` })
      .eq('id', id);
    if (error) {
      sentAt.delete(`UPDATE:${id}`);
      console.error('update err:', error.message);
    }
  });
  console.log(`  ✓ ${createdIds.length} updates en ${Date.now() - t0} ms`);
}

// ── Phase 3 : drain ─────────────────────────────────────────────────────────
console.log('\n▶ Drain (attente que les évènements arrivent)…');
const drainStart = Date.now();
const drainDeadline = drainStart + 15_000; // 15 s max
const expectedTotal = createdIds.length * (1 + WAVES); // 1 INSERT + WAVES UPDATE
while (
  received.INSERT + received.UPDATE < expectedTotal &&
  Date.now() < drainDeadline
) {
  await new Promise((r) => setTimeout(r, 100));
  if (lastEventAt && Date.now() - lastEventAt > 2_000) break; // silence radio 2 s
}
const drainElapsed = Date.now() - drainStart;

// ── Phase 4 : cleanup ───────────────────────────────────────────────────────
console.log('\n▶ Cleanup');
const { error: delErr } = await supabase
  .from('items')
  .delete()
  .in('id', createdIds);
if (delErr) console.error('  ⚠ delete err:', delErr.message);
else console.log(`  ✓ ${createdIds.length} items supprimés`);

await supabase.removeChannel(channel);
await supabase.auth.signOut();

// ── Rapport ─────────────────────────────────────────────────────────────────
const totalExpected = expectedTotal;
const totalReceived = received.INSERT + received.UPDATE;
const lossPct = ((totalExpected - totalReceived) / totalExpected) * 100;
const throughput = totalReceived / ((drainStart + drainElapsed - insertStart) / 1000);

console.log('\n╔════════════════ RAPPORT ════════════════╗');
console.log(`  items créés        : ${createdIds.length}`);
console.log(`  vagues UPDATE      : ${WAVES}`);
console.log(`  évts attendus      : ${totalExpected}`);
console.log(`  évts reçus         : ${totalReceived}   (INSERT ${received.INSERT} / UPDATE ${received.UPDATE})`);
console.log(`  pertes             : ${lossPct.toFixed(2)} %`);
console.log(`  drain final        : ${drainElapsed} ms`);
console.log(`  débit moyen        : ${throughput.toFixed(1)} évts/s`);
console.log(`  latence min/avg/p95/max : ${
  latencies.length
    ? `${Math.min(...latencies)} / ${(latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(0)} / ${pct(latencies, 95)} / ${Math.max(...latencies)} ms`
    : 'n/a'
}`);
console.log('╚═════════════════════════════════════════╝');

const ok = lossPct < 1 && drainElapsed < 5_000;
console.log(ok ? '\n✅ TEST RÉUSSI' : '\n❌ TEST ÉCHOUÉ (pertes ≥ 1 % ou drain ≥ 5 s)');
exit(ok ? 0 : 1);
