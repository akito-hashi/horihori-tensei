# ほりほり転生のキャラを Blender で組み立てる
# 使い方: Blender -b -P build.py -- <キャラ> <出力> [サンプル数] [解像度] [段階] [層]
#   キャラ: mog / gan / drill / soko / player
#   出力: 確認用の .png / いじれる .blend / ゲーム用に書き出すフォルダ（最後が /）
#   段階: 仲間は 0〜4（Lv.1 / 10 / 25 / 50 / 100）。自分は装備「つるはし,手袋,ヘルメット,長ぐつ」（例 1,0,1,0）
#   層: 自分をゲーム用に書き出すときだけ。body / boots / gloveL / helmet / arm / pick
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib, common
importlib.reload(common)
from common import *
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
WHO, OUT = argv[0], argv[1]
SAMPLES = int(argv[2]) if len(argv) > 2 else 96
RES = int(argv[3]) if len(argv) > 3 else 700
SPEC = argv[4] if len(argv) > 4 else "1"
LAYER = argv[5] if len(argv) > 5 else None


def face_shine(eye_mat_name="目"):
    return (mat(eye_mat_name, "#120a06", rough=0.05, coat=1.0),
            mat("目の光", "#ffffff", rough=0.3, emit="#ffffff", emit_str=2.0),
            mat("ほっぺ", "#ff8fa0", rough=0.6, sss=0.3))


def metal_grad(name, dark, light):
    return gradient(mat(name, light, rough=0.15, metal=1.0), dark, light)


# ================= モグ（モグラ） =================
def mog(s):
    gold = s >= 3
    FUR = fuzz(mat("毛", "#d8a03a" if gold else "#8a5634", rough=0.5 if gold else 0.55, sheen=0.6, sss=0.08))
    CREAM = fuzz(mat("クリーム色の毛", "#fff0b8" if gold else "#f5dcc0", rough=0.5, sheen=0.3, sss=0.15), 70, 0.06)
    PAW = mat("手足の肌", "#f2b8a8", rough=0.45, sss=0.25)
    if s >= 3:
        CLAW = metal_grad("金の爪", "#c88a00", "#fff0a0")
    elif s >= 2:
        CLAW = metal_grad("銀の爪", "#7a8696", "#eef4fa")
    else:
        CLAW = gradient(mat("爪", "#e8c95e", rough=0.12, coat=1.0), "#c99a48", "#fff4d6")
    EYE, SHINE, BLUSH = face_shine()
    group("体")
    ball("からだ", FUR, (0, 0, 1.2), 1.1, (1, 1, 1.15))
    ball("おなか", CREAM, (0, -0.6, 0.78), 0.72, (1, 0.55, 1.0))
    for sx, side in ((-1, "右"), (1, "左")):
        ball(f"足（{side}）", PAW, (0.45 * sx, -0.55, 0.1), 0.28, (1.0, 1.35, 0.5))
    group("顔")
    ball("口のまわり", CREAM, (0, -0.86, 1.42), 0.4, (1.25, 0.8, 0.82))
    ball("鼻", mat("鼻", "#ff6f9a", rough=0.2, coat=1.0, sss=0.2), (0, -1.2, 1.56), 0.17, (1.3, 0.95, 0.9))
    ball("口", mat("口", "#5a1a24", rough=0.4), (0, -1.13, 1.27), 0.1, (1.5, 0.6, 0.7))
    rbox("歯", mat("歯", "#ffffff", rough=0.25, coat=0.5), (0, -1.165, 1.22), (0.077, 0.034, 0.077), bevel=0.012)
    for sx, side in ((-1, "右"), (1, "左")):
        eye(f"目（{side}）", EYE, (0.37 * sx, -0.88, 1.76), 0.16, (1, 0.8, 1.15))
        shine(f"目の光（{side}）", SHINE, (0.37 * sx - 0.05, -1.0, 1.83), 0.045)
        ball(f"ほっぺ（{side}）", BLUSH, (0.62 * sx, -0.8, 1.5), 0.13, (1.2, 0.5, 0.75), rot=(0, 0, -35 * sx))
        if s == 0:  # ヘルメットの前は、ふさふさの眉
            ball(f"眉（{side}）", FUR, (0.37 * sx, -0.86, 2.02), 0.14, (1.5, 0.6, 0.55), rot=(0, 12 * sx, 0))
    for sx, side in ((-1, "右"), (1, "左")):
        group(f"動:{side}手")
        h = empty(f"手（{side}）←これを動かすと手全体が動く", (1.05 * sx, -0.55, 1.05), rot=(-20, 40 * sx, -20 * sx))
        ball(f"手のひら（{side}）", PAW, (0, 0, 0), 0.36, (1.12, 0.42, 0.92), parent=h)
        ball(f"手首（{side}）", FUR, (-0.12 * sx, 0.08, -0.25), 0.3, (1, 0.8, 0.9), parent=h)
        for i, u in enumerate((-1.5, -0.5, 0.5, 1.5)):
            ph = u * 17
            pr = math.radians(ph)
            horn(f"爪（{side}{i + 1}）", CLAW, (0.37 * math.sin(pr), -0.04, 0.30 * math.cos(pr) - 0.09),
                 0.30 - abs(u) * 0.035, 0.085 - abs(u) * 0.006, bend=40, rot=(0, ph, 0), parent=h)
    if s >= 1:
        group("ヘルメット")
        helmet((0, 0.02, 1.98), 0.93, 0.8)
    if s >= 4:
        crown((0, 0.02, 2.6), 0.42)
    return 1.3


