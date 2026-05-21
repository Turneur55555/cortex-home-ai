import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useItemsRealtime } from "@/hooks/use-pantry";
import { RoomsView } from "@/components/stocks/RoomsView";
import { CompartmentsView } from "@/components/stocks/CompartmentsView";
import { ItemsView } from "@/components/stocks/ItemsView";

export const Route = createFileRoute("/_authenticated/stocks")({
  head: () => ({
    meta: [
      { title: "Maison — ICORTEX" },
      { name: "description", content: "Gestion intelligente de votre maison par pièces et compartiments." },
    ],
  }),
  component: MaisonPage,
});

// ─── Navigation state ─────────────────────────────────────────────────────────

type View =
  | { level: "rooms" }
  | { level: "compartments"; roomId: string }
  | { level: "items"; roomId: string; compartmentId: string };

// ─── Page ─────────────────────────────────────────────────────────────────────

function MaisonPage() {
  const [view, setView] = useState<View>({ level: "rooms" });
  const [globalSearch, setGlobalSearch] = useState("");
  useItemsRealtime();

  const goToRoom = (roomId: string) => setView({ level: "compartments", roomId });
  const goToCompartment = (roomId: string, compartmentId: string) =>
    setView({ level: "items", roomId, compartmentId });
  const goBack = () => {
    if (view.level === "items") setView({ level: "compartments", roomId: view.roomId });
    else if (view.level === "compartments") setView({ level: "rooms" });
  };

  return (
    <main className="flex flex-1 flex-col px-4 pb-6 pt-12">
      {view.level === "rooms" && (
        <RoomsView
          globalSearch={globalSearch}
          onSearchChange={setGlobalSearch}
          onRoomClick={goToRoom}
        />
      )}
      {view.level === "compartments" && (
        <CompartmentsView
          roomId={view.roomId}
          onBack={goBack}
          onCompartmentClick={(compId) => goToCompartment(view.roomId, compId)}
        />
      )}
      {view.level === "items" && (
        <ItemsView
          roomId={view.roomId}
          compartmentId={view.compartmentId}
          onBack={goBack}
        />
      )}
    </main>
  );
}
