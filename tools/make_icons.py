"""ほりほり転生のアプリアイコン (PNG) を生成する。追加ライブラリ不要。

使い方: python3 tools/make_icons.py   （horihori-tensei フォルダで実行）
空と地層のしま模様を下へ掘った穴と、いちばん下で光るダイヤを描く。
"""
import os
import struct
import zlib

SKY = (143, 211, 255)
LAYERS = [(0.30, (122, 84, 50)), (0.48, (107, 116, 128)), (0.64, (75, 61, 92)), (0.80, (138, 42, 18)), (1.01, (255, 122, 26))]
SHAFT = (24, 14, 6)
GEM = (190, 240, 255)
GEM_D = (80, 170, 230)
SIZES = [180, 192, 512]
SS = 4


def color_at(px, py, size):
    u, v = px / size, py / size
    # ダイヤ（いちばん下でかがやく）
    cx, cy, w, h = 0.5, 0.80, 0.13, 0.12
    if abs(u - cx) / w + abs(v - cy) / h <= 1 and v <= cy + h:
        return GEM if u < cx else GEM_D
    # 光の輪
    if ((u - cx) ** 2 + (v - cy) ** 2) ** 0.5 < 0.2:
        glow = 1 - ((u - cx) ** 2 + (v - cy) ** 2) ** 0.5 / 0.2
        base = _layer(u, v)
        return tuple(base[i] + (255 - base[i]) * glow * 0.55 for i in range(3))
    # 縦の穴
    if 0.43 <= u <= 0.57 and 0.18 <= v <= 0.68:
        return SHAFT
    return _layer(u, v)


def _layer(u, v):
    if v < 0.18:
        return SKY
    for edge, col in LAYERS:
        if v < edge:
            return col
    return LAYERS[-1][1]


def make_png(size):
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            acc = [0, 0, 0]
            for i in range(SS):
                for j in range(SS):
                    c = color_at(x + (i + 0.5) / SS, y + (j + 0.5) / SS, size)
                    for k in range(3):
                        acc[k] += c[k]
            row += bytes(round(a / (SS * SS)) for a in acc)
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
    os.makedirs(out, exist_ok=True)
    for s in SIZES:
        with open(os.path.join(out, f"icon-{s}.png"), "wb") as f:
            f.write(make_png(s))
        print("wrote", f"icons/icon-{s}.png")
