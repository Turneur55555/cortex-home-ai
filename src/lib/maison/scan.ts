import { supabase } from "@/integrations/supabase/client";
import { resolveScanModule, type ScanModule } from "./rooms";

export type DetectedItem = {
  name: string;
  category?: string;
  quantity?: number;
  unit?: string;
  location?: string;
  expiration_date?: string;
  expiration_source?: "label" | "estimated";
  expiration_raw?: string;
  confidence?: number;
};

export type ScanFridgeRequest = {
  image_base64: string;
  mime_type: string;
  room: string;
  module: ScanModule;
};

/** Construit le payload envoyé à l'edge function scan-fridge. */
export function buildScanFridgeRequest(params: {
  room: string;
  b64: string;
  mime: string;
}): ScanFridgeRequest {
  return {
    image_base64: params.b64,
    mime_type: params.mime,
    room: params.room,
    module: resolveScanModule(params.room),
  };
}

/**
 * Flux complet : construit la requête, invoque l'edge function, parse la réponse.
 * Lance une Error en cas d'échec réseau ou de `data.error` retourné par la fonction.
 */
export async function invokeScanFridge(params: {
  room: string;
  b64: string;
  mime: string;
}): Promise<DetectedItem[]> {
  const body = buildScanFridgeRequest(params);
  const { data, error } = await supabase.functions.invoke("scan-fridge", { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return (data?.extracted_items ?? []) as DetectedItem[];
}
