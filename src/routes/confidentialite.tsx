import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/confidentialite")({
  head: () => ({
    meta: [
      { title: "Confidentialité & Sécurité — ICORTEX" },
      {
        name: "description",
        content:
          "Comment ICORTEX protège vos données : authentification, chiffrement en transit, contrôles d'accès, conservation et contact.",
      },
      { property: "og:title", content: "Confidentialité & Sécurité — ICORTEX" },
      {
        property: "og:description",
        content:
          "Pratiques de sécurité et de confidentialité appliquées à votre compte ICORTEX.",
      },
    ],
  }),
  component: TrustPage,
});

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function TrustPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">
          Confidentialité & Sécurité
        </h1>
        <p className="text-sm text-muted-foreground">
          Cette page est maintenue par l'équipe ICORTEX pour répondre aux
          questions fréquentes sur la sécurité et la confidentialité de
          l'application. Elle décrit les pratiques en vigueur ; elle ne
          constitue pas une certification indépendante.
        </p>
      </header>

      <Section title="Authentification">
        L'accès à votre espace nécessite un compte (email + mot de passe ou
        Google). Les sessions sont gérées par notre fournisseur d'authentification
        et révocables à tout moment depuis votre profil.
      </Section>

      <Section title="Hébergement & chiffrement en transit">
        L'application est hébergée sur l'infrastructure Lovable Cloud. Tous les
        échanges entre votre appareil et nos serveurs utilisent HTTPS/TLS.
      </Section>

      <Section title="Contrôles d'accès & isolation des données">
        Vos données nutritionnelles, séances, rappels, photos et documents sont
        rattachés à votre identifiant utilisateur et protégés par des règles
        d'accès au niveau de la base de données : seul votre compte peut lire
        et modifier vos enregistrements.
      </Section>

      <Section title="Données collectées">
        Nous traitons uniquement les données nécessaires au fonctionnement :
        profil (pseudo, objectifs), nutrition, séances, mensurations, rappels
        et fichiers que vous choisissez d'importer. Aucune revente à des tiers.
      </Section>

      <Section title="Sous-traitants & intégrations">
        Lovable Cloud (hébergement & base de données), fournisseurs d'IA pour
        l'analyse d'image/texte que vous déclenchez, et USDA FoodData Central
        pour les informations nutritionnelles publiques. Aucune donnée
        identifiante n'est envoyée à USDA.
      </Section>

      <Section title="Conservation & suppression">
        Vos données sont conservées tant que votre compte est actif. Vous
        pouvez demander la suppression de votre compte et de vos données en
        nous contactant.
      </Section>

      <Section title="Contact sécurité">
        Pour toute question de sécurité ou de confidentialité, contactez-nous
        depuis l'application (onglet Profil) ou par email à l'adresse
        fournie lors de votre inscription.
      </Section>

      <footer className="pt-4 text-xs text-muted-foreground">
        <Link to="/" className="underline">
          ← Retour à l'accueil
        </Link>
      </footer>
    </main>
  );
}
