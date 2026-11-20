# 画面のアイコン：Blender -b -P icons.py -- <名前> <出力.png か 書き出すフォルダ/> [サンプル数] [解像度]
# 名前: coin shard pick glove helmet boot tree book star nugget nugget-pearl
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib, common
importlib.reload(common)
from common import *
import bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
NAME, OUT = argv[0], argv[1]
SAMPLES = int(argv[2]) if len(argv) > 2 else 48
RES = int(argv[3]) if len(argv) > 3 else 160
C = Vector((0, 0, 1.35))  # カメラが狙う点（ここに置く）


def star_prism(name, m, loc, points=5, R=1.0, r=0.45, depth=0.35, rot=(90, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = []
    for i in range(points * 2):
        a = math.pi / 2 + i * math.pi / points
        rr = R if i % 2 == 0 else r
        vs.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), 0)))
    f = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]:
        v.co.z += depth
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, -depth / 2))
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    common._link(o)
    bv = o.modifiers.new("bev", "BEVEL")
    bv.width = 0.08
    bv.segments = 6
    return common._place(o, name, m, loc, (1, 1, 1), rot, None, smooth=False)


reset()
GOLD = mat("金", "#ffc93a", rough=0.18, metal=1.0)
group("アイコン")
if NAME == "coin":
    cyl("お金", GOLD, C, 0.95, 0.24, rot=(80, 0, 18), bevel=0.06)
    cyl("お金の中", mat("金（濃い）", "#e8a400", rough=0.25, metal=1.0), C + Vector((0.03, -0.13, 0.0)), 0.66, 0.06, rot=(80, 0, 18), bevel=0.03)
    star_prism("お金の星", GOLD, C + Vector((0.05, -0.18, 0.02)), 5, 0.42, 0.19, 0.08, rot=(80, 0, 18))
elif NAME == "shard":
    G = mat("星のかけら", "#bfe8ff", rough=0.05, coat=1.0, emit="#8fd8ff", emit_str=1.2)
    bsdf(G).inputs["Transmission Weight"].default_value = 0.4
    for i, (x, z, L) in enumerate(((0, 1, 1.05), (0, -1, 1.05), (1, 0, 0.8), (-1, 0, 0.8))):
        o = cone(f"とげ{i}", G, C + Vector((x * L / 2, 0, z * L / 2)), 0.32, 0.0, L, parent=None, verts=4)
        orient(o, Vector((0, 1, 0)).cross(Vector((x, 0, z))) if (x or z) else Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((x, 0, z)))
    ball("中心", G, C, 0.28)
elif NAME == "pick":
    pickaxe("つるはし", C + Vector((0, 0, -0.1)), length=1.9, metal=1, rot=(0, -40, 0), scale=1.05)
elif NAME == "helmet":
    # X まわりに + 回すと、てっぺんがカメラ（-Y）側へ倒れて、ドームとライトがよく見える
    g = empty("ヘルメットの向き", C + Vector((0, 0, -0.35)), rot=(22, 0, -12))
    helmet((0, 0, 0), 1.0, 0.8, lamp=True, parent=g)
elif NAME == "glove":
    F = fuzz(mat("手袋", "#3fa0ff", rough=0.7, sheen=0.5), 90, 0.06)
    ball("手のひら", F, C + Vector((0, 0, 0.15)), 0.62, (1, 0.6, 1.15), rot=(0, -12, 0))
    ball("親指", F, C + Vector((-0.62, -0.05, 0.05)), 0.26, (0.8, 0.8, 1.3), rot=(0, 40, 0))
    cyl("手首", fuzz(mat("手首", "#2f7fd0", rough=0.7, sheen=0.5), 90, 0.06), C + Vector((0.06, 0, -0.75)), 0.5, 0.36, rot=(0, -12, 0), bevel=0.12)
elif NAME == "boot":
    B = mat("長ぐつ", "#e0602a", rough=0.28, coat=0.6)
    rbox("つつ", B, C + Vector((-0.15, 0, 0.25)), (0.75, 0.7, 1.2), bevel=0.25)
    rbox("つま先", B, C + Vector((0.25, 0, -0.45)), (1.45, 0.72, 0.5), bevel=0.24)
    rbox("底", mat("底", "#3a2a20", rough=0.5), C + Vector((0.2, 0, -0.72)), (1.55, 0.78, 0.12), bevel=0.05)