# ================= ガンさん（ベテラン掘り師） =================
def gan(s):
    SKIN = mat("肌", "#f0b48a", rough=0.45, sss=0.3)
    NOSE = mat("鼻", "#e8907a", rough=0.35, sss=0.3, coat=0.3)
    BEARD = fuzz(mat("ひげ", "#f4f2ee", rough=0.6, sheen=0.8, sss=0.1), 80, 0.15)
    SHIRT = fuzz(mat("シャツ", "#c8462a" if s < 3 else "#ffcf3a", rough=0.7, sheen=0.4), 120, 0.05)
    PANTS = fuzz(mat("ズボン", "#4a3a2a", rough=0.75, sheen=0.3), 120, 0.05)
    BOOT = mat("ブーツ", "#5a3418", rough=0.35, coat=0.4)
    BELT = mat("ベルト", "#4a2c14", rough=0.4, coat=0.3)
    GOLD = mat("金具（金）", "#ffcf3a", rough=0.2, metal=1.0)
    EYE, SHINE, BLUSH = face_shine()
    group("体")
    ball("からだ", SHIRT, (0, 0, 1.05), 0.9, (1.0, 0.82, 0.95))
    torus("ベルト", BELT, (0, 0, 0.78), 0.84, 0.09, scale=(1.0, 0.82, 1.0))
    rbox("バックル", GOLD, (0, -0.72, 0.78), (0.26, 0.08, 0.2), bevel=0.03)
    for sx, side in ((-1, "右"), (1, "左")):
        ball(f"足（{side}）", PANTS, (0.36 * sx, 0, 0.35), 0.3, (1, 1, 1.0))
        rbox(f"ブーツ（{side}）", BOOT, (0.38 * sx, -0.12, 0.12), (0.46, 0.62, 0.26), bevel=0.11)
    group("顔")
    HZ = 2.05
    ball("あたま", SKIN, (0, 0, HZ), 0.62)
    ball("ひげ", BEARD, (0, -0.36, HZ - 0.42), 0.5, (1.05, 0.62, 0.85))
    ball("ひげ（下）", BEARD, (0, -0.44, HZ - 0.72), 0.32, (1.0, 0.6, 0.8))
    for sx, side in ((-1, "右"), (1, "左")):
        ball(f"ひげ（{side}）", BEARD, (0.4 * sx, -0.22, HZ - 0.3), 0.3, (0.8, 0.7, 1.0))
        ball(f"口ひげ（{side}）", BEARD, (0.16 * sx, -0.6, HZ - 0.14), 0.16, (1.4, 0.7, 0.7), rot=(0, 18 * sx, 0))
        eye(f"目（{side}）", EYE, (0.21 * sx, -0.57, HZ + 0.06), 0.065, (1.6, 0.6, 0.8), rot=(0, -10 * sx, 0), lid_flat=0.3)
        ball(f"眉（{side}）", BEARD, (0.23 * sx, -0.55, HZ + 0.17), 0.1, (1.8, 0.7, 0.7), rot=(0, -12 * sx, 0))
        ball(f"ほっぺ（{side}）", BLUSH, (0.38 * sx, -0.48, HZ - 0.02), 0.1, (1.2, 0.5, 0.75), rot=(0, 0, -30 * sx))
        ball(f"耳（{side}）", SKIN, (0.6 * sx, 0, HZ), 0.13, (0.6, 1, 1.2))
    ball("鼻", NOSE, (0, -0.64, HZ - 0.02), 0.15, (1.1, 0.9, 0.95))
    group("ヘルメット")
    if s >= 1:
        helmet((0, 0, HZ + 0.27), 0.69, 0.85)
        if s >= 4:
            crown((0, 0, HZ + 0.8), 0.36)
    else:
        torus("はちまき", mat("はちまき", "#2a6fd6", rough=0.7, sheen=0.4), (0, 0, HZ + 0.18), 0.6, 0.08, scale=(1, 1, 1.3))
    group("動:右腕")
    # 右手（つるはしを持つ）。肩を中心に回すと振り下ろせる
    arm = empty("腕（右）←回すとつるはしを振る", (-0.72, -0.05, 1.45), rot=(0, -60, 0))
    ball("そで（右）", SHIRT, (0, 0, 0.28), 0.24, (1, 1, 1.5), parent=arm)
    ball("手（右）", SKIN, (0, -0.02, 0.62), 0.17, parent=arm)
    pickaxe("つるはし", (0, -0.05, 0.62), length=1.6, metal=[1, 1, 2, 5, 5][s], rot=(0, 60, 0), parent=arm)
    group("手")
    # 左腕：外側（+X）へ少し開いて下げる。Y まわりに -θ 回すと、下向きの腕が +X 側へ開く
    arm2 = empty("腕（左）", (0.74, -0.12, 1.42), rot=(0, -30, 0))
    ball("そで（左）", SHIRT, (0, 0, -0.25), 0.24, (1, 1, 1.4), parent=arm2)
    ball("手（左）", SKIN, (0, -0.02, -0.55), 0.17, parent=arm2)
    return 1.45


