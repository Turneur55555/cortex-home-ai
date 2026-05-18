import { useEffect } from "react";
import { Bell, Palette, Ruler, Sparkles, Sun } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useUserPreferences } from "@/hooks/useUserPreferences";

const ACCENTS = ["#6c63ff", "#22c55e", "#f97316", "#ec4899", "#06b6d4", "#eab308"];

export function PersonalizationPanel() {
  const { prefs, update } = useUserPreferences();

  // Applique la couleur d'accent en CSS var
  useEffect(() => {
    if (prefs.accent_color) {
      document.documentElement.style.setProperty("--accent-color", prefs.accent_color);
    }
  }, [prefs.accent_color]);

  const Row = ({
    icon: Icon,
    label,
    children,
  }: {
    icon: typeof Sun;
    label: string;
    children: React.ReactNode;
  }) => (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="flex-1 text-sm">{label}</span>
      {children}
    </div>
  );

  return (
    <section className="mb-5">
      <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Personnalisation</h2>
      <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl">
        <Row icon={Sun} label="Thème sombre">
          <Switch checked={prefs.theme === "dark"} onCheckedChange={(v) => void update({ theme: v ? "dark" : "light" })} />
        </Row>
        <Row icon={Sparkles} label="Animations">
          <Switch checked={prefs.animations_enabled} onCheckedChange={(v) => void update({ animations_enabled: v })} />
        </Row>
        <Row icon={Bell} label="Notifications">
          <Switch checked={prefs.notifications_enabled} onCheckedChange={(v) => void update({ notifications_enabled: v })} />
        </Row>
        <Row icon={Ruler} label="Unités">
          <select
            value={prefs.units}
            onChange={(e) => void update({ units: e.target.value as "metric" | "imperial" })}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs"
          >
            <option value="metric">Métriques</option>
            <option value="imperial">Impériales</option>
          </select>
        </Row>
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-muted-foreground">
            <Palette className="h-3.5 w-3.5" />
          </span>
          <span className="flex-1 text-sm">Couleur d'accent</span>
          <div className="flex gap-1.5">
            {ACCENTS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => void update({ accent_color: c })}
                className="h-5 w-5 rounded-full border-2 transition-transform"
                style={{ background: c, borderColor: prefs.accent_color === c ? "white" : "transparent" }}
                aria-label={`Couleur ${c}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
