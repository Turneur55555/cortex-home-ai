import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { transferData, MODULE_QUERY_KEYS } from "../services/transferService";
import { TRANSFER_LABELS } from "../types";
import type { TransferTarget, TransferStatus } from "../types";

export function useTransfer() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<TransferStatus>({ phase: "idle" });

  const transfer = useCallback(
    async (target: TransferTarget, items: Array<Record<string, unknown>>) => {
      setStatus({ phase: "pending" });
      console.log("[TRANSFER HOOK] Starting", { target, itemCount: items.length });

      try {
        const count = await transferData(target, items);
        setStatus({ phase: "success", count, target });
        console.log("[TRANSFER HOOK] Success", { count });

        if (count === 0) {
          toast.info("Aucune donnée exploitable à ajouter");
        } else {
          toast.success(`${count} entrée${count > 1 ? "s" : ""} ajoutée${count > 1 ? "s" : ""} dans ${TRANSFER_LABELS[target]}`);
        }

        for (const key of MODULE_QUERY_KEYS[target] ?? []) {
          void qc.invalidateQueries({ queryKey: key });
        }
        void qc.invalidateQueries({ queryKey: ["dashboard_stats"] });

        return count;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erreur lors du déversement";
        console.error("[TRANSFER HOOK] Error", err);
        setStatus({ phase: "error", message });
        toast.error(message);
        throw err;
      }
    },
    [qc],
  );

  const reset = useCallback(() => setStatus({ phase: "idle" }), []);

  return {
    status,
    transfer,
    reset,
    isPending: status.phase === "pending",
  };
}
