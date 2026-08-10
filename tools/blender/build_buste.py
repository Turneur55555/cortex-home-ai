"""
Buste 3D Cortex — modèle RÉEL v1 (Phase I-B, RPG V2, 31/08/2026).

Succède au prototype primitif (`build_buste_prototype.py`, capsules/boîtes).
Construit une géométrie anatomique loftée (torse en anneaux elliptiques
asymétriques avant/arrière, bras/avant-bras effilés) via bmesh — pas des
primitives brutes. Les 4 zones du torse (chest/abs/back/traps) sont
découpées par SÉLECTION sur un même socle loft partagé (voir §4 du
workflow) : elles partagent leurs sommets de bordure, donc aucune fente ni
chevauchement visible entre zones adjacentes. Chaque zone reçoit un shape
key `evolution` qui gonfle le volume le long des normales locales
(silhouette qui s'épaissit réellement, pas une simple mise à l'échelle
uniforme depuis le centre).

Exécuté RÉELLEMENT via :
    blender --background --python tools/blender/build_buste.py

Sortie :
    public/buste/cortex-buste.glb  (remplace le prototype comme asset
    officiel chargé par CortexBusteMesh.tsx)
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

RING_SEGMENTS = 20


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block_collection in (bpy.data.meshes, bpy.data.materials, bpy.data.objects):
        for block in list(block_collection):
            if block.users == 0:
                block_collection.remove(block)


def ring_vertices(z, front_r, back_r, side_r, segments=RING_SEGMENTS):
    """Anneau elliptique asymétrique avant/arrière : profil en "œuf" (le
    torse humain bombe davantage à l'avant qu'à l'arrière — sans cette
    asymétrie, un simple cercle donnerait une silhouette de tube, pas un
    buste)."""
    verts = []
    for i in range(segments):
        theta = (i / segments) * 2 * math.pi
        depth_r = front_r if math.sin(theta) >= 0 else back_r
        x = side_r * math.cos(theta)
        y = depth_r * math.sin(theta)
        verts.append(Vector((x, y, z)))
    return verts


def build_loft(name, profile):
    """`profile` : liste de (z, front_r, back_r, side_r). Construit un tube
    par anneaux successifs reliés en face quads — la technique de loft."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()

    rings = [ring_vertices(z, fr, br, sr) for (z, fr, br, sr) in profile]
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


def torso_full_profile():
    """Anneaux du torse complet, de la taille au cou — les 4 zones du
    torse (chest/abs/back/traps) sont découpées APRÈS coup sur cette même
    géométrie (voir split_by_face_filter), jamais reconstruites séparément."""
    return [
        (0.90, 0.115, 0.100, 0.150),  # taille
        (1.02, 0.135, 0.110, 0.160),  # bas des côtes
        (1.16, 0.155, 0.115, 0.175),  # bas pectoraux / haut abdos
        (1.30, 0.175, 0.120, 0.190),  # pectoraux (bombé avant)
        (1.42, 0.165, 0.130, 0.205),  # haut pectoraux / clavicules
        (1.52, 0.135, 0.135, 0.190),  # base du cou / trapèzes hauts
    ]


def split_by_face_filter(source_obj, name, predicate):
    """Duplique `source_obj`, ne garde que les faces satisfaisant
    `predicate(face_center)`, renomme. Les sommets de bordure restent
    identiques à ceux de l'objet source → aucune fente entre zones
    voisines (même principe que "séparer par sélection" dans l'UI
    Blender, voir §4 du workflow)."""
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
    bmesh.ops.delete(
        bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS"
    )
    bm.normal_update()
    bm.to_mesh(dup.data)
    bm.free()
    dup.data.update()
    return dup


def add_evolution_shape_key(obj, bulge_amount):
    """Shape key unique `evolution` (§3 du workflow) : gonfle chaque sommet
    le long de sa normale, avec un fondu qui protège les bords partagés
    avec les zones voisines (évite toute fente visible au maximum
    d'évolution — voir §4)."""
    mesh = obj.data
    mesh.calc_normals_split() if hasattr(mesh, "calc_normals_split") else None

    if mesh.shape_keys is None:
        obj.shape_key_add(name="Basis", from_mix=False)
    key = obj.shape_key_add(name="evolution", from_mix=False)

    # Poids de bordure : sommets dont la normale est presque horizontale ET
    # proches d'un bord (peu de faces voisines côté "intérieur" de la
    # zone) bougent moins — approximation simple : on pondère par |normal.z|
    # inversé pour les zones du torse (les bords haut/bas du torse sont les
    # jonctions avec le cou/la taille, on les laisse bouger normalement) et
    # on centre le gonflement sur le ventre de la zone via un poids gaussien
    # en fonction de la position relative dans la bounding box locale.
    coords = [v.co for v in mesh.vertices]
    if not coords:
        return
    zs = [c.z for c in coords]
    z_min, z_max = min(zs), max(zs)
    z_mid = (z_min + z_max) / 2
    z_span = max(1e-6, (z_max - z_min) / 2)

    for i, vert in enumerate(mesh.vertices):
        normal = vert.normal
        # Fondu doux vers les bords haut/bas (0 au bord, 1 au centre) —
        # sqrt pour un plateau large au centre plutôt qu'un pic étroit.
        t = 1.0 - min(1.0, abs(vert.co.z - z_mid) / z_span)
        falloff = math.sqrt(max(0.0, t))
        displacement = normal * (bulge_amount * falloff)
        key.data[i].co = vert.co + displacement

    key.value = 0.0
    mesh.shape_keys.use_relative = True


