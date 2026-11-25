#!/usr/bin/env python3
"""Ashen Crown 키 아트 — 사람 비율(7~8등신) 도트 캐릭터를 코드로 찍는다.

    python3 tools/keyart.py            → public/keyart.png (1920x1080), public/keyart_small.png (480x270 원본)

캐릭터는 관절(머리·어깨·팔꿈치·손목·골반·무릎·발목) 좌표로 자세를 잡고,
팔다리는 음영 캡슐, 몸통·망토·머리카락은 다각형으로 채운 뒤
부위 경계선 · 바깥 외곽선 · 균열의 붉은 역광(림 라이트)을 픽셀 단위로 넣는다.
"""
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public")
W, H = 480, 270
SCALE = 4
rnd = random.Random(7)


def hx(s):
    s = s.lstrip("#")
    return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)] + [255], dtype=np.float32)


def ramp(*cols):
    """밝음 → 어두움 순서의 색 단계"""
    return [hx(c) for c in cols]


OUTLINE = hx("140c12")
RIM = hx("ff6a3d")      # 오른쪽 뒤에서 비치는 균열의 붉은 빛
LIGHT = np.array([-0.55, -0.62, 0.56])
LIGHT /= np.linalg.norm(LIGHT)

# ── 재질 ────────────────────────────────────────────────────────────
SKIN = ramp("ffe3c8", "f2bc94", "cf8f68", "9a5f44", "5a3428")
SKIN_ORC = ramp("b8e07a", "7fbf52", "4f9440", "2f6534", "1b3b24")
SKIN_DEMON = ramp("e0c4f0", "b893d0", "8a66ad", "5d4380", "35244d")
STEEL = ramp("dfe7f0", "a7b5c6", "74849a", "4a5468", "262c3c")
GOLD = ramp("fff3b0", "facb3e", "e0942a", "a35a1e", "5e2e14")
RED_CLOTH = ramp("ff8a6a", "da4e38", "a7302a", "6e1c22", "3c0e16")
LEATHER = ramp("d9a877", "b07a4e", "835535", "573522", "301c14")
DARK_LEATHER = ramp("6a5a6e", "4a3c50", "33283a", "231b2a", "140e18")
GREEN_CLOTH = ramp("a8e07a", "6cb04a", "3d7d3a", "275430", "14301e")
TAN = ramp("efe0c0", "d3bfa0", "aa9078", "7a6250", "45362e")
WHITE_CLOTH = ramp("ffffff", "e8e4dc", "c2b9ac", "8c8276", "524a44")
PURPLE_ROBE = ramp("b48ae0", "7d55b8", "583a8c", "3a2560", "201438")
BLACK_CLOTH = ramp("5a5068", "3c3448", "2a2434", "1c1824", "0e0c14")
WOOD = ramp("e0b080", "b58057", "8a5a3a", "5c3a26", "331f16")
HAIR_BROWN = ramp("b07850", "8a5434", "643a24", "42261a", "24140e")
HAIR_BLOND = ramp("fff0a0", "f5cf58", "d39a34", "9a6424", "5a3818")
HAIR_RED = ramp("ffa070", "e05e34", "b03a22", "7a2418", "40120e")
HAIR_BLACK = ramp("5a5060", "3a3242", "26202e", "18141e", "0c0a10")
HAIR_WHITE = ramp("ffffff", "dfe4ee", "b4bccc", "7f879a", "474d5e")
BONE = ramp("fffaf0", "efe2c8", "cdb894", "8f7c60", "4e4234")
HORN = ramp("8a7c70", "5e5048", "40342e", "2a201c", "16100e")


