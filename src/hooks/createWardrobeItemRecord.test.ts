import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `createWardrobeItemRecord` — cœur du pipeline de création d'une pièce
 * (upload original → upload détouré additif → insert `wardrobe_items`),
 * extrait de `useCreateWardrobeItem` (Phase 5.1) pour être réutilisé TEL
 * QUEL par l'import massif (`useWardrobeBulkImport`).
 *
 * Non-régression : ce test verrouille le comportement Storage/DB exact
 * qu'utilisait déjà le flux d'ajout individuel avant l'extraction — même
 * chemin `{user}/{itemId}/original.{ext}`, même upload détouré additif
 * jamais bloquant, même nettoyage Storage si l'insert échoue.
 */

const uploadMock = vi.fn();
const removeMock = vi.fn();
const insertMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => uploadMock(...args),
        remove: (...args: unknown[]) => removeMock(...args),
      }),
    },
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
    },
  },
}));

vi.mock("@/integrations/supabase/db", () => ({
  db: {
    from: () => ({
      insert: (...args: unknown[]) => insertMock(...args),
    }),
  },
}));

// Import après le mock (obligatoire avec vi.mock hoisté).
import { createWardrobeItemRecord } from "./useWardrobe";

function makeFile(name = "photo.jpg", type = "image/jpeg"): File {
  return new File([new Uint8Array(1024)], name, { type });
}

beforeEach(() => {
  uploadMock.mockReset().mockResolvedValue({ error: null });
  removeMock.mockReset().mockResolvedValue({ error: null });
  insertMock.mockReset().mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("createWardrobeItemRecord", () => {
  it("uploade l'original dans {user}/{itemId}/original.{ext} puis insère wardrobe_items", async () => {
    const itemId = await createWardrobeItemRecord("user-1", {
      file: makeFile(),
      category: "tops",
      name: "T-shirt noir",
    });

    expect(itemId).toEqual(expect.any(String));
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [path, , options] = uploadMock.mock.calls[0];
    expect(path).toBe(`user-1/${itemId}/original.jpg`);
    expect(options).toMatchObject({ contentType: "image/jpeg", upsert: false });

    expect(insertMock).toHaveBeenCalledTimes(1);
    const insertPayload = insertMock.mock.calls[0][0];
    expect(insertPayload).toMatchObject({
      id: itemId,
      user_id: "user-1",
      storage_path: `user-1/${itemId}/original.jpg`,
      processed_storage_path: null,
      category: "top",
      name: "T-shirt noir",
    });
  });

  it("uploade la version détourée en additif quand fournie (original conservé)", async () => {
    const processedFile = new Blob(["cutout"], { type: "image/webp" });
    const itemId = await createWardrobeItemRecord("user-1", {
      file: makeFile(),
      category: "tops",
      processedFile,
    });

    expect(uploadMock).toHaveBeenCalledTimes(2);
    const [processedPath, , processedOptions] = uploadMock.mock.calls[1];
    expect(processedPath).toBe(`user-1/${itemId}/processed.webp`);
    expect(processedOptions).toMatchObject({ contentType: "image/webp", upsert: false });

    const insertPayload = insertMock.mock.calls[0][0];
    expect(insertPayload.processed_storage_path).toBe(`user-1/${itemId}/processed.webp`);
    // L'original reste la seule référence si le détourage échoue ailleurs.
    expect(insertPayload.storage_path).toBe(`user-1/${itemId}/original.jpg`);
  });

  it("l'échec de l'upload détouré n'empêche jamais la création de la pièce (original seul)", async () => {
    uploadMock
      .mockResolvedValueOnce({ error: null }) // original
      .mockResolvedValueOnce({ error: new Error("upload détouré échoué") }); // détouré

    const itemId = await createWardrobeItemRecord("user-1", {
      file: makeFile(),
      category: "tops",
      processedFile: new Blob(["cutout"], { type: "image/webp" }),
    });

    expect(itemId).toEqual(expect.any(String));
    const insertPayload = insertMock.mock.calls[0][0];
    expect(insertPayload.processed_storage_path).toBeNull();
  });

  it("nettoie les fichiers Storage uploadés si l'insert DB échoue", async () => {
    insertMock.mockResolvedValueOnce({ error: new Error("contrainte violée") });

    await expect(
      createWardrobeItemRecord("user-1", {
        file: makeFile(),
        category: "tops",
        processedFile: new Blob(["cutout"], { type: "image/webp" }),
      }),
    ).rejects.toThrow("contrainte violée");

    expect(removeMock).toHaveBeenCalledTimes(1);
    const pathsRemoved = removeMock.mock.calls[0][0];
    expect(pathsRemoved).toHaveLength(2);
  });

  it("rejette un fichier invalide avant tout upload (aucun appel Storage)", async () => {
    await expect(
      createWardrobeItemRecord("user-1", {
        file: makeFile("doc.pdf", "application/pdf"),
        category: "tops",
      }),
    ).rejects.toThrow(/Format non supporté/);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("la taille n'est jamais inventée : seule la valeur explicitement fournie est enregistrée", async () => {
    await createWardrobeItemRecord("user-1", {
      file: makeFile(),
      category: "tops",
    });
    expect(insertMock.mock.calls[0][0].size).toBeNull();

    await createWardrobeItemRecord("user-1", {
      file: makeFile(),
      category: "tops",
      size: "M",
    });
    expect(insertMock.mock.calls[1][0].size).toBe("M");
  });
});
