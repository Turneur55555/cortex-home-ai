interface Props {
  title: string;
  children: React.ReactNode;
}

/**
 * Sous-en-tête discret pour regrouper Personnalisation / Compte & sécurité /
 * Données sous une seule section "Paramètres" (au lieu de deux sections mal
 * nommées auparavant — voir audit du 06/07/2026).
 */
export function SettingsGroup({ title, children }: Props) {
  return (
    <div className="mb-5">
      <p className="mb-1.5 px-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50">
        {title}
      </p>
      {children}
    </div>
  );
}
