#!/usr/bin/env python3
"""Ashen Crown 에셋 빌더.

0x72 DungeonTileset II (CC0) 시트에서 프레임을 잘라 오고, 같은 팔레트·같은 외곽선 규칙
(1px #222222 검은 테두리, 위에서 비추는 2~3단 음영)으로 직접 그린 스프라이트를 더해
public/assets/atlas.png + atlas.json 하나로 묶는다.

    python3 tools/build_assets.py
"""
import json
import math
import os
import random

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_PNG = os.path.join(HERE, "src", "0x72_DungeonTilesetII_v1.7.png")
SRC_LIST = os.path.join(HERE, "src", "tile_list_v1.7")
OUT_DIR = os.path.join(HERE, "..", "public", "assets")


def hx(s):
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), 255)


# ── 0x72 팔레트에서 뽑은 색 ─────────────────────────────────────────
P = {k: hx(v) for k, v in {
    "out": "222222", "void": "21141b", "dkbrown": "483b3a", "brown": "775c55", "tan": "aa8d7a",
    "beige": "d3bfa9", "cream": "fdf7ed", "red": "da4e38", "dkred": "8f4029", "wine": "62232f",
    "dkgreen": "3d734f", "green": "4ba747", "lime": "97da3f", "teal": "49a790", "cyan": "72d6ce",
    "yellow": "facb3e", "orange": "ee8e2e", "burnt": "c56025", "navy": "314152", "steel": "417089",
    "blue": "5698cc", "purple": "5956bd", "plum": "5f2d56", "magenta": "9f294e", "pink": "dc4a7b",
    "skin": "d8a57d", "skinlt": "fccba3", "skinmd": "c38d70", "wood": "b58057", "wooddk": "8a503e",
    "gray": "7b8994", "gray2": "545454", "gray3": "3f3f3f", "ltgray": "b6cbcf", "ice": "cae6f5",
    "dknavy": "2a2a3a", "grass0": "2f5a40", "gold2": "ffcc68",
}.items()}
OUT = P["out"]
CLEAR = (0, 0, 0, 0)

rng = random.Random(1120)

# ── 0x72 원본 ───────────────────────────────────────────────────────
sheet = Image.open(SRC_PNG).convert("RGBA")
SRC = {}
for line in open(SRC_LIST):
    parts = line.split()
    if len(parts) == 5:
        SRC[parts[0]] = tuple(map(int, parts[1:]))


def src(name):
    x, y, w, h = SRC[name]
    return sheet.crop((x, y, x + w, y + h))


FRAMES = {}  # name -> Image


def add(name, img):
    FRAMES[name] = img


for n in SRC:
    add(n, src(n))
# 이름 정리: zombie_anim_f10 오타, 일부 시트는 idle 이름이 없음
FRAMES["zombie_anim_f0"] = FRAMES.pop("zombie_anim_f10")


# ── 도우미 ─────────────────────────────────────────────────────────
def new(w, h):
    return Image.new("RGBA", (w, h), CLEAR)


def outline(img, color=OUT, diag=False):
    """투명 픽셀 중 불투명 픽셀과 맞닿은 곳을 외곽선색으로 칠한다 (0x72 스타일)."""
    w, h = img.size
    px = img.load()
    res = img.copy()
    rp = res.load()
    nb = [(1, 0), (-1, 0), (0, 1), (0, -1)]
    if diag:
        nb += [(1, 1), (-1, 1), (1, -1), (-1, -1)]
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0:
                for dx, dy in nb:
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < w and 0 <= yy < h and px[xx, yy][3] > 0 and px[xx, yy] != color:
                        rp[x, y] = color
                        break
    return res


def recolor(img, mapping):
    m = {hx(k)[:3]: (v if isinstance(v, tuple) else hx(v)) for k, v in mapping.items()}
    out = img.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            p = px[x, y]
            if p[3] and p[:3] in m:
                px[x, y] = m[p[:3]]
    return out


def colors_of(img):
    s = {}
    for p in img.getdata():
        if p[3]:
            s["%02x%02x%02x" % p[:3]] = s.get("%02x%02x%02x" % p[:3], 0) + 1
    return s


def put(img, x, y, c):
    if 0 <= x < img.width and 0 <= y < img.height:
        img.putpixel((x, y), c)


def ellipse(img, cx, cy, rx, ry, cols, light=(-0.4, -0.7)):
    """음영 있는 타원 채우기. cols = (밝음, 중간, 어두움)."""
    for y in range(int(cy - ry - 1), int(cy + ry + 2)):
        for x in range(int(cx - rx - 1), int(cx + rx + 2)):
            dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            d = dx * dx + dy * dy
            if d <= 1.0:
                sh = dx * light[0] + dy * light[1]
                c = cols[0] if sh > 0.35 else (cols[2] if sh < -0.45 else cols[1])
                put(img, x, y, c)


def rect(img, x0, y0, w, h, c):
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            put(img, x, y, c)


def pixmap(rows, cmap):
    h = len(rows)
    w = max(len(r) for r in rows)
    img = new(w, h)
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch in cmap:
                img.putpixel((x, y), cmap[ch])
    return img


def paste(dst, img, x, y):
    dst.alpha_composite(img, (x, y))


def flipx(img):
    return img.transpose(Image.FLIP_LEFT_RIGHT)


# ═══════════════════════════════════════════════════════════════════
# 1) 플레이어 종족 몸체 — 0x72에 없는 마족/오크(여)를 엘프 몸체에서 만든다
# ═══════════════════════════════════════════════════════════════════
ELF_SKIN = {"fccba3": "c79bd0", "d8a57d": "9a6fb0", "e2b694": "b385c4", "c38d70": "7d5592"}


def anim_names(base):
    out = []
    for kind in ("idle", "run"):
        for i in range(4):
            out.append(f"{base}_{kind}_anim_f{i}")
    out.append(f"{base}_hit_anim_f0")
    return out


def body_variant(src_base, dst_base, skin_map, extra_map, decorate):
    for n in anim_names(src_base):
        if n not in FRAMES:
            continue
        img = recolor(FRAMES[n], {**skin_map, **extra_map})
        img = decorate(img, n)
        add(n.replace(src_base, dst_base), img)


def find_head_top(img):
    for y in range(img.height):
        for x in range(img.width):
            if img.getpixel((x, y))[3]:
                return y
    return 0


