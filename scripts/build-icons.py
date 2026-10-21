"""앱 아이콘 에셋 생성기. 하트 한 개(투명 배경, 완전 플랫)에서 모든 아이콘을 같은 모양으로 만든다.

실행: python scripts/build-icons.py   (Pillow 필요)

만드는 것
- assets/icon/*.svg            SVG 원본 (앱 안 currentColor, 흑/백, 앱 아이콘, 랜딩 파비콘)
- public/icon.ico              Windows exe·탐색기 (16~256, 검은 하트 + 얇은 흰 윤곽선, 투명 배경)
- public/icon.icns, icon.png   맥 앱 아이콘 (같은 모양, 캔버스 안 하트 비율을 키움)
- public/tray/*.png            트레이 (흰/검정 16·32 + 두근 프레임, 맥 Template)
"""
import io
import os
import re
import struct
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, 'assets', 'icon')
PUB_DIR = os.path.join(ROOT, 'public')
TRAY_DIR = os.path.join(PUB_DIR, 'tray')

# 후보 1: 좌우 대칭, 통통한 하트 (viewBox 0 0 100 100 기준)
HEART_PATH = ('M50 90 C47 90 44 88 41 86 C22 72 6 56 6 34 C6 18 18 8 31 8 C40 8 47 13 50 20 '
              'C53 13 60 8 69 8 C82 8 94 18 94 34 C94 56 78 72 59 86 C56 88 53 90 50 90 Z')
BBOX = (6.0, 8.0, 94.0, 90.0)          # x0, y0, x1, y1 (경로 단위)
BBOX_W = BBOX[2] - BBOX[0]             # 88
CX, CY = (BBOX[0] + BBOX[2]) / 2, (BBOX[1] + BBOX[3]) / 2   # 50, 49


def parse_path(d):
    """M / C / Z만 쓰는 경로를 3차 베지어 구간 목록으로 바꾼다."""
    nums = [float(x) for x in re.findall(r'-?\d+(?:\.\d+)?', d)]
    start = (nums[0], nums[1])
    segs, cur, i = [], start, 2
    while i + 5 < len(nums) + 0 and i < len(nums):
        c1, c2, p = (nums[i], nums[i + 1]), (nums[i + 2], nums[i + 3]), (nums[i + 4], nums[i + 5])
        segs.append((cur, c1, c2, p)); cur = p; i += 6
    return segs


SEGS = parse_path(HEART_PATH)


def flatten(scale, cx, cy, steps=48):
    """경로 단위 → 캔버스 픽셀. bbox 중심을 (cx, cy)에 둔다."""
    pts = []
    for (p0, p1, p2, p3) in SEGS:
        for k in range(steps):
            t = k / steps; u = 1 - t
            x = u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0]
            y = u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1]
            pts.append(((x - CX) * scale + cx, (y - CY) * scale + cy))
    return pts


def supersample(n):
    return 16 if n <= 64 else 8 if n <= 256 else 4


def render(n, heart_w, outline=0.0, fill=(0, 0, 0), stroke=(255, 255, 255)):
    """n×n 투명 캔버스에 폭 heart_w(px)의 하트를 그린다. outline>0이면 바깥쪽으로 outline px 윤곽선."""
    ss = supersample(n)
    big = n * ss
    base = stroke if outline > 0 else fill        # 가장자리 번짐(검은 테두리) 방지: 투명 픽셀 색을 맞춘다
    img = Image.new('RGBA', (big, big), base + (0,))
    d = ImageDraw.Draw(img)
    scale = heart_w * ss / BBOX_W
    pts = flatten(scale, big / 2, big / 2)
    if outline > 0:
        d.polygon(pts, fill=stroke + (255,))
        d.line(pts + [pts[0]], fill=stroke + (255,), width=max(1, round(2 * outline * ss)), joint='curve')
    d.polygon(pts, fill=fill + (255,))
    return img.resize((n, n), Image.LANCZOS)


def win_icon(n):
    m = 0.02                                    # 캔버스 여백 2%
    o = max(n * 0.03, 1.0)                      # 얇은 흰 윤곽선 (작은 크기는 최소 1px)
    return render(n, n * (1 - 2 * m) - 2 * o, outline=o)


def mac_icon(n):
    m = 0.015                                   # 독에서 작아 보이지 않게 여백을 더 줄임
    o = n * 0.025
    return render(n, n * (1 - 2 * m) - 2 * o, outline=o)


def tray(px, color, beat=None):
    """트레이 평소는 캔버스의 87.5%, 두근 프레임은 그보다 커진다 (정수 크기라 흔들리지 않음)."""
    w = beat if beat else px * 14 // 16
    return render(px, w, fill=color)