class Layer:
    """캐릭터 한 명을 그리는 판. id 맵으로 부위 경계를 안다."""

    def __init__(self, w=200, h=200):
        self.w, self.h = w, h
        self.rgba = np.zeros((h, w, 4), np.float32)
        self.part = np.zeros((h, w), np.int32)
        self.pid = 0
        self.ox, self.oy = w // 2, h - 12  # 발 기준점
        self.grp = None  # 묶음 그리기 중이면 (h,w) bool

    def _put(self, mask, cols, x0, y0, edge=True, rim=True, rimside=1):
        """mask: (h,w) bool, cols: (h,w,4) — 부위를 찍고 가장자리 한 줄을 어둡게."""
        self.pid += 1
        hh, ww = mask.shape
        sl = (slice(y0, y0 + hh), slice(x0, x0 + ww))
        if self.grp is not None:
            # 묶음(팔·다리 하나) 안에서는 조각별 테두리 없이 칠하고, 끝날 때 묶음 전체에 테두리
            self.rgba[sl][mask] = cols[mask]
            self.grp[sl] |= mask
            self.part[sl][mask] = self.pid
            return
        if edge:
            m = mask
            inner = m.copy()
            inner[1:, :] &= m[:-1, :]
            inner[:-1, :] &= m[1:, :]
            inner[:, 1:] &= m[:, :-1]
            inner[:, :-1] &= m[:, 1:]
            border = m & ~inner
            # 부위 경계: 아래쪽·바깥쪽 경계만 진하게 (위쪽 경계는 밝은 면이라 살짝만)
            cols = cols.copy()
            dark = cols.copy()
            dark[..., :3] = cols[..., :3] * 0.45 + OUTLINE[:3] * 0.55
            cols[border] = dark[border]
            if rim:
                # 오른쪽(또는 왼쪽) 가장자리에 붉은 역광
                rm = m.copy()
                if rimside > 0:
                    rm[:, :-1] &= ~m[:, 1:]
                    rm[:, -1] = m[:, -1]
                else:
                    rm[:, 1:] &= ~m[:, :-1]
                    rm[:, 0] = m[:, 0]
                rm &= ~border | rm
                inner_rim = np.zeros_like(m)
                if rimside > 0:
                    inner_rim[:, :-1] = rm[:, 1:] & m[:, :-1]
                else:
                    inner_rim[:, 1:] = rm[:, :-1] & m[:, 1:]
                cols[inner_rim] = cols[inner_rim] * 0.45 + RIM * 0.55
        reg = self.rgba[sl]
        reg[mask] = cols[mask]
        self.part[sl][mask] = self.pid

    def begin(self):
        self.grp = np.zeros((self.h, self.w), bool)

    def end(self, rim=True):
        m = self.grp
        self.grp = None
        if m is None or not m.any():
            return
        inner = m.copy()
        inner[1:, :] &= m[:-1, :]
        inner[:-1, :] &= m[1:, :]
        inner[:, 1:] &= m[:, :-1]
        inner[:, :-1] &= m[:, 1:]
        border = m & ~inner
        c = self.rgba
        c[border, :3] = c[border, :3] * 0.45 + OUTLINE[:3] * 0.55
        if rim:
            edge_r = m.copy()
            edge_r[:, :-1] &= ~m[:, 1:]
            inside = np.zeros_like(m)
            inside[:, :-1] = edge_r[:, 1:] & m[:, :-1]
            c[inside, :3] = c[inside, :3] * 0.45 + RIM[:3] * 0.55

    def to(self, x, y):
        return self.ox + x, self.oy + y

    # ── 기본 도형 ────────────────────────────────────────────────
    def capsule(self, a, b, ra, rb, rmp, rim=True, rimside=1, bands=(0.62, 0.25, -0.12, -0.45)):
        ax, ay = self.to(*a)
        bx, by = self.to(*b)
        r = max(ra, rb) + 1
        x0, x1 = int(math.floor(min(ax, bx) - r)), int(math.ceil(max(ax, bx) + r))
        y0, y1 = int(math.floor(min(ay, by) - r)), int(math.ceil(max(ay, by) + r))
        ys, xs = np.mgrid[y0:y1 + 1, x0:x1 + 1].astype(np.float32) + 0.5
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy or 1e-6
        t = np.clip(((xs - ax) * dx + (ys - ay) * dy) / L2, 0, 1)
        cx, cy = ax + t * dx, ay + t * dy
        rr = ra + (rb - ra) * t
        vx, vy = (xs - cx) / rr, (ys - cy) / rr
        d2 = vx * vx + vy * vy
        mask = d2 <= 1.0
        nz = np.sqrt(np.clip(1 - d2, 0, 1))
        shade = vx * LIGHT[0] + vy * LIGHT[1] + nz * LIGHT[2]
        cols = self._shade(shade, rmp, bands, xs, ys)
        self._clip_put(mask, cols, x0, y0, rim=rim, rimside=rimside)

    def ellipse(self, c, rx, ry, rmp, rim=True, bands=(0.62, 0.25, -0.12, -0.45), rot=0.0):
        cx, cy = self.to(*c)
        r = max(rx, ry) + 1
        x0, x1, y0, y1 = int(cx - r), int(cx + r) + 1, int(cy - r), int(cy + r) + 1
        ys, xs = np.mgrid[y0:y1 + 1, x0:x1 + 1].astype(np.float32) + 0.5
        X, Y = xs - cx, ys - cy
        cr, sr = math.cos(rot), math.sin(rot)
        u, v = (X * cr + Y * sr) / rx, (-X * sr + Y * cr) / ry
        d2 = u * u + v * v
        mask = d2 <= 1
        nz = np.sqrt(np.clip(1 - d2, 0, 1))
        nx, ny = u * cr - v * sr, u * sr + v * cr
        shade = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]
        self._clip_put(mask, self._shade(shade, rmp, bands, xs, ys), x0, y0, rim=rim)

    def poly(self, pts, rmp, rim=True, bands=(0.55, 0.2, -0.15, -0.5), bulge=1.0, edge=True, rimside=1):
        P = [self.to(*p) for p in pts]
        xs_ = [p[0] for p in P]
        ys_ = [p[1] for p in P]
        x0, x1, y0, y1 = int(min(xs_)) - 1, int(max(xs_)) + 2, int(min(ys_)) - 1, int(max(ys_)) + 2
        im = Image.new("L", (x1 - x0 + 1, y1 - y0 + 1), 0)
        ImageDraw.Draw(im).polygon([(x - x0, y - y0) for x, y in P], fill=255)
        mask = np.array(im) > 0
        # 가짜 법선: 각 행의 왼·오른 끝, 위·아래 끝 대비 위치
        ys, xs = np.mgrid[y0:y1 + 1, x0:x1 + 1].astype(np.float32) + 0.5
        nx = np.zeros(mask.shape, np.float32)
        for r_ in range(mask.shape[0]):
            row = np.nonzero(mask[r_])[0]
            if len(row):
                l, rr = row[0], row[-1]
                c, hw = (l + rr) / 2, max(1, (rr - l) / 2)
                nx[r_] = (np.arange(mask.shape[1]) - c) / hw
        ny = np.zeros(mask.shape, np.float32)
        for c_ in range(mask.shape[1]):
            col = np.nonzero(mask[:, c_])[0]
            if len(col):
                t, b = col[0], col[-1]
                c, hh = (t + b) / 2, max(1, (b - t) / 2)
                ny[:, c_] = (np.arange(mask.shape[0]) - c) / hh * 0.6
        nx *= bulge
        d2 = np.clip(nx * nx + ny * ny, 0, 1)
        nz = np.sqrt(1 - d2)
        shade = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]
        self._clip_put(mask, self._shade(shade, rmp, bands, xs, ys), x0, y0, rim=rim, edge=edge, rimside=rimside)

    def line(self, a, b, col, w=1):
        """얇은 선 (활시위, 무늬)"""
        ax, ay = self.to(*a)
        bx, by = self.to(*b)
        n = int(max(abs(bx - ax), abs(by - ay))) + 1
        for i in range(n + 1):
            x = ax + (bx - ax) * i / n
            y = ay + (by - ay) * i / n
            for k in range(w):
                xi, yi = int(x) + (k if abs(by - ay) > abs(bx - ax) else 0), int(y) + (0 if abs(by - ay) > abs(bx - ax) else k)
                if 0 <= xi < self.w and 0 <= yi < self.h:
                    self.rgba[yi, xi] = col

    def px(self, x, y, col):
        xi, yi = self.to(x, y)
        xi, yi = int(xi), int(yi)
        if 0 <= xi < self.w and 0 <= yi < self.h:
            self.rgba[yi, xi] = col

    def _shade(self, shade, rmp, bands, xs, ys):
        # 단계 사이에는 체크무늬 디더 한 줄 (도트 그림의 질감)
        dith = ((xs.astype(int) + ys.astype(int)) % 2) * 0.06 - 0.03
        s = shade + dith
        idx = np.full(s.shape, 4, np.int32)
        idx[s > bands[3]] = 3
        idx[s > bands[2]] = 2
        idx[s > bands[1]] = 1
        idx[s > bands[0]] = 0
        arr = np.stack(rmp)
        return arr[idx]

    def _clip_put(self, mask, cols, x0, y0, rim=True, edge=True, rimside=1):
        hh, ww = mask.shape
        cx0, cy0 = max(0, -x0), max(0, -y0)
        cx1, cy1 = min(ww, self.w - x0), min(hh, self.h - y0)
        if cx1 <= cx0 or cy1 <= cy0:
            return
        self._put(mask[cy0:cy1, cx0:cx1], cols[cy0:cy1, cx0:cx1], x0 + cx0, y0 + cy0, edge=edge, rim=rim, rimside=rimside)

    def outline(self):
        a = self.rgba[..., 3] > 0
        o = np.zeros_like(a)
        o[1:, :] |= a[:-1, :]
        o[:-1, :] |= a[1:, :]
        o[:, 1:] |= a[:, :-1]
        o[:, :-1] |= a[:, 1:]
        o &= ~a
        self.rgba[o] = OUTLINE

    def image(self):
        return Image.fromarray(self.rgba.astype(np.uint8), "RGBA")


