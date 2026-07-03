import { useEffect, useState } from "react";
import { Palette, Ruler, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { ACCENT_OPTIONS, applyAccent } from "@/lib/accent";

function PrefRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Sparkles;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="flex-1 text-sm">{label}</span>
      {children}
    </div>
  );
}

export function PersonalizationPanel() {
  const { prefs, update } = useUserPreferences();
  const [heightDraft, setHeightDraft] = useState<string>("");

  // Synchronise le champ taille quand les prefs arrivent
  useEffect(() => {
    setHeightDraft(prefs.height_cm != null ? String(prefs.height_cm) : "");
  }, [prefs.height_cm]);

  // Applique la couleur d'accent (réellement : recolore --primary)
  useEffect(() => {
    applyAccent(prefs.accent_color);
  }, [prefs.accent_color]);

  const commitHeight = () => {
    const trimmed = heightDraft.trim();
    if (trimmed === "") {
      if (prefs.height_cm != null) void update({ height_cm: null });
      return;
    }
    const v = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(v) || v < 100 || v > 250) {
      setHeightDraft(prefs.height_cm != null ? String(prefs.height_cm) : "");
      return;
    }
    if (v !== prefs.height_cm) void update({ height_cm: v });
  };

  return (
    <section className="mb-5">
      <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Personnalisation</h2>
      <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl">
        <PrefRow icon={Sparkles} label="Animations">
          <Switch
            checked={prefs.animations_enabled}
            onCheckedChange={(v) => void update({ animations_enabled: v })}
          />
        </PrefRow>
        <PrefRow icon={Ruler} label="Taille (cm)">
          <input
            type="number"
            inputMode="decimal"
            min={100}
            max={250}
            value={heightDraft}
            onChange={(e) => setHeightDraft(e.target.value)}
            onBlur={commitHeight}
            placeholder="—"
            className="w-20 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-primary/50"
            aria-label="Taille en centimètres"
          />
        </PrefRow>
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-muted-foreground">
            <Palette className="h-3.5 w-3.5" />
          </span>
          <span className="flex-1 text-sm">Couleur d'accent</span>
          <div className="flex gap-1.5">
            {ACCENT_OPTIONS.map((a) => (
              <button
                key={a.hex}
                type="button"
                onClick={() => void update({ accent_color: a.hex })}
                className="h-5 w-5 rounded-full border-2 transition-transform active:scale-90"
                style={{ background: a.hex, borderColor: prefs.accent_color === a.hex ? "white" : "transparent" }}
                aria-label={`Couleur ${a.label}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
