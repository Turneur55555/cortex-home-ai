/**
 * RLS regression tests — vérifient l'isolation entre utilisateurs sur :
 *   - user_stats (lecture seule côté client)
 *   - user_badges (insert refusé, déblocage uniquement via RPC unlock_user_badge)
 *   - storage.objects (buckets food-images, clothes-images, pharmacy-images, pdf-documents)
 *
 * Exécution :
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... \
 *     bun run test src/lib/security/rls.test.ts
 *
 * Sans les variables d'env, les tests sont `skip` (utile en dev local sans secrets).
 * En CI, ces variables sont injectées depuis les secrets GitHub Actions.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "";

const HAS_ENV = !!(SUPABASE_URL && SERVICE_ROLE_KEY && ANON_KEY);
const d = HAS_ENV ? describe : describe.skip;

const TEST_BUCKETS = [
  "food-images",
  "clothes-images",
  "pharmacy-images",
  "pdf-documents",
] as const;

interface TestUser {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
}

async function createUser(admin: SupabaseClient): Promise<TestUser> {
  const email = `rls-test-${crypto.randomUUID()}@icortex.test`;
  const password = `Pwd-${crypto.randomUUID()}`;
  const { data, error } = await (admin.auth as any).admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr) throw signInErr;

  return { id: data.user.id, email, password, client };
}

d("RLS regression — user isolation", () => {
  let admin: SupabaseClient;
  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    [alice, bob] = await Promise.all([createUser(admin), createUser(admin)]);

    // Seed user_stats for both via service-role (table has no client INSERT policy).
    await admin
      .from("user_stats")
      .upsert([
        { user_id: alice.id, xp: 100, level: 2, total_actions: 5 },
        { user_id: bob.id, xp: 200, level: 3, total_actions: 10 },
      ]);
  }, 30_000);

  afterAll(async () => {
    if (!admin) return;
    await Promise.all(
      [alice, bob]
        .filter(Boolean)
        .map((u) => (admin.auth as any).admin.deleteUser(u.id)),
    );
  }, 30_000);

  // ── user_stats ──────────────────────────────────────────────────────────
  describe("user_stats", () => {
    it("Alice ne voit que ses propres stats", async () => {
      const { data, error } = await alice.client
        .from("user_stats")
        .select("user_id, xp");
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].user_id).toBe(alice.id);
      expect(data![0].xp).toBe(100);
    });

    it("Alice ne peut PAS INSERT dans user_stats (policy retirée)", async () => {
      const { error } = await alice.client
        .from("user_stats")
        .insert({ user_id: alice.id, xp: 9999, level: 99, total_actions: 0 });
      expect(error).not.toBeNull();
    });

    it("Alice ne peut PAS UPDATE ses stats directement", async () => {
      const { error } = await alice.client
        .from("user_stats")
        .update({ xp: 9999 })
        .eq("user_id", alice.id);
      // Soit erreur de permission, soit 0 row affecté → re-vérifier la valeur
      const { data } = await alice.client
        .from("user_stats")
        .select("xp")
        .eq("user_id", alice.id)
        .single();
      expect(data?.xp).toBe(100);
      expect(error || data?.xp === 100).toBeTruthy();
    });

    it("Alice ne peut PAS voir les stats de Bob", async () => {
      const { data } = await alice.client
        .from("user_stats")
        .select("user_id")
        .eq("user_id", bob.id);
      expect(data ?? []).toHaveLength(0);
    });
  });

  // ── user_badges ─────────────────────────────────────────────────────────
  describe("user_badges", () => {
    it("Alice ne peut PAS INSERT directement dans user_badges", async () => {
      const { error } = await alice.client.from("user_badges").insert({
        user_id: alice.id,
        badge_key: "hack_attempt",
        label: "Hacker",
        icon: "Award",
        rarity: "legendary",
        xp_reward: 99999,
        description: "bypass",
      });
      expect(error).not.toBeNull();
    });

    it("unlock_user_badge échoue si critères non remplis", async () => {
      // Choisir un badge existant dont les critères ne sont pas remplis
      const { data: catalog } = await alice.client
        .from("badges_catalog")
        .select("badge_key, requirement_type, requirement_value")
        .in("requirement_type", [
          "workouts_count",
          "goals_completed",
          "body_measurements",
        ])
        .order("requirement_value", { ascending: false })
        .limit(1);
      const hardBadge = catalog?.[0]?.badge_key;
      if (!hardBadge) return; // catalog vide → skip
      const { error } = await (alice.client as any).rpc("unlock_user_badge", {
        _badge_key: hardBadge,
      });
      expect(error).not.toBeNull();
      expect(String(error?.message)).toMatch(/Criteria not met|Unknown badge/i);
    });

    it("unlock_user_badge refuse un badge inconnu", async () => {
      const { error } = await (alice.client as any).rpc("unlock_user_badge", {
        _badge_key: `__nope_${crypto.randomUUID()}`,
      });
      expect(error).not.toBeNull();
    });

    it("Alice ne voit pas les badges de Bob", async () => {
      // Seed un badge pour Bob via service-role
      const { data: cat } = await admin
        .from("badges_catalog")
        .select("badge_key, label, icon, rarity, xp_reward, description")
        .limit(1)
        .single();
      if (cat) {
        await admin.from("user_badges").insert({
          user_id: bob.id,
          ...cat,
        });
      }
      const { data } = await alice.client
        .from("user_badges")
        .select("user_id")
        .eq("user_id", bob.id);
      expect(data ?? []).toHaveLength(0);
    });
  });

  // ── storage.objects ─────────────────────────────────────────────────────
  describe("storage.objects (buckets privés)", () => {
    for (const bucket of TEST_BUCKETS) {
      describe(bucket, () => {
        const aliceFile = () => `${alice.id}/rls-${crypto.randomUUID()}.txt`;
        const bobFile = () => `${bob.id}/rls-${crypto.randomUUID()}.txt`;

        it(`Alice peut uploader dans son dossier (${bucket})`, async () => {
          const path = aliceFile();
          const { error } = await alice.client.storage
            .from(bucket)
            .upload(path, new Blob(["alice"]), { contentType: "text/plain" });
          expect(error).toBeNull();
          await alice.client.storage.from(bucket).remove([path]);
        });

        it(`Alice ne peut PAS uploader dans le dossier de Bob (${bucket})`, async () => {
          const path = bobFile();
          const { error } = await alice.client.storage
            .from(bucket)
            .upload(path, new Blob(["intrusion"]), {
              contentType: "text/plain",
            });
          expect(error).not.toBeNull();
        });

        it(`Alice ne peut PAS lire un fichier de Bob (${bucket})`, async () => {
          // Bob upload d'abord
          const path = bobFile();
          const up = await bob.client.storage
            .from(bucket)
            .upload(path, new Blob(["secret-bob"]), {
              contentType: "text/plain",
            });
          expect(up.error).toBeNull();

          const { data, error } = await alice.client.storage
            .from(bucket)
            .download(path);
          expect(data).toBeNull();
          expect(error).not.toBeNull();

          await bob.client.storage.from(bucket).remove([path]);
        });

        it(`Alice ne peut PAS supprimer un fichier de Bob (${bucket})`, async () => {
          const path = bobFile();
          await bob.client.storage
            .from(bucket)
            .upload(path, new Blob(["dont-delete"]), {
              contentType: "text/plain",
            });

          const { data } = await alice.client.storage
            .from(bucket)
            .remove([path]);
          // remove() retourne [] si rien n'a été supprimé (RLS filtre)
          expect(data ?? []).toHaveLength(0);

          // Vérifie que le fichier existe toujours côté Bob
          const dl = await bob.client.storage.from(bucket).download(path);
          expect(dl.error).toBeNull();
          await bob.client.storage.from(bucket).remove([path]);
        });

        it(`Utilisateur anonyme ne peut RIEN faire (${bucket})`, async () => {
          const anon = createClient(SUPABASE_URL, ANON_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const path = `anon/${crypto.randomUUID()}.txt`;
          const up = await anon.storage
            .from(bucket)
            .upload(path, new Blob(["anon"]), { contentType: "text/plain" });
          expect(up.error).not.toBeNull();
        });
      });
    }
  });
});

if (!HAS_ENV) {
  describe("RLS regression — user isolation", () => {
    it.skip("variables d'env SUPABASE_URL/SERVICE_ROLE_KEY/ANON_KEY manquantes", () => {});
  });
}