def png_bytes(img):
    b = io.BytesIO(); img.save(b, 'PNG', optimize=True); return b.getvalue()


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    mode = 'wb' if isinstance(data, bytes) else 'w'
    with open(path, mode, **({} if mode == 'wb' else {'encoding': 'utf-8', 'newline': '\n'})) as f:
        f.write(data)


def build_ico(images):
    """PNG 압축 엔트리로 ICO를 만든다 (Vista 이후 전 크기 지원, 알파 유지)."""
    blobs = [png_bytes(im) for im in images]
    head = struct.pack('<HHH', 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries = b''
    for im, blob in zip(images, blobs):
        w = 0 if im.width >= 256 else im.width
        entries += struct.pack('<BBBBHHII', w, w, 0, 0, 1, 32, len(blob), offset)
        offset += len(blob)
    return head + entries + b''.join(blobs)


def build_icns(by_size):
    kinds = [('icp4', 16), ('icp5', 32), ('icp6', 64), ('ic07', 128), ('ic08', 256), ('ic09', 512), ('ic10', 1024),
             ('ic11', 32), ('ic12', 64), ('ic13', 256), ('ic14', 512)]
    body = b''
    for tag, size in kinds:
        blob = png_bytes(by_size[size])
        body += tag.encode() + struct.pack('>I', len(blob) + 8) + blob
    return b'icns' + struct.pack('>I', len(body) + 8) + body


def svg_app_icon():
    n, m, o = 1024, 0.015, 1024 * 0.025
    w = n * (1 - 2 * m) - 2 * o
    s = w / BBOX_W
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">\n'
            f'  <!-- 배경 없음(투명). 검은 하트 + 얇은 흰 윤곽선, 그라디언트·그림자 없음 -->\n'
            f'  <path d="{HEART_PATH}" fill="#000" stroke="#fff" stroke-width="{2 * o / s:.2f}" stroke-linejoin="round" '
            f'paint-order="stroke" transform="translate(512 512) scale({s:.4f}) translate(-{CX:g} -{CY:g})"/>\n</svg>\n')


def svg_heart(fill):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">\n'
            f'  <path d="{HEART_PATH}" fill="{fill}"/>\n</svg>\n')


def main():
    # SVG 원본
    write(os.path.join(SRC_DIR, 'heart.svg'), svg_heart('currentColor'))
    write(os.path.join(SRC_DIR, 'heart-black.svg'), svg_heart('#000'))
    write(os.path.join(SRC_DIR, 'heart-white.svg'), svg_heart('#fff'))
    write(os.path.join(SRC_DIR, 'app-icon.svg'), svg_app_icon())
    write(os.path.join(SRC_DIR, 'landing-favicon.svg'),
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n'
          '  <style>path{fill:#000}@media (prefers-color-scheme:dark){path{fill:#fff}}</style>\n'
          f'  <path d="{HEART_PATH}"/>\n</svg>\n')

    # Windows: ico (크기별로 따로 그려 선명하게)
    win = [win_icon(n) for n in (256, 128, 64, 48, 32, 24, 16)]
    write(os.path.join(PUB_DIR, 'icon.ico'), build_ico(win))

    # 맥: icns + png
    mac = {s: mac_icon(s) for s in (16, 32, 64, 128, 256, 512, 1024)}
    write(os.path.join(PUB_DIR, 'icon.icns'), build_icns(mac))
    write(os.path.join(PUB_DIR, 'icon.png'), png_bytes(mac[512]))
    write(os.path.join(SRC_DIR, 'app-icon-1024.png'), png_bytes(mac[1024]))

    # 트레이: 흰/검정 × 16·32, 두근 프레임 f1~f3 (평소 14 → 15 → 16 → 15)
    for name, color in (('black', (0, 0, 0)), ('white', (255, 255, 255))):
        for px in (16, 32):
            f = px // 16
            write(os.path.join(TRAY_DIR, f'tray-{name}-{px}.png'), png_bytes(tray(px, color)))
            for i, w in enumerate((15 * f, 16 * f, 15 * f), start=1):
                write(os.path.join(TRAY_DIR, f'tray-{name}-{px}-f{i}.png'), png_bytes(tray(px, color, beat=w)))
    # 맥 메뉴 막대: 검정 템플릿 (OS가 라이트/다크에 맞춰 자동 반전)
    write(os.path.join(TRAY_DIR, 'trayTemplate.png'), png_bytes(tray(16, (0, 0, 0))))
    write(os.path.join(TRAY_DIR, 'trayTemplate@2x.png'), png_bytes(tray(32, (0, 0, 0))))
    print('ok')


if __name__ == '__main__':
    sys.exit(main())