# ═══════════════════════════════════════════════════════════════════
# 몸 만들기
# ═══════════════════════════════════════════════════════════════════
BULK = 1.18


def limb(L, a, b, c, r0, r1, r2, rmp, rim=True):
    """어깨/골반 → 팔꿈치/무릎 → 손목/발목. 위팔·허벅지와 아래팔·종아리에 근육 볼륨을 준다."""
    r0, r1, r2 = r0 * BULK, r1 * BULK, r2 * BULK
    L.begin()
    L.capsule(a, b, r0, r1, rmp, rim=rim)
    m = (a[0] + (b[0] - a[0]) * 0.42, a[1] + (b[1] - a[1]) * 0.42)
    ang = math.atan2(b[1] - a[1], b[0] - a[0])
    seg = math.hypot(b[0] - a[0], b[1] - a[1])
    L.ellipse(m, seg * 0.34, r0 * 1.12, rmp, rim=rim, rot=ang)
    L.capsule(b, c, r1, r2, rmp, rim=rim)
    m2 = (b[0] + (c[0] - b[0]) * 0.3, b[1] + (c[1] - b[1]) * 0.3)
    ang2 = math.atan2(c[1] - b[1], c[0] - b[0])
    seg2 = math.hypot(c[0] - b[0], c[1] - b[1])
    L.ellipse(m2, seg2 * 0.3, r1 * 1.1, rmp, rim=rim, rot=ang2)
    L.end(rim)


def torso(L, sh_l, sh_r, waist_w, waist_y, hip_w, hip_y, rmp, chest_y=None, lean=0):
    sy = (sh_l[1] + sh_r[1]) / 2
    chest_y = chest_y if chest_y is not None else sy + 8
    cx = (sh_l[0] + sh_r[0]) / 2
    pts = [(sh_l[0], sh_l[1] + 1), (sh_r[0], sh_r[1] + 1),
           (sh_r[0] + 0.5, chest_y), (cx + waist_w + lean, waist_y), (cx + hip_w + lean, hip_y),
           (cx - hip_w + lean, hip_y), (cx - waist_w + lean, waist_y), (sh_l[0] - 0.5, chest_y)]
    L.poly(pts, rmp, bulge=1.1)
    return cx


def head(L, c, rx, ry, skin, hair, face_dir=1, eye="2a1a1e", ear=None, style="short", jaw=0.0):
    x, y = c
    rx, ry = rx * 1.08, ry * 1.06
    if style == "long":
        L.poly([(x - rx - 1, y - ry + 1), (x + rx + 1, y - ry + 1), (x + rx + 4 * -face_dir + 2, y + ry + 10), (x - rx - 3, y + ry + 12)], hair, bulge=0.8)
    if ear == "elf":
        ex = x - rx * face_dir * 0.6
        L.poly([(ex, y - 1), (ex - face_dir * 8, y - 6), (ex - face_dir * 1, y + 2)], skin, bulge=0.6)
    L.ellipse((x, y), rx, ry, skin)
    if jaw:
        L.ellipse((x + face_dir * 1, y + ry * 0.45), rx * (0.9 + jaw), ry * 0.55, skin, rim=False)
    # 눈 · 눈썹 · 코 그림자
    e = hx(eye)
    fx = x + face_dir * rx * 0.35
    if ear is None and style != "bald":
        L.ellipse((x - face_dir * rx * 0.55, y + 0.5), 1.4, 2.0, skin, rim=False)
    for ex_ in (fx, fx + face_dir * 3):
        L.px(ex_ - face_dir * 1, y - 0.5, hx("fdf7ed"))
        L.px(ex_, y - 0.5, e)
        L.px(ex_, y + 0.5, e * 0.6 + skin[3] * 0.4)
    L.px(fx, y - 2.5, skin[3])
    L.px(fx + face_dir * 3, y - 2.5, skin[3])
    L.px(fx + face_dir * 2, y + 2, skin[3])
    L.px(fx + face_dir * 1, y + 4.5, skin[3])
    L.px(fx + face_dir * 2, y + 4.5, skin[3])
    if hair is not None and style != "bald":
        top = [(x - rx - 1, y - 1), (x - rx, y - ry + 1), (x - rx * 0.3, y - ry - 2), (x + rx * 0.5, y - ry - 1.5), (x + rx + 1, y - ry + 2), (x + rx + 1, y - 2)]
        if face_dir > 0:
            top += [(x + rx * 0.6, y - ry * 0.45), (x - rx * 0.2, y - ry * 0.35), (x - rx * 0.4, y + 2)]
        else:
            top += [(x - rx * 0.6, y - ry * 0.45), (x + rx * 0.2, y - ry * 0.35), (x + rx * 0.4, y + 2)]
        L.poly(top, hair, bulge=0.9)


def boot(L, ankle, toe, rmp):
    L.capsule(ankle, toe, 2.6, 2.2, rmp)


