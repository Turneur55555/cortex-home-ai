# Supabase Auth — actions manuelles restantes

Ce document liste les réglages d'authentification qui **ne peuvent pas être appliqués depuis le
dépôt** : ils vivent dans la configuration du projet Supabase, pas dans une migration SQL ni dans
le code. Aucun changement de code ne les remplace.

Projet concerné : `bcwfvpwxzlmkxobvbtzp`.

---

## AUD-10 — Protection contre les mots de passe compromis (À FAIRE)

### État constaté le 2026-09-07

Vérifié en direct via l'advisor de sécurité Supabase (`get_advisors`, type `security`) :

```
auth_leaked_password_protection — WARN — EXTERNAL
« Leaked password protection is currently disabled. »
```

La protection est donc **toujours désactivée**. Sans elle, un utilisateur peut choisir (ou
conserver) un mot de passe figurant dans les fuites publiques connues — c'est exactement ce que
visent les attaques par bourrage d'identifiants (_credential stuffing_).

### Pourquoi ce n'est pas fait automatiquement ici

Ce réglage appartient à la configuration Auth du projet. Les outils disponibles dans
l'environnement de développement (MCP Supabase) couvrent la base, les migrations et les edge
functions — **aucun ne permet d'écrire la configuration Auth**. L'activer demanderait un jeton
d'accès Management API, qui n'est pas présent dans ce dépôt et n'a pas à y être.

L'action ci-dessous est donc **manuelle, et à faire par Nathan**.

### Comment l'activer

1. Ouvrir le tableau de bord Supabase du projet `bcwfvpwxzlmkxobvbtzp`.
2. **Authentication → Sign In / Providers → Email**
   (lien direct : `https://supabase.com/dashboard/project/bcwfvpwxzlmkxobvbtzp/auth/providers?provider=Email`).
3. Dans les réglages de mot de passe, activer **« Prevent use of leaked passwords »**.
   Supabase Auth interroge alors l'API _Pwned Passwords_ de HaveIBeenPwned.org et refuse un mot de
   passe connu comme fuité.

**Prérequis** : la documentation Supabase indique que la protection contre les mots de passe
fuités est disponible **à partir du plan Pro**. Si le projet est sur le plan gratuit, l'option
n'apparaîtra pas — c'est alors une décision produit (passer au plan Pro), pas un oubli technique.

Référence : <https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection>

### Effet sur les comptes existants

Aucun compte n'est déconnecté ni invalidé. Un utilisateur dont le mot de passe actuel est faible
peut toujours se connecter ; le contrôle s'applique aux **créations de compte et aux changements de
mot de passe**. Il n'y a donc aucun risque de blocage à l'activation.

### Comment vérifier que c'est fait

Relancer l'advisor de sécurité : la ligne `auth_leaked_password_protection` doit avoir disparu de
la liste.

---

## Autres avertissements de l'advisor — décision explicite

Relevés le même jour, **volontairement non traités** dans le chantier final : ils touchent aux
politiques de sécurité de la base, périmètre explicitement gelé.

| Avertissement                                                   | Décision                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `rls_enabled_no_policy` sur `public.recipe_import_cache` (INFO) | RLS activée sans policy = table inaccessible aux clients, ce qui est un état **fermé**, pas une fuite. À trancher côté produit (cache serveur ?) dans un chantier dédié.                                                                                                                                                                                           |
| `authenticated_security_definer_function_executable` × 8 (WARN) | Fonctions `SECURITY DEFINER` appelables par un utilisateur connecté (`compute_fitness_stats`, `award_reward_event`, `apply_calorie_goal_adjustment`…). Plusieurs sont appelées par l'application et une révocation à l'aveugle casserait des écrans en production. Nécessite un audit fonction par fonction — chantier de sécurité dédié, jamais un effet de bord. |
| `is_paie_staff`                                                 | ⚠️ Appartient au projet **Contrôle de Paie**, séparé, qui partage cette base. Ne jamais y toucher depuis une session cortex-home-ai.                                                                                                                                                                                                                               |
