# Tests E2E (Playwright)

Tests de bout en bout couvrant les parcours critiques d'ICORTEX.

## Lancer

```bash
# 1. Installer les navigateurs (une fois)
npx playwright install chromium

# 2. Lancer les tests (le serveur dev démarre automatiquement)
npx playwright test

# Mode UI interactif
npx playwright test --ui

# Un seul fichier
npx playwright test e2e/01-auth.spec.ts
```

## Variables d'environnement

- `E2E_EMAIL` / `E2E_PASSWORD` : utiliser un compte existant au lieu d'en créer un.
- `E2E_BASE_URL` : tester contre une URL déployée plutôt que `localhost:8080`.

## Couverture

1. `01-auth.spec.ts` — Inscription + connexion
2. `02-navigation.spec.ts` — Navigation entre les modules
3. `03-stocks-crud.spec.ts` — Création + suppression d'un item
4. `04-signout.spec.ts` — Déconnexion

Les tests ciblent les éléments via `data-testid` pour être robustes aux changements
visuels.