def demon_deco(img, n):
    # 이마 위 뿔 두 개 (상아색 + 어두운 끝) 그리고 붉은 눈
    img = img.copy()
    top = find_head_top(img)
    big = new(img.width, img.height + 3)
    paste(big, img, 0, 3)
    t = top + 3
    for (hx_, d) in ((4, -1), (10, 1)):
        put(big, hx_, t - 1, P["beige"]); put(big, hx_ + d, t - 2, P["beige"]); put(big, hx_ + d, t - 3, P["cream"])
        put(big, hx_ + 1, t - 1, P["tan"])
    px = big.load()
    for y in range(big.height):
        for x in range(big.width):
            if px[x, y][:3] == hx("5698cc")[:3] or px[x, y][:3] == hx("417089")[:3]:
                px[x, y] = P["red"]
    big = outline(big)
    return big.crop((0, 0, big.width, big.height))


def orc_deco(img, n):
    img = img.copy()
    px = img.load()
    # 눈은 노랗게, 입가에 엄니
    eye_y = None
    for y in range(img.height):
        for x in range(img.width):
            if px[x, y][:3] in (hx("5698cc")[:3], hx("417089")[:3]):
                px[x, y] = P["yellow"]
                eye_y = y
    if eye_y is not None:
        # 가장 오른쪽 피부 픽셀 근처에 엄니
        y = eye_y + 3
        xs = [x for x in range(img.width) if px[x, y][3] and px[x, y][:3] in (hx("3d734f")[:3], hx("4ba747")[:3], hx("97da3f")[:3], hx("2f5a40")[:3], hx("49a790")[:3])]
        if xs:
            put(img, max(xs) - 1, y - 1, P["cream"])
            put(img, max(xs) - 4, y - 1, P["cream"])
    return img


body_variant("elf_m", "demon_m", ELF_SKIN, {"facb3e": "3b2a4a", "ee8e2e": "2a2a3a", "c56025": "21141b",
                                             "4ba747": "62232f", "3d734f": "3b1a22", "97da3f": "9f294e"}, demon_deco)
body_variant("elf_f", "demon_f", ELF_SKIN, {"facb3e": "3b2a4a", "ee8e2e": "2a2a3a", "c56025": "21141b",
                                             "4ba747": "5f2d56", "3d734f": "3b1a3a", "97da3f": "9f294e"}, demon_deco)
ORC_SKIN = {"fccba3": "4ba747", "d8a57d": "3d734f", "e2b694": "49a790", "c38d70": "2f5a40"}
body_variant("elf_f", "orc_f", ORC_SKIN, {"facb3e": "2a2a3a", "ee8e2e": "21141b", "c56025": "21141b",
                                          "4ba747": "8a503e", "3d734f": "5c3326", "97da3f": "b58057"}, orc_deco)
# 오크(남)는 0x72 orc_warrior — 피격 프레임만 idle 0을 복사
for i in range(4):
    add(f"orc_m_idle_anim_f{i}", FRAMES[f"orc_warrior_idle_anim_f{i}"])
    add(f"orc_m_run_anim_f{i}", FRAMES[f"orc_warrior_run_anim_f{i}"])
add("orc_m_hit_anim_f0", FRAMES["orc_warrior_idle_anim_f0"])
# 인간 = 기사 몸체, 이름 맞추기
for g in "mf":
    for n in anim_names(f"knight_{g}"):
        add(n.replace("knight", "human"), FRAMES[n])

# ═══════════════════════════════════════════════════════════════════
# 2) NPC / 인간형 적 — 엘프 몸체를 다시 칠해 귀를 감춘 마을 사람, 산적
# ═══════════════════════════════════════════════════════════════════
def hide_ears(img, n):
    return img


def bandit_deco(img, n):
    img = img.copy()
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            if px[x, y][:3] in (hx("5698cc")[:3], hx("417089")[:3]):
                # 눈 줄에 검은 두건 띠
                for xx in range(img.width):
                    if px[xx, y][3] and px[xx, y][:3] != hx("222222")[:3] and px[xx, y][:3] not in (hx("5698cc")[:3], hx("417089")[:3], hx("fdf7ed")[:3]):
                        px[xx, y] = P["dknavy"]
                px[x, y] = P["cream"]
    return img


VILLAGER_A = {"facb3e": "8a503e", "ee8e2e": "5c3326", "c56025": "3b2a2a", "4ba747": "5698cc", "3d734f": "314152", "97da3f": "72d6ce"}
VILLAGER_B = {"facb3e": "da4e38", "ee8e2e": "8f4029", "c56025": "62232f", "4ba747": "d3bfa9", "3d734f": "aa8d7a", "97da3f": "fdf7ed"}
body_variant("elf_m", "villager_m", {}, VILLAGER_A, hide_ears)
body_variant("elf_f", "villager_f", {}, VILLAGER_B, hide_ears)
body_variant("elf_m", "bandit", {"fccba3": "e2b694"}, {"facb3e": "5c3326", "ee8e2e": "3b2a2a", "c56025": "21141b",
                                                       "4ba747": "8f4029", "3d734f": "62232f", "97da3f": "da4e38"}, bandit_deco)
body_variant("elf_f", "bandit_archer", {"fccba3": "e2b694"}, {"facb3e": "3b2a2a", "ee8e2e": "21141b", "c56025": "21141b",
                                                             "4ba747": "775c55", "3d734f": "483b3a", "97da3f": "aa8d7a"}, bandit_deco)

# 도적왕: 오거를 사람 피부·붉은 망토로 칠하고 금관을 씌운다
ogre_cols = colors_of(FRAMES["ogre_idle_anim_f0"])


def king_deco(img, n):
    img = img.copy()
    top = find_head_top(img)
    big = new(img.width, img.height + 4)
    paste(big, img, 0, 4)
    t = top + 4
    xs = [x for x in range(big.width) if big.getpixel((x, t + 1))[3]]
    if xs:
        cx = (min(xs) + max(xs)) // 2
        for x in range(cx - 4, cx + 5):
            put(big, x, t - 1, P["yellow"])
            put(big, x, t, P["orange"])
        for x in (cx - 4, cx, cx + 4):
            put(big, x, t - 2, P["yellow"]); put(big, x, t - 3, P["gold2"])
        put(big, cx, t - 1, P["red"])
    return outline(big)


ogre_map = {}
for c in ogre_cols:
    r, g, b = int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
    if g > r + 20 and g > b:  # 초록 피부 → 사람 피부
        lum = (r + g + b) / 3
        ogre_map[c] = "fccba3" if lum > 140 else ("d8a57d" if lum > 95 else "a5704f")
    elif r > g + 15 and r > b and r < 200:  # 갈색 옷 → 붉은 망토
        lum = (r + g + b) / 3
        ogre_map[c] = "da4e38" if lum > 110 else ("8f4029" if lum > 70 else "62232f")
