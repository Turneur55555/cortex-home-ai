const MAX_ENTRIES = 500;
const STORAGE_KEY = "reminder_audit_log_v1";

export interface ReminderAuditEntry {
  ts: string;
  event: string;
  reminderId: string | null;
  detail: string;
}

function getBuffer(): ReminderAuditEntry[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ReminderAuditEntry[]) : [];
  } catch {
    return [];
  }
}

function saveBuffer(buffer: ReminderAuditEntry[]) {
  try {
    const trimmed = buffer.slice(-MAX_ENTRIES);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // storage quota — silently drop
  }
}

/**
 * Log a realtime postgres_changes payload for the reminders table.
 * Call this inside the Supabase realtime callback.
 */
export function logReminderAudit(payload: {
  eventType: string;
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
  schema: string;
  table: string;
  commit_timestamp: string;
}) {
  const entry: ReminderAuditEntry = {
    ts: new Date().toISOString(),
    event: payload.eventType,
    reminderId:
      (payload.new?.id as string | undefined) ??
      (payload.old?.id as string | undefined) ??
      null,
    detail: JSON.stringify({
      commit_ts: payload.commit_timestamp,
      newStatus: payload.new?.status,
      oldStatus: payload.old?.status,
      newDue: payload.new?.due_at,
      oldDue: payload.old?.due_at,
    }),
  };

  const buffer = getBuffer();
  buffer.push(entry);
  saveBuffer(buffer);

  // Structured console log for immediate dev/prod debugging
  // eslint-disable-next-line no-console
  console.info(`[Audit:Reminders] ${entry.ts} | ${entry.event} | ${entry.reminderId ?? "—"}`);
}

/** Retrieve the full audit log from sessionStorage. */
export function getReminderAuditLog(): ReminderAuditEntry[] {
  return getBuffer();
}

/** Clear the audit log. */
export function clearReminderAuditLog() {
  sessionStorage.removeItem(STORAGE_KEY);
}

/* Expose globally so support can ask users to run
   `__REMINDER_AUDIT__.getLog()` in the browser console in production. */
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__REMINDER_AUDIT__ = {
    getLog: getReminderAuditLog,
    clear: clearReminderAuditLog,
  };
}
