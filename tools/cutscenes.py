#!/usr/bin/env python3
"""오프닝 컷신 그림 — 키 아트와 같은 사람 비율 도트 캐릭터로 장면 6개(마지막 장면은 종족별 5종)를 만든다.

    python3 tools/cutscenes.py   → public/cutscenes/*.png (480x270, 화면에서 정수배로 확대)
"""
import math
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import keyart as K  # noqa: E402

W, H = K.W, K.H
OUT = os.path.join(K.HERE, "..", "public", "cutscenes")
B = K.BAYER
hx = K.hx


def sky(stops):
    img = np.zeros((H, W, 4), np.float32)
    img[..., 3] = 255
    ys, xs = np.mgrid[0:H, 0:W]
    t = ys / H
    for i in range(len(stops) - 1):
        t0, c0 = stops[i]
        t1, c1 = stops[i + 1]
        m = (t >= t0) & (t <= t1)
        k = (t - t0) / max(1e-6, t1 - t0)
        q = np.clip(np.floor(k * 4 + B[ys % 4, xs % 4]) / 4, 0, 1)
        img[m] = (hx(c0) + (hx(c1) - hx(c0)) * q[..., None])[m]
    return img


def stars(img, n=80, seed=1, col="fdf7ed"):
    r = random.Random(seed)
    for _ in range(n):
        x, y = r.randint(0, W - 1), r.randint(0, int(H * 0.6))
        img[y, x] = hx(col) * (0.5 + r.random() * 0.5)
        img[y, x, 3] = 255


def tint(layer, col, k):
    """캐릭터를 실루엣 쪽으로 물들인다 (먼 곳·역광)"""
    a = layer.rgba
    on = a[..., 3] > 0
    c = hx(col)
    a[on, :3] = a[on, :3] * (1 - k) + c[:3] * k
    return layer


def hill(img, base, amp, col, seed=2):
    r = random.Random(seed)
    pts = [(0, H)]
    for x in range(0, W + 8, 8):
        pts.append((x, int(base + amp * math.sin(x / 47 + seed) + r.randint(-2, 2))))
    pts.append((W, H))
    K.silhouette(img, pts, hx(col))


def crown(img, cx, cy, s, metal, gems, glow_col=None, broken=False):
    """큰 왕관 (5개의 보석)"""
    if glow_col:
        K.glow(img, cx, cy, 70 * s, glow_col, 0.55)
    m = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(m)
    w, h = 60 * s, 34 * s
    pts = [(cx - w / 2, cy + h / 2), (cx - w / 2, cy - h * 0.1), (cx - w * 0.36, cy - h / 2), (cx - w * 0.2, cy - h * 0.05),
           (cx, cy - h * 0.62), (cx + w * 0.2, cy - h * 0.05), (cx + w * 0.36, cy - h / 2), (cx + w / 2, cy - h * 0.1), (cx + w / 2, cy + h / 2)]
    if broken:
        pts[4] = (cx + 3, cy - h * 0.2)
    d.polygon(pts, fill=255)
    mask = np.array(m) > 0
    ys, xs = np.nonzero(mask)
    t = (xs - (cx - w / 2)) / w
    shade = np.clip(1 - t * 1.2 + (ys - cy) / h * 0.4, 0, 1)
    idx = np.clip((shade * 3 + B[ys % 4, xs % 4]).astype(int), 0, 3)
    cols = [hx(c) for c in metal]
    for i in range(4):
        sel = idx == i
        img[ys[sel], xs[sel]] = cols[3 - i]
    # 테두리
    edge = Image.new("L", (W, H), 0)
    ImageDraw.Draw(edge).line(pts + [pts[0]], fill=255, width=1)
    img[np.array(edge) > 0] = hx("1a0c10")
    band = int(cy + h * 0.28)
    img[band:band + 2, int(cx - w / 2) + 1:int(cx + w / 2)] = hx(metal[0])
    # 보석
    for i, g in enumerate(gems):
        gx = int(cx - w * 0.36 + i * w * 0.18)
        gy = int(cy + h * 0.12)
        for yy in range(-3, 4):
            for xx in range(-3, 4):
                if abs(xx) + abs(yy) <= 3:
                    img[gy + yy, gx + xx] = hx(g) if abs(xx) + abs(yy) < 3 else hx("1a0c10")
        img[gy - 1, gx - 1] = hx("ffffff")


def falling(img, n, cols, seed=3):
    r = random.Random(seed)
    for _ in range(n):
        x, y = r.randint(0, W - 1), r.randint(0, H - 1)
        c = hx(r.choice(cols))
        img[y, x] = c
        if y + 1 < H and r.random() < 0.5:
            img[y + 1, x] = c * 0.6 + img[y + 1, x] * 0.4


def save(img, name):
    os.makedirs(OUT, exist_ok=True)
    K.vignette(img)
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGBA").convert("RGB").save(os.path.join(OUT, name + ".png"), optimize=True)


