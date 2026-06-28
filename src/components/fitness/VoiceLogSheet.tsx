import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet } from "@/components/shared/FormComponents";
import { useAddNutritionBatch } from "@/hooks/use-fitness";

interface ParsedItem {
  name: string;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
}

interface ParseResult {
  items: ParsedItem[];
  meal?: string;
  confidence?: number;
  details?: string;
}

const MEAL_LABELS: Record<string, string> = {
  "petit-dej": "Petit-déjeuner",
  dejeuner: "Déjeuner",
  diner: "Dîner",
  collation: "Collation",
};

const VALID_MEALS = ["petit-dej", "dejeuner", "diner", "collation"] as const;

// Vérifie si SpeechRecognition est disponible (Chrome iOS / Safari 17+).
const hasSpeechRecognition =
  typeof window !== "undefined" &&
  (typeof window.SpeechRecognition !== "undefined" ||
    typeof (window as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition !== "undefined");

type SpeechRecognitionType = typeof SpeechRecognition;

function getSpeechRecognition(): SpeechRecognitionType | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window.SpeechRecognition ?? (window as any).webkitSpeechRecognition) ?? null;
}

interface VoiceLogSheetProps {
  date: string;
  onClose: () => void;
}

export function VoiceLogSheet({ date, onClose }: VoiceLogSheetProps) {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [manualText, setManualText] = useState("");
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [meal, setMeal] = useState("dejeuner");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const addBatch = useAddNutritionBatch();

  const parse = useMutation({
    mutationFn: async (text: string) => {
      const { data, error } = await supabase.functions.invoke("parse-meal-text", {
        body: { text },
      });
      if (error) throw new Error("Erreur de connexion au service IA. Vérifie ta connexion.");
      if (data?.error) throw new Error(data.error as string);
      return data as ParseResult;
    },
    onSuccess: (d) => {
      setParseResult(d);
      setItems(d.items ?? []);
      const detectedMeal = d.meal ?? "";
      if (VALID_MEALS.includes(detectedMeal as (typeof VALID_MEALS)[number])) {
        setMeal(detectedMeal);
      }
      const n = (d.items ?? []).length;
      toast.success(`${n} aliment${n > 1 ? "s" : ""} identifié${n > 1 ? "s" : ""}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startRecording = () => {
    const SR = getSpeechRecognition();
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = "fr-FR";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setRecording(true);
    recognition.onend = () => {
      setRecording(false);
      recognitionRef.current = null;
    };
    recognition.onerror = (e) => {
      setRecording(false);
      recognitionRef.current = null;
      if (e.error !== "aborted" && e.error !== "no-speech") {
        toast.error("Erreur micro : " + e.error);
      }
    };
    recognition.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      const combined = (final || interim).trim();
      if (combined) setTranscript(combined);
      // Auto-parse when speech ends (final result)
      if (final.trim()) {
        setTranscript(final.trim());
        parse.mutate(final.trim());
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopRecording = () => {
    recognitionRef.current?.stop();
  };

  // Clean up on unmount
  useEffect(() => {
    return () => { recognitionRef.current?.abort(); };
  }, []);

  const handleManualParse = () => {
    const text = manualText.trim();
    if (!text) return;
    setTranscript(text);
    setItems([]);
    setParseResult(null);
    parse.mutate(text);
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
    if (editingIdx === idx) setEditingIdx(null);
  };

  const updateItem = (idx: number, patch: Partial<ParsedItem>) =>
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));

  const confirm = () => {
    if (items.length === 0) return;
    addBatch.mutate(
      items.map((item) => ({
        date,
        meal,
        name: item.name,
        calories: Math.round(item.calories),
        proteins: Math.round(item.proteins * 10) / 10,
        carbs: Math.round(item.carbs * 10) / 10,
        fats: Math.round(item.fats * 10) / 10,
        base_calories: Math.round(item.calories),
        base_proteins: Math.round(item.proteins * 10) / 10,
        base_carbs: Math.round(item.carbs * 10) / 10,
        base_fats: Math.round(item.fats * 10) / 10,
        serving_count: 1,
        percentage_consumed: 100,
      })),
      { onSuccess: () => onClose() },
    );
  };

  const totals = items.reduce(
    (acc, i) => ({
      calories: acc.calories + i.calories,
      proteins: acc.proteins + i.proteins,
      carbs: acc.carbs + i.carbs,
      fats: acc.fats + i.fats,
    }),
    { calories: 0, proteins: 0, carbs: 0, fats: 0 },
  );

  const reset = () => {
    setTranscript("");
    setManualText("");
    setItems([]);
    setParseResult(null);
    setEditingIdx(null);
    stopRecording();
  };

  return (
    <Sheet title="Saisie vocale" onClose={onClose}>
      <div className="space-y-4">

        {/* Mic button */}
        {hasSpeechRecognition && (
          <div className="flex flex-col items-center gap-3 py-2">
            <button
              type="button"
              onPointerDown={startRecording}
              onPointerUp={stopRecording}
              onPointerCancel={stopRecording}
              disabled={parse.isPending}
              className={
                "relative flex h-20 w-20 items-center justify-center rounded-full transition-all active:scale-95 disabled:opacity-60 " +
                (recording
                  ? "bg-destructive text-white shadow-[0_0_0_12px_hsl(var(--destructive)/0.15)]"
                  : "bg-gradient-primary text-primary-foreground shadow-glow")
              }
              aria-label={recording ? "Relâcher pour analyser" : "Maintenir pour parler"}
            >
              {recording ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
              {recording && (
                <span className="absolute inset-0 animate-ping rounded-full bg-destructive/30" />
              )}
            </button>
            <p className="text-center text-xs text-muted-foreground">
              {recording
                ? "Parle… relâche quand tu as fini"
                : "Maintiens le bouton et parle"}
            </p>
          </div>
        )}

        {/* Live transcript */}
        {transcript && (
          <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Transcription
            </p>
            <p className="mt-1 text-sm">{transcript}</p>
          </div>
        )}

        {/* Parsing spinner */}
        {parse.isPending && (
          <div className="flex flex-col items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Analyse en cours…
          </div>
        )}

        {/* Error */}
        {parse.isError && !parse.isPending && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-center text-sm text-destructive">
            {(parse.error as Error).message}
          </div>
        )}

        {/* Divider */}
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">ou tape</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Text fallback */}
        <div className="flex gap-2">
          <textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder="Ex : 100 g de saumon, 100 g de noix de cajou"
            rows={2}
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-foreground/30"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={handleManualParse}
            disabled={!manualText.trim() || parse.isPending}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-foreground text-background disabled:opacity-40"
            aria-label="Analyser"
          >
            <Sparkles className="h-4 w-4" />
          </button>
        </div>

        {/* Results */}
        {parseResult && !parse.isPending && items.length > 0 && (
          <>
            {parseResult.details && (
              <p className="text-[11px] italic text-muted-foreground">{parseResult.details}</p>
            )}

            <ul className="space-y-2">
              {items.map((item, idx) => (
                <li key={idx} className="rounded-xl border border-border bg-card">
                  {editingIdx === idx ? (
                    <div className="space-y-2 p-3">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateItem(idx, { name: e.target.value })}
                        autoComplete="off"
                        className="w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-base outline-none focus:border-primary"
                      />
                      <div className="grid grid-cols-4 gap-1.5">
                        {(["calories", "proteins", "carbs", "fats"] as const).map((field) => (
                          <div key={field}>
                            <label className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                              {field === "calories" ? "kcal" : field === "proteins" ? "prot" : field === "carbs" ? "gluc" : "lip"}
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={item[field]}
                              onChange={(e) => updateItem(idx, { [field]: Number(e.target.value) })}
                              autoComplete="off"
                              className="w-full rounded-lg border border-border bg-surface px-2 py-2 text-base outline-none focus:border-primary"
                            />
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingIdx(null)}
                        className="w-full rounded-lg bg-primary/10 py-3 text-sm font-semibold text-primary active:scale-[0.98]"
                      >
                        Valider
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {Math.round(item.calories)} kcal · P
                          {Math.round(item.proteins * 10) / 10} G
                          {Math.round(item.carbs * 10) / 10} L
                          {Math.round(item.fats * 10) / 10}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingIdx(idx)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground active:bg-muted"
                        aria-label="Modifier"
                      >
                        <span className="text-sm">✎</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground active:bg-destructive/10 active:text-destructive"
                        aria-label="Retirer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {/* Totals */}
            <div className="rounded-xl bg-surface px-3 py-2 text-center text-xs">
              <span className="font-bold text-primary">{Math.round(totals.calories)}</span>{" "}
              kcal · P{Math.round(totals.proteins * 10) / 10} G
              {Math.round(totals.carbs * 10) / 10} L
              {Math.round(totals.fats * 10) / 10}
            </div>

            {/* Meal selector */}
            <select
              value={meal}
              onChange={(e) => setMeal(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              {Object.entries(MEAL_LABELS).map(([slug, label]) => (
                <option key={slug} value={slug}>
                  {label}
                </option>
              ))}
            </select>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={reset}
                className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface text-sm font-semibold text-foreground"
              >
                Recommencer
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={addBatch.isPending}
                className="inline-flex h-12 flex-[2] items-center justify-center gap-1.5 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
              >
                {addBatch.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                <Plus className="h-4 w-4" />
                Ajouter {items.length} aliment{items.length > 1 ? "s" : ""}
              </button>
            </div>
          </>
        )}

        {/* All removed */}
        {parseResult && !parse.isPending && items.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            Tous les aliments ont été retirés.
          </p>
        )}
      </div>
    </Sheet>
  );
}