def sword(L, grip, tip, blade=STEEL, glow=None):
    gx, gy = grip
    tx, ty = tip
    dx, dy = tx - gx, ty - gy
    n = math.hypot(dx, dy)
    ux, uy = dx / n, dy / n
    px_, py_ = -uy, ux
    # 칼날 (가운데 밝은 줄)
    base = (gx + ux * 6, gy + uy * 6)
    L.poly([(base[0] + px_ * 2.2, base[1] + py_ * 2.2), (tx, ty), (base[0] - px_ * 2.2, base[1] - py_ * 2.2)], blade, bulge=1.4)
    L.line((base[0], base[1]), (tx - ux * 3, ty - uy * 3), blade[0])
    if glow is not None:
        L.line((base[0] + px_ * 1, base[1] + py_ * 1), (tx - ux * 6 + px_, ty - uy * 6 + py_), glow)
    # 코등이 · 손잡이 · 폼멜
    L.capsule((gx + ux * 5 + px_ * 6, gy + uy * 5 + py_ * 6), (gx + ux * 5 - px_ * 6, gy + uy * 5 - py_ * 6), 1.6, 1.6, GOLD)
    L.capsule((gx - ux * 4, gy - uy * 4), (gx + ux * 4, gy + uy * 4), 1.4, 1.4, LEATHER)
    L.ellipse((gx - ux * 5, gy - uy * 5), 2, 2, GOLD)


# ═══════════════════════════════════════════════════════════════════
# 다섯 영웅
# ═══════════════════════════════════════════════════════════════════
def human_warrior():
    L = Layer(220, 200)
    # 붉은 망토 (몸 뒤)
    L.poly([(-11, -80), (9, -81), (6, -60), (-4, -26), (-30, -16), (-34, -30), (-22, -56)], RED_CLOTH, bulge=0.9)
    # 뒷다리 · 뒷팔
    limb(L, (-5, -52), (-12, -29), (-15, -6), 4.6, 3.6, 2.8, LEATHER)
    L.capsule((-12, -31), (-14, -8), 3.6, 3.0, STEEL)  # 정강이 갑옷
    boot(L, (-15, -5), (-22, -2), STEEL)
    limb(L, (-10, -80), (-15, -65), (-13, -52), 3.6, 3.0, 2.6, STEEL)
    L.ellipse((-13, -50), 2.6, 2.6, LEATHER)
    # 몸통 (판금 흉갑 + 허리띠 + 치마 갑옷)
    torso(L, (-11, -80), (11, -80), 7.5, -60, 9, -51, STEEL)
    L.poly([(-9, -60), (9, -60), (10, -56), (-10, -56)], LEATHER, bulge=0.6)
    L.ellipse((0, -58), 2, 1.6, GOLD)
    L.poly([(-10, -56), (10, -56), (12, -42), (2, -40), (-1, -44), (-11, -42)], RED_CLOTH, bulge=0.8)
    # 앞다리
    limb(L, (5, -52), (12, -29), (17, -6), 4.8, 3.6, 2.8, LEATHER)
    L.capsule((12, -31), (16, -8), 3.6, 3.0, STEEL)
    L.ellipse((12, -29), 3.2, 2.8, STEEL)
    boot(L, (17, -5), (25, -2), STEEL)
    # 목 · 머리
    L.capsule((0, -84), (1, -80), 2.8, 3.0, SKIN)
    head(L, (2, -92), 5.6, 7.0, SKIN, HAIR_BROWN, face_dir=1, jaw=0.05)
    # 어깨 갑옷
    L.ellipse((-11, -79), 5, 4, STEEL)
    L.ellipse((12, -79), 5.2, 4.2, STEEL)
    # 앞팔 + 큰 검 (오른쪽 아래로 비스듬히)
    limb(L, (11, -80), (18, -66), (16, -54), 3.6, 3.0, 2.6, STEEL)
    sword(L, (16, -55), (78, 4), STEEL, glow=hx("bff4ff"))
    L.ellipse((16, -54), 2.8, 2.8, LEATHER)
    L.outline()
    return L


def elf_archer():
    L = Layer(200, 200)
    # 긴 금발 (뒤로 흩날림)
    L.poly([(-4, -99), (6, -97), (16, -84), (22, -70), (14, -72), (8, -78), (2, -82)], HAIR_BLOND, bulge=0.8)
    # 뒷다리
    limb(L, (4, -52), (11, -29), (14, -6), 4.0, 3.2, 2.5, TAN)
    boot(L, (14, -6), (8, -2), LEATHER)
    L.capsule((11, -26), (14, -9), 3.4, 2.9, LEATHER)
    # 시위 당기는 팔 (뒤)
    limb(L, (8, -80), (17, -84), (5, -87), 3.0, 2.6, 2.2, GREEN_CLOTH)
    # 몸통 · 망토 짧게
    torso(L, (-9, -80), (8, -80), 6.0, -61, 7.5, -52, GREEN_CLOTH, lean=-0.5)
    L.poly([(-8, -61), (7, -61), (7, -58), (-8, -58)], LEATHER, bulge=0.5)
    L.poly([(-8, -58), (7, -58), (9, -44), (-10, -44)], GREEN_CLOTH, bulge=0.8)
    # 앞다리
    limb(L, (-4, -52), (-11, -29), (-16, -6), 4.2, 3.2, 2.5, TAN)
    L.capsule((-11, -27), (-15, -9), 3.4, 2.9, LEATHER)
    boot(L, (-16, -5), (-23, -2), LEATHER)
    # 머리 (왼쪽을 봄)
    L.capsule((-1, -84), (0, -80), 2.4, 2.6, SKIN)
    head(L, (-1, -92), 5.2, 6.8, SKIN, HAIR_BLOND, face_dir=-1, eye="3a6a2a", ear="elf")
    # 활 (왼쪽, 세워서)
    bow_x = -33
    top, bot = (bow_x + 4, -112), (bow_x + 4, -52)
    for i in range(24):
        t0, t1 = i / 24, (i + 1) / 24
        a0 = (bow_x - 4 * math.sin(math.pi * t0), top[1] + (bot[1] - top[1]) * t0)
        a1 = (bow_x - 4 * math.sin(math.pi * t1), top[1] + (bot[1] - top[1]) * t1)
        L.capsule(a0, a1, 1.5, 1.5, WOOD, rim=False)
    hand = (4, -87)
    L.line(top, hand, hx("e8e0d0"))
    L.line(hand, bot, hx("e8e0d0"))
    # 화살
    L.line(hand, (bow_x - 10, -82), hx("d3bfa0"))
    L.poly([(bow_x - 10, -84), (bow_x - 15, -82), (bow_x - 10, -80)], STEEL, bulge=0.5, rim=False)
    L.poly([(5, -89), (10, -88), (9, -86), (4, -86)], RED_CLOTH, bulge=0.5, rim=False)
    # 활 잡은 앞팔
    limb(L, (-9, -80), (-20, -81), (-31, -82), 3.0, 2.6, 2.2, GREEN_CLOTH)
    L.ellipse((-32, -82), 2.4, 2.6, LEATHER)
    L.ellipse(hand, 2.2, 2.2, LEATHER)
    L.ellipse((-9, -79), 3.6, 3.2, LEATHER)
    L.outline()
    return L


