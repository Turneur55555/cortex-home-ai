import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ChevronRight,
  Flame,
  LogOut,
  Mail,
  Pencil,
  Target,
  TrendingUp,
  Utensils,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/useProfile";
import { useGoals } from "@/hooks/useGoals";
import { useStreak } from "@/hooks/useStreak";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EditPseudoSheet } from "@/components/profile/EditPseudoSheet";
import { GoalsSheet } from "@/components/profile/GoalsSheet";
import { ProgressSheet } from "@/components/profile/ProgressSheet";
import { StreakSheet } from "@/components/profile/StreakSheet";

export const Route = createFileRoute("/_authenticated/profil")({
  head: () => ({
    meta: [
      { title: "Profil — ICORTEX" },
      { name: "description", content: "Votre compte ICORTEX." },
    ],
  }),
  component: ProfilPage,
});

const easeOut = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: 0.05 * i, ease: easeOut },
  }),
};

function ProfilPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const fallbackPseudo = useMemo(
    () => user?.email?.split("@")[0] ?? "Utilisateur",
    [user?.email],
  );
  const { pseudo, updatePseudo } = useProfile(fallbackPseudo);
  const { stats: goalStats } = useGoals();
  const { current: streakDays } = useStreak();

  const [editOpen, setEditOpen] = useState(false);
  const [streakOpen, setStreakOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    toast.success("Déconnecté");
    navigate({ to: "/login" });
  };

  const initial = pseudo[0]?.toUpperCase() ?? "?";

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden px-5 pb-32 pt-[max(3rem,env(safe-area-inset-top))]">
      <AmbientBackdrop />

      <motion.header
        variants={fadeUp}
        custom={0}
        initial="hidden"
        animate="show"
        className="relative mb-8 flex flex-col items-center text-center"
      >
        <div className="relative mb-5">
          <motion.div
            aria-hidden
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, ease: easeOut }}
            className="absolute inset-0 -z-10 rounded-full blur-2xl"
            style={{
              background:
                "radial-gradient(circle, rgba(108,99,255,0.55), rgba(77,175,255,0.25) 60%, transparent 75%)",
            }}
          />
          <motion.div
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 320, damping: 18 }}
            className="relative flex h-24 w-24 items-center justify-center rounded-[28px] border border-white/15 bg-white/5 shadow-elevated backdrop-blur-xl"
          >
            <div
              className="absolute inset-[1px] rounded-[26px]"
              style={{
                background:
                  "linear-gradient(135deg, rgba(139,92,246,0.35), rgba(77,175,255,0.25))",
              }}
            />
            <span className="relative text-4xl font-bold tracking-tight text-white drop-shadow-[0_2px_8px_rgba(108,99,255,0.6)]">
              {initial}
            </span>
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-[3px] border-background bg-success shadow-[0_0_12px_rgba(34,197,94,0.7)]" />
          </motion.div>
        </div>

        {/* Editable pseudo */}
        <motion.button
          variants={fadeUp}
          custom={1}
          type="button"
          onClick={() => setEditOpen(true)}
          whileTap={{ scale: 0.97 }}
          className="group inline-flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors hover:bg-white/[0.04]"
        >
          <h1 className="text-2xl font-bold tracking-tight">{pseudo}</h1>
          <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </motion.button>

        <motion.p
          variants={fadeUp}
          custom={2}
          className="mt-1 max-w-[260px] text-[13px] leading-snug text-muted-foreground"
        >
          Bienvenue dans votre espace, prenez le contrôle de vos habitudes.
        </motion.p>

      </motion.header>

      {/* Stats — interactive */}
      <motion.section
        variants={fadeUp}
        custom={4}
        initial="hidden"
        animate="show"
        className="mb-7 grid grid-cols-3 gap-2.5"
      >
        <StatCard
          icon={Flame}
          label="Streak"
          value={`${streakDays}j`}
          tint="from-orange-500/30 to-pink-500/10"
          onClick={() => setStreakOpen(true)}
        />
        <StatCard
          icon={Target}
          label="Objectifs"
          value={`${goalStats.done}/${goalStats.total}`}
          tint="from-violet-500/30 to-indigo-500/10"
          onClick={() => setGoalsOpen(true)}
        />
        <StatCard
          icon={TrendingUp}
          label="Progrès"
          value="+12%"
          tint="from-cyan-400/30 to-blue-500/10"
          onClick={() => setProgressOpen(true)}
        />
      </motion.section>

      <motion.section variants={fadeUp} custom={5} initial="hidden" animate="show" className="mb-5">
        <SectionTitle>Compte</SectionTitle>
        <GlassCard>
          <Row icon={<Mail className="h-4 w-4" />} label={user?.email ?? "—"} mono />
        </GlassCard>
      </motion.section>

      <motion.section variants={fadeUp} custom={6} initial="hidden" animate="show" className="mb-8">
        <SectionTitle>Préférences</SectionTitle>
        <GlassCard interactive>
          <NavRow
            to="/preferences-alimentaires"
            icon={<Utensils className="h-4 w-4" />}
            title="Préférences alimentaires"
            subtitle="Allergies, aliments à éviter, objectifs"
          />
        </GlassCard>
      </motion.section>

      <motion.div variants={fadeUp} custom={7} initial="hidden" animate="show" className="mt-auto">
        <motion.button
          type="button"
          data-testid="signout-btn"
          onClick={handleSignOut}
          whileTap={{ scale: 0.97 }}
          whileHover={{ y: -1 }}
          transition={{ type: "spring", stiffness: 320, damping: 18 }}
          className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3.5 text-sm font-semibold text-destructive backdrop-blur-xl transition-colors hover:bg-destructive/15"
        >
          <LogOut className="h-4 w-4" />
          Se déconnecter
        </motion.button>
      </motion.div>

      {/* Modals */}
      <EditPseudoSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        current={pseudo}
        onSave={async (v) => {
          await updatePseudo(v);
          toast.success("Pseudo mis à jour");
        }}
      />
      <StreakSheet open={streakOpen} onOpenChange={setStreakOpen} />
      <GoalsSheet open={goalsOpen} onOpenChange={setGoalsOpen} />
      <ProgressSheet open={progressOpen} onOpenChange={setProgressOpen} />
    </main>
  );
}

