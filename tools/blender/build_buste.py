"""
Buste 3D Cortex — modèle RÉEL v2 (Phase I-C, RPG V2, 31/08/2026).

Succède au blockout v1 (Phase I-B, anneaux elliptiques simples). Ajoute une
modulation angulaire ("bumps" gaussiens localisés en theta) sur chaque
anneau du loft pour sculpter une vraie silhouette anatomique — deux masses
pectorales séparées par une gouttière sternale, largeur/relief du dos,
avant-bras/biceps/triceps bombés plutôt que des demi-tubes lisses — sans
changer la technique de base (loft + découpe par sélection sur un socle
partagé, shape key `evolution` unique par zone).

Exécuté RÉELLEMENT via :
    blender --background --python tools/blender/build_buste.py

Sortie :
    public/buste/cortex-buste.glb
"""

import math
import os

import bmesh
import bpy
from mathutils import Vector

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
OUTPUT_DIR = os.path.join(REPO_ROOT, "public", "buste")
OUTPUT_PATH = os.path.join(OUTPUT_DIR, "cortex-buste.glb")

RING_SEGMENTS = 28


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block_collection in (bpy.data.meshes, bpy.data.materials, bpy.data.objects):
        for block in list(block_collection):
            if block.users == 0:
                block_collection.remove(block)


def angular_diff(a, b):
    d = abs(a - b) % (2 * math.pi)
    return min(d, 2 * math.pi - d)


def ring_vertices(z, front_r, back_r, side_r, bumps=None, segments=RING_SEGMENTS):
    """Anneau elliptique avant/arrière asymétrique + `bumps` : liste de
    (theta_centre, largeur_angulaire, amplitude) qui gonfle (amplitude>0)
    ou creuse (amplitude<0) localement le rayon — c'est ce qui transforme
    un tube lisse en silhouette anatomique (masses pectorales séparées,
    largeur du dos, ventre du biceps…)."""
    bumps = bumps or []
    verts = []
    for i in range(segments):
        theta = (i / segments) * 2 * math.pi
        depth_r = front_r if math.sin(theta) >= 0 else back_r
        factor = 1.0
        for theta_c, width, amp in bumps:
            d = angular_diff(theta, theta_c)
            factor += amp * math.exp(-((d / width) ** 2))
        x = side_r * math.cos(theta) * factor
        y = depth_r * math.sin(theta) * factor
        verts.append(Vector((x, y, z)))
    return verts


