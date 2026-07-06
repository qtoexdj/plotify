"""Genera los assets rasterizados de la marca Plotify desde los SVG fuente.

Uso: python3 brand/scripts/generate_assets.py

El script usa Quick Look en macOS para rasterizar SVGs y Pillow para derivar
tamaños, favicons e iconos PWA. Los SVG de brand/ son la fuente visual.
"""

import json
import pathlib
import shutil
import subprocess
import tempfile

from PIL import Image, ImageDraw

BRAND = pathlib.Path(__file__).resolve().parents[1]
REPO = BRAND.parent
DIST = BRAND / "dist"
WEB_APP = REPO / "apps" / "web" / "src" / "app"
WEB_ICONS = REPO / "apps" / "web" / "public" / "icons"

INK = (17, 17, 17, 255)
GREEN = (22, 163, 74, 255)
WHITE = (255, 255, 255, 255)
WHITE_TRANSPARENT = (255, 255, 255, 0)


def render_svg(svg_path: pathlib.Path, size: int) -> Image.Image:
    """Renderiza un SVG cuadrado usando Quick Look y devuelve RGBA."""
    with tempfile.TemporaryDirectory(prefix="plotify-brand-") as tmp:
        out_dir = pathlib.Path(tmp)
        subprocess.run(
            ["qlmanage", "-t", "-s", str(size), "-o", str(out_dir), str(svg_path)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        png_path = out_dir / f"{svg_path.name}.png"
        return Image.open(png_path).convert("RGBA")


def resize_square(image: Image.Image, size: int) -> Image.Image:
    return image.resize((size, size), Image.Resampling.LANCZOS)


def transparent_mark(image: Image.Image, dark: bool = False) -> Image.Image:
    """Quita el fondo blanco de Quick Look y normaliza colores de marca."""
    img = image.convert("RGBA")
    out = Image.new("RGBA", img.size, WHITE_TRANSPARENT)
    src = img.load()
    dst = out.load()
    layer_color = WHITE if dark else INK

    for y in range(img.height):
        for x in range(img.width):
            r, g, b, _ = src[x, y]
            if r > 250 and g > 250 and b > 250:
                continue

            is_green = g > r + 20 and g > b + 20 and g > 80
            source_fg = GREEN if is_green else INK
            output_fg = GREEN if is_green else layer_color
            alpha = 0
            for channel, foreground in zip((r, g, b), source_fg[:3]):
                denominator = 255 - foreground
                if denominator > 0:
                    alpha = max(alpha, int(round(255 * (255 - channel) / denominator)))
            alpha = max(0, min(255, alpha))
            dst[x, y] = (output_fg[0], output_fg[1], output_fg[2], alpha)

    return out


def render_mark(size: int, dark: bool = False) -> Image.Image:
    source = BRAND / "mark.svg"
    mark = transparent_mark(render_svg(source, max(size, 1024)), dark=dark)
    return resize_square(mark, size)


def tile(size: int, rounded: bool = True, radius_ratio: float = 0.22, symbol_scale: float = 0.72):
    img = Image.new("RGBA", (size, size), WHITE_TRANSPARENT)
    draw = ImageDraw.Draw(img)
    if rounded:
        draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=INK)
    else:
        draw.rectangle([0, 0, size, size], fill=INK)

    mark_size = int(size * symbol_scale)
    mark = render_mark(mark_size, dark=True)
    offset = (size - mark_size) // 2
    img.alpha_composite(mark, (offset, offset))
    return img


def save_png(image: Image.Image, path: pathlib.Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path)


def main():
    DIST.mkdir(exist_ok=True)
    WEB_ICONS.mkdir(parents=True, exist_ok=True)

    for size in (64, 128, 256, 512, 1024):
        save_png(render_mark(size), DIST / f"mark-{size}.png")
        save_png(render_mark(size, dark=True), DIST / f"mark-dark-{size}.png")
        save_png(tile(size), DIST / f"app-icon-{size}.png")

    for size in (16, 32, 48):
        save_png(tile(size, radius_ratio=0.18, symbol_scale=0.8), DIST / f"favicon-{size}.png")

    favicon = tile(256, radius_ratio=0.18, symbol_scale=0.8)
    favicon.save(DIST / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

    tile(180, rounded=False, symbol_scale=0.66).save(DIST / "apple-touch-icon.png")
    tile(192).save(DIST / "icon-192.png")
    tile(512).save(DIST / "icon-512.png")
    tile(512, rounded=False, symbol_scale=0.58).save(DIST / "icon-512-maskable.png")

    shutil.copy(DIST / "favicon.ico", WEB_APP / "favicon.ico")
    shutil.copy(DIST / "apple-touch-icon.png", WEB_APP / "apple-icon.png")
    shutil.copy(BRAND / "favicon.svg", WEB_APP / "icon.svg")
    for name in ("icon-192.png", "icon-512.png", "icon-512-maskable.png"):
        shutil.copy(DIST / name, WEB_ICONS / name)

    manifest = {
        "name": "Plotify",
        "short_name": "Plotify",
        "description": "Gestión de loteos, ventas y escrituras",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#FFFFFF",
        "theme_color": "#111111",
        "icons": [
            {"src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
            {
                "src": "/icons/icon-512-maskable.png",
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "maskable",
            },
        ],
    }
    (WEB_APP / "manifest.webmanifest").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(f"dist -> {DIST}")
    print(f"web  -> {WEB_APP / 'favicon.ico'}, icon.svg, apple-icon.png, manifest.webmanifest")
    print(f"pwa  -> {WEB_ICONS}")


if __name__ == "__main__":
    main()
