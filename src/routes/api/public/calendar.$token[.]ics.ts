import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/calendar/$token.ics")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const raw = (params as Record<string, string>).token ?? (params as Record<string, string>)["token.ics"] ?? "";
        const token = String(raw).replace(/\.ics$/i, "").trim();
        if (!token || !/^[a-zA-Z0-9_-]{16,128}$/.test(token)) {
          return new Response("Invalid token", { status: 400 });
        }

        const { data: tok, error: tokErr } = await supabaseAdmin
          .from("calendar_tokens")
          .select("user_id")
          .eq("token", token)
          .maybeSingle();

        if (tokErr || !tok) {
          return new Response("Not found", { status: 404 });
        }

        const { data: reminders, error: remErr } = await supabaseAdmin
          .from("reminders")
          .select("id,title,description,due_at,all_day,notify_before_minutes,status,updated_at,created_at")
          .eq("user_id", tok.user_id)
          .not("due_at", "is", null)
          .order("due_at", { ascending: true });

        if (remErr) {
          return new Response("Server error", { status: 500 });
        }

        const ics = buildICS(reminders ?? []);
        return new Response(ics, {
          status: 200,
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Cache-Control": "private, max-age=300",
            "Content-Disposition": 'inline; filename="cortex-rappels.ics"',
          },
        });
      },
    },
  },
});

type Row = {
  id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  all_day: boolean;
  notify_before_minutes: number;
  status: string;
  updated_at: string;
  created_at: string;
};

function escapeICS(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function fmtUTC(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function fmtDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear().toString() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate())
  );
}

function fold(line: string): string {
  // RFC5545: fold long lines at 75 octets
  if (line.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    out.push((i === 0 ? "" : " ") + line.slice(i, i + 74));
    i += 74;
  }
  return out.join("\r\n");
}

function buildICS(rows: Row[]): string {
  const now = fmtUTC(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ICORTEX//Rappels//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Rappels ICORTEX",
    "X-WR-TIMEZONE:Europe/Paris",
  ];

  for (const r of rows) {
    if (!r.due_at) continue;
    const due = new Date(r.due_at);
    if (Number.isNaN(due.getTime())) continue;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${r.id}@icortex`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`CREATED:${fmtUTC(new Date(r.created_at))}`);
    lines.push(`LAST-MODIFIED:${fmtUTC(new Date(r.updated_at))}`);

    if (r.all_day) {
      const day = fmtDate(due);
      const end = new Date(due.getTime() + 24 * 60 * 60 * 1000);
      lines.push(`DTSTART;VALUE=DATE:${day}`);
      lines.push(`DTEND;VALUE=DATE:${fmtDate(end)}`);
    } else {
      const end = new Date(due.getTime() + 30 * 60 * 1000);
      lines.push(`DTSTART:${fmtUTC(due)}`);
      lines.push(`DTEND:${fmtUTC(end)}`);
    }

    lines.push(fold(`SUMMARY:${escapeICS(r.title)}`));
    if (r.description) lines.push(fold(`DESCRIPTION:${escapeICS(r.description)}`));
    lines.push(`STATUS:${r.status === "done" ? "COMPLETED" : "CONFIRMED"}`);
    lines.push("TRANSP:OPAQUE");

    if (r.notify_before_minutes > 0 && r.status !== "done") {
      lines.push("BEGIN:VALARM");
      lines.push("ACTION:DISPLAY");
      lines.push(`DESCRIPTION:${escapeICS(r.title)}`);
      lines.push(`TRIGGER:-PT${r.notify_before_minutes}M`);
      lines.push("END:VALARM");
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