def build_loft(name, profile):
    """`profile` : liste de (z, front_r, back_r, side_r, bumps)."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()

    rings = [ring_vertices(z, fr, br, sr, bumps) for (z, fr, br, sr, bumps) in profile]
    bm_rings = [[bm.verts.new(v) for v in ring] for ring in rings]
    bm.verts.ensure_lookup_table()

    n = len(rings[0])
    for r in range(len(rings) - 1):
        a, b = bm_rings[r], bm_rings[r + 1]
        for i in range(n):
            i2 = (i + 1) % n
            bm.faces.new((a[i], a[i2], b[i2], b[i]))

    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


PI = math.pi
FRONT = PI / 2  # theta pointant plein avant (sin=1)
BACK = -PI / 2  # theta pointant plein arrière (sin=-1)


def torso_full_profile():
    """Anneaux du torse complet, taille → cou. Chaque anneau porte ses
    propres `bumps` — c'est la modulation angulaire, pas juste front/back/
    side, qui donne les masses musculaires (pectoraux séparés, largeur du
    dos, trapèzes qui se referment vers le cou)."""
    pec_l = (FRONT - 0.5, 0.42, 0.14)
    pec_r = (FRONT + 0.5, 0.42, 0.14)
    sternum_groove = (FRONT, 0.16, -0.07)
    lat_l = (BACK - 0.55, 0.55, 0.10)
    lat_r = (BACK + 0.55, 0.55, 0.10)
    spine_groove = (BACK, 0.14, -0.05)
    trap_l = (BACK - 0.5, 0.6, 0.07)
    trap_r = (BACK + 0.5, 0.6, 0.07)

    return [
        # z,    front, back,  side,  bumps
        (0.86, 0.110, 0.098, 0.148, []),  # taille
        (0.98, 0.128, 0.108, 0.158, [lat_l, lat_r, spine_groove]),  # bas des côtes
        (1.10, 0.148, 0.112, 0.172, [lat_l, lat_r, spine_groove]),  # bas pecs/abdos
        (1.22, 0.150, 0.118, 0.185, [pec_l, pec_r, sternum_groove, lat_l, lat_r, spine_groove]),
        (1.34, 0.145, 0.128, 0.198, [pec_l, pec_r, sternum_groove, lat_l, lat_r, spine_groove]),
        (1.42, 0.120, 0.140, 0.205, [trap_l, trap_r, spine_groove]),  # clavicules/haut trapèzes
        (1.50, 0.100, 0.128, 0.185, [trap_l, trap_r]),  # base du cou
    ]


def split_by_face_filter(source_obj, name, predicate):
    """Duplique `source_obj`, ne garde que les faces satisfaisant
    `predicate(face_center)`, renomme. Les sommets de bordure restent
    identiques à ceux de l'objet source → aucune fente entre zones
    voisines (§4 du workflow — "séparer par sélection")."""
    bpy.ops.object.select_all(action="DESELECT")
    source_obj.select_set(True)
    bpy.context.view_layer.objects.active = source_obj
    bpy.ops.object.duplicate()
    dup = bpy.context.active_object
    dup.name = name

    bm = bmesh.new()
    bm.from_mesh(dup.data)
    bm.faces.ensure_lookup_table()
    to_delete = [f for f in bm.faces if not predicate(f.calc_center_median())]
    bmesh.ops.delete(bm, geom=to_delete, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.normal_update()
    bm.to_mesh(dup.data)
    bm.free()
    dup.data.update()
    return dup


def add_evolution_shape_key(obj, bulge_amount):
    """Shape key unique `evolution` : gonfle chaque sommet le long de sa
    normale, avec un fondu doux vers les bords haut/bas (jonctions avec les
    zones voisines) pour ne jamais créer de fente au maximum d'évolution."""
    mesh = obj.data
    if mesh.shape_keys is None:
        obj.shape_key_add(name="Basis", from_mix=False)
    key = obj.shape_key_add(name="evolution", from_mix=False)

    coords = [v.co for v in mesh.vertices]
    if not coords:
        return
    zs = [c.z for c in coords]
    z_min, z_max = min(zs), max(zs)
    z_mid = (z_min + z_max) / 2
    z_span = max(1e-6, (z_max - z_min) / 2)

    for i, vert in enumerate(mesh.vertices):
        normal = vert.normal
        t = 1.0 - min(1.0, abs(vert.co.z - z_mid) / z_span)
        falloff = math.sqrt(max(0.0, t))
        key.data[i].co = vert.co + normal * (bulge_amount * falloff)

    key.value = 0.0
    mesh.shape_keys.use_relative = True


def offset_ring_x(obj, ring_idx, x_offset, segments=RING_SEGMENTS):
    v_group = obj.data.vertices[ring_idx * segments : (ring_idx + 1) * segments]
    for v in v_group:
        v.co.x += x_offset


def build_arm_side(side_sign, side_label):
    """UN SEUL loft continu par bras, de l'épaule au poignet — même
    technique que le torse : un socle partagé, découpé en 4 zones par
    sélection (§4 du workflow), donc AUCUNE fente possible aux jointures
    épaule/biceps/triceps/avant-bras (contrairement à une v1 qui tentait
    d'aligner des objets construits séparément)."""
    delt_front = (FRONT, 1.0, 0.09)
    delt_back = (BACK, 1.0, 0.07)
    biceps_bump = (FRONT, 1.0, 0.13)
    triceps_bump = (BACK, 1.1, 0.11)
    brachio_bump = (FRONT - 0.2, 0.9, 0.07)

    # z, front_r, back_r, side_r, x_offset (distance latérale au centre du buste)
    rings = [
        (1.50, 0.075, 0.070, 0.078, 0.155, [delt_front, delt_back]),  # sommet épaule
        (1.44, 0.095, 0.088, 0.098, 0.170, [delt_front, delt_back]),  # deltoïde (large)
        (1.36, 0.078, 0.074, 0.080, 0.185, [delt_front, delt_back]),  # raccord deltoïde→bras
        (1.22, 0.062, 0.060, 0.064, 0.190, [biceps_bump, triceps_bump]),  # ventre biceps/triceps
        (1.06, 0.058, 0.056, 0.060, 0.198, [biceps_bump, triceps_bump]),
        (0.92, 0.048, 0.046, 0.050, 0.206, []),  # coude
        (0.80, 0.044, 0.042, 0.046, 0.212, [brachio_bump]),  # brachioradial
        (0.66, 0.034, 0.032, 0.036, 0.220, []),
        (0.52, 0.026, 0.024, 0.028, 0.224, []),  # poignet
    ]

    arm = build_loft(
        f"arm_{side_label}",
        [(z, fr, br, sr, bumps) for (z, fr, br, sr, _x, bumps) in rings],
    )
    for ring_idx, (_z, _fr, _br, _sr, x_offset, _b) in enumerate(rings):
        offset_ring_x(arm, ring_idx, x_offset * side_sign)
    arm.data.update()

    shoulder = split_by_face_filter(arm, f"shoulder_{side_label}", lambda c: c.z >= 1.30)
    biceps = split_by_face_filter(
        arm, f"biceps_{side_label}", lambda c: c.z < 1.30 and c.z >= 0.86 and c.y > 0
    )
    triceps = split_by_face_filter(
        arm, f"triceps_{side_label}", lambda c: c.z < 1.30 and c.z >= 0.86 and c.y <= 0
    )
    forearm = split_by_face_filter(arm, f"forearm_{side_label}", lambda c: c.z < 0.86)
    bpy.data.objects.remove(arm, do_unlink=True)

    return shoulder, biceps, triceps, forearm


