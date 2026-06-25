// Scheduled function — runs via Supabase cron (no user auth).
// Configure in Supabase Dashboard → Edge Functions → Schedule.
// Recommended cron: "0 8 * * 1" (every Monday at 8:00 UTC)
import { createClient } from "@supabase/supabase-js";

function getWeekBounds(): { weekStart: string; weekEnd: string } {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diff);
  monday.setUTCHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    weekStart: monday.toISOString().split("T")[0],
    weekEnd: sunday.toISOString().split("T")[0],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200 });

  // Require CRON_SECRET bearer token — function is only called by Supabase cron.
  const provided = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || provided !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SERVICE_ROLE) {
      console.error("[scheduled-weekly-report] SUPABASE_SERVICE_ROLE_KEY manquant");
      return new Response(JSON.stringify({ error: "Service key missing" }), { status: 500 });
    }

    const adminSupa = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { weekStart, weekEnd } = getWeekBounds();

    // Fetch all user profiles
    const { data: users, error: usersErr } = await adminSupa
      .from("users_profiles")
      .select("id");

    if (usersErr || !users) {
      console.error("[scheduled-weekly-report] Erreur fetch users:", usersErr);
      return new Response(JSON.stringify({ error: "Error fetching users" }), { status: 500 });
    }

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const user of users) {
      try {
        // Skip if report already exists for this week
        const { data: existing } = await adminSupa
          .from("weekly_reports")
          .select("id")
          .eq("user_id", user.id)
          .eq("week_start", weekStart)
          .maybeSingle();

        if (existing) { skipped++; continue; }

        // Create a "generating" placeholder — user will trigger actual generation
        const { error } = await adminSupa.from("weekly_reports").insert({
          user_id: user.id,
          week_start: weekStart,
          week_end: weekEnd,
          summary: {},
          fitness_data: {},
          nutrition_data: {},
          body_data: {},
          ai_analysis: {},
          status: "generating",
        });

        if (error) { errors++; console.error(`[scheduled-weekly-report] user ${user.id}:`, error); }
        else created++;
      } catch (e) {
        errors++;
        console.error(`[scheduled-weekly-report] user ${user.id}:`, e);
      }
    }

    return new Response(
      JSON.stringify({ message: "Scheduled reports initialized", weekStart, created, skipped, errors }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[scheduled-weekly-report] Fatal:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 });
  }
});
