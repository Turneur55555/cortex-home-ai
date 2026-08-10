"""
Buste 3D Cortex — générateur de PROTOTYPE (Phase I, RPG V2, 31/08/2026).

Ce script construit un buste primitif (capsules/boîtes, pas un sculpt
artistique) avec les 8 zones musculaires nommées exactement comme attendu
par le code React Three Fiber, chacune porteuse d'un shape key `evolution`
(0 = état minimum, 1 = état maximum), puis exporte le tout en GLB.

But : valider TOUT le pipeline (nommage des objets → export GLB → Draco →
chargement Three.js → pilotage des shape keys par le Rang musculaire) avant
qu'un artiste ne sculpte la version définitive. Ce n'est PAS l'asset final —
voir docs/architecture/rpg-buste-3d-blender-workflow.md pour les conventions
que la version définitive doit respecter (mêmes noms, même règle "un seul
shape key `evolution` par zone").

Usage :
    blender --background --python tools/blender/build_buste_prototype.py

Sortie :
    src/assets/buste/cortex-buste-prototype.glb
"""

import math
import os
import sys

import bpy

# ── Chemin de sortie ─────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
# public/ (pas src/assets/) : un binaire lourd chargé à la demande par une
# URL fixe ne doit jamais dépendre du pipeline de build Vite — voir
# docs/architecture/rpg-buste-3d-blender-workflow.md §5.
OUTPUT_DIR = os.path.join(REPO_ROOT, "public", "buste")
OUTPUT_PATH = os.path.join(OUTPUT_DIR, "cortex-buste-prototype.glb")

# ── Définition des 8 zones évolutives + les 3 zones neutres ─────────
# position/rotation/scale approximatifs pour une silhouette de buste
# debout, posture neutre, bras le long du corps légèrement écartés.
# bulge_axis : direction locale (avant scale) le long de laquelle le
# shape key "evolution" fait gonfler la zone (approxime le volume
# musculaire réel qui grossit surtout en épaisseur/largeur, pas en
# longueur).
ZONES = [
    # nom          type       position (x,y,z)      taille (x,y,z)      bulge
    ("chest",      "cube",    (0.0, 0.12, 1.35),     (0.34, 0.16, 0.22), 1.6),
    ("abs",        "cube",    (0.0, 0.10, 1.02),     (0.24, 0.14, 0.28), 1.25),
    ("shoulders_l", "sphere", (-0.42, 0.0, 1.50),    (0.16, 0.16, 0.16), 1.5),
    ("shoulders_r", "sphere", (0.42, 0.0, 1.50),     (0.16, 0.16, 0.16), 1.5),
    ("biceps_l",   "capsule", (-0.48, 0.0, 1.22),    (0.09, 0.09, 0.16), 1.7),
    ("biceps_r",   "capsule", (0.48, 0.0, 1.22),     (0.09, 0.09, 0.16), 1.7),
    ("triceps_l",  "capsule", (-0.50, -0.04, 1.20),  (0.085, 0.085, 0.16), 1.6),
    ("triceps_r",  "capsule", (0.50, -0.04, 1.20),   (0.085, 0.085, 0.16), 1.6),
    ("forearms_l", "capsule", (-0.52, 0.0, 0.94),    (0.075, 0.075, 0.16), 1.4),
    ("forearms_r", "capsule", (0.52, 0.0, 0.94),     (0.075, 0.075, 0.16), 1.4),
    ("back",       "cube",    (0.0, -0.14, 1.35),    (0.32, 0.12, 0.24), 1.5),
    ("traps",      "cube",    (0.0, -0.06, 1.52),    (0.26, 0.13, 0.10), 1.5),
]
# Note : shoulders_l/r, biceps_l/r, triceps_l/r, forearms_l/r sont fusionnés
# en UN SEUL objet par muscle ("shoulders", "biceps", "triceps", "forearms")
# après création — un buste RPG anime les deux côtés du corps ensemble
# (même Rang musculaire des deux côtés), donc une seule zone logique par
# muscle, symétrique, comme documenté dans le workflow (§2 : 8 zones, pas
# 12).

NEUTRAL_PARTS = [
    ("head", "sphere", (0.0, 0.0, 1.82), (0.14, 0.14, 0.16)),
    ("neck", "cylinder", (0.0, 0.0, 1.68), (0.08, 0.08, 0.08)),
    ("torso_base", "cube", (0.0, 0.0, 1.20), (0.28, 0.15, 0.42)),
]

MUSCLE_MERGE_GROUPS = {
    "shoulders": ["shoulders_l", "shoulders_r"],
    "biceps": ["biceps_l", "biceps_r"],
    "triceps": ["triceps_l", "triceps_r"],
    "forearms": ["forearms_l", "forearms_r"],
}


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)


def make_primitive(kind, location, scale):
    if kind == "cube":
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    elif kind == "sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0, location=location, segments=16, ring_count=10)
    elif kind == "cylinder":
        bpy.ops.mesh.primitive_cylinder_add(radius=1.0, depth=1.0, location=location, vertices=16)
    elif kind == "capsule":
        # Blender n'a pas de primitive "capsule" native pré-4.x fiable en
        # background mode partout : on approxime avec un cylindre à bouts
        # arrondis via un mesh UV sphere étiré (suffisant pour un prototype).
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0, location=location, segments=12, ring_count=8)
    else:
        raise ValueError(f"kind inconnu: {kind}")
    obj = bpy.context.active_object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.location = location
    return obj


def add_evolution_shape_key(obj, bulge_factor):
    """Ajoute Basis + `evolution` : le shape key fait gonfler le mesh
    uniformément depuis le centre local de l'objet (volume perceptible),
    conforme au §3 du workflow (un seul shape key continu par zone)."""
    if obj.data.shape_keys is None:
        obj.shape_key_add(name="Basis", from_mix=False)
    key = obj.shape_key_add(name="evolution", from_mix=False)

    mesh = obj.data
    for i, vert in enumerate(mesh.vertices):
        local = vert.co.copy()
        key.data[i].co = local * bulge_factor

    key.value = 0.0
    obj.data.shape_keys.use_relative = True


def build_zone(name, kind, location, scale, bulge_factor):
    obj = make_primitive(kind, location, scale)
    obj.name = name
    add_evolution_shape_key(obj, bulge_factor)
    return obj


def merge_objects(name, parts):
    bpy.ops.object.select_all(action="DESELECT")
    objs = [bpy.data.objects[p] for p in parts]
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    merged = bpy.context.active_object
    merged.name = name
    return merged


def main():
    clear_scene()

    created = {}
    for name, kind, loc, scale, bulge in ZONES:
        created[name] = build_zone(name, kind, loc, scale, bulge)

    # Fusionne les paires gauche/droite en une seule zone logique par
    # muscle — le Rang musculaire est unique par muscle, pas par côté.
    for merged_name, parts in MUSCLE_MERGE_GROUPS.items():
        merge_objects(merged_name, parts)

    # `chest`, `abs`, `back`, `traps` sont déjà nommés correctement
    # (une seule zone dès la création, pas de fusion nécessaire).

    for name, kind, loc, scale in NEUTRAL_PARTS:
        obj = make_primitive(kind, loc, scale)
        obj.name = name
        # Pas de shape key `evolution` — zones neutres (voir §2).

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT_PATH,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_morph=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_materials="NONE",
    )
    print(f"[build_buste_prototype] Exporté : {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