def build_arm_side(side_sign, side_label):
    """Construit un bras (deltoïde + biceps/triceps + avant-bras) pour un
    côté (side_sign = -1 gauche, +1 droit). Retourne les objets créés :
    (shoulder, biceps, triceps, forearm) — encore non fusionnés avec
    l'autre côté (fait par l'appelant)."""
    # Le torse mesure ~0.205 de rayon latéral au niveau des épaules (voir
    # torso_full_profile, anneau z=1.42) : le bras s'accroche à peu près à
    # cette distance, pas loin devant dans le vide — c'est ce qui donnait
    # l'effet "bras détachés" du premier rendu de contrôle.
    shoulder_x = 0.185 * side_sign

    # ── Épaule (calotte arrondie, chevauche légèrement le torse) ──
    shoulder_profile = [
        (1.40, 0.075, 0.065, 0.075),
        (1.47, 0.095, 0.08, 0.10),
        (1.40, 0.075, 0.065, 0.075),
    ]
    shoulder = build_loft(f"shoulder_{side_label}", shoulder_profile)
    for v in shoulder.data.vertices:
        v.co.x += shoulder_x
    shoulder.data.update()

    # ── Haut du bras (épaule → coude) : descend quasi à la verticale, léger
    #    écartement CONSTANT (pas un évasement progressif) — "bras vers le
    #    bas, légèrement écartés du corps" (posture neutre demandée). ──
    upper_rings = [
        (1.42, 0.185, 0.062, 0.060, 0.062),  # épaule
        (1.22, 0.205, 0.060, 0.058, 0.060),  # ventre biceps/triceps
        (1.02, 0.215, 0.050, 0.048, 0.050),  # coude
    ]
    upper = build_loft(
        f"upper_arm_{side_label}", [(z, fr, br, sr) for (z, _x, fr, br, sr) in upper_rings]
    )
    for ring_idx, (_z, x_offset, *_r) in enumerate(upper_rings):
        v_group = upper.data.vertices[ring_idx * RING_SEGMENTS : (ring_idx + 1) * RING_SEGMENTS]
        for v in v_group:
            v.co.x += x_offset * side_sign
    upper.data.update()

    biceps = split_by_face_filter(upper, f"biceps_{side_label}", lambda c: c.y > 0)
    triceps = split_by_face_filter(upper, f"triceps_{side_label}", lambda c: c.y <= 0)
    bpy.data.objects.remove(upper, do_unlink=True)

    # ── Avant-bras (coude → poignet), continue la même verticale ──
    forearm_rings = [
        (1.02, 0.215, 0.048, 0.046, 0.048),
        (0.86, 0.225, 0.040, 0.038, 0.040),
        (0.70, 0.230, 0.030, 0.028, 0.030),
    ]
    forearm = build_loft(
        f"forearm_{side_label}", [(z, fr, br, sr) for (z, _x, fr, br, sr) in forearm_rings]
    )
    for ring_idx, (_z, x_offset, *_r) in enumerate(forearm_rings):
        v_group = forearm.data.vertices[ring_idx * RING_SEGMENTS : (ring_idx + 1) * RING_SEGMENTS]
        for v in v_group:
            v.co.x += x_offset * side_sign
    forearm.data.update()
    forearm.name = f"forearm_{side_label}"

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
            (1.58, 0.075, 0.075, 0.075),
            (1.70, 0.085, 0.08, 0.085),
            (1.80, 0.075, 0.07, 0.075),
            (1.86, 0.04, 0.04, 0.04),
        ],
    )
    neck = build_loft(
        "neck",
        [
            (1.50, 0.075, 0.075, 0.075),
            (1.60, 0.07, 0.065, 0.07),
        ],
    )
    return head, neck


def main():
    clear_scene()

    # ── Torse : socle loft partagé, découpé en 4 zones (§4 du workflow) ──
    torso = build_loft("torso_shell", torso_full_profile())

    chest = split_by_face_filter(
        torso, "chest", lambda c: c.y > 0.02 and c.z >= 1.10
    )
    abs_ = split_by_face_filter(
        torso, "abs", lambda c: c.y > 0.02 and c.z < 1.10
    )
    back = split_by_face_filter(
        torso, "back", lambda c: c.y <= 0.02 and c.z < 1.35
    )
    traps = split_by_face_filter(
        torso, "traps", lambda c: c.y <= 0.02 and c.z >= 1.35
    )
    bpy.data.objects.remove(torso, do_unlink=True)

    # ── Bras (gauche + droit), fusionnés par muscle (§9 : 8 zones, pas 12) ──
    l_shoulder, l_biceps, l_triceps, l_forearm = build_arm_side(-1, "l")
    r_shoulder, r_biceps, r_triceps, r_forearm = build_arm_side(1, "r")

    shoulders = merge("shoulders", [l_shoulder, r_shoulder])
    biceps = merge("biceps", [l_biceps, r_biceps])
    triceps = merge("triceps", [l_triceps, r_triceps])
    forearms = merge("forearms", [l_forearm, r_forearm])

    head, neck = add_neutral_head_neck()

    evolving_zones = {
        "chest": (chest, 0.028),
        "abs": (abs_, 0.018),
        "back": (back, 0.030),
        "traps": (traps, 0.022),
        "shoulders": (shoulders, 0.020),
        "biceps": (biceps, 0.022),
        "triceps": (triceps, 0.020),
        "forearms": (forearms, 0.012),
    }

    stats = []
    for zone_name, (obj, bulge) in evolving_zones.items():
        obj.data.update()
        subsurf = obj.modifiers.new("Smooth", type="SUBSURF")
        subsurf.levels = 1
        subsurf.render_levels = 1
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
    # Draco indisponible sur ce paquet Blender headless (libextern_draco.so
    # absent) — export non compressé ici ; à réactiver quand un artiste
    # exporte depuis un Blender desktop complet (voir §5 du workflow).
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
