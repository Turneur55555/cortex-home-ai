import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AppSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Compact (auto height) vs full (90vh). */
  size?: "compact" | "full";
}

/**
 * iOS-style premium bottom sheet with glass blur, drag handle and spring animation.
 */
export function AppSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = "full",
}: AppSheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 32, stiffness: 320 }}
                className={cn(
                  "fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[430px] overflow-hidden rounded-t-[32px] border-t border-white/10 bg-background/95 shadow-elevated backdrop-blur-2xl",
                  size === "full" ? "max-h-[92vh]" : "max-h-[80vh]",
                )}
                style={{
                  paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
                }}
              >
                {/* ambient top glow */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-70"
                  style={{
                    background:
                      "radial-gradient(circle at 50% 0%, rgba(108,99,255,0.35), transparent 70%)",
                  }}
                />

                {/* drag handle */}
                <div className="relative flex justify-center pb-2 pt-3">
                  <span className="h-1.5 w-10 rounded-full bg-white/20" />
                </div>

                <div className="relative flex items-start justify-between px-6 pb-3">
                  <div className="min-w-0 flex-1 pr-4">
                    <Dialog.Title className="text-lg font-bold tracking-tight">
                      {title}
                    </Dialog.Title>
                    {description && (
                      <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                        {description}
                      </Dialog.Description>
                    )}
                  </div>
                  <Dialog.Close
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                    aria-label="Fermer"
                  >
                    <X className="h-4 w-4" />
                  </Dialog.Close>
                </div>

                <div
                  className={cn(
                    "relative overflow-y-auto px-6 pb-2",
                    size === "full" ? "max-h-[calc(92vh-7rem)]" : "",
                  )}
                  style={{ WebkitOverflowScrolling: "touch" }}
                >
                  {children}
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