for k in ("idle", "run"):
    for i in range(4):
        n = f"ogre_{k}_anim_f{i}"
        add(f"bandit_king_{k}_anim_f{i}", king_deco(recolor(FRAMES[n], ogre_map), n))

# 리치(네크로맨서) 계열 / 불 정령(워골 재채색) / 석상 골렘(오거 재채색)
wogol_cols = colors_of(FRAMES["wogol_idle_anim_f0"])
fire_map = {}
for c in wogol_cols:
    r, g, b = int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
    if c == "222222":
        continue
    lum = (r + g + b) / 3
    fire_map[c] = "facb3e" if lum > 150 else ("ee8e2e" if lum > 100 else ("da4e38" if lum > 60 else "8f4029"))
for k in ("idle", "run"):
    for i in range(4):
        add(f"fire_spirit_{k}_anim_f{i}", recolor(FRAMES[f"wogol_{k}_anim_f{i}"], fire_map))

# ═══════════════════════════════════════════════════════════════════
# 3) 동물 — 늑대, 멧돼지, 거대 거미 (직접 제작, 16x16, idle 4f + run 4f)
# ═══════════════════════════════════════════════════════════════════
def quad(body, head, ears, legs_cols, phase, run, tail=None, tusk=False, bob=0):
    img = new(18, 16)
    b_lt, b_md, b_dk = body
    # 다리 (뒤 → 앞)
    leg_x = [4, 6, 11, 13]
    for i, lx in enumerate(leg_x):
        if run:
            off = [0, 1, 0, -1][(phase + (i % 2) * 2) % 4]
        else:
            off = 0
        ly = 11 + bob
        h = 4 - (1 if off > 0 and run else 0)
        c = legs_cols[1] if i in (0, 2) else legs_cols[0]
        rect(img, lx + off, ly, 2, h, c)
    if tail:
        tx, ty = 2, 7 + bob
        for k in range(3):
            put(img, tx - k, ty - (k if run and phase % 2 else k // 2), tail)
            put(img, tx - k, ty + 1 - (k if run and phase % 2 else k // 2), b_dk)
    ellipse(img, 8.5, 9 + bob, 6.2, 3.6, body)
    ellipse(img, 14, 6.5 + bob, 3.2, 3.0, head)
    # 주둥이
    rect(img, 15, 7 + bob, 3, 2, head[1])
    rect(img, 15, 8 + bob, 3, 1, head[2])
    put(img, 17, 7 + bob, OUT)
    # 귀
    for ex in ears:
        put(img, ex, 3 + bob, head[1]); put(img, ex, 2 + bob, head[0])
    # 눈
    put(img, 15, 6 + bob, OUT)
    if tusk:
        put(img, 16, 9 + bob, P["cream"]); put(img, 16, 10 + bob, P["cream"])
    return outline(img)


def make_quadruped(name, body, head, legs, ears, tail=None, tusk=False):
    for i in range(4):
        add(f"{name}_idle_anim_f{i}", quad(body, head, ears, legs, i, False, tail, tusk, bob=(1 if i in (1, 2) else 0)))
        add(f"{name}_run_anim_f{i}", quad(body, head, ears, legs, i, True, tail, tusk, bob=(1 if i % 2 else 0)))


make_quadruped("wolf", (P["ltgray"], P["gray"], P["navy"]), (P["ltgray"], P["gray"], P["navy"]), (P["gray"], P["navy"]),
               ears=(13, 15), tail=P["gray"])
make_quadruped("boar", (P["wood"], P["wooddk"], P["dkbrown"]), (P["wood"], P["wooddk"], P["dkbrown"]), (P["wooddk"], P["dkbrown"]),
               ears=(12,), tail=P["dkbrown"], tusk=True)


def spider(phase, run):
    img = new(18, 14)
    bob = (phase % 2) if run else (1 if phase in (1, 2) else 0)
    # 다리 8개 (좌우 4쌍), 관절은 꺾인 선
    for k in range(4):
        sx = 5 + k * 2
        sway = ([0, 1, 0, -1][(phase + k) % 4]) if run else 0
        for side in (-1, 1):
            put(img, sx + sway, 7 + bob, P["dknavy"])
            put(img, sx + sway + side * 0, 6 + bob, P["dknavy"])
            put(img, sx + sway - 1 + k, 4 + bob - (k % 2), P["plum"]) if False else None
        # 위쪽 관절 → 아래 발끝
        rect(img, 2 + k * 4 + sway, 5 + bob, 1, 2, P["plum"])
        rect(img, 1 + k * 4 + sway, 7 + bob, 1, 5 - bob, P["dknavy"])
    ellipse(img, 7, 7 + bob, 4.5, 3.3, (P["plum"], P["dknavy"], P["void"]))
    ellipse(img, 12.5, 8 + bob, 2.6, 2.3, (P["plum"], P["dknavy"], P["void"]))
    # 등 무늬 + 눈
    put(img, 6, 5 + bob, P["red"]); put(img, 7, 6 + bob, P["red"]); put(img, 8, 5 + bob, P["red"])
    put(img, 13, 7 + bob, P["red"]); put(img, 14, 7 + bob, P["red"]); put(img, 14, 8 + bob, P["red"])
    put(img, 15, 10 + bob, P["cream"])
    return outline(img)


for i in range(4):
    add(f"spider_idle_anim_f{i}", spider(i, False))
    add(f"spider_run_anim_f{i}", spider(i, True))

# ═══════════════════════════════════════════════════════════════════
# 4) 바깥 지형 타일 (16x16) — 풀, 흙길, 돌바닥, 물
# ═══════════════════════════════════════════════════════════════════
def grass_tile(seed, base=None, dots=None, flowers=False):
    r = random.Random(seed)
    base = base or P["dkgreen"]
    dots = dots or (P["green"], P["grass0"])
    img = Image.new("RGBA", (16, 16), base)
    for _ in range(7):
        x, y = r.randrange(16), r.randrange(1, 16)
        put(img, x, y, dots[0]); put(img, x, y - 1, dots[0]) if r.random() < 0.6 else None
        put(img, (x + 1) % 16, y, dots[1])
    for _ in range(5):
        put(img, r.randrange(16), r.randrange(16), dots[1])
    if flowers:
        for _ in range(3):
            x, y = r.randrange(1, 15), r.randrange(1, 15)
            c = r.choice([P["yellow"], P["cream"], P["pink"], P["blue"]])
            put(img, x, y, c); put(img, x, y + 1, P["grass0"])
    return img


for i in range(4):
    add(f"t_grass_{i}", grass_tile(10 + i))
add("t_grass_flower_0", grass_tile(30, flowers=True))
add("t_grass_flower_1", grass_tile(31, flowers=True))
# 어두운 숲 풀
for i in range(2):
    add(f"t_dgrass_{i}", grass_tile(40 + i, base=P["grass0"], dots=(P["dkgreen"], hx("24443a"))))


def ground_tile(seed, base, spec):
    r = random.Random(seed)
    img = Image.new("RGBA", (16, 16), base)
    for c, n in spec:
        for _ in range(n):
            x, y = r.randrange(16), r.randrange(16)
            put(img, x, y, c)
            if r.random() < 0.4:
                put(img, (x + 1) % 16, y, c)
    return img


DIRT = (P["wood"], [(P["wooddk"], 10), (P["skin"], 6), (P["dkbrown"], 2)])
for i in range(2):
    add(f"t_dirt_{i}", ground_tile(50 + i, *DIRT))

# 흙길 테두리: 4방향 비트마스크 (1=N,2=E,4=S,8=W 이웃이 '풀'), 풀이 흙을 덮는 모양
def edge_overlay(mask, seed, col, shade):
    r = random.Random(seed)
    img = new(16, 16)
    for side in range(4):
        if not (mask >> side) & 1:
            continue
        for t in range(16):
            depth = 2 + (1 if r.random() < 0.45 else 0) - (1 if r.random() < 0.2 else 0)
            for d in range(depth):
                if side == 0: x, y = t, d
                elif side == 1: x, y = 15 - d, t
                elif side == 2: x, y = t, 15 - d
                else: x, y = d, t
                put(img, x, y, col)
            # 경계 아래 한 줄 그림자
            d = depth
            if side == 0: put(img, t, d, shade)
            elif side == 1: put(img, 15 - d, t, shade)
            elif side == 2: put(img, t, 15 - d, shade)
            else: put(img, d, t, shade)
    return img


for m in range(1, 16):
    add(f"e_grass_{m}", edge_overlay(m, 200 + m, P["dkgreen"], P["wooddk"]))

# 돌바닥 (마을 광장)
def cobble(seed):
    r = random.Random(seed)
    img = Image.new("RGBA", (16, 16), P["brown"])
    rows = [(0, 5), (5, 5), (10, 6)]
    for ri, (y0, h) in enumerate(rows):
        x = -r.randrange(0, 4) if ri % 2 else 0
        while x < 16:
            w = r.randrange(4, 7)
            c = r.choice([P["tan"], P["tan"], P["beige"]])
            rect(img, x + 1, y0 + 1, w - 1, h - 1, c)
            rect(img, x + 1, y0 + h - 1, w - 1, 1, P["brown"]) if False else None
            put(img, x + 1, y0 + 1, P["beige"])
            rect(img, x + 1, y0 + h - 1, w - 1, 1, hx("8f7a6a"))
            x += w
    return img


for i in range(2):
    add(f"t_cobble_{i}", cobble(70 + i))

# 물 (3프레임 반짝임)
def water(frame):
    img = Image.new("RGBA", (16, 16), P["steel"])
    r = random.Random(90)
    for k in range(5):
        x, y = r.randrange(16), r.randrange(16)
        xx = (x + frame * 2) % 16
        for d in range(3):
            put(img, (xx + d) % 16, y, P["blue"])
    r2 = random.Random(91 + frame)
    for k in range(2):
        put(img, r2.randrange(16), r2.randrange(16), P["cyan"])
    return img


for f in range(3):
    add(f"t_water_{f}", water(f))
# 물가: 물 위에 덮는 땅 가장자리
for m in range(1, 16):
    add(f"e_shore_{m}", edge_overlay(m, 300 + m, P["dkgreen"], P["navy"]))

# 붉은 균열 땅 / 용암 (보너스 지역용)
for i in range(2):
    add(f"t_ash_{i}", ground_tile(80 + i, hx("3b2a2a"), [(P["dkbrown"], 12), (P["wine"], 5), (P["dkred"], 2)]))
for f in range(3):
    img = Image.new("RGBA", (16, 16), P["red"])
    r = random.Random(95)
    for k in range(6):
        x, y = r.randrange(16), r.randrange(16)
        for d in range(3):
            put(img, (x + d + f) % 16, y, P["orange"])
    r2 = random.Random(96 + f)
    for k in range(3):
        put(img, r2.randrange(16), r2.randrange(16), P["yellow"])
    add(f"t_lava_{f}", img)
for m in range(1, 16):
    add(f"e_ashedge_{m}", edge_overlay(m, 400 + m, hx("3b2a2a"), P["dkred"]))

# ═══════════════════════════════════════════════════════════════════
# 5) 바깥 오브젝트 — 나무, 덤불, 바위, 울타리, 집, 표지판, 우물, 천막, 모닥불
# ═══════════════════════════════════════════════════════════════════
LEAF = (P["green"], P["dkgreen"], P["grass0"])


def tree(seed, leaf=LEAF, w=30, h=38, kind="round"):
    r = random.Random(seed)
    img = new(w, h)
    # 줄기
    tx = w // 2 - 2
    rect(img, tx, h - 13, 4, 12, P["wooddk"])
    rect(img, tx, h - 13, 1, 12, P["wood"])
    rect(img, tx + 3, h - 13, 1, 12, P["dkbrown"])
    rect(img, tx - 1, h - 2, 6, 1, P["wooddk"])
    if kind == "round":
        blobs = [(w / 2, 11, 10, 9), (w / 2 - 6, 16, 7, 6.5), (w / 2 + 6, 16, 7, 6.5), (w / 2, 18, 9, 6)]
        for (cx, cy, rx, ry) in blobs:
            ellipse(img, cx, cy, rx, ry, leaf)
        # 잎 하이라이트 점
        for _ in range(14):
            x, y = r.randrange(4, w - 4), r.randrange(3, 20)
            if img.getpixel((x, y))[3] and img.getpixel((x, y)) == leaf[1]:
                put(img, x, y, leaf[0])
        for _ in range(10):
            x, y = r.randrange(4, w - 4), r.randrange(10, 24)
            if img.getpixel((x, y))[3] and img.getpixel((x, y)) != P["wooddk"]:
                put(img, x, y, leaf[2])
    else:  # 침엽수
        cx = w / 2
        for i, (cy, rx) in enumerate(((8, 5), (14, 8), (20, 11))):
            for y in range(int(cy - 6), int(cy + 4)):
                span = rx * (y - (cy - 7)) / 10
                for x in range(int(cx - span), int(cx + span) + 1):
                    sh = (x - cx) / max(span, 1)
                    put(img, x, y, leaf[0] if sh < -0.45 else (leaf[2] if sh > 0.5 or y > cy + 2 else leaf[1]))
    return outline(img)


add("o_tree_0", tree(1))
add("o_tree_1", tree(2))
add("o_tree_dark", tree(3, leaf=(P["dkgreen"], P["grass0"], hx("1d3a2c"))))
add("o_pine_0", tree(4, leaf=(P["teal"], P["dkgreen"], P["grass0"]), w=26, h=36, kind="pine"))
add("o_tree_dead", (lambda: (lambda img: outline(img))(
    (lambda img: ([rect(img, 12, 8, 3, 22, P["dkbrown"]), rect(img, 12, 8, 1, 22, P["brown"]),
                   [put(img, 11 - k, 14 - k, P["dkbrown"]) for k in range(6)],
                   [put(img, 15 + k, 12 - k, P["dkbrown"]) for k in range(6)],
                   [put(img, 15 + k, 20 - k // 2, P["dkbrown"]) for k in range(5)]], img)[1])(new(26, 32))))())


def bush(seed, berries=False):
    img = new(16, 13)
    ellipse(img, 8, 7.5, 7, 5, LEAF)
    ellipse(img, 4.5, 8.5, 4, 3.5, LEAF)
    ellipse(img, 11.5, 8.5, 4, 3.5, LEAF)
    if berries:
        for (x, y) in ((5, 6), (9, 5), (11, 8), (7, 9)):
            put(img, x, y, P["red"])
    return outline(img)


add("o_bush_0", bush(1))
add("o_bush_1", bush(2, berries=True))


def rock(big):
    w, h = (20, 15) if big else (12, 9)
    img = new(w, h)
    ellipse(img, w / 2, h / 2 + 0.5, w / 2 - 0.6, h / 2 - 0.6, (P["ltgray"], P["gray"], P["navy"]))
    if big:
        put(img, 6, 5, P["ltgray"]); put(img, 7, 5, P["ice"])
        for k in range(4):
            put(img, 11 + k // 2, 4 + k, P["navy"])
    return outline(img)


add("o_rock_0", rock(False))
add("o_rock_1", rock(True))


def stump():
    img = new(14, 10)
    rect(img, 2, 3, 10, 6, P["wooddk"])
    rect(img, 2, 3, 2, 6, P["wood"])
    ellipse(img, 7, 3, 5, 2, (P["skin"], P["wood"], P["wooddk"]))
    put(img, 7, 3, P["wooddk"]); put(img, 6, 3, P["wooddk"])
    return outline(img)


add("o_stump", stump())


def fence_h():
    img = new(16, 12)
    for x in (1, 13):
        rect(img, x, 1, 2, 10, P["wood"]); put(img, x + 1, 1, P["skin"])
        rect(img, x + 1, 2, 1, 9, P["wooddk"])
    rect(img, 0, 3, 16, 2, P["wood"]); rect(img, 0, 4, 16, 1, P["wooddk"])
    rect(img, 0, 7, 16, 2, P["wood"]); rect(img, 0, 8, 16, 1, P["wooddk"])
    return outline(img)


add("o_fence_h", fence_h())
add("o_fence_v", outline((lambda img: ([rect(img, 6, 0, 3, 16, P["wood"]), rect(img, 8, 0, 1, 16, P["wooddk"]), put(img, 6, 0, P["skin"])], img)[1])(new(16, 16))))


def house(roof, wall=P["beige"], w=64, h=60, sign=None):
    img = new(w, h)
    wall_top = h - 26
    # 벽 (목조 + 회반죽)
    rect(img, 4, wall_top, w - 8, 25, wall)
    for x in range(4, w - 4, 12):
        rect(img, x, wall_top, 2, 25, P["wooddk"])
    rect(img, 4, wall_top, w - 8, 2, P["wooddk"])
    rect(img, 4, h - 3, w - 8, 2, P["dkbrown"])
    # 지붕 (사다리꼴 + 기와 줄)
    rl, rm, rd = roof
    for y in range(2, wall_top + 2):
        inset = max(0, (wall_top + 2 - y) // 3) if False else 0
        x0 = 1 + max(0, (8 - y)) // 2
        x1 = w - 2 - max(0, (8 - y)) // 2
        for x in range(x0, x1):
            c = rm
            if (y - 2) % 5 == 4:
                c = rd
            elif (x + (y // 5) * 3) % 6 == 0:
                c = rd
            elif (y - 2) % 5 == 0:
                c = rl
            put(img, x, y, c)
    rect(img, 0, wall_top + 1, w, 2, rd)
    # 굴뚝
    rect(img, w - 18, 0, 6, 8, P["brown"]); rect(img, w - 18, 0, 6, 1, P["tan"])
    # 문
    dx = w // 2 - 5
    rect(img, dx, h - 16, 10, 14, P["wooddk"])
    rect(img, dx + 1, h - 15, 8, 13, P["wood"])
    rect(img, dx + 4, h - 15, 1, 13, P["wooddk"])
    put(img, dx + 7, h - 9, P["yellow"])
    # 창문
    for wx in (10, w - 20):
        rect(img, wx, wall_top + 7, 10, 8, P["dkbrown"])
        rect(img, wx + 1, wall_top + 8, 8, 6, P["steel"])
        rect(img, wx + 1, wall_top + 8, 3, 2, P["cyan"])
        rect(img, wx + 5, wall_top + 8, 1, 6, P["dkbrown"])
        rect(img, wx + 1, wall_top + 11, 8, 1, P["dkbrown"])
        rect(img, wx - 1, wall_top + 15, 12, 2, P["wood"])
    if sign:
        sx, sc = sign
        rect(img, dx - 13, wall_top + 3, 10, 7, P["wood"])
        rect(img, dx - 12, wall_top + 4, 8, 5, P["skin"])
        rect(img, dx - 10, wall_top + 5, 4, 3, sc)
    return outline(img)


add("o_house_red", house((P["red"], P["dkred"], P["wine"])))
add("o_house_blue", house((P["blue"], P["steel"], P["navy"])))
add("o_house_green", house((P["teal"], P["dkgreen"], P["grass0"])))
add("o_shop", house((P["orange"], P["burnt"], P["dkred"]), sign=(0, P["yellow"])))
add("o_smithy", house((P["gray"], P["navy"], P["dknavy"]), wall=P["tan"], sign=(0, P["gray"])))
add("o_chapel", house((P["purple"], P["plum"], P["dknavy"]), wall=P["cream"], w=56, h=66, sign=(0, P["yellow"])))


def well():
    img = new(24, 28)
    # 지붕
    for y in range(0, 7):
        for x in range(3 + (6 - y) // 2, 21 - (6 - y) // 2):
            put(img, x, y, P["dkred"] if y % 3 == 2 else P["red"])
    rect(img, 4, 7, 2, 10, P["wooddk"]); rect(img, 18, 7, 2, 10, P["wooddk"])
    rect(img, 6, 9, 12, 1, P["dkbrown"])
    put(img, 12, 10, P["tan"]); put(img, 12, 11, P["wood"])
    # 돌 통
    rect(img, 2, 16, 20, 11, P["gray"])
    for y in (16, 20, 24):
        for x in range(2, 22, 5):
            rect(img, x + (2 if y == 20 else 0), y, 4, 3, P["ltgray"])
    rect(img, 4, 15, 16, 2, P["navy"])
    return outline(img)


add("o_well", well())


def signpost():
    img = new(16, 18)
    rect(img, 7, 6, 2, 12, P["wooddk"])
    rect(img, 1, 2, 14, 7, P["wood"])
    rect(img, 1, 8, 14, 1, P["wooddk"])
    for x in range(3, 13, 2):
        put(img, x, 5, P["dkbrown"])
    return outline(img)


add("o_sign", signpost())


def tent(col):
    img = new(32, 26)
    c0, c1, c2 = col
    for y in range(2, 25):
        half = (y - 1) * 0.65
        for x in range(int(16 - half), int(16 + half) + 1):
            c = c1 if x < 16 else c2
            if (x - 16) % 6 == 0:
                c = c0
            put(img, x, y, c)
    for y in range(12, 25):
        half = (y - 12) * 0.35
        for x in range(int(16 - half), int(16 + half) + 1):
            put(img, x, y, P["void"])
    rect(img, 15, 0, 2, 4, P["wooddk"])
    return outline(img)


add("o_tent", tent((P["beige"], P["tan"], P["brown"])))
add("o_tent_red", tent((P["red"], P["dkred"], P["wine"])))


def campfire(f):
    img = new(16, 16)
    rect(img, 2, 12, 12, 2, P["wooddk"]); rect(img, 4, 11, 8, 1, P["wood"])
    r = random.Random(500 + f)
    for y in range(3, 12):
        half = (y - 2) * 0.45
        for x in range(int(8 - half), int(8 + half) + 1):
            if r.random() < 0.85:
                put(img, x, y + (f % 2 if y < 6 else 0), P["yellow"] if abs(x - 8) < half * 0.4 and y > 6 else (P["orange"] if abs(x - 8) < half * 0.75 else P["red"]))
    for x in range(2, 14, 3):
        put(img, x, 14, P["gray"]); put(img, x + 1, 14, P["navy"])
    return outline(img)


for f in range(4):
    add(f"o_campfire_{f}", campfire(f))


def crypt_gate():
    img = new(48, 40)
    rect(img, 2, 8, 44, 31, P["gray"])
    for y in range(8, 39, 5):
        for x in range(2 + (3 if (y // 5) % 2 else 0), 46, 8):
            rect(img, x, y, 7, 4, P["ltgray"])
            rect(img, x, y + 3, 7, 1, P["navy"])
    # 지붕 삼각
    for y in range(0, 9):
        for x in range(24 - y * 3, 24 + y * 3):
            put(img, x, y, P["navy"] if y % 3 == 0 else P["gray"])
    # 입구 아치 (어둠 + 계단)
    for y in range(18, 39):
        for x in range(14, 34):
            dx = (x + 0.5 - 24) / 10
            dy = (y + 0.5 - 22) / 10
            if y >= 22 or dx * dx + dy * dy <= 1:
                put(img, x, y, P["void"])
    for k, y in enumerate(range(31, 39, 2)):
        rect(img, 16 + k, y, 16 - 2 * k, 1, P["dknavy"])
    put(img, 24, 4, P["cream"]); put(img, 23, 5, P["cream"]); put(img, 25, 5, P["cream"]); put(img, 24, 6, P["cream"])
    return outline(img)


add("o_crypt", crypt_gate())


def fort_gate():
    img = new(64, 48)
    rect(img, 0, 10, 64, 38, P["wooddk"])
    for x in range(0, 64, 6):
        rect(img, x, 6, 5, 42, P["wood"])
        rect(img, x + 4, 6, 1, 42, P["wooddk"])
        for k in range(3):
            put(img, x + 1 + k, 5 - k, P["wood"]) if k < 2 else put(img, x + 2, 3, P["skin"])
    rect(img, 0, 18, 64, 2, P["dkbrown"]); rect(img, 0, 36, 64, 2, P["dkbrown"])
    rect(img, 20, 22, 24, 26, P["void"])
    rect(img, 20, 22, 24, 2, P["dkbrown"])
    # 해골 깃발
    rect(img, 29, 10, 6, 6, P["cream"]); put(img, 30, 12, P["out"]); put(img, 33, 12, P["out"]); rect(img, 31, 15, 2, 1, P["out"])
    return outline(img)


add("o_fort", fort_gate())


def stall(col):
    img = new(40, 34)
    rect(img, 3, 10, 2, 22, P["wooddk"]); rect(img, 35, 10, 2, 22, P["wooddk"])
    for x in range(0, 40):
        c = col[0] if (x // 5) % 2 == 0 else P["cream"]
        rect(img, x, 2, 1, 9, c)
        put(img, x, 11 if (x // 5) % 2 == 0 else 10, c)
    rect(img, 0, 2, 40, 1, col[1])
    rect(img, 2, 22, 36, 8, P["wood"]); rect(img, 2, 22, 36, 1, P["skin"]); rect(img, 2, 29, 36, 1, P["wooddk"])
    for i, c in enumerate([P["red"], P["yellow"], P["lime"], P["orange"], P["red"], P["green"]]):
        ellipse(img, 7 + i * 5, 20, 2, 2, (c, c, P["dkbrown"]))
    return outline(img)


add("o_stall_red", stall((P["red"], P["dkred"])))
add("o_stall_blue", stall((P["blue"], P["steel"])))


def barrel():
    img = new(12, 15)
    ellipse(img, 6, 7.5, 5.5, 7, (P["wood"], P["wooddk"], P["dkbrown"]))
    rect(img, 1, 3, 10, 1, P["gray"]); rect(img, 0, 11, 12, 1, P["gray"])
    return outline(img)


add("o_barrel", barrel())


def gravestone(cross=False):
    img = new(12, 15)
    if cross:
        rect(img, 5, 1, 2, 13, P["gray"]); rect(img, 2, 4, 8, 2, P["gray"]); put(img, 5, 1, P["ltgray"])
    else:
        ellipse(img, 6, 6, 5, 5, (P["ltgray"], P["gray"], P["navy"]))
        rect(img, 1, 6, 10, 8, P["gray"]); rect(img, 1, 6, 2, 8, P["ltgray"]); rect(img, 9, 6, 2, 8, P["navy"])
        rect(img, 4, 6, 4, 1, P["navy"]); rect(img, 5, 5, 2, 5, P["navy"])
    rect(img, 0, 13, 12, 2, P["dkbrown"])
    return outline(img)


add("o_grave_0", gravestone())
add("o_grave_1", gravestone(True))


def statue():
    img = new(20, 34)
    rect(img, 2, 26, 16, 7, P["gray"]); rect(img, 2, 26, 16, 2, P["ltgray"])
    knight = FRAMES["knight_m_idle_anim_f0"]
    g = recolor(knight, {c: ("b6cbcf" if i % 2 else "7b8994") for i, c in enumerate(colors_of(knight)) if c != "222222"})
    paste(img, g, 2, 0)
    return outline(img)


add("o_statue", statue())

# 균열 지역용 수정 / 해골 더미
def crystal():
    img = new(14, 22)
    for (x0, h, c) in ((2, 12, P["plum"]), (5, 19, P["magenta"]), (9, 14, P["plum"])):
        for y in range(22 - h, 21):
            rect(img, x0, y, 4, 1, c)
        rect(img, x0 + 1, 22 - h, 2, 1, P["pink"]); rect(img, x0, 22 - h + 2, 1, h - 4, P["pink"])
    return outline(img)


add("o_crystal", crystal())

# ═══════════════════════════════════════════════════════════════════
# 6) 아이콘 (16x16) — 방어구·장신구·재화
# ═══════════════════════════════════════════════════════════════════
def icon_helm(c):
    img = new(16, 16)
    ellipse(img, 8, 8, 6, 6, c)
    rect(img, 2, 8, 12, 6, c[1])
    rect(img, 4, 9, 8, 2, P["out"])
    rect(img, 7, 9, 2, 5, c[1])
    rect(img, 2, 13, 12, 1, c[2])
    return outline(img)


def icon_armor(c):
    img = new(16, 16)
    rect(img, 3, 3, 10, 11, c[1])
    rect(img, 1, 3, 3, 5, c[0]); rect(img, 12, 3, 3, 5, c[2])
    rect(img, 6, 3, 4, 2, P["out"])
    rect(img, 4, 5, 3, 8, c[0]); rect(img, 3, 13, 10, 1, c[2])
    rect(img, 7, 6, 2, 7, c[2])
    return outline(img)


def icon_gloves(c):
    img = new(16, 16)
    rect(img, 3, 4, 7, 8, c[1]); rect(img, 3, 4, 2, 8, c[0])
    for i in range(3):
        rect(img, 4 + i * 2, 1, 2, 4, c[0] if i == 0 else c[1])
    rect(img, 10, 7, 3, 3, c[1])
    rect(img, 2, 12, 9, 3, c[2])
    return outline(img)


def icon_boots(c):
    img = new(16, 16)
    rect(img, 4, 2, 6, 10, c[1]); rect(img, 4, 2, 2, 10, c[0])
    rect(img, 4, 10, 10, 4, c[1]); rect(img, 4, 13, 10, 1, c[2])
    rect(img, 3, 2, 8, 2, c[2])
    return outline(img)


def icon_ring(gem):
    img = new(16, 16)
    for a in range(0, 360, 8):
        x = 8 + 4.5 * math.cos(math.radians(a)); y = 9.5 + 4 * math.sin(math.radians(a))
        put(img, int(x), int(y), P["yellow"] if a > 180 else P["orange"])
    ellipse(img, 8, 4.5, 2.5, 2.5, (P["cream"], gem, P["out"]))
    return outline(img)


def icon_amulet(gem):
    img = new(16, 16)
    for a in range(200, 340, 6):
        x = 8 + 6 * math.cos(math.radians(a)); y = 8 + 6 * math.sin(math.radians(a)) + 1
        put(img, int(x), int(y), P["yellow"])
    for k in range(5):
        put(img, 2 + k // 2, 8 + k, P["yellow"]); put(img, 13 - k // 2, 8 + k, P["yellow"])
    ellipse(img, 8, 12, 3, 3, (P["cream"], gem, P["out"]))
    return outline(img)


def icon_shield(c):
    img = new(16, 16)
    for y in range(1, 15):
        half = 6 if y < 9 else max(0, 6 - (y - 8))
        for x in range(8 - half, 8 + half):
            put(img, x, y, c[0] if x < 8 else c[1])
    rect(img, 7, 2, 2, 11, P["yellow"]); rect(img, 3, 6, 10, 2, P["yellow"])
    return outline(img)


def icon_book(c):
    img = new(16, 16)
    rect(img, 2, 2, 11, 13, c[1]); rect(img, 2, 2, 2, 13, c[2])
    rect(img, 12, 3, 2, 12, P["cream"]); rect(img, 12, 3, 2, 1, P["beige"])
    rect(img, 6, 5, 4, 4, P["yellow"]); put(img, 7, 6, c[0]); put(img, 8, 7, c[0])
    return outline(img)


def icon_soul():
    img = new(16, 16)
    for y in range(2, 15):
        half = (y - 1) * 0.5 if y < 8 else (15 - y) * 0.8
        for x in range(int(8 - half), int(8 + half) + 1):
            put(img, x, y, P["cyan"] if x < 8 else P["steel"])
    put(img, 7, 6, P["cream"]); put(img, 6, 7, P["ice"])
    return outline(img)


def icon_gold():
    img = new(16, 16)
    for (x, y) in ((4, 10), (9, 10), (6.5, 6.5), (11, 6), (3, 6)):
        ellipse(img, x + 1, y + 1, 3, 2.2, (P["gold2"], P["yellow"], P["orange"]))
    return outline(img)


def icon_scroll():
    img = new(16, 16)
    rect(img, 3, 3, 10, 10, P["beige"]); rect(img, 3, 3, 10, 1, P["cream"])
    rect(img, 2, 2, 12, 2, P["tan"]); rect(img, 2, 12, 12, 2, P["tan"])
    for y in (6, 8, 10):
        rect(img, 5, y, 6, 1, P["brown"])
    put(img, 8, 13, P["red"])
    return outline(img)


def icon_food():
    img = new(16, 16)
    ellipse(img, 7, 8, 5.5, 4.5, (P["skin"], P["wood"], P["wooddk"]))
    rect(img, 11, 10, 4, 2, P["cream"]); put(img, 14, 9, P["cream"]); put(img, 14, 12, P["cream"])
    return outline(img)


def icon_bomb():
    return FRAMES["bomb_f0"]


METAL = (P["ltgray"], P["gray"], P["navy"])
LEATHER = (P["wood"], P["wooddk"], P["dkbrown"])
CLOTH = (P["blue"], P["purple"], P["navy"])
GOLDC = (P["gold2"], P["yellow"], P["orange"])
for name, c in (("leather", LEATHER), ("iron", METAL), ("cloth", CLOTH), ("gold", GOLDC)):
    add(f"i_helm_{name}", icon_helm(c))
    add(f"i_armor_{name}", icon_armor(c))
    add(f"i_gloves_{name}", icon_gloves(c))
    add(f"i_boots_{name}", icon_boots(c))
add("i_shield_iron", icon_shield((P["gray"], P["navy"])))
add("i_shield_red", icon_shield((P["red"], P["dkred"])))
add("i_book_blue", icon_book((P["cyan"], P["purple"], P["navy"])))
add("i_book_red", icon_book((P["yellow"], P["red"], P["wine"])))
add("i_holy_book", icon_book((P["red"], P["cream"], P["tan"])))
add("i_quiver", outline((lambda img: ([rect(img, 4, 4, 6, 11, P["wooddk"]), rect(img, 4, 4, 2, 11, P["wood"]),
                                        [rect(img, 5 + k * 2, 1, 1, 4, P["beige"]) for k in range(3)],
                                        [put(img, 5 + k * 2, 0, P["red"]) for k in range(3)]], img)[1])(new(16, 16))))
for g, c in (("red", P["red"]), ("blue", P["blue"]), ("green", P["green"]), ("purple", P["purple"])):
    add(f"i_ring_{g}", icon_ring(c))
    add(f"i_amulet_{g}", icon_amulet(c))
add("i_soul", icon_soul())
add("i_gold", icon_gold())
add("i_scroll", icon_scroll())
add("i_food", icon_food())

# ═══════════════════════════════════════════════════════════════════
# 7) 투사체 · 이펙트 스프라이트
# ═══════════════════════════════════════════════════════════════════
def orb(c, f, r=3.2):
    img = new(12, 12)
    rr = r + (0.5 if f % 2 else 0)
    ellipse(img, 6, 6, rr + 1.5, rr + 1.5, (c[2], c[2], c[2]))
    ellipse(img, 6, 6, rr, rr, (c[0], c[1], c[1]))
    put(img, 5, 4, P["cream"])
    return img


for f in range(2):
    add(f"fx_orb_blue_{f}", orb((P["cyan"], P["blue"], (86, 152, 204, 110)), f))
    add(f"fx_orb_fire_{f}", orb((P["yellow"], P["orange"], (218, 78, 56, 130)), f, 3.6))
    add(f"fx_orb_holy_{f}", orb((P["cream"], P["yellow"], (250, 203, 62, 110)), f))
    add(f"fx_orb_dark_{f}", orb((P["pink"], P["plum"], (95, 45, 86, 140)), f))
    add(f"fx_orb_green_{f}", orb((P["lime"], P["green"], (75, 167, 71, 120)), f))


def ice_shard():
    img = new(12, 6)
    for x in range(12):
        half = 2.5 * (1 - abs(x - 4) / 8)
        for y in range(int(3 - half), int(3 + half) + 1):
            put(img, x, y, P["ice"] if y < 3 else P["cyan"])
    return outline(img)


add("fx_ice", ice_shard())

# ═══════════════════════════════════════════════════════════════════
# 패킹
# ═══════════════════════════════════════════════════════════════════
# ═══════════════════════════════════════════════════════════════════
# 8) 2장 실바넬의 썩은 숲 — 타락한 늑대, 숲정령, 드라이어드, 타락한 정령(보스)
# ═══════════════════════════════════════════════════════════════════
BLIGHT = {"7b8994": "5f2d56", "b6cbcf": "9f294e", "314152": "21141b"}
for k in ("idle", "run"):
    for i in range(4):
        add(f"blight_wolf_{k}_anim_f{i}", recolor(FRAMES[f"wolf_{k}_anim_f{i}"], BLIGHT))
        add(f"forest_spirit_{k}_anim_f{i}", recolor(FRAMES[f"wogol_{k}_anim_f{i}"], {"da4e38": "4ba747", "9f294e": "3d734f", "5f2d56": "2f5a40", "fdf7ed": "97da3f"}))
        # 보스: 거대 악마를 이끼·보라 독으로 다시 칠한다
        add(f"forest_lord_{k}_anim_f{i}", recolor(FRAMES[f"big_demon_{k}_anim_f{i}"], {"da4e38": "3d734f", "9f294e": "5f2d56", "fdf7ed": "97da3f"}))
DRYAD = {"fccba3": "b6e0a0", "d8a57d": "8cc47a", "e2b694": "a2d48c", "c38d70": "6aa35c",
         "facb3e": "c37bff", "ee8e2e": "8a4fc0", "c56025": "5f2d56", "4ba747": "49a790", "3d734f": "2f6a5a", "97da3f": "72d6ce",
         "5698cc": "dc4a7b", "417089": "9f294e"}
for n in anim_names("elf_f"):
    if n in FRAMES:
        add(n.replace("elf_f", "dryad"), recolor(FRAMES[n], DRYAD))


def pack(frames, width=1024):
    items = sorted(frames.items(), key=lambda kv: (-kv[1].height, kv[0]))
    x = y = 0
    row_h = 0
    pos = {}
    pad = 1
    for name, img in items:
        w, h = img.size
        if x + w + pad > width:
            x = 0
            y += row_h + pad
            row_h = 0
        pos[name] = (x, y, w, h)
        x += w + pad
        row_h = max(row_h, h)
    H = y + row_h
    H = 1 << (H - 1).bit_length()
    atlas = Image.new("RGBA", (width, H), CLEAR)
    for name, img in items:
        x, y, w, h = pos[name]
        atlas.paste(img, (x, y))
    return atlas, pos


atlas, pos = pack(FRAMES)
os.makedirs(OUT_DIR, exist_ok=True)
atlas.save(os.path.join(OUT_DIR, "atlas.png"), optimize=True)
with open(os.path.join(OUT_DIR, "atlas.json"), "w") as f:
    json.dump({k: list(v) for k, v in sorted(pos.items())}, f, separators=(",", ":"))
print(f"atlas {atlas.size}, {len(pos)} frames")