def dwarf_cleric():
    L = Layer(170, 170)
    # 성스러운 빛 (망치 뒤 후광은 합성 단계에서)
    # 뒷다리
    limb(L, (-6, -34), (-9, -18), (-10, -5), 5.2, 4.4, 3.6, LEATHER)
    boot(L, (-10, -4), (-17, -1), DARK_LEATHER)
    # 성서 든 뒷팔
    limb(L, (-12, -55), (-17, -44), (-15, -34), 4.4, 3.8, 3.2, STEEL)
    L.poly([(-20, -38), (-11, -39), (-11, -29), (-20, -28)], RED_CLOTH, bulge=0.5)
    L.poly([(-19, -37), (-12, -38), (-12, -30), (-19, -29)], WHITE_CLOTH, bulge=0.5, rim=False)
    # 몸통: 사슬 갑옷 + 흰 겉옷(금테)
    torso(L, (-13, -55), (13, -55), 12, -40, 12.5, -33, STEEL, chest_y=-49)
    L.poly([(-8, -54), (8, -54), (10, -22), (-10, -22)], WHITE_CLOTH, bulge=0.9)
    L.line((-8, -54), (-10, -22), GOLD[1])
    L.line((8, -54), (10, -22), GOLD[1])
    L.poly([(-2, -50), (2, -50), (2, -36), (-2, -36)], GOLD, bulge=0.4, rim=False)
    L.poly([(-6, -45), (6, -45), (6, -42), (-6, -42)], GOLD, bulge=0.4, rim=False)
    L.poly([(-12, -37), (12, -37), (13, -33), (-13, -33)], LEATHER, bulge=0.6)
    # 앞다리
    limb(L, (6, -34), (9, -18), (10, -5), 5.4, 4.4, 3.6, LEATHER)
    boot(L, (10, -4), (18, -1), DARK_LEATHER)
    # 머리: 투구 + 큰 붉은 수염
    head(L, (1, -63), 6.4, 6.6, SKIN, None, face_dir=1, style="bald", jaw=0.15)
    L.poly([(-5, -60), (9, -60), (12, -50), (7, -40), (1, -36), (-4, -42), (-7, -52)], HAIR_RED, bulge=1.0)
    L.poly([(0, -61), (3, -60), (9, -61), (8, -59), (1, -59)], HAIR_RED, bulge=0.5, rim=False)  # 콧수염
    L.poly([(-7, -66), (9, -66), (9, -72), (4, -76), (-3, -76), (-7, -72)], STEEL, bulge=1.0)
    L.poly([(-8, -67), (10, -67), (10, -65), (-8, -65)], GOLD, bulge=0.5, rim=False)
    L.poly([(4, -65), (6, -65), (6, -61), (4, -61)], STEEL, bulge=0.4, rim=False)  # 코가리개
    # 어깨
    L.ellipse((-12, -54), 5.5, 4.6, STEEL)
    L.ellipse((13, -54), 5.5, 4.6, STEEL)
    # 망치를 높이 든 앞팔
    limb(L, (12, -55), (19, -67), (17, -80), 4.4, 3.8, 3.2, STEEL)
    L.capsule((17, -76), (11, -112), 1.8, 1.8, WOOD)
    L.poly([(2, -118), (20, -114), (19, -104), (1, -108)], GOLD, bulge=1.2)
    L.poly([(4, -116), (18, -113), (17.5, -111), (3.5, -114)], hx("fff8d8").reshape(1, 4).repeat(5, 0), bulge=0.5, rim=False)
    L.ellipse((17, -79), 3.4, 3.4, DARK_LEATHER)
    L.outline()
    return L


def orc_mage():
    L = Layer(220, 220)
    # 불꽃을 든 뒷팔 (오른쪽 위로)
    limb(L, (13, -87), (23, -80), (27, -95), 4.4, 3.8, 3.2, SKIN_ORC)
    # 긴 로브 (다리 덮음)
    L.poly([(-15, -88), (15, -88), (17, -60), (20, -20), (24, -2), (-22, -2), (-19, -22), (-16, -60)], PURPLE_ROBE, bulge=1.0)
    # 로브 앞트임 · 금 장식 · 허리띠
    L.poly([(-2, -60), (3, -60), (6, -2), (-5, -2)], BLACK_CLOTH, bulge=0.6, rim=False)
    L.line((-2, -60), (-5, -3), GOLD[1])
    L.line((3, -60), (6, -3), GOLD[1])
    L.poly([(-16, -62), (16, -62), (16, -58), (-16, -58)], LEATHER, bulge=0.6)
    L.ellipse((0, -60), 2.5, 2.2, GOLD)
    boot(L, (-9, -3), (-16, -1), DARK_LEATHER)
    boot(L, (9, -3), (16, -1), DARK_LEATHER)
    # 뼈 목걸이 · 어깨 털
    L.poly([(-16, -90), (16, -90), (18, -82), (0, -76), (-18, -82)], HAIR_BLACK, bulge=0.9)
    for i, x in enumerate((-9, -4, 1, 6, 10)):
        L.poly([(x, -80), (x + 2, -80), (x + 1, -76 + (i % 2) * 2)], BONE, bulge=0.4, rim=False)
    # 머리: 초록 피부 · 엄니 · 검은 상투
    L.capsule((-1, -94), (0, -89), 3.6, 4.2, SKIN_ORC)
    head(L, (-1, -101), 6.4, 7.6, SKIN_ORC, None, face_dir=-1, eye="facb3e", style="bald", jaw=0.25)
    L.poly([(-4, -109), (3, -109), (6, -116), (2, -122), (-3, -118)], HAIR_BLACK, bulge=0.8)
    L.poly([(-1, -122), (3, -123), (8, -128), (2, -126)], HAIR_BLACK, bulge=0.6)
    L.poly([(-7, -96), (-6, -101), (-5, -96)], BONE, bulge=0.3, rim=False)
    L.poly([(-2, -96), (-1, -100), (0, -96)], BONE, bulge=0.3, rim=False)
    # 지팡이 든 앞팔 (왼쪽)
    L.capsule((-28, -2), (-28, -126), 2.0, 2.0, WOOD)
    L.poly([(-34, -126), (-22, -126), (-24, -132), (-28, -136), (-32, -132)], BONE, bulge=0.8)
    limb(L, (-13, -87), (-23, -76), (-27, -66), 4.6, 4.0, 3.4, SKIN_ORC)
    L.ellipse((-27, -66), 3.6, 3.4, SKIN_ORC)
    L.ellipse((27, -96), 3.4, 3.4, SKIN_ORC)
    L.ellipse((-13, -86), 6, 5, HAIR_BLACK)
    L.outline()
    return L