# ================= ドリルン（掘削ロボ） =================
def drill(s):
    shell = ["#c8d0d8", "#ff9e1a", "#3f8fe0", "#ffcf3a", "#ffcf3a"][s]
    SHELL = mat("外装", shell, rough=0.25, coat=1.0, metal=0.0)
    DARK = mat("黒い部品", "#2a2c32", rough=0.4, coat=0.3)
    STEEL = mat("金属", "#a8b0b8", rough=0.25, metal=1.0)
    GLASS = mat("画面", "#0c1620", rough=0.05, coat=1.0)
    EYE = mat("目の光", "#7ff0ff", rough=0.2, emit="#7ff0ff", emit_str=6.0)
    BULB = mat("頭のランプ", "#ffcf3a" if s < 2 else "#ff3d6e", rough=0.15, emit="#ffd23a" if s < 2 else "#ff3d6e", emit_str=5.0)
    col, met, rough = METALS[[1, 1, 2, 3, 5][s]]
    BIT = stripes(mat(f"ドリルの刃{s}", col, rough=rough, metal=met), "#6a7078" if met else col, col, 5.0)
    group("体")
    rbox("からだ", SHELL, (0, 0, 1.32), (1.75, 1.35, 1.45), bevel=0.32)
    rbox("キャタピラ", DARK, (0, 0, 0.32), (2.0, 1.2, 0.5), bevel=0.22)
    for i, x in enumerate((-0.65, 0, 0.65)):
        cyl(f"車輪{i + 1}", STEEL, (x, -0.6, 0.32), 0.18, 0.06, rot=(90, 0, 0), bevel=0.02)
    cyl("首", STEEL, (0, 0, 2.15), 0.06, 0.4)
    ball("頭のランプ", BULB, (0, 0, 2.4), 0.14)
    for sx in (-1, 1):
        for z in (0.82, 1.82):
            ball(f"ねじ{sx}{z}", STEEL, (0.72 * sx, -0.69, z), 0.05, (1, 0.5, 1))
    if s >= 1:
        rbox("しま模様", DARK, (0, -0.68, 0.9), (1.4, 0.04, 0.1), bevel=0.03)
    group("顔")
    rbox("画面", GLASS, (0, -0.66, 1.48), (1.25, 0.08, 0.72), bevel=0.12)
    for sx, side in ((-1, "右"), (1, "左")):
        eye(f"目（{side}）", EYE, (0.27 * sx, -0.71, 1.5), 0.13, (1, 0.35, 1.2), lid_flat=0.25)
    ball("口", EYE, (0, -0.71, 1.28), 0.07, (2.0, 0.3, 0.5))
    if s >= 4:
        group("体")
        crown((0, 0, 2.0), 0.4)
    group("手")
    # 反対側（-X）のつかむ手。2本の指が向き合うように曲がる
    g = empty("つかむ手", (-0.95, -0.1, 1.1), rot=(0, 0, 20))
    rbox("つかむ手の腕", DARK, (-0.05, 0, 0), (0.36, 0.42, 0.42), bevel=0.1, parent=g)
    cyl("つかむ手の手首", STEEL, (-0.3, 0, 0), 0.2, 0.16, rot=(0, 90, 0), parent=g, bevel=0.03)
    for up in (1, -1):
        f = horn("つかむ指" + ("（上）" if up > 0 else "（下）"), STEEL, (-0.36, 0, 0.11 * up), 0.34, 0.07, bend=45, taper=0.5, parent=g)
        orient(f, Vector((0, -up, 0)), Vector((0, 0, up)), Vector((-1, 0, 0)))
    group("動:ドリル")
    arm = empty("ドリル←回すと刃が回る", (0.95, -0.05, 1.15))
    rbox("腕", DARK, (0.05, 0, 0), (0.36, 0.42, 0.42), bevel=0.1, parent=arm)
    cyl("刃の根もと", STEEL, (0.3, 0, 0), 0.32, 0.18, rot=(0, 90, 0), parent=arm, bevel=0.03)
    cone("ドリルの刃", BIT, (0.72, 0, 0), 0.32, 0.0, 0.72, rot=(0, 90, 0), parent=arm)
    return 1.3