elif NAME == "tree":
    cyl("幹", fuzz(mat("幹", "#8a5a2a", rough=0.6), 40, 0.1), C + Vector((0, 0, -0.55)), 0.18, 0.9)
    L = fuzz(mat("葉", "#4cc25a", rough=0.5, sheen=0.4, sss=0.2), 30, 0.08)
    for x, z, r in ((0, 0.35, 0.62), (-0.45, 0.0, 0.45), (0.45, 0.0, 0.45), (0, 0.85, 0.4)):
        ball(f"葉{x}{z}", L, C + Vector((x, 0, z)), r)
elif NAME == "book":
    rbox("表紙", mat("表紙", "#d8402a", rough=0.35, coat=0.5), C, (1.3, 0.28, 1.6), bevel=0.08, rot=(0, 0, 25))
    rbox("紙", mat("紙", "#fff4dc", rough=0.7), C + Vector((0.08, -0.03, 0)), (1.18, 0.24, 1.48), bevel=0.03, rot=(0, 0, 25))
    star_prism("表紙の星", GOLD, C + Vector((-0.08, -0.2, 0.1)), 5, 0.3, 0.13, 0.05, rot=(90, 0, 25))
elif NAME == "star":
    star_prism("星", GOLD, C, 5, 1.05, 0.46, 0.38, rot=(80, 0, 12))
elif NAME.startswith("ore_"):
    ROCK = fuzz(mat("岩", "#6a5a4a", rough=0.85), 18, 0.5)
    base = C + Vector((0, 0, -0.5))
    if NAME != "ore_nugget":
        ball("岩", ROCK, base, 0.95, (1.2, 0.9, 0.62), rot=(0, 8, 0))
        ball("岩2", ROCK, base + Vector((0.6, 0.1, -0.1)), 0.55, (1, 0.9, 0.7))
    if NAME == "ore_vein":
        G2 = mat("金の粒", "#e8b830", rough=0.3, metal=1.0)
        for i, (x, z, r) in enumerate(((-0.5, 0.25, 0.16), (-0.15, 0.42, 0.12), (0.2, 0.3, 0.18), (0.55, 0.12, 0.13), (-0.75, 0.02, 0.11), (0.05, 0.05, 0.1), (0.4, 0.45, 0.09))):
            ball(f"金の粒{i}", G2, base + Vector((x, -0.62, z)), r, (1.2, 0.6, 0.9), rot=(0, i * 37, 0))
    elif NAME == "ore_crystal":
        X = mat("結晶", "#b8dce8", rough=0.22, coat=0.6)
        bsdf(X).inputs["Transmission Weight"].default_value = 0.35
        for i, (x, tilt, h, r) in enumerate(((-0.35, -22, 1.2, 0.2), (0.05, 4, 1.6, 0.25), (0.42, 25, 1.1, 0.18), (-0.05, -40, 0.8, 0.15))):
            g = empty(f"結晶{i}", base + Vector((x, -0.15, 0.2)), rot=(0, tilt, 0))
            cyl(f"柱{i}", X, (0, 0, h / 2), r, h, parent=g, verts=6)
            cone(f"先{i}", X, (0, 0, h + r * 0.6), r, 0.0, r * 1.2, parent=g, verts=6)
    elif NAME == "ore_nugget":
        G3 = fuzz(mat("金塊", "#e0a828", rough=0.32, metal=1.0), 6, 0.6)
        for i, (x, y, z, r) in enumerate(((0, 0, 0, 0.7), (0.5, -0.1, -0.15, 0.48), (-0.48, 0.05, -0.12, 0.5), (0.15, -0.2, 0.35, 0.42), (-0.2, -0.25, -0.3, 0.4))):
            ball(f"金塊{i}", G3, base + Vector((x, y, z + 0.2)), r, (1.1, 0.9, 0.85), rot=(i * 20, i * 33, 0))
