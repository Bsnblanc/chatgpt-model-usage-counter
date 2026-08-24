from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "icons"
SUPERSAMPLE = 8

NAVY = (16, 27, 78, 255)
NAVY_TOP = (8, 18, 52, 255)
NAVY_BOTTOM = (24, 42, 106, 255)
NAVY_LINE = (48, 76, 156, 255)
WHITE = (255, 255, 255, 255)
CYAN = (34, 211, 238, 255)
BLUE = (96, 165, 250, 255)
VIOLET = (196, 139, 250, 255)

FULL_SIZES = (16, 20, 24, 32, 48, 128)
ACTION_SIZES = (16, 20, 24, 32, 48)
ACTION_SPECS = {
    # Chrome controls the native badge position. These are the measured
    # lower-right regions reached by its widest "99+" badge at each icon size.
    16: {"safe_x": 5, "safe_y": 9},
    20: {"safe_x": 6, "safe_y": 11},
    24: {"safe_x": 7, "safe_y": 14},
    32: {"safe_x": 10, "safe_y": 18},
    48: {"safe_x": 14, "safe_y": 27},
}
ACTION_BADGE_STARTS = {
    "one": {size: max(spec["safe_x"], round(size * 0.64)) for size, spec in ACTION_SPECS.items()},
    "two": {size: max(spec["safe_x"], round(size * 0.46)) for size, spec in ACTION_SPECS.items()},
    "wide": {size: spec["safe_x"] for size, spec in ACTION_SPECS.items()},
}


def rounded(draw, box, radius, fill, scale):
    draw.rounded_rectangle(
        tuple(round(value * scale) for value in box),
        radius=round(radius * scale),
        fill=fill,
    )


def triangle(draw, points, fill, scale):
    draw.polygon(
        [(round(x * scale), round(y * scale)) for x, y in points],
        fill=fill,
    )


def ellipse(draw, box, fill, scale):
    draw.ellipse(
        tuple(round(value * scale) for value in box),
        fill=fill,
    )


def arc(draw, box, start, end, width, fill, scale):
    draw.arc(
        tuple(round(value * scale) for value in box),
        start=start,
        end=end,
        width=max(1, round(width * scale)),
        fill=fill,
    )


def gradient_tile(canvas_size, box, radius, scale):
    gradient = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    pixels = gradient.load()
    top = NAVY_TOP
    bottom = NAVY_BOTTOM
    for y in range(canvas_size):
        mix = y / max(1, canvas_size - 1)
        color = tuple(round(top[channel] * (1 - mix) + bottom[channel] * mix) for channel in range(4))
        for x in range(canvas_size):
            pixels[x, y] = color
    mask = Image.new("L", (canvas_size, canvas_size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle(
        tuple(round(value * scale) for value in box),
        radius=round(radius * scale),
        fill=255,
    )
    gradient.putalpha(mask)
    return gradient


def draw_mark(size):
    scale = size * SUPERSAMPLE / 128
    canvas_size = size * SUPERSAMPLE
    image = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    image.alpha_composite(gradient_tile(canvas_size, (4, 4, 124, 124), 29, scale))
    draw = ImageDraw.Draw(image)

    draw.rounded_rectangle(
        tuple(round(value * scale) for value in (6.5, 6.5, 121.5, 121.5)),
        radius=round(27 * scale),
        outline=NAVY_LINE,
        width=max(1, round(1.5 * scale)),
    )
    arc(draw, (23, 22, 105, 104), 38, 331, 13, WHITE, scale)
    ellipse(draw, (96, 57, 105, 66), CYAN, scale)
    rounded(draw, (43, 66, 56, 86), 6.5, CYAN, scale)
    rounded(draw, (59, 52, 72, 86), 6.5, BLUE, scale)
    rounded(draw, (75, 37, 88, 86), 6.5, VIOLET, scale)

    return image.resize((size, size), Image.Resampling.LANCZOS)


def draw_action_mark(size, badge_width):
    # Chrome's native badge position cannot be moved. Three optical toolbar
    # variants reserve only the space required by one character, two
    # characters, or the widest "99+" state. The badge fills a deliberate
    # lower-right notch instead of covering the identity-bearing ring/bars.
    spec = ACTION_SPECS[size]
    safe_x = ACTION_BADGE_STARTS[badge_width][size]
    safe_y = spec["safe_y"]
    canvas_size = size * SUPERSAMPLE
    scale = size * SUPERSAMPLE / 128
    image = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    image.alpha_composite(gradient_tile(canvas_size, (2, 2, 126, 126), 27, scale))
    draw = ImageDraw.Draw(image)

    reserve_x = safe_x * 128 / size
    reserve_y = safe_y * 128 / size
    if badge_width == "one":
        center_x, center_y, radius = min(46, reserve_x * 0.55), 45, 34
    elif badge_width == "two":
        center_x, center_y, radius = min(38, reserve_x * 0.58), 42, 28
    else:
        center_x, center_y, radius = min(29, reserve_x * 0.68), 36, 22
    center_y = min(center_y, reserve_y - 5)
    arc(
        draw,
        (
            center_x - radius,
            center_y - radius,
            center_x + radius,
            center_y + radius,
        ),
        42,
        326,
        max(7, radius * 0.34),
        WHITE,
        scale,
    )
    bar_width = max(5.5, radius * 0.31)
    gap = max(2.5, radius * 0.11)
    group_width = bar_width * 3 + gap * 2
    start_x = center_x - group_width / 2
    baseline = center_y + radius * 0.46
    heights = (radius * 0.58, radius * 0.92, radius * 1.27)
    colors = (CYAN, BLUE, VIOLET)
    for index, (height, color) in enumerate(zip(heights, colors)):
        left = start_x + index * (bar_width + gap)
        rounded(
            draw,
            (left, baseline - height, left + bar_width, baseline),
            bar_width / 2,
            color,
            scale,
        )

    image = image.resize((size, size), Image.Resampling.LANCZOS)
    if size <= 24:
        # Chromium commonly renders these small assets directly. Reinforce the
        # three bars on the final pixel grid so their colors remain readable
        # instead of disappearing during downsampling.
        pixel_draw = ImageDraw.Draw(image)
        baseline = max(5, safe_y - 1)
        unit = max(1, round(size / 16))
        positions = (
            max(2, round(size * 0.20)),
            max(3, round(size * 0.32)),
            max(4, round(size * 0.44)),
        )
        heights = (
            max(2, round(size * 0.16)),
            max(3, round(size * 0.25)),
            max(4, round(size * 0.34)),
        )
        for left, height, color in zip(positions, heights, (CYAN, BLUE, VIOLET)):
            pixel_draw.rectangle(
                (left, baseline - height, left + unit - 1, baseline),
                fill=color,
            )
    pixels = image.load()
    for y in range(safe_y, size):
        for x in range(safe_x, size):
            pixels[x, y] = (0, 0, 0, 0)
    return image


def main():
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    for size in FULL_SIZES:
        draw_mark(size).save(ICON_DIR / f"icon{size}.png", optimize=True)
    for size in ACTION_SIZES:
        draw_action_mark(size, "wide").save(ICON_DIR / f"action{size}.png", optimize=True)
        draw_action_mark(size, "one").save(ICON_DIR / f"action1-{size}.png", optimize=True)
        draw_action_mark(size, "two").save(ICON_DIR / f"action2-{size}.png", optimize=True)


if __name__ == "__main__":
    main()