def demon_rogue():
    L = Layer(220, 180)
    # 꼬리
    pts = [(10, -36), (22, -30), (32, -20), (38, -10), (44, -12)]
    for a, b in zip(pts, pts[1:]):
        L.capsule(a, b, 2.0, 1.6, SKIN_DEMON)
    L.poly([(42, -16), (50, -12), (43, -8)], DARK_LEATHER, bulge=0.5)
    # 붉은 목도리 (뒤로 길게)
    L.poly([(6, -74), (12, -72), (34, -78), (46, -72), (30, -70), (14, -66)], RED_CLOTH, bulge=0.7)
    # 뒷다리 (뒤로 쭉 뻗음)
    limb(L, (6, -40), (17, -22), (29, -5), 4.4, 3.4, 2.6, PURPLE_ROBE)
    boot(L, (29, -4), (34, -1), DARK_LEATHER)
    # 뒷팔 (단검을 역수로 높이)
    limb(L, (8, -70), (18, -62), (25, -71), 3.2, 2.8, 2.3, DARK_LEATHER)
    L.poly([(25, -74), (27, -72), (33, -90), (30, -91)], SKIN_DEMON, bulge=1.0)
    L.poly([(23, -71), (28, -69), (28, -71), (23, -73)], GOLD, bulge=0.5, rim=False)
    # 몸통 (앞으로 숙임)
    L.poly([(-11, -71), (8, -73), (9, -62), (6, -50), (7, -40), (-6, -40), (-8, -50), (-12, -62)], DARK_LEATHER, bulge=1.1)
    L.line((-2, -71), (0, -41), RED_CLOTH[2])
    L.poly([(-7, -44), (8, -44), (8, -40), (-7, -40)], RED_CLOTH, bulge=0.5)
    # 앞다리 (무릎 굽힘)
    limb(L, (-4, -40), (-18, -27), (-19, -5), 4.6, 3.4, 2.6, PURPLE_ROBE)
    boot(L, (-19, -4), (-26, -1), DARK_LEATHER)
    # 머리: 보라 피부 · 흰 머리 · 뿔
    L.capsule((-3, -75), (-2, -71), 2.4, 2.6, SKIN_DEMON)
    L.poly([(-1, -90), (5, -88), (9, -80), (6, -74), (2, -78)], HAIR_WHITE, bulge=0.8)  # 뒤로 넘긴 머리
    head(L, (-4, -82), 5.2, 6.6, SKIN_DEMON, None, face_dir=-1, eye="ff3a3a", style="bald")
    L.poly([(-9, -86), (-1, -90), (4, -88), (2, -85), (-4, -86), (-8, -83)], HAIR_WHITE, bulge=0.7)  # 앞머리
    for pts_ in (((-5, -87), (-6, -92), (-3, -97), (2, -99)), ((0, -88), (2, -93), (6, -96), (11, -96))):
        for a_, b_, ra_, rb_ in zip(pts_, pts_[1:], (1.9, 1.5, 1.1), (1.5, 1.1, 0.6)):
            L.capsule(a_, b_, ra_, rb_, HORN, rim=False)
    # 앞팔 (단검을 앞으로 찌름)
    limb(L, (-10, -70), (-21, -63), (-31, -60), 3.2, 2.8, 2.3, DARK_LEATHER)
    L.poly([(-34, -61), (-34, -58), (-50, -60)], SKIN_DEMON, bulge=1.2)
    L.poly([(-33, -63), (-31, -63), (-31, -56), (-33, -56)], GOLD, bulge=0.5, rim=False)
    L.ellipse((-31, -60), 2.3, 2.3, DARK_LEATHER)
    L.ellipse((25, -71), 2.2, 2.2, DARK_LEATHER)
    L.outline()
    return L


# ═══════════════════════════════════════════════════════════════════
# 배경
# ═══════════════════════════════════════════════════════════════════
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0


def lerp(a, b, t):
    return a + (b - a) * t


def background():
    img = np.zeros((H, W, 4), np.float32)
    img[..., 3] = 255
    sky = [(0.0, hx("120c1c")), (0.35, hx("2a1630")), (0.58, hx("5a2238")), (0.72, hx("a8402e")), (0.82, hx("e8853a")), (0.9, hx("ffc26a"))]
    ys, xs = np.mgrid[0:H, 0:W]
    t = ys / (H * 0.82)
    # 4색 단계로 끊고 Bayer 디더로 섞는다
    for i in range(len(sky) - 1):
        t0, c0 = sky[i]
        t1, c1 = sky[i + 1]
        m = (t >= t0) & (t < t1)
        k = (t - t0) / (t1 - t0)
        q = np.floor(k * 4 + BAYER[ys % 4, xs % 4]) / 4
        q = np.clip(q, 0, 1)
        img[m] = (c0 + (c1 - c0) * q[..., None])[m]
    img[t >= 0.9] = sky[-1][1]
    # 잿빛 해
    cx, cy, r = 240, 160, 34
    d = np.hypot(xs - cx, ys - cy)
    glow = np.clip(1 - (d - r) / 70, 0, 1)
    gq = np.floor(glow * 5 + BAYER[ys % 4, xs % 4]) / 5
    img[..., :3] = img[..., :3] + (hx("ffb060")[:3] - img[..., :3]) * (gq[..., None] * 0.55)
    img[d < r] = hx("ffe2a0")
    img[(d < r) & (d > r - 3)] = hx("ffc878")
    # 붉은 균열 (오른쪽 하늘)
    crack = [(372, 18), (390, 40), (382, 62), (404, 84), (396, 108), (420, 128)]
    cimg = Image.new("L", (W, H), 0)
    cd = ImageDraw.Draw(cimg)
    cd.line(crack, fill=255, width=9)
    halo = np.array(cimg.filter(__import__("PIL.ImageFilter", fromlist=["GaussianBlur"]).GaussianBlur(10))) / 255.0
    hq = np.floor(halo * 6 + BAYER[ys % 4, xs % 4]) / 6
    img[..., :3] = img[..., :3] + (hx("ff3a48")[:3] - img[..., :3]) * (np.clip(hq, 0, 1)[..., None] * 0.7)
    core = Image.new("L", (W, H), 0)
    ImageDraw.Draw(core).line(crack, fill=255, width=3)
    img[np.array(core) > 0] = hx("ffd0b0")
    core2 = Image.new("L", (W, H), 0)
    ImageDraw.Draw(core2).line(crack, fill=255, width=1)
    img[np.array(core2) > 0] = hx("ffffff")
    return img