elif NAME.startswith("nugget"):
    # 金塊：ひとつのかたまりを、ノイズで不規則に波打たせる。へこみの奥は土で暗く
    M = bpy.data.materials.new("金塊")
    M.use_nodes = True
    nt = M.node_tree
    b = bsdf(M)
    b.inputs["Metallic"].default_value = 1.0
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    ramp = nt.nodes.new("ShaderNodeValToRGB")          # とがった所は金、へこみは土の色
    ramp.color_ramp.elements[0].position = 0.43
    pearl = NAME == "nugget-pearl"  # 虹色の鉱石：同じ形で真珠色
    ramp.color_ramp.elements[0].color = lin("#a89a8c" if pearl else "#8a5c1c")
    ramp.color_ramp.elements[1].position = 0.52
    ramp.color_ramp.elements[1].color = lin("#f4ece0" if pearl else "#e8ac30")
    if pearl:
        b.inputs["Metallic"].default_value = 0.35
        b.inputs["Coat Weight"].default_value = 1.0
        b.inputs["Coat IOR"].default_value = 1.8
        if "Thin Film Thickness" in b.inputs:
            b.inputs["Thin Film Thickness"].default_value = 380  # 見る角度で淡い虹色
    nt.links.new(geo.outputs["Pointiness"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    rr = nt.nodes.new("ShaderNodeValToRGB")            # へこみはざらざら、出っぱりはつや
    rr.color_ramp.elements[0].position = 0.46
    rr.color_ramp.elements[0].color = (0.75, 0.75, 0.75, 1)
    rr.color_ramp.elements[1].position = 0.53
    rr.color_ramp.elements[1].color = (0.28, 0.28, 0.28, 1)
    nt.links.new(geo.outputs["Pointiness"], rr.inputs["Fac"])
    nt.links.new(rr.outputs["Color"], b.inputs["Roughness"])
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 70; nz.inputs["Detail"].default_value = 6
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.25
    nt.links.new(nz.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=6, radius=0.78)
    o = bpy.context.active_object
    for name, kind, sc, st in (("大きなうねり", "CLOUDS", 0.6, 0.48), ("しわ", "CLOUDS", 0.22, 0.045)):
        t = bpy.data.textures.new(name, kind)
        t.noise_scale = sc
        t.noise_depth = 3
        d = o.modifiers.new(name, "DISPLACE")
        d.texture = t
        d.strength = st
        d.mid_level = 0.5
    up = 0.12 if NAME == "nugget_dirt" else 0.0
    common._place(o, "金塊", M, C + Vector((0, 0, -0.25 + up)), (1.3, 0.95, 0.78), (12, -8, 24), None)
    if NAME == "nugget_dirt":
        DIRT = fuzz(mat("土", "#4a3420", rough=0.95), 25, 0.6)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=5, radius=1.0)
        dc = bpy.context.active_object
        t = bpy.data.textures.new("土のでこぼこ", "CLOUDS"); t.noise_scale = 0.35
        d = dc.modifiers.new("でこぼこ", "DISPLACE"); d.texture = t; d.strength = 0.35
        common._place(dc, "土のかたまり", DIRT, C + Vector((0, 0.1, -0.8)), (1.45, 1.0, 0.45), (0, 0, 0), None)
        for i, (x, z, r) in enumerate(((-1.05, -0.62, 0.16), (1.1, -0.66, 0.12), (0.75, -0.5, 0.1), (-0.7, -0.48, 0.09))):
            ball(f"小石{i}", DIRT, C + Vector((x, -0.4, z)), r)
studio(1.35)
if OUT.endswith("/"):
    import json
    setup_render(SAMPLES, RES, "WEBP")
    os.makedirs(os.path.join(OUT, "_meta"), exist_ok=True)
    common._vis(show=common._groups())
    f = f"ui-{NAME}.webp"
    common.scene.render.filepath = os.path.join(OUT, f)
    bpy.ops.render.render(write_still=True)
    with open(os.path.join(OUT, "_meta", f"ui-{NAME}.json"), "w") as fp:
        json.dump({"ui": NAME, "file": f}, fp)
    print("DONE", f)
else:
    output(OUT, SAMPLES, RES, NAME + ".png")
