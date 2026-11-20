# キャラ作りの共通部分：素材、部品の形、ヘルメット、つるはし、カメラと光、描画
import bpy, bmesh, math
from mathutils import Vector, Matrix

scene = None
_group = None


def reset():
    global scene, _group
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    _group = None
    return scene


# ---------- グループ（Blender の右上の一覧で、部品をまとめる箱） ----------
def group(name):
    """これ以降に作る部品を、name のグループに入れる"""
    global _group
    col = bpy.data.collections.get(name)
    if not col:
        col = bpy.data.collections.new(name)
        scene.collection.children.link(col)
    _group = col
    lc = bpy.context.view_layer.layer_collection.children[col.name]
    bpy.context.view_layer.active_layer_collection = lc
    return col


def _link(o):
    (_group or scene.collection).objects.link(o)


# ---------- 色と素材 ----------
def lin(hexstr):
    h = hexstr.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def _set(b, name, val):
    if name in b.inputs:
        b.inputs[name].default_value = val


def bsdf(m):
    return m.node_tree.nodes.get("Principled BSDF")


def mat(name, color, rough=0.5, coat=0.0, sheen=0.0, sss=0.0, metal=0.0, emit=None, emit_str=0.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = bsdf(m)
    _set(b, "Base Color", lin(color))
    _set(b, "Roughness", rough)
    _set(b, "Metallic", metal)
    _set(b, "Coat Weight", coat)
    _set(b, "Coat Roughness", 0.06)
    _set(b, "Sheen Weight", sheen)
    _set(b, "Sheen Roughness", 0.4)
    _set(b, "Subsurface Weight", sss)
    _set(b, "Subsurface Radius", (0.3, 0.12, 0.08))
    _set(b, "Subsurface Scale", 0.15)
    if emit:
        _set(b, "Emission Color", lin(emit))
        _set(b, "Emission Strength", emit_str)
    return m


def fuzz(m, scale=55, strength=0.12):
    """毛や布の、細かいざらざら"""
    nt = m.node_tree
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = 8
    b = nt.nodes.new("ShaderNodeBump")
    b.inputs["Strength"].default_value = strength
    nt.links.new(n.outputs["Fac"], b.inputs["Height"])
    nt.links.new(b.outputs["Normal"], bsdf(m).inputs["Normal"])
    return m


def gradient(m, dark, light, a=0.15, b=0.9, axis="Z"):
    """部品の下から上へ色を変える"""
    nt = m.node_tree
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = a
    ramp.color_ramp.elements[0].color = lin(dark)
    ramp.color_ramp.elements[1].position = b
    ramp.color_ramp.elements[1].color = lin(light)
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    nt.links.new(sep.outputs[axis], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf(m).inputs["Base Color"])
    return m


def stripes(m, c1, c2, scale=6.0):
    """ねじれた筋（ドリルの刃）"""
    nt = m.node_tree
    w = nt.nodes.new("ShaderNodeTexWave")
    w.wave_type = "BANDS"
    w.bands_direction = "DIAGONAL"
    w.inputs["Scale"].default_value = scale
    w.inputs["Distortion"].default_value = 0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.45
    ramp.color_ramp.elements[0].color = lin(c1)
    ramp.color_ramp.elements[1].position = 0.55
    ramp.color_ramp.elements[1].color = lin(c2)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(tc.outputs["Generated"], w.inputs["Vector"])
    nt.links.new(w.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf(m).inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.4
    nt.links.new(w.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf(m).inputs["Normal"])
    return m


# ---------- 部品の形 ----------
def _place(o, name, m, loc, scale, rot, parent, subd=0, smooth=True):
    o.name = name
    o.location = loc
    o.scale = scale
    o.rotation_euler = [math.radians(a) for a in rot]
    if m:
        o.data.materials.append(m)
    if smooth and o.type == "MESH":
        for p in o.data.polygons:
            p.use_smooth = True
    if subd:
        mod = o.modifiers.new("subd", "SUBSURF")
        mod.levels = subd
        mod.render_levels = subd
    if parent:
        o.parent = parent
    return o


def ball(name, m, loc, r=1.0, scale=(1, 1, 1), rot=(0, 0, 0), parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=r)
    return _place(bpy.context.active_object, name, m, loc, scale, rot, parent)


def rbox(name, m, loc, size, bevel=0.1, rot=(0, 0, 0), parent=None):
    """角の丸い箱。size は (幅, 奥行き, 高さ)"""
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bv = o.modifiers.new("bev", "BEVEL")
    bv.width = bevel
    bv.segments = 8
    bv.limit_method = "NONE"
    return _place(o, name, m, loc, (1, 1, 1), rot, parent)


def cyl(name, m, loc, r, depth, rot=(0, 0, 0), parent=None, bevel=0.0, verts=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth)
    o = bpy.context.active_object
    if bevel:
        bv = o.modifiers.new("bev", "BEVEL")
        bv.width = bevel
        bv.segments = 5
    return _place(o, name, m, loc, (1, 1, 1), rot, parent)


def cone(name, m, loc, r1, r2, depth, rot=(0, 0, 0), parent=None, verts=48):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth)
    return _place(bpy.context.active_object, name, m, loc, (1, 1, 1), rot, parent)


def torus(name, m, loc, R, r, scale=(1, 1, 1), rot=(0, 0, 0), parent=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=96, minor_segments=24)
    return _place(bpy.context.active_object, name, m, loc, scale, rot, parent)


def empty(name, loc, rot=(0, 0, 0), parent=None):
    o = bpy.data.objects.new(name, None)
    _link(o)
    o.location = loc
    o.rotation_euler = [math.radians(a) for a in rot]
    if parent:
        o.parent = parent
    return o


def horn(name, m, loc, length, r0, bend=40, taper=0.62, flat=1.05, tip=0.3, rot=(0, 0, 0), parent=None):
    """反りながら細くなる角の形（爪・つるはしの刃・触角）。
    向き：部品の Z 方向へ伸び、-Y 方向へ反る"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    N, K = 14, 16
    th = math.radians(max(bend, 0.5))
    R = length / th
    rings = []
    for k in range(N):
        t = k / (N - 1)
        ph = th * t
        cy, cz = -R * (1 - math.cos(ph)), R * math.sin(ph)
        ny, nz = math.cos(ph), math.sin(ph)
        r = r0 * (1 - taper * t ** 1.8)
        ring = []
        for j in range(K):
            a = 2 * math.pi * j / K
            ox = math.cos(a) * r * flat
            on = math.sin(a) * r
            ring.append(bm.verts.new((ox, cy + ny * on, cz + nz * on)))
        rings.append(ring)
    for k in range(N - 1):
        for j in range(K):
            bm.faces.new((rings[k][j], rings[k][(j + 1) % K], rings[k + 1][(j + 1) % K], rings[k + 1][j]))
    tp = bm.verts.new((0, -R * (1 - math.cos(th)) - math.sin(th) * r0 * tip, R * math.sin(th) + math.cos(th) * r0 * tip))
    for j in range(K):
        bm.faces.new((rings[-1][j], rings[-1][(j + 1) % K], tp))
    base = bm.verts.new((0, 0, -r0 * 0.3))
    for j in range(K):
        bm.faces.new((rings[0][(j + 1) % K], rings[0][j], base))
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    _link(o)
    return _place(o, name, m, loc, (1, 1, 1), rot, parent, subd=1)


def horn_tip(length, bend):
    """horn の先の位置（部品の中の座標）"""
    th = math.radians(max(bend, 0.5))
    R = length / th
    return Vector((0, -R * (1 - math.cos(th)), R * math.sin(th)))


def orient(o, x, y, z):
    """部品の X・Y・Z の向きを、世界（親）のどの向きにするか決める"""
    M = Matrix((x, y, z)).transposed()
    o.rotation_euler = M.to_euler()
    return o


# ---------- ヘルメット ----------
YELLOW = "#ffbe00"


def helmet(c, R, zs=0.8, color=YELLOW, dark="#f08c00", lamp=True, parent=None):
    """c: 中心, R: 横の半径, zs: 高さの比"""
    c = Vector(c)
    H = mat("ヘルメット" if color == YELLOW else f"ヘルメット{color}", color, rough=0.18, coat=1.0)
    HD = mat("ヘルメット（濃い）" if dark == "#f08c00" else f"ヘルメット（濃い）{dark}", dark, rough=0.25, coat=1.0)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=1)
    hel = bpy.context.active_object
    bm = bmesh.new()
    bm.from_mesh(hel.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.02], context="VERTS")
    bm.to_mesh(hel.data)
    bm.free()
    sol = hel.modifiers.new("solid", "SOLIDIFY")
    sol.thickness = 0.07  # 部品の大きさ R 倍される
    _place(hel, "ヘルメット", H, c, (R, R, zs * R), (0, 0, 0), parent, subd=1)
    torus("ヘルメットのつば", HD, c + Vector((0, 0, 0.01 * R)), 1.01 * R, 0.08 * R, scale=(1, 1, 0.8), parent=parent)
    torus("ヘルメットの筋", H, c, 0.667 * R, 0.075 * R, scale=(1.5, 1.18 * zs / 0.8, 1.05), rot=(90, 0, 0), parent=parent)
    if lamp:
        LB = mat("ライトの箱", "#3a3a40", rough=0.35, coat=0.5)
        LN = mat("ライトの光", "#fff6c8", rough=0.1, emit="#fff3b0", emit_str=8.0)
        cyl("ライトの箱", LB, c + Vector((0, -0.89 * R, 0.40 * R * zs)), 0.215 * R, 0.17 * R, rot=(78, 0, 0), parent=parent, bevel=0.03 * R)
        cyl("ライトの光", LN, c + Vector((0, -0.985 * R, 0.43 * R * zs)), 0.15 * R, 0.045 * R, rot=(78, 0, 0), parent=parent)


# ---------- 目（まばたき用に「閉じた目」も作る） ----------
def eye(name, m, loc, r, scale=(1, 1, 1), rot=(0, 0, 0), lid=None, lid_flat=0.2):
    """開いた目と、同じ場所の閉じた目（グループ「目閉じ」、ふだんは描かない）"""
    o = ball(name, m, loc, r, scale, rot)
    o["eye"] = 1
    cur = _group
    group("目閉じ")
    ball(name + "（閉じ）", lid or m, loc, r, (scale[0] * 1.08, scale[1], scale[2] * lid_flat), rot)
    if cur:
        group(cur.name)
    return o


def shine(name, m, loc, r):
    """目の光（目を閉じると消える）"""
    o = ball(name, m, loc, r)
    o["eye"] = 1
    return o


# ---------- 王冠（Lv.100） ----------
def crown(c, r, parent=None):
    c = Vector(c)
    h = r * 0.55
    G = mat("王冠", "#ffcf3a", rough=0.18, metal=1.0)
    J = mat("王冠の宝石", "#ff3d6e", rough=0.05, coat=1.0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=r, depth=h, end_fill_type="NOTHING")
    band = bpy.context.active_object
    sol = band.modifiers.new("solid", "SOLIDIFY")
    sol.thickness = 0.05
    _place(band, "王冠の輪", G, c + Vector((0, 0, h / 2)), (1, 1, 1), (0, 0, 0), parent)
    torus("王冠のふち", G, c, r * 1.02, r * 0.07, parent=parent)
    for k in range(5):
        a = math.radians(-90 + 72 * k)
        p = c + Vector((r * math.cos(a), r * math.sin(a), h))
        cone(f"王冠の山{k + 1}", G, p + Vector((0, 0, h * 0.42)), r * 0.26, 0.0, h * 0.85, parent=parent)
        ball(f"王冠の玉{k + 1}", G, p + Vector((0, 0, h * 0.9)), r * 0.09, parent=parent)
    ball("王冠の宝石", J, c + Vector((0, -r * 1.03, h * 0.5)), r * 0.14, (1, 0.6, 1), parent=parent)


# ---------- つるはし（持ち手は部品の Z 方向、刃は上の端で X 方向に左右へ） ----------
METALS = {  # 木・鉄・鋼・ダイヤ・ミスリル・流れ星（金）
    0: ("#9a6a3a", 0.0, 0.5), 1: ("#d0d6dc", 1.0, 0.38), 2: ("#a8c8f0", 1.0, 0.3),
    3: ("#9ff4ff", 0.0, 0.05), 4: ("#d7b8ff", 1.0, 0.2), 5: ("#ffcf3a", 1.0, 0.18)}


def pickaxe(name, loc, length=1.5, metal=1, rot=(0, 0, 0), parent=None, scale=1.0):
    g = empty(name, loc, rot, parent)
    g.scale = (scale, scale, scale)
    col, met, rough = METALS[metal]
    M = mat(f"つるはしの刃{metal}", col, rough=rough, metal=met, coat=0.6 if met == 0 else 0.0)
    if metal == 3:  # ダイヤは透き通る
        b = bsdf(M)
        _set(b, "Transmission Weight", 0.8)
        _set(b, "IOR", 2.0)
    W = fuzz(mat("つるはしの柄", "#8a5a2a", rough=0.6), 30, 0.08)
    cyl("柄", W, (0, 0, 0), 0.06, length, parent=g, bevel=0.02)
    top = length / 2
    cyl("柄の金具", mat("金具", "#5a5a60", rough=0.3, metal=1.0), (0, 0, top - 0.05), 0.1, 0.22, parent=g, bevel=0.02)
    for side in (1, -1):
        h = horn(f"刃{'右' if side > 0 else '左'}", M, (0, 0, top - 0.05), 0.66, 0.14, bend=38, taper=0.8, flat=0.7, tip=0.15, parent=g)
        # 部品の Z（伸びる向き）を ±X、反る向き（-Y）を下（-Z）に
        orient(h, Vector((0, side, 0)), Vector((0, 0, 1)), Vector((side, 0, 0)))
    return g


# ---------- カメラ・光・描画 ----------
def studio(target_z=1.3):
    group("撮影用")
    target = empty("カメラの狙い", (0, 0, target_z))

    def aim(o):
        c = o.constraints.new("TRACK_TO")
        c.target = target
        c.track_axis = "TRACK_NEGATIVE_Z"
        c.up_axis = "UP_Y"

    cd = bpy.data.cameras.new("カメラ")
    cd.lens = 95  # 王冠をのせても、ドリルンの両腕を広げても収まる大きさ
    cam = bpy.data.objects.new("カメラ", cd)
    _link(cam)
    cam.location = (2.2, -10.5, 3.3)
    aim(cam)
    scene.camera = cam

    def light(name, loc, power, size, color):
        d = bpy.data.lights.new(name, "AREA")
        d.energy = power
        d.size = size
        d.color = lin(color)[:3]
        o = bpy.data.objects.new(name, d)
        _link(o)
        o.location = loc
        aim(o)

    light("メインの光", (-5, -6, 7), 1400, 5, "#fff2e0")
    light("補助の光", (6, -5, 2.5), 350, 6, "#dfe8ff")
    light("ふちの光", (3, 6, 5), 1100, 3, "#cfe6ff")
    light("ふちの光2", (-4, 5, 3), 500, 3, "#ffe0c0")
    world = bpy.data.worlds.new("まわりの光")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = lin("#b8a898")
    bg.inputs["Strength"].default_value = 0.5
    return cam, target


def setup_render(samples=96, res=700, fmt="PNG"):
    scene.render.engine = "CYCLES"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        scene.cycles.device = "GPU"
    except Exception as e:
        print("GPU なし:", e)
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.render.resolution_x = res
    scene.render.resolution_y = res
    scene.render.image_settings.file_format = fmt
    scene.render.image_settings.color_mode = "RGBA"
    if fmt == "WEBP":
        scene.render.image_settings.quality = 90
    scene.view_settings.view_transform = "Khronos PBR Neutral"


def output(out, samples=96, res=700, png_name="char.png"):
    """1枚の確認用画像（.png）か、いじれるファイル（.blend）を書き出す"""
    setup_render(samples, res)
    _vis(show=[lc.name for lc in bpy.context.view_layer.layer_collection.children if lc.name != "目閉じ"])
    if out.endswith(".blend"):
        scene.render.filepath = "//" + png_name
        for scr in bpy.data.screens:
            for area in scr.areas:
                if area.type == "VIEW_3D":
                    for sp in area.spaces:
                        if sp.type == "VIEW_3D":
                            sp.shading.type = "MATERIAL"
        bpy.ops.wm.save_as_mainfile(filepath=out)
    else:
        scene.render.filepath = out
        bpy.ops.render.render(write_still=True)
    print("DONE", out)


# ---------- ゲーム用の書き出し（WebP の重ね絵＋説明の JSON） ----------
def _groups():
    return [lc.name for lc in bpy.context.view_layer.layer_collection.children]


def _vis(show=(), holdout=()):
    """show のグループを描き、holdout のグループは切り抜き（透明の穴）にする。ほかは描かない"""
    vl = bpy.context.view_layer
    for lc in vl.layer_collection.children:
        if lc.name == "撮影用":
            lc.exclude, lc.holdout = False, False
            continue
        lc.exclude = not (lc.name in show or lc.name in holdout)
        lc.holdout = lc.name in holdout
    vl.update()


def _blink(on):
    for o in bpy.data.objects:
        if o.get("eye"):
            o.hide_render = on


def _shot(path):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def pivot_of(colname):
    """そのグループのいちばん上の親の位置を、画像の上の点（幅・高さに対する %）にする"""
    from bpy_extras.object_utils import world_to_camera_view
    _vis(show=_groups())
    col = bpy.data.collections[colname]
    roots = [o for o in col.objects if o.parent is None]
    root = ([o for o in roots if o.type == "EMPTY"] or roots)[0]
    v = world_to_camera_view(scene, scene.camera, root.matrix_world.translation)
    return root, [round(v.x * 100, 2), round((1 - v.y) * 100, 2)]


PART_ID = {"動:右手": "handR", "動:左手": "handL", "動:右腕": "arm", "動:ドリル": "drill", "動:光の玉": "orb"}


def export_comp(outdir, who, stage, samples, res, spin_frames=8):
    """仲間 1人の 1段階：体・まばたきの体・動く部品"""
    import os, json
    setup_render(samples, res, "WEBP")
    os.makedirs(os.path.join(outdir, "_meta"), exist_ok=True)
    tag = f"{who}-{stage}"
    body = [g for g in _groups() if not g.startswith("動:") and g not in ("撮影用", "目閉じ")]
    moving = [g for g in _groups() if g.startswith("動:")]
    meta = {"who": who, "stage": stage, "base": f"{tag}-base.webp", "blink": f"{tag}-blink.webp", "parts": []}
    _vis(show=body)
    _shot(os.path.join(outdir, meta["base"]))
    _blink(True)
    _vis(show=body + ["目閉じ"])
    _shot(os.path.join(outdir, meta["blink"]))
    _blink(False)
    for g in moving:
        root, pv = pivot_of(g)
        pid = PART_ID[g]
        item = {"name": pid, "pivot": pv}
        _vis(show=[g], holdout=body)
        if pid == "drill":
            item["frames"] = []
            for k in range(spin_frames):
                root.rotation_euler.x = math.radians(360 * k / spin_frames)
                bpy.context.view_layer.update()
                f = f"{tag}-drill-{k}.webp"
                _shot(os.path.join(outdir, f))
                item["frames"].append(f)
            root.rotation_euler.x = 0
        else:
            item["file"] = f"{tag}-{pid}.webp"
            _shot(os.path.join(outdir, item["file"]))
        meta["parts"].append(item)
    with open(os.path.join(outdir, "_meta", tag + ".json"), "w") as fp:
        json.dump(meta, fp, ensure_ascii=False, indent=1)
    print("DONE", json.dumps(meta, ensure_ascii=False))


def export_player_layer(outdir, layer, index, samples, res):
    """自分の重ね絵の 1枚。layer: body / boots / gloveL / helmet / arm / pick。
    body はまばたきの体も描く。ほかは体と顔を切り抜きにして描く"""
    import os, json
    setup_render(samples, res, "WEBP")
    os.makedirs(os.path.join(outdir, "_meta"), exist_ok=True)
    body = ["体", "顔"]
    meta = {"who": "me", "layer": layer, "index": index}
    if layer == "body":
        meta["file"], meta["blink"] = "me-body.webp", "me-blink.webp"
        _vis(show=body)
        _shot(os.path.join(outdir, meta["file"]))
        _blink(True)
        _vis(show=body + ["目閉じ"])
        _shot(os.path.join(outdir, meta["blink"]))
        _blink(False)
        meta["pivot"] = pivot_of("動:右腕")[1]
    else:
        g = {"boots": "層:長ぐつ", "gloveL": "層:左手", "helmet": "層:ヘルメット", "arm": "動:右腕", "pick": "層:つるはし"}[layer]
        hold = body + (["動:右腕"] if layer == "pick" else [])
        _vis(show=[g], holdout=hold)
        meta["file"] = f"me-{layer}-{index}.webp"
        _shot(os.path.join(outdir, meta["file"]))
    with open(os.path.join(outdir, "_meta", f"me-{layer}-{index}.json"), "w") as fp:
        json.dump(meta, fp, ensure_ascii=False, indent=1)
    print("DONE", json.dumps(meta, ensure_ascii=False))
