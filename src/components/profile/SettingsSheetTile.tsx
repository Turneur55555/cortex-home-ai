import { useState, type ReactNode } from "react";
import { AppSheet } from "./AppSheet";
import { SpaceButton } from "./SpaceTile";

interface Props {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}

/** Tuile de « Mes paramètres » : au clic, le panneau s'ouvre dans une feuille. */
export function SettingsSheetTile({ icon, label, children }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SpaceButton icon={icon} label={label} onClick={() => setOpen(true)} />
      <AppSheet open={open} onOpenChange={setOpen} title={label}>
        {children}
      </AppSheet>
    </>
  );
}