/* ─────────────── building blocks ─────────────── */

function AmbientBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.4 }}
        className="absolute -top-32 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full blur-[120px]"
        style={{
          background:
            "radial-gradient(circle, rgba(108,99,255,0.35), rgba(77,175,255,0.15) 50%, transparent 70%)",
        }}
      />
      <motion.div
        animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        className="absolute right-[-80px] top-40 h-[280px] w-[280px] rounded-full blur-[100px]"
        style={{ background: "radial-gradient(circle, rgba(139,92,246,0.25), transparent 70%)" }}
      />
      <motion.div
        animate={{ x: [0, -20, 0], y: [0, 25, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -left-20 top-72 h-[260px] w-[260px] rounded-full blur-[100px]"
        style={{ background: "radial-gradient(circle, rgba(77,175,255,0.22), transparent 70%)" }}
      />
      {Array.from({ length: 8 }).map((_, i) => (
        <motion.span
          key={i}
          className="absolute h-1 w-1 rounded-full bg-white/40"
          style={{
            top: `${15 + ((i * 53) % 70)}%`,
            left: `${(i * 37) % 95}%`,
          }}
          animate={{ opacity: [0.1, 0.6, 0.1], y: [0, -10, 0] }}
          transition={{ duration: 4 + (i % 3), repeat: Infinity, delay: i * 0.4 }}
        />
      ))}
    </div>
  );
}


function StatCard({
  icon: Icon,
  label,
  value,
  tint,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tint: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 320, damping: 18 }}
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left backdrop-blur-xl shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      <div className={cn("absolute inset-0 -z-10 bg-gradient-to-br opacity-70", tint)} />
      <Icon className="h-4 w-4 text-white/80" />
      <div className="mt-2 text-lg font-bold leading-none tracking-tight">{value}</div>
      <div className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </motion.button>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </h2>
  );
}

function GlassCard({
  children,
  interactive = false,
}: {
  children: ReactNode;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-card overflow-hidden",
        interactive && "transition-all",
      )}
    >
      {children}
    </div>
  );
}

function Row({
  icon,
  label,
  mono = false,
}: {
  icon: ReactNode;
  label: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-muted-foreground">
        {icon}
      </span>
      <span className={cn("truncate text-sm", mono && "font-medium")}>{label}</span>
    </div>
  );
}

function NavRow({
  to,
  icon,
  title,
  subtitle,
}: {
  to: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <motion.div whileTap={{ scale: 0.98 }} transition={{ type: "spring", stiffness: 400, damping: 22 }}>
      <Link
        to={to}
        className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.04]"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-accent/20 text-primary-foreground shadow-[0_0_18px_rgba(108,99,255,0.35)]">
          {icon}
        </span>
        <span className="flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block text-xs text-muted-foreground">{subtitle}</span>
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Link>
    </motion.div>
  );
}
