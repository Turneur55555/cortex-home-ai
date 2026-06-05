import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { requestReminderNotificationPermission } from "@/hooks/useReminderNotifications";

/**
 * Compact banner that surfaces the current Notification permission state and
 * lets the user grant it via an explicit click (required by Chrome/Safari).
 */
export function NotificationPermissionPrompt() {
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPerm("unsupported");
      return;
    }
    setPerm(Notification.permission);
  }, []);

  if (perm === "granted") return null;

  const handleEnable = async () => {
    if (perm === "unsupported") {
      toast.error("Ce navigateur ne supporte pas les notifications");
      return;
    }
    if (perm === "denied") {
      toast.error(
        "Notifications bloquées. Active-les dans les réglages du navigateur (icône cadenas dans la barre d'adresse).",
      );
      return;
    }
    const next = await requestReminderNotificationPermission();
    setPerm(next);
    if (next === "granted") toast.success("Notifications activées ✨");
    else if (next === "denied") toast.error("Permission refusée");
  };

  const denied = perm === "denied" || perm === "unsupported";

  return (
    <button
      type="button"
      onClick={handleEnable}
      className={`mb-3 flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.99] ${
        denied
          ? "border-destructive/30 bg-destructive/10"
          : "border-primary/30 bg-primary/10 hover:bg-primary/15"
      }`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          denied ? "bg-destructive/20 text-destructive" : "bg-primary/20 text-primary"
        }`}
      >
        {denied ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {denied ? "Notifications bloquées" : "Activer les notifications"}
        </p>
        <p className="text-xs text-muted-foreground">
          {denied
            ? "Autorise-les dans les réglages du navigateur pour recevoir tes rappels."
            : "Reçois une alerte avant chaque rappel, même hors de cette page."}
        </p>
      </div>
    </button>
  );
}
