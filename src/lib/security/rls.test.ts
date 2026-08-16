/**
 * RLS regression tests — vérifient l'isolation entre utilisateurs sur :
 *   - user_stats (lecture seule côté client)
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

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "";

const HAS_ENV = !!(SUPABASE_URL && SERVICE_ROLE_KEY && ANON_KEY);
const d = HAS_ENV ? describe : describe.skip;

const TEST_BUCKETS = ["food-images", "clothes-images", "pharmacy-images", "pdf-documents"] as const;

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
    await admin.from("user_stats").upsert([
      { user_id: alice.id, xp: 100, level: 2, total_actions: 5 },
      { user_id: bob.id, xp: 200, level: 3, total_actions: 10 },
    ]);
  }, 30_000);

  afterAll(async () => {
    if (!admin) return;
    await Promise.all(
      [alice, bob].filter(Boolean).map((u) => (admin.auth as any).admin.deleteUser(u.id)),
    );
  }, 30_000);

  // ── user_stats ──────────────────────────────────────────────────────────
  describe("user_stats", () => {
    it("Alice ne voit que ses propres stats", async () => {
      const { data, error } = await alice.client.from("user_stats").select("user_id, xp");
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

    // Audit 16/08/2026 — CTX-03 : PATCH /rest/v1/user_stats {"xp": 9999999}
    // était accepté malgré une policy RESTRICTIVE censée l'interdire depuis
    // la migration 20260607103913 (enregistrée "applied" en base mais sans
    // effet réel constaté — voir la migration de correctif pour le détail).
    it.each([-1, 0, 9999999, null])(
      "Alice ne peut PAS UPDATE xp=%s directement",
      async (xpValue) => {
        const { error } = await alice.client
          .from("user_stats")
          .update({ xp: xpValue as number | null })
          .eq("user_id", alice.id);
        const { data } = await alice.client
          .from("user_stats")
          .select("xp")
          .eq("user_id", alice.id)
          .single();
        // La valeur en base ne doit JAMAIS avoir bougé, peu importe si
        // l'appel a renvoyé une erreur explicite ou 0 ligne affectée.
        expect(data?.xp).toBe(100);
        expect(error || data?.xp === 100).toBeTruthy();
      },
    );

    it("Alice ne peut PAS DELETE ses propres stats", async () => {
      const { error } = await alice.client.from("user_stats").delete().eq("user_id", alice.id);
      const { data } = await admin
        .from("user_stats")
        .select("xp")
        .eq("user_id", alice.id)
        .maybeSingle();
      expect(data).not.toBeNull();
      expect(error || data !== null).toBeTruthy();
    });
  });

  // ── activity_log (CTX-02) ───────────────────────────────────────────────
  // Audit 16/08/2026 : policy "auth_all_activity_log" en ALL avec pour seule
  // condition auth.role() = 'authenticated' — vraie pour tout compte
  // connecté, journal d'audit entièrement lisible et effaçable.
  describe("activity_log (CTX-02)", () => {
    it("Alice ne peut PAS lire le journal d'audit global", async () => {
      const { data, error } = await alice.client.from("activity_log").select("*");
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    });

    it("Alice ne peut PAS insérer directement dans activity_log", async () => {
      const { error } = await alice.client.from("activity_log").insert({
        table_name: "contrats",
        action: "INSERT",
        description: "faux événement injecté par Alice",
      });
      expect(error).not.toBeNull();
    });

    it("Alice ne peut PAS supprimer le journal d'audit", async () => {
      const { error, count } = await alice.client
        .from("activity_log")
        .delete({ count: "exact" })
        .neq("id", "00000000-0000-0000-0000-000000000000");
      expect(error !== null || count === 0).toBe(true);
    });
  });

  // ── domaine RH/paie — is_paie_staff (CTX-01) ────────────────────────────
  // Audit 16/08/2026 : is_paie_staff() autorisait tout utilisateur possédant
  // une ligne dans profiles, et handle_new_user() (trigger sur auth.users)
  // crée cette ligne pour CHAQUE inscription — y compris les inscriptions
  // Cortex. Toute nouvelle inscription obtenait un accès complet aux tables
  // RH/paie (contrats, DSN, arrêts maladie...).
  describe("domaine RH/paie — is_paie_staff (CTX-01)", () => {
    let testDossierId: string;

    beforeAll(async () => {
      const { data, error } = await admin
        .from("dossiers")
        .insert({ nom: `rls-test-${crypto.randomUUID()}` })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("dossier seed failed");
      testDossierId = data.id;
    });

    afterAll(async () => {
      if (testDossierId) await admin.from("dossiers").delete().eq("id", testDossierId);
    });

    it("un nouvel inscrit Cortex n'a AUCUN privilège RH par défaut", async () => {
      const { data } = await admin.from("profiles").select("role").eq("id", alice.id).maybeSingle();
      expect(data?.role).not.toBe("gestionnaire");
      expect(data?.role).not.toBe("admin");
      expect(data?.role).not.toBe("consultant");
    });

    it("Alice (compte Cortex standard) ne peut PAS lire le dossier RH de test", async () => {
      const { data } = await alice.client.from("dossiers").select("id").eq("id", testDossierId);
      expect(data ?? []).toHaveLength(0);
    });

    it("Alice ne peut PAS écrire dans contrats (dossier réel, existant)", async () => {
      const { error } = await alice.client.from("contrats").insert({
        dossier_id: testDossierId,
        salarie_nom: "Intrus",
        type: "CDI",
        date_debut: "2026-01-01",
        salaire_brut: 1,
      });
      expect(error).not.toBeNull();
    });

    it("Alice ne peut PAS s'auto-promouvoir gestionnaire (colonne role verrouillée)", async () => {
      const { error } = await alice.client
        .from("profiles")
        .update({ role: "gestionnaire" })
        .eq("id", alice.id);
      expect(error).not.toBeNull();

      const { data } = await admin.from("profiles").select("role").eq("id", alice.id).maybeSingle();
      expect(data?.role).not.toBe("gestionnaire");
    });

    it("un compte RH légitime (role assigné par service_role) garde son accès", async () => {
      const { error: promoteErr } = await admin
        .from("profiles")
        .update({ role: "gestionnaire" })
        .eq("id", bob.id);
      expect(promoteErr).toBeNull();

      try {
        const { data, error } = await bob.client
          .from("dossiers")
          .select("id")
          .eq("id", testDossierId);
        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(1);
      } finally {
        // Restaure l'état pour ne pas laisser Bob privilégié après le test.
        await admin.from("profiles").update({ role: "none" }).eq("id", bob.id);
      }
    });
  });

  // ── compute_fitness_stats / compute_achievement_stats (CTX-04) ──────────
  // Audit 16/08/2026 : SECURITY DEFINER, _uid accepté en paramètre sans
  // vérification, exécutable par anon — oracle de statistiques pour
  // n'importe quel utilisateur, sans compte.
  describe("compute_fitness_stats (CTX-04)", () => {
    it("un utilisateur anonyme ne peut PAS appeler compute_fitness_stats", async () => {
      const anon = createClient(SUPABASE_URL, ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await anon.rpc("compute_fitness_stats", { _uid: alice.id });
      expect(error).not.toBeNull();
    });

    it("Alice ne peut PAS lire les stats de Bob via compute_fitness_stats", async () => {
      const { error } = await alice.client.rpc("compute_fitness_stats", { _uid: bob.id });
      expect(error).not.toBeNull();
    });

    it("Alice peut lire SES PROPRES stats via compute_fitness_stats", async () => {
      const { data, error } = await alice.client.rpc("compute_fitness_stats", {
        _uid: alice.id,
      });
      expect(error).toBeNull();
      expect(data).not.toBeNull();
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
          const up = await bob.client.storage.from(bucket).upload(path, new Blob(["secret-bob"]), {
            contentType: "text/plain",
          });
          expect(up.error).toBeNull();

          const { data, error } = await alice.client.storage.from(bucket).download(path);
          expect(data).toBeNull();
          expect(error).not.toBeNull();

          await bob.client.storage.from(bucket).remove([path]);
        });

        it(`Alice ne peut PAS supprimer un fichier de Bob (${bucket})`, async () => {
          const path = bobFile();
          await bob.client.storage.from(bucket).upload(path, new Blob(["dont-delete"]), {
            contentType: "text/plain",
          });

          const { data } = await alice.client.storage.from(bucket).remove([path]);
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
