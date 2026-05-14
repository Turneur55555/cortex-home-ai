import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PremiumSheet } from "./PremiumSheet";

interface EditPseudoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: string;
  onSave: (next: string) => void;
}

export function EditPseudoSheet({ open, onOpenChange, current, onSave }: EditPseudoSheetProps) {
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(current);
      setError(null);
      setSuccess(false);
      setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [open, current]);

  const validate = (v: string): string | null => {
    const t = v.trim();
    if (t.length < 3) return "Minimum 3 caractères.";
    if (t.length > 20) return "Maximum 20 caractères.";
    return null;
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const err = validate(value);
    if (err) {
      setError(err);
      return;
    }
    onSave(value.trim());
    setSuccess(true);
    setTimeout(() => onOpenChange(false), 700);
  };

  return (
    <PremiumSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Modifier le pseudo"
      description="Choisissez un nom entre 3 et 20 caractères."
      size="compact"
    >
      <form onSubmit={handleSubmit} className="pb-4 pt-2">
        <div className="relative">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            maxLength={20}
            placeholder="Votre pseudo"
            className="h-14 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-base font-medium tracking-tight text-foreground placeholder:text-muted-foreground/60 backdrop-blur-xl outline-none transition-all focus:border-primary/50 focus:bg-white/[0.06] focus:shadow-[0_0_0_4px_rgba(108,99,255,0.15)]"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground">
            {value.length}/20
          </span>
        </div>

        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2 px-1 text-xs text-destructive"
          >
            {error}
          </motion.p>
        )}

        <motion.button
          type="submit"
          whileTap={{ scale: 0.97 }}
          disabled={success}
          className="mt-5 flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-accent px-4 py-3.5 text-sm font-semibold text-white shadow-glow transition-opacity disabled:opacity-90"
        >
          {success ? (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 18 }}
              className="flex items-center gap-2"
            >
              <Check className="h-4 w-4" />
              Enregistré
            </motion.span>
          ) : (
            "Enregistrer"
          )}
        </motion.button>
      </form>
    </PremiumSheet>
  );
}