def merge(name, objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    merged = bpy.context.active_object
    merged.name = name
    return merged


def add_neutral_head_neck():
    head = build_loft(
        "head",
        [
            (1.58, 0.075, 0.075, 0.075, []),
            (1.70, 0.085, 0.08, 0.085, []),
            (1.80, 0.075, 0.07, 0.075, []),
            (1.86, 0.04, 0.04, 0.04, []),
        ],
    )
    neck = build_loft(
        "neck",
        [
            (1.48, 0.08, 0.078, 0.08, []),
            (1.60, 0.07, 0.065, 0.07, []),
        ],
    )
    return head, neck


def main():
    clear_scene()

    # ── Torse : socle loft partagé, découpé en 4 zones (§4/§5 du workflow) ──
    torso = build_loft("torso_shell", torso_full_profile())

    chest = split_by_face_filter(torso, "chest", lambda c: c.y > 0.015 and c.z >= 1.05)
    abs_ = split_by_face_filter(torso, "abs", lambda c: c.y > 0.015 and c.z < 1.05)
    back = split_by_face_filter(torso, "back", lambda c: c.y <= 0.015 and c.z < 1.36)
    traps = split_by_face_filter(torso, "traps", lambda c: c.y <= 0.015 and c.z >= 1.36)
    bpy.data.objects.remove(torso, do_unlink=True)

    # ── Bras (gauche + droit), fusionnés par muscle (8 zones, pas 12) ──
    l_shoulder, l_biceps, l_triceps, l_forearm = build_arm_side(-1, "l")
    r_shoulder, r_biceps, r_triceps, r_forearm = build_arm_side(1, "r")

    shoulders = merge("shoulders", [l_shoulder, r_shoulder])
    biceps = merge("biceps", [l_biceps, r_biceps])
    triceps = merge("triceps", [l_triceps, r_triceps])
    forearms = merge("forearms", [l_forearm, r_forearm])

    head, neck = add_neutral_head_neck()

    evolving_zones = {
        "chest": (chest, 0.046),
        "abs": (abs_, 0.030),
        "back": (back, 0.050),
        "traps": (traps, 0.013),
        "shoulders": (shoulders, 0.034),
        "biceps": (biceps, 0.040),
        "triceps": (triceps, 0.036),
        "forearms": (forearms, 0.022),
    }

    stats = []
    for zone_name, (obj, bulge) in evolving_zones.items():
        obj.data.update()
        subsurf = obj.modifiers.new("Smooth", type="SUBSURF")
        subsurf.levels = 2
        subsurf.render_levels = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=subsurf.name)

        add_evolution_shape_key(obj, bulge)
        stats.append((zone_name, len(obj.data.vertices), len(obj.data.polygons)))

    for obj in (head, neck):
        obj.data.update()

    print("=== build_buste.py — statistiques réelles ===")
    total_verts = 0
    for name, vcount, fcount in stats:
        print(f"  {name}: {vcount} sommets, {fcount} faces")
        total_verts += vcount
    print(f"  TOTAL zones évolutives: {total_verts} sommets")

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT_PATH,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_morph=True,
        export_draco_mesh_compression_enable=False,
        export_materials="NONE",
    )
    size_kb = os.path.getsize(OUTPUT_PATH) / 1024
    print(f"[build_buste] Exporté : {OUTPUT_PATH} ({size_kb:.1f} Ko)")


if __name__ == "__main__":
    main()