def silhouette(img, pts, col):
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    img[np.array(m) > 0] = col


def ruins(img):
    # 먼 산
    pts = [(0, 186)]
    x = 0
    r = random.Random(3)
    while x < W:
        x += r.randint(10, 26)
        pts.append((x, 168 + r.randint(-14, 10)))
    pts += [(W, 200), (0, 200)]
    silhouette(img, pts, hx("4a1e30"))
    # 무너진 왕도 성벽과 탑
    col = hx("24141e")
    silhouette(img, [(0, 250), (0, 188), (60, 186), (64, 176), (72, 176), (74, 186), (140, 184), (W, 186), (W, 250)], col)
    # 성벽 아래 흙먼지 띠 (해 쪽이 밝다)
    for x in range(W):
        yb = 200 + int(3 * math.sin(x / 9))
        img[yb:yb + 1, x] = hx('3a1e28')
    towers = [(40, 150, 16), (96, 160, 12), (150, 136, 14), (330, 138, 16), (382, 156, 12), (440, 146, 18)]
    for tx, ty, tw in towers:
        silhouette(img, [(tx - tw // 2, 190), (tx - tw // 2, ty), (tx - tw // 2 - 2, ty - 2), (tx - tw // 2 - 2, ty - 6),
                         (tx - tw // 2 + 2, ty - 6), (tx - tw // 2 + 2, ty - 3), (tx - 1, ty - 3), (tx - 1, ty - 6), (tx + 3, ty - 6),
                         (tx + 3, ty - 3), (tx + tw // 2, ty - 3 - (tw % 5)), (tx + tw // 2, 190)], col)
        for k in range(2):  # 불 켜진 창
            wx, wy = tx - 2 + k * 4, ty + 10 + k * 9
            img[wy:wy + 3, wx:wx + 2] = hx("ff8a3a")
    # 가운데: 부서진 왕관 모양 첨탑 (해 앞)
    cx = 240
    silhouette(img, [(cx - 30, 190), (cx - 22, 120), (cx - 26, 112), (cx - 18, 116), (cx - 12, 96), (cx - 6, 112), (cx, 84),
                     (cx + 6, 110), (cx + 12, 98), (cx + 16, 108), (cx + 24, 104), (cx + 20, 122), (cx + 28, 190)], hx("1c1018"))
    # 왕관 테두리 금빛
    edge = [(cx - 22, 120), (cx - 26, 112), (cx - 18, 116), (cx - 12, 96), (cx - 6, 112), (cx, 84), (cx + 6, 110), (cx + 12, 98), (cx + 16, 108), (cx + 24, 104)]
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).line(edge, fill=255, width=1)
    img[np.array(m) > 0] = hx("ffb848")
    for (gx, gy) in [(cx, 92), (cx - 12, 103), (cx + 12, 105)]:
        img[gy - 1:gy + 2, gx - 1:gx + 2] = hx("ff6a3d")
        img[gy, gx] = hx("ffe2a0")


def ground(img):
    # 영웅들이 선 바위 언덕
    r = random.Random(11)
    top = []
    for x in range(0, W + 1, 6):
        base = 236 + 10 * math.sin(x / 70) - 14 * math.exp(-((x - 240) / 110) ** 2)
        top.append((x, int(base + r.randint(-2, 2))))
    pts = top + [(W, H), (0, H)]
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    mask = np.array(m) > 0
    ys, xs = np.mgrid[0:H, 0:W]
    shade = np.clip((ys - 220) / 50, 0, 1)
    q = np.floor(shade * 3 + BAYER[ys % 4, xs % 4]) / 3
    c0, c1 = hx("3a2430"), hx("140c12")
    g = c0 + (c1 - c0) * q[..., None]
    img[mask] = g[mask]
    # 윗면 테두리 (해와 균열 빛)
    edge = Image.new("L", (W, H), 0)
    ImageDraw.Draw(edge).line(top, fill=255, width=1)
    em = np.array(edge) > 0
    img[em] = hx("b4532e")
    # 바위 무늬
    for _ in range(60):
        x, y = r.randint(0, W - 8), r.randint(236, H - 4)
        if mask[y, x]:
            img[y, x:x + r.randint(2, 6)] = hx("4e3040")


def particles(img, back=True):
    r = random.Random(5 if back else 6)
    for _ in range(140 if back else 60):
        x, y = r.randint(0, W - 1), r.randint(0, H - 1)
        c = hx("ff9a4a") if r.random() < 0.35 else hx("c8b8c0")
        if not back:
            c = hx("ffd070") if r.random() < 0.5 else hx("ff6a3d")
        img[y, x] = c
        if r.random() < 0.3 and y + 1 < H:
            img[y + 1, x] = c * 0.7 + img[y + 1, x] * 0.3


def paste(img, layer: Layer, fx, fy, flip=False):
    a = layer.rgba
    if flip:
        a = a[:, ::-1]
    lx = int(fx - (layer.w - layer.ox if flip else layer.ox))
    ly = int(fy - layer.oy)
    for yy in range(a.shape[0]):
        Y = ly + yy
        if not 0 <= Y < H:
            continue
        row = a[yy]
        on = row[:, 3] > 0
        for xx in np.nonzero(on)[0]:
            X = lx + xx
            if 0 <= X < W:
                img[Y, X] = row[xx]


def shadow(img, x, y, rx):
    for yy in range(-2, 3):
        for xx in range(-rx, rx + 1):
            if (xx / rx) ** 2 + (yy / 2.5) ** 2 <= 1:
                X, Y = int(x + xx), int(y + yy)
                if 0 <= X < W and 0 <= Y < H:
                    img[Y, X, :3] *= 0.55


def glow(img, x, y, r, col, strength=0.8):
    ys, xs = np.mgrid[0:H, 0:W]
    d = np.hypot(xs - x, ys - y)
    g = np.clip(1 - d / r, 0, 1) ** 1.6
    q = np.floor(g * 5 + BAYER[ys % 4, xs % 4]) / 5
    c = hx(col)
    img[..., :3] = img[..., :3] + (c[:3] - img[..., :3]) * (np.clip(q, 0, 1)[..., None] * strength)


def flame(img, x, y, size):
    r = random.Random(int(x * 7 + y))
    for k in range(int(size * 14)):
        a = r.random() * math.pi * 2
        d = r.random() ** 1.5 * size
        px_, py_ = int(x + math.cos(a) * d * 0.8), int(y + math.sin(a) * d - (size - d) * 0.6)
        c = hx("fff4c0") if d < size * 0.3 else hx("ffb43a") if d < size * 0.6 else hx("e8532e")
        if 0 <= px_ < W and 0 <= py_ < H:
            img[py_, px_] = c


def title(img):
    font_path = os.path.join(HERE, "src", "Galmuri11-Bold.ttf")
    ko_path = os.path.join(HERE, "src", "Galmuri11.ttf")
    big = ImageFont.truetype(font_path, 33)
    small = ImageFont.truetype(ko_path, 11)
    text = "ASHEN CROWN"
    m = Image.new("L", (W, 60), 0)
    d = ImageDraw.Draw(m)
    bbox = d.textbbox((0, 0), text, font=big)
    tw = bbox[2] - bbox[0]
    x0 = (W - tw) // 2
    d.text((x0, 4), text, font=big, fill=255)
    mask = np.array(m) > 128
    rows = np.nonzero(mask.any(1))[0]
    top, bot = rows[0], rows[-1]
    oy = 16
    # 그림자 → 외곽선 → 금색 세로 그라데이션
    for dy, dx, col in ((3, 3, hx("1a0c10")), (-1, 0, hx("3a1410")), (1, 0, hx("3a1410")), (0, -1, hx("3a1410")), (0, 1, hx("3a1410")),
                        (-1, -1, hx("3a1410")), (1, 1, hx("3a1410")), (-1, 1, hx("3a1410")), (1, -1, hx("3a1410"))):
        ys, xs = np.nonzero(mask)
        Y, X = ys + oy + dy, xs + dx
        ok = (Y >= 0) & (Y < H) & (X >= 0) & (X < W)
        img[Y[ok], X[ok]] = col
    ys, xs = np.nonzero(mask)
    t = (ys - top) / max(1, bot - top)
    cols = [hx("fff6c8"), hx("ffd864"), hx("f0a83a"), hx("c26a24")]
    idx = np.clip((t * 4 + BAYER[ys % 4, xs % 4] * 0.9).astype(int), 0, 3)
    for i in range(4):
        sel = idx == i
        img[ys[sel] + oy, xs[sel]] = cols[i]
    # 부제 (한글)
    sub = "잿 빛  왕 관"
    m2 = Image.new("L", (W, 20), 0)
    d2 = ImageDraw.Draw(m2)
    b2 = d2.textbbox((0, 0), sub, font=small)
    d2.text(((W - (b2[2] - b2[0])) // 2, 2), sub, font=small, fill=255)
    mk = np.array(m2) > 128
    sy = oy + bot + 8
    ys, xs = np.nonzero(mk)
    for dy, dx in ((1, 1), (-1, 0), (1, 0), (0, -1), (0, 1)):
        img[ys + sy + dy, xs + dx] = hx("1a0c10")
    img[ys + sy, xs] = hx("fdf7ed")
    # 장식 선
    cy = sy + 7
    for x in range(W // 2 - 70, W // 2 - 34):
        img[cy, x] = hx("c26a24")
    for x in range(W // 2 + 34, W // 2 + 70):
        img[cy, x] = hx("c26a24")
    img[cy - 1:cy + 2, W // 2 - 72:W // 2 - 70] = hx("ffd864")
    img[cy - 1:cy + 2, W // 2 + 70:W // 2 + 72] = hx("ffd864")


def vignette(img):
    ys, xs = np.mgrid[0:H, 0:W]
    d = np.hypot((xs - W / 2) / (W / 2), (ys - H / 2) / (H / 2))
    v = np.clip((d - 0.75) / 0.6, 0, 1)
    q = np.floor(v * 4 + BAYER[ys % 4, xs % 4]) / 4
    img[..., :3] *= (1 - np.clip(q, 0, 1)[..., None] * 0.55)


def main():
    img = background()
    ruins(img)
    particles(img, back=True)
    ground(img)
    # 마법 빛 (캐릭터 뒤)
    glow(img, 193, 146, 40, "fff0a0", 0.45)  # 드워프 망치 성광
    glow(img, 411, 140, 30, "ff8a3a", 0.5)   # 오크 손 불꽃
    glow(img, 356, 100, 26, "ff8a3a", 0.4)   # 오크 지팡이
    heroes = [
        (elf_archer(), 132, 236, False),
        (orc_mage(), 384, 234, False),
        (human_warrior(), 236, 246, False),
        (dwarf_cleric(), 184, 258, False),
        (demon_rogue(), 326, 258, False),
    ]
    for L, x, y, fl in sorted(heroes, key=lambda h: h[2]):
        shadow(img, x, y, 16)
        paste(img, L, x, y, fl)
    # 앞쪽 효과: 불꽃, 성광 반짝이, 단검 잔광
    flame(img, 411, 140, 7)   # 오크 손바닥 불꽃
    flame(img, 356, 101, 5)   # 지팡이 끝
    for k in range(14):
        a = k / 14 * math.pi * 2
        x, y = int(194 + math.cos(a) * 20), int(146 + math.sin(a) * 9)
        if 0 <= x < W and 0 <= y < H:
            img[y, x] = hx("fff4c0")
    particles(img, back=False)
    title(img)
    vignette(img)
    out = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGBA").convert("RGB")
    os.makedirs(OUT, exist_ok=True)
    out.save(os.path.join(OUT, "keyart_small.png"))
    out.resize((W * SCALE, H * SCALE), Image.NEAREST).save(os.path.join(OUT, "keyart.png"), optimize=True)
    print("keyart saved", out.size)


if __name__ == "__main__":
    main()
