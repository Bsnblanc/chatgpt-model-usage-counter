from pathlib import Path
from math import cos, radians, sin

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


def round_arc(draw, box, start, end, width, fill, scale):
    scaled = scaled_box(box, scale)
    stroke = max(1, round(width * scale))
    draw.arc(scaled, start=start, end=end, fill=fill, width=stroke)
    center_x = ((box[0] + box[2]) / 2) * scale
    center_y = ((box[1] + box[3]) / 2) * scale
    radius_x = ((box[2] - box[0]) / 2) * scale
    radius_y = ((box[3] - box[1]) / 2) * scale
    cap_radius = stroke / 2
    for angle in (start, end):
        angle_radians = radians(angle)
        x = center_x + radius_x * cos(angle_radians)
        y = center_y + radius_y * sin(angle_radians)
        draw.ellipse(
            (
                round(x - cap_radius),
                round(y - cap_radius),
                round(x + cap_radius),
                round(y + cap_radius),
            ),
            fill=fill,
        )


def draw_brand_mark(size, *, toolbar=False):
    """Render the bsnblanc usage-counter mark at its final requested size.

    Three warm-paper orbital segments form a letter-free local model system.
    Cobalt checkpoints mark distinct counted model events. The open orbit
    remains legible at toolbar sizes and does not shrink around Chrome's native
    badge, whose placement is controlled by the browser.
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
        orbit = (25, 25, 103, 103)
        orbit_width = 13
        node_radius = 6.5
    else:
        tile = (4, 4, 124, 124)
        tile_radius = 26
        edge = (6, 6, 122, 122)
        edge_radius = 24
        orbit = (27, 27, 101, 101)
        orbit_width = 12
        node_radius = 6

    rounded(draw, tile, tile_radius, INK, scale)
    draw.rounded_rectangle(
        scaled_box(edge, scale),
        radius=round(edge_radius * scale),
        outline=INK_EDGE,
        width=max(1, round(1.5 * scale)),
    )

    arcs = ((-66, 18), (54, 138), (174, 258))
    for start, end in arcs:
        round_arc(draw, orbit, start, end, orbit_width, PAPER, scale)

    center_x = (orbit[0] + orbit[2]) / 2
    center_y = (orbit[1] + orbit[3]) / 2
    radius_x = (orbit[2] - orbit[0]) / 2
    radius_y = (orbit[3] - orbit[1]) / 2
    for angle in (18, 138, 258):
        angle_radians = radians(angle)
        x = center_x + radius_x * cos(angle_radians)
        y = center_y + radius_y * sin(angle_radians)
        draw.ellipse(
            scaled_box(
                (
                    x - node_radius,
                    y - node_radius,
                    x + node_radius,
                    y + node_radius,
                ),
                scale,
            ),
            fill=COBALT,
        )

    return image.resize((size, size), Image.Resampling.LANCZOS)


def draw_mark(size):
    return draw_brand_mark(size)


def draw_action_mark(size):
    return draw_brand_mark(size, toolbar=True)


def write_svg():
    svg = """<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" role="img" aria-labelledby="title desc">
  <title id="title">ChatGPT Model Usage Counter</title>
  <desc id="desc">A black tile with three warm-paper orbital segments and three cobalt usage checkpoints.</desc>
  <rect x="4" y="4" width="120" height="120" rx="26" fill="#121214"/>
  <rect x="6" y="6" width="116" height="116" rx="24" fill="none" stroke="#37373C" stroke-width="1.5"/>
  <path d="M79.05 28.68A37 37 0 0 1 99.18 75.43" fill="none" stroke="#F7F4EC" stroke-width="12" stroke-linecap="round"/>
  <path d="M99.18 75.43A37 37 0 0 1 36.44 88.75" fill="none" stroke="#F7F4EC" stroke-width="12" stroke-linecap="round"/>
  <path d="M36.44 88.75A37 37 0 0 1 79.05 28.68" fill="none" stroke="#F7F4EC" stroke-width="12" stroke-linecap="round"/>
  <circle cx="99.18" cy="75.43" r="6" fill="#1818FF"/>
  <circle cx="36.44" cy="88.75" r="6" fill="#1818FF"/>
  <circle cx="79.05" cy="28.68" r="6" fill="#1818FF"/>
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