# ── 1. 오족 전쟁 ─────────────────────────────────────────────────────
def scene_war():
    img = sky([(0, "1a0c14"), (0.45, "4a1424"), (0.75, "a8302a"), (1, "e8653a")])
    falling(img, 120, ["ff9a4a", "ffd070"], 4)
    hill(img, 200, 10, "2a1218", 5)
    for x, y in ((60, 190), (150, 184), (330, 186), (420, 192)):
        K.flame(img, x, y, 12)
        K.glow(img, x, y, 36, "ff6a3d", 0.4)
    hill(img, 236, 6, "140c12", 9)
    # 서로 칼을 겨눈 다섯 종족 (역광 실루엣)
    figs = [(K.human_warrior(), 150, 250, False), (K.orc_mage(), 330, 248, True), (K.elf_archer(), 80, 246, False),
            (K.demon_rogue(), 260, 254, True), (K.dwarf_cleric(), 400, 256, True)]
    for L, x, y, fl in figs:
        tint(L, "1a0c10", 0.78)
        K.paste(img, L, x, y, fl)
    save(img, "cs1_war")


# ── 2. 태양 왕관 ─────────────────────────────────────────────────────
def scene_crown():
    img = sky([(0, "3a2410"), (0.5, "a8642a"), (0.85, "f0b04a"), (1, "ffe2a0")])
    ys, xs = np.mgrid[0:H, 0:W]
    ang = np.arctan2(ys - 110, xs - 240)
    rays = (np.sin(ang * 12) > 0.6) & (np.hypot(xs - 240, ys - 110) > 50)
    img[rays, :3] = img[rays, :3] * 0.7 + hx("fff0c0")[:3] * 0.3
    crown(img, 240, 112, 1.6, ["fff6c8", "ffd864", "f0a83a", "c26a24"], ["f0a83a", "4ba747", "3a3448", "da4e38", "5f2d56"], glow_col="fff4c0")
    hill(img, 222, 4, "5a3418", 6)
    hill(img, 244, 3, "2a1a12", 7)
    # 다섯 영웅이 왕관 아래 나란히
    for i, (L, x) in enumerate(((K.elf_archer(), 110), (K.dwarf_cleric(), 180), (K.human_warrior(), 240), (K.demon_rogue(), 300), (K.orc_mage(), 370))):
        tint(L, "3a2410", 0.55)
        K.paste(img, L, x, 258, False)
    save(img, "cs2_crown")


# ── 3. 잿빛이 된 왕관 ───────────────────────────────────────────────
def scene_ash():
    img = sky([(0, "18161c"), (0.6, "3a3640"), (1, "6a6470")])
    crown(img, 240, 120, 1.6, ["b6b0b8", "8a8490", "5a5460", "3a3640"], ["7a7480", "6a7068", "3a3448", "7a5a5a", "4a4050"])
    falling(img, 260, ["b6b0b8", "8a8490", "dcd6dc"], 8)
    hill(img, 236, 5, "121014", 3)
    save(img, "cs3_ash")


# ── 4. 왕의 죽음, 사라진 왕관 ───────────────────────────────────────
def scene_king():
    img = sky([(0, "0a0c18"), (0.6, "1c2238"), (1, "34304a")])
    stars(img, 120, 4)
    # 달
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.hypot(xx - 370, yy - 60)
    img[d < 18] = hx("e8ecf4")
    img[(d < 18) & (np.hypot(xx - 376, yy - 56) < 15)] = hx("1c2238")
    # 왕도 실루엣 (불 꺼진 창)
    K.ruins(img)
    img[(img[..., 0] > 200) & (img[..., 1] < 160)] = hx("3a3040")  # 창문 불 끄기
    hill(img, 240, 3, "0c0a12", 2)
    # 왕관 없는 왕좌의 그림자 · 떠나는 근위대장
    L = K.human_warrior()
    tint(L, "0c0a12", 0.85)
    K.paste(img, L, 120, 252, True)
    save(img, "cs4_king")