# ================= ソコ（地底人） =================
def soko(s):
    skin = "#7ee08a" if s < 3 else "#b8ffcf"
    robe = ["#6b4bd8", "#6b4bd8", "#3a2a8a", "#ffcf3a", "#ffcf3a"][s]
    SKIN = mat("肌", skin, rough=0.35, sss=0.35, coat=0.3)
    ROBE = fuzz(mat("ローブ", robe, rough=0.65, sheen=0.7), 90, 0.05)
    GOLD = mat("金のふち", "#ffcf3a", rough=0.2, metal=1.0)
    EYE, SHINE, BLUSH = face_shine()
    ORB = mat("触角の玉", "#ffd23a" if s < 2 else "#ff6ad5", rough=0.1, emit="#ffd23a" if s < 2 else "#ff6ad5", emit_str=4.0)
    GLOW = mat("光の玉", "#e8fffa", rough=0.1, emit="#b8fff0" if s < 2 else "#ff9af0", emit_str=10.0)
    group("体")
    ball("ローブ", ROBE, (0, 0, 0.62), 1.0, (0.82, 0.75, 0.72))
    if s >= 1:
        torus("金のふち", GOLD, (0, 0, 0.35), 0.765, 0.055, scale=(1, 0.915, 1))
    group("顔")
    HZ = 1.85
    ball("あたま", SKIN, (0, 0, HZ), 0.78, (1.05, 0.92, 1.0))
    for sx, side in ((-1, "右"), (1, "左")):
        eye(f"目（{side}）", EYE, (0.3 * sx, -0.6, HZ + 0.02), 0.2, (0.85, 0.55, 1.15), rot=(0, 0, 12 * sx), lid_flat=0.15)
        shine(f"目の光（{side}）", SHINE, (0.3 * sx - 0.07, -0.72, HZ + 0.12), 0.055)
        shine(f"目の光2（{side}）", SHINE, (0.3 * sx + 0.06, -0.73, HZ - 0.1), 0.025)
        ball(f"ほっぺ（{side}）", BLUSH, (0.5 * sx, -0.52, HZ - 0.22), 0.1, (1.2, 0.5, 0.75), rot=(0, 0, -30 * sx))
        a = empty(f"触角（{side}）", (0.28 * sx, -0.05, HZ + 0.65), rot=(0, 28 * sx, 0))
        orient(a, Vector((sx, 0, 0)).normalized(), Vector((0, -1, 0)), Vector((0.55 * sx, 0, 1)).normalized())
        a.location = (0.28 * sx, -0.05, HZ + 0.62)
        horn(f"触角の棒（{side}）", SKIN, (0, 0, 0), 0.55, 0.055, bend=50, taper=0.3, parent=a)
        ball(f"触角の玉（{side}）", ORB, tuple(horn_tip(0.55, 50)), 0.13, parent=a)
    ball("口", mat("口", "#2a4a2a", rough=0.4), (0, -0.7, HZ - 0.3), 0.06, (1.6, 0.5, 0.6))
    if s >= 4:
        crown((0, 0, HZ + 0.72), 0.3)
    group("手")
    for sx, side in ((-1, "右"), (1, "左")):
        ball(f"手（{side}）", SKIN, (0.78 * sx, -0.25, 0.95), 0.16)
    group("動:光の玉")
    ball("光の玉", GLOW, (-0.95, -0.45, 1.05), 0.17)
    pl = bpy.data.lights.new("光の玉のあかり", "POINT")
    pl.energy = 30
    pl.color = lin("#b8fff0")[:3]
    po = bpy.data.objects.new("光の玉のあかり", pl)
    common._link(po)
    po.location = (-0.95, -0.7, 1.05)
    return 1.3


