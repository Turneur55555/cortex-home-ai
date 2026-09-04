import { describe, expect, it } from "vitest";
import { isAdminEmail } from "./adminAccess";

// CHANTIER 5 (MIN-09) — garde admin client partagé par les `beforeLoad` de
// `/admin/exercises` et `/rls-status`. Le vrai garde-fou reste côté serveur
// (voir supabase/functions/_shared/adminAuth.ts) : ce test couvre seulement
// la logique de décision utilisée par le routing.
describe("isAdminEmail", () => {
  it("reconnaît l'email admin exact", () => {
    expect(isAdminEmail("Turneur555@gmail.com")).toBe(true);
  });

  it("est insensible à la casse", () => {
    expect(isAdminEmail("turneur555@gmail.com")).toBe(true);
    expect(isAdminEmail("TURNEUR555@GMAIL.COM")).toBe(true);
  });

  it("refuse un compte authentifié standard", () => {
    expect(isAdminEmail("alice@example.com")).toBe(false);
  });

  it("refuse l'absence d'email (non authentifié)", () => {
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail("")).toBe(false);
  });
});