# ── 5. 균열과 마족 ───────────────────────────────────────────────────
def scene_rift():
    img = K.background()
    img[..., :3] *= 0.75
    K.ruins(img)
    hill(img, 226, 8, "1a0c10", 11)
    r = random.Random(12)
    small = []
    for maker in (K.demon_rogue, K.orc_mage, K.human_warrior):
        L = maker()
        tint(L, "1a0c10", 1.0)
        im = L.image()
        small.append(im.resize((im.width // 3, im.height // 3), Image.NEAREST))
    for row, (base, n) in enumerate(((214, 22), (224, 18))):  # 지평선 너머로 내려오는 마족 군세 (작은 실루엣)
        for i in range(n):
            s_ = small[(i + row) % 3]
            x = 10 + i * (W - 20) // n + r.randint(-4, 4)
            y = base + r.randint(-2, 2) - s_.height + 4
            arr = np.array(s_).astype(np.float32)
            on = arr[..., 3] > 0
            ys_, xs_ = np.nonzero(on)
            ok = (ys_ + y >= 0) & (ys_ + y < H) & (xs_ + x >= 0) & (xs_ + x < W)
            img[ys_[ok] + y, xs_[ok] + x] = hx("120810")
            # 윗가장자리 붉은 테
            top = on & ~np.vstack([np.zeros((1, on.shape[1]), bool), on[:-1]])
            ty, tx = np.nonzero(top)
            ok2 = (ty + y >= 0) & (ty + y < H) & (tx + x >= 0) & (tx + x < W)
            img[ty[ok2] + y, tx[ok2] + x] = hx("b4302a")
    hill(img, 238, 4, "100810", 14)
    falling(img, 100, ["ff6a3d", "ffd070"], 13)
    save(img, "cs5_rift")


# ── 6. 꺼져 가는 성소 (종족별) ──────────────────────────────────────
def shrine(img, cx, base):
    K.silhouette(img, [(cx - 18, base), (cx - 14, base - 8), (cx + 14, base - 8), (cx + 18, base)], hx("4a4458"))
    K.silhouette(img, [(cx - 8, base - 8), (cx - 8, base - 52), (cx + 8, base - 52), (cx + 8, base - 8)], hx("5a5468"))
    K.silhouette(img, [(cx - 14, base - 52), (cx + 14, base - 52), (cx + 10, base - 60), (cx - 10, base - 60)], hx("6a6478"))
    for y in range(base - 50, base - 8, 6):
        img[y, cx - 7:cx + 8] = hx("4a4458")
    K.glow(img, cx, base - 64, 30, "ff8a3a", 0.35)
    K.flame(img, cx, base - 62, 4)


def scene_shrine(race):
    stops = {
        "human": [(0, "0c0c18"), (0.7, "1c2238"), (1, "2a2a40")],
        "elf": [(0, "08140e"), (0.7, "143024"), (1, "1e4030")],
        "dwarf": [(0, "100a08"), (0.7, "2a1a12"), (1, "3a2418")],
        "orc": [(0, "180a0a"), (0.7, "3a1414"), (1, "5a2018")],
        "demon": [(0, "14060c"), (0.7, "34101c"), (1, "4a1424")],
    }[race]
    img = sky(stops)
    stars(img, 70, 21)
    if race == "elf":
        for x in range(0, W, 26):
            K.silhouette(img, [(x - 10, 230), (x + 2, 120 + (x * 37) % 40), (x + 14, 230)], hx("0a1a12"))
    elif race == "dwarf":
        K.silhouette(img, [(0, 0), (W, 0), (W, 40), (380, 60), (240, 46), (100, 64), (0, 40)], hx("1a100c"))
    elif race == "demon":
        for x in (90, 380):
            K.silhouette(img, [(x - 8, 236), (x - 2, 170), (x + 3, 176), (x + 8, 236)], hx("5f2d56"))
    hill(img, 236, 4, "0c0a10", 30)
    shrine(img, 300, 238)
    hero = {"human": K.human_warrior, "elf": K.elf_archer, "dwarf": K.dwarf_cleric, "orc": K.orc_mage, "demon": K.demon_rogue}[race]()
    K.paste(img, hero, 228, 252, race in ("human", "dwarf"))
    # 왼쪽에서 다가오는 잿빛 짐승 (게임 스프라이트를 2배로)
    atlas = Image.open(os.path.join(K.HERE, "..", "public", "assets", "atlas.png")).convert("RGBA")
    import json
    fr = json.load(open(os.path.join(K.HERE, "..", "public", "assets", "atlas.json")))
    for i, (bx, by) in enumerate(((40, 250), (96, 242), (140, 254))):
        x0, y0, w0, h0 = fr["ash_wolf_run_anim_f%d" % (i % 4)]
        wolf = atlas.crop((x0, y0, x0 + w0, y0 + h0)).resize((w0 * 3, h0 * 3), Image.NEAREST)
        arr = np.array(wolf).astype(np.float32)
        on = arr[..., 3] > 0
        ys_, xs_ = np.nonzero(on)
        top = by - h0 * 3
        img[ys_ + top, xs_ + bx] = hx("120c10")
        # 윗가장자리만 잿빛으로, 눈은 불씨
        ridge = on & ~np.vstack([np.zeros((1, on.shape[1]), bool), on[:-1]])
        ry_, rx_ = np.nonzero(ridge)
        img[ry_ + top, rx_ + bx] = hx("6a6470")
        ex, ey = bx + int(w0 * 3 * 0.86), top + int(h0 * 3 * 0.42)
        img[ey:ey + 2, ex:ex + 2] = hx("ff8a3a")
        K.glow(img, ex, ey, 10, "ff6a3d", 0.25)
    # 성소에서 영웅에게 옮겨 붙는 마지막 불꽃
    K.glow(img, 262, 186, 22, "ffb060", 0.45)
    for k in range(14):
        t = k / 14
        x, y = int(298 - 40 * t), int(176 + 10 * t + 3 * math.sin(t * 9))
        img[y, x] = hx("ffd070")
    falling(img, 50, ["ff9a4a", "c8b8c0"], 31)
    save(img, "cs6_" + race)


if __name__ == "__main__":
    scene_war()
    scene_crown()
    scene_ash()
    scene_king()
    scene_rift()
    for r in ("human", "elf", "dwarf", "orc", "demon"):
        scene_shrine(r)
    print("cutscenes saved:", sorted(os.listdir(OUT)))