# ================= 自分（タップで掘る子ども） =================
GLOVES = ["#ffd2b0", "#ece6d6", "#3fa0ff", "#ffcf3a"]          # 素手・軍手・青い手袋・金の手袋
BOOTS = ["#6b4a2b", "#8a3b1a", "#2f6fd6", "#ffcf3a"]           # 長ぐつ（茶）・赤茶・青・金


def player(g):
    pick, glove, hel, boots = g
    SKIN = mat("肌", "#ffd2b0", rough=0.45, sss=0.35)
    HAIR = fuzz(mat("髪", "#5a3218", rough=0.5, sheen=0.5), 60, 0.1)
    SHIRT = fuzz(mat("シャツ", "#4f9de8", rough=0.7, sheen=0.4), 120, 0.05)
    PANTS = fuzz(mat("ズボン", "#2f4f7f", rough=0.75, sheen=0.3), 120, 0.05)
    gl = GLOVES[glove]
    GLOVE = SKIN if glove == 0 else (mat("金の手袋", gl, rough=0.2, metal=1.0) if glove == 3 else fuzz(mat(f"手袋{glove}", gl, rough=0.7, sheen=0.4), 90, 0.06))
    bc = BOOTS[boots]
    BOOT = mat(f"長ぐつ{boots}", bc, rough=0.2 if boots == 3 else 0.35, coat=0.5, metal=1.0 if boots == 3 else 0.0)
    EYE, SHINE, BLUSH = face_shine()
    group("体")
    ball("からだ", SHIRT, (0, 0, 1.02), 0.62, (1.0, 0.82, 0.95))
    rbox("ポケット", fuzz(mat("ポケット", "#3a86d4", rough=0.7), 120, 0.05), (0, -0.5, 1.08), (0.4, 0.05, 0.26), bevel=0.06)
    for sx, side in ((-1, "右"), (1, "左")):
        ball(f"足（{side}）", PANTS, (0.25 * sx, 0, 0.42), 0.22, (1, 1, 1.3))
    arm2 = empty("腕（左）", (0.56, -0.1, 1.28), rot=(0, -30, 0))
    ball("そで（左）", SHIRT, (0, 0, -0.18), 0.18, (1, 1, 1.4), parent=arm2)
    group("顔")
    HZ = 1.98
    ball("あたま", SKIN, (0, 0, HZ), 0.64)
    for sx, side in ((-1, "右"), (1, "左")):
        eye(f"目（{side}）", EYE, (0.23 * sx, -0.56, HZ - 0.06), 0.1, (0.9, 0.6, 1.2), lid_flat=0.18)
        shine(f"目の光（{side}）", SHINE, (0.23 * sx - 0.035, -0.64, HZ), 0.03)
        ball(f"ほっぺ（{side}）", BLUSH, (0.4 * sx, -0.47, HZ - 0.2), 0.11, (1.2, 0.5, 0.75), rot=(0, 0, -30 * sx))
        ball(f"耳（{side}）", SKIN, (0.62 * sx, 0, HZ - 0.02), 0.13, (0.6, 1, 1.2))
    ball("口", mat("口", "#7a2a2a", rough=0.4), (0, -0.6, HZ - 0.25), 0.075, (1.5, 0.5, 0.9))
    for i, (x, z, r) in enumerate(((-0.42, 0.13, 0.15), (-0.2, 0.19, 0.15), (0.06, 0.2, 0.14), (0.32, 0.16, 0.14), (0.5, 0.08, 0.12))):
        ball(f"前髪{i + 1}", HAIR, (x, -0.47 - (0.06 if abs(x) < 0.3 else 0), HZ + z), r, (1.2, 0.6, 0.75), rot=(0, -x * 40, 0))
    for sx, side in ((-1, "右"), (1, "左")):
        ball(f"横の髪（{side}）", HAIR, (0.55 * sx, -0.08, HZ + 0.12), 0.2, (0.6, 1.0, 1.0))
        ball(f"後ろの髪（{side}）", HAIR, (0.3 * sx, 0.3, HZ + 0.25), 0.4, (1, 1, 0.9))
    group("層:長ぐつ")
    for sx, side in ((-1, "右"), (1, "左")):
        rbox(f"長ぐつ（{side}）", BOOT, (0.27 * sx, -0.08, 0.13), (0.36, 0.5, 0.28), bevel=0.1)
    group("層:左手")
    ball("手（左）", GLOVE, (0, -0.02, -0.42), 0.15, parent=arm2)
    group("層:ヘルメット")
    # 0: オレンジの帽子 / 1: 黄色のヘルメット / 2: ライト付き / 3: 金のヘルメット（ライト付き）
    if hel == 0:
        helmet((0, 0, HZ + 0.22), 0.7, 0.78, color="#ff7a3d", dark="#e5602a", lamp=False)
    elif hel == 3:
        helmet((0, 0, HZ + 0.24), 0.72, 0.82, color="#ffd84a", dark="#d89a00", lamp=True)
        bsdf(bpy.data.materials["ヘルメット#ffd84a"]).inputs["Metallic"].default_value = 1.0
    else:
        helmet((0, 0, HZ + 0.24), 0.72, 0.82, lamp=hel >= 2)
    group("動:右腕")
    arm = empty("腕（右）←回すとつるはしを振る", (-0.55, -0.05, 1.3), rot=(0, -65, 0))
    ball("そで（右）", SHIRT, (0, 0, 0.2), 0.18, (1, 1, 1.5), parent=arm)
    ball("手（右）", GLOVE, (0, -0.02, 0.48), 0.15, parent=arm)
    group("層:つるはし")
    pickaxe("つるはし", (0, -0.05, 0.48), length=1.3, metal=pick, rot=(0, 65, 0), parent=arm, scale=0.85)
    return 1.3


reset()
if WHO == "player":
    gear = [int(x) for x in SPEC.split(",")] if "," in SPEC else [1, 0, 1, 0]
    player(gear)
else:
    STAGE = int(SPEC)
    {"mog": mog, "gan": gan, "drill": drill, "soko": soko}[WHO](STAGE)
studio(1.35)
if OUT.endswith("/"):
    if WHO == "player":
        export_player_layer(OUT, LAYER, int(argv[6]) if len(argv) > 6 else 0, SAMPLES, RES)
    else:
        export_comp(OUT, WHO, STAGE, SAMPLES, RES)
else:
    output(OUT, SAMPLES, RES, f"{WHO}.png")
