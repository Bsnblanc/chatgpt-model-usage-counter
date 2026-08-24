from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "icons"
SUPERSAMPLE = 8

# Restrained publishing palette derived from bsnblanc.com:
# near-black ink, warm paper, and one high-chroma editorial blue.
INK = (18, 18, 20, 255)
INK_EDGE = (55, 55, 60, 255)
PAPER = (247, 244, 236, 255)
COBALT = (24, 24, 255, 255)

FULL_SIZES = (16, 20, 24, 32, 48, 128)
ACTION_SIZES = (16, 20, 24, 32, 48)


def scaled_box(box, scale):
    return tuple(round(value * scale) for value in box)


def rounded(draw, box, radius, fill, scale):
    draw.rounded_rectangle(
        scaled_box(box, scale),
        radius=round(radius * scale),
        fill=fill,
    )


def ellipse_outline(draw, box, width, fill, scale):
    draw.ellipse(
        scaled_box(box, scale),
        outline=fill,
        width=max(1, round(width * scale)),
    )


def draw_brand_mark(size, *, toolbar=False):
    """Render the bsnblanc usage-counter mark at its final requested size.

    The warm-white stem and bowl form a geometric lowercase "b"; the three
    cobalt columns inside the bowl express model-usage counting. Toolbar icons
    use a slightly fuller optical drawing, not a shrunken badge-safe cutout.
    Chrome remains responsible for placing its native badge over the icon.
    """

    canvas_size = size * SUPERSAMPLE
    scale = canvas_size / 128
    image = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    if toolbar:
        tile = (2, 2, 126, 126)
        tile_radius = 26
        edge = (4, 4, 124, 124)
        edge_radius = 24
        stem = (25, 17, 41, 111)
        bowl = (31, 31, 111, 111)
        bowl_width = 12
        bars = (
            (52, 71, 61, 94),
            (68, 56, 77, 94),
            (84, 40, 93, 94),
        )
    else:
        tile = (4, 4, 124, 124)
        tile_radius = 26
        edge = (6, 6, 122, 122)
        edge_radius = 24
        stem = (28, 20, 41, 108)
        bowl = (34, 34, 108, 108)
        bowl_width = 11
        bars = (
            (53, 72, 62, 91),
            (68, 59, 77, 91),
            (83, 44, 92, 91),
        )

    rounded(draw, tile, tile_radius, INK, scale)
    draw.rounded_rectangle(
        scaled_box(edge, scale),
        radius=round(edge_radius * scale),
        outline=INK_EDGE,
        width=max(1, round(1.5 * scale)),
    )

    rounded(draw, stem, (stem[2] - stem[0]) / 2, PAPER, scale)
    ellipse_outline(draw, bowl, bowl_width, PAPER, scale)
    for bar in bars:
        rounded(draw, bar, (bar[2] - bar[0]) / 2, COBALT, scale)

    return image.resize((size, size), Image.Resampling.LANCZOS)


def draw_mark(size):
    return draw_brand_mark(size)


def draw_action_mark(size):
    return draw_brand_mark(size, toolbar=True)


def write_svg():
    svg = """<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" role="img" aria-labelledby="title desc">
  <title id="title">ChatGPT Model Usage Counter</title>
  <desc id="desc">A restrained black bsnblanc monogram containing three blue model-usage columns.</desc>
  <rect x="4" y="4" width="120" height="120" rx="26" fill="#121214"/>
  <rect x="6" y="6" width="116" height="116" rx="24" fill="none" stroke="#37373C" stroke-width="1.5"/>
  <rect x="28" y="20" width="13" height="88" rx="6.5" fill="#F7F4EC"/>
  <circle cx="71" cy="71" r="37" fill="none" stroke="#F7F4EC" stroke-width="11"/>
  <rect x="53" y="72" width="9" height="19" rx="4.5" fill="#1818FF"/>
  <rect x="68" y="59" width="9" height="32" rx="4.5" fill="#1818FF"/>
  <rect x="83" y="44" width="9" height="47" rx="4.5" fill="#1818FF"/>
</svg>
"""
    with (ICON_DIR / "usage-counter-mark.svg").open("w", encoding="utf-8", newline="\n") as svg_file:
        svg_file.write(svg)


def main():
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    write_svg()
    for size in FULL_SIZES:
        draw_mark(size).save(ICON_DIR / f"icon{size}.png", optimize=True)
    for size in ACTION_SIZES:
        action = draw_action_mark(size)
        action.save(ICON_DIR / f"action{size}.png", optimize=True)
        action.save(ICON_DIR / f"action1-{size}.png", optimize=True)
        action.save(ICON_DIR / f"action2-{size}.png", optimize=True)


if __name__ == "__main__":
    main()
