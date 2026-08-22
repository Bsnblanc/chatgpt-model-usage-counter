from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "promotional"
OUT.mkdir(parents=True, exist_ok=True)

FONT_REGULAR = Path("C:/Windows/Fonts/segoeui.ttf")
FONT_SEMIBOLD = Path("C:/Windows/Fonts/seguisb.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/segoeuib.ttf")


def font(size, weight="regular"):
    path = FONT_BOLD if weight == "bold" else FONT_SEMIBOLD if weight == "semibold" else FONT_REGULAR
    return ImageFont.truetype(str(path), size)


def gradient(width, height, start=(6, 16, 29), end=(18, 48, 78)):
    image = Image.new("RGB", (width, height))
    pixels = image.load()
    for y in range(height):
        for x in range(width):
            mix = 0.68 * (x / max(1, width - 1)) + 0.32 * (y / max(1, height - 1))
            pixels[x, y] = tuple(round(start[i] * (1 - mix) + end[i] * mix) for i in range(3))
    return image


def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text(draw, xy, value, size, fill, weight="regular", anchor=None):
    draw.text(xy, value, font=font(size, weight), fill=fill, anchor=anchor)


def pill(draw, x, y, label, scale=1, active=False):
    face = (23, 184, 166) if active else (27, 47, 70)
    border = (45, 212, 191) if active else (63, 86, 113)
    color = (5, 27, 38) if active else (213, 226, 240)
    label_font = font(12 * scale, "semibold")
    bounds = draw.textbbox((0, 0), label, font=label_font)
    width = bounds[2] - bounds[0] + 22 * scale
    height = 30 * scale
    rounded(draw, (x, y, x + width, y + height), 15 * scale, face, border, scale)
    draw.text((x + width / 2, y + height / 2 - scale), label, font=label_font, fill=color, anchor="mm")
    return x + width


def draw_check(draw, x, y, label, scale=1):
    radius = 12 * scale
    draw.ellipse((x, y, x + radius * 2, y + radius * 2), fill=(8, 65, 70))
    draw.line(
        (
            x + 6 * scale,
            y + 12 * scale,
            x + 10 * scale,
            y + 16 * scale,
            x + 18 * scale,
            y + 7 * scale,
        ),
        fill=(73, 234, 211),
        width=2 * scale,
        joint="curve",
    )
    text(draw, (x + radius * 2 + 14 * scale, y + radius), label, 17 * scale, (218, 229, 241), "regular", "lm")


def draw_chart(draw, box, scale=1):
    x1, y1, x2, y2 = box
    grid = (44, 67, 94)
    for index in range(4):
        y = y1 + (y2 - y1) * index / 3
        draw.line((x1, y, x2, y), fill=grid, width=scale)
    series = [
        ((39, 214, 176), [0.18, 0.28, 0.24, 0.52, 0.68, 0.78]),
        ((91, 157, 255), [0.10, 0.22, 0.42, 0.33, 0.52, 0.56]),
        ((245, 173, 40), [0.04, 0.08, 0.14, 0.09, 0.16, 0.20]),
    ]
    for color, values in series:
        points = []
        for index, value in enumerate(values):
            x = x1 + (x2 - x1) * index / (len(values) - 1)
            y = y2 - (y2 - y1) * value
            points.append((x, y))
        draw.line(points, fill=color, width=3 * scale, joint="curve")
        px, py = points[-1]
        draw.ellipse((px - 4 * scale, py - 4 * scale, px + 4 * scale, py + 4 * scale), fill=color)


def marquee():
    scale = 2
    width, height = 1400 * scale, 560 * scale
    image = gradient(width, height)
    draw = ImageDraw.Draw(image)

    # Soft decorative glows.
    draw.ellipse((1880, -360, 3020, 780), fill=(18, 72, 99))
    draw.ellipse((-520, 700, 420, 1640), fill=(7, 50, 62))

    rounded(draw, (88 * scale, 46 * scale, 407 * scale, 84 * scale), 19 * scale, (7, 39, 52), (18, 132, 139), scale)
    text(draw, (105 * scale, 65 * scale), "●  LOCAL STATS · NO PUBLISHER SERVER", 13 * scale, (84, 238, 222), "semibold", "lm")

    text(draw, (88 * scale, 116 * scale), "ChatGPT", 57 * scale, (243, 248, 255), "bold")
    text(draw, (88 * scale, 178 * scale), "Model Usage", 57 * scale, (59, 226, 207), "bold")
    text(draw, (88 * scale, 240 * scale), "Counter", 57 * scale, (243, 248, 255), "bold")

    text(draw, (90 * scale, 326 * scale), "Exact request-model counts with future-ready detection.", 20 * scale, (168, 190, 215))
    text(draw, (90 * scale, 358 * scale), "Export the current, selected, or complete chat history.", 20 * scale, (168, 190, 215))

    draw_check(draw, 90 * scale, 414 * scale, "Exact model slugs · date ranges · daily charts", scale)
    draw_check(draw, 90 * scale, 458 * scale, "JSON · Markdown · PDF · DOCX · PNG", scale)
    draw_check(draw, 90 * scale, 502 * scale, "Multi-chat ZIP · one file per chat · integrity report", scale)

    card = (742 * scale, 72 * scale, 1360 * scale, 524 * scale)
    rounded(draw, card, 24 * scale, (18, 38, 62), (48, 75, 105), scale)
    text(draw, (780 * scale, 112 * scale), "Usage & export", 24 * scale, (239, 246, 255), "bold")
    text(draw, (1318 * scale, 116 * scale), "observed model identity", 13 * scale, (132, 156, 183), "regular", "rm")

    models = [
        ("GPT-5.6 Sol", "11", (39, 214, 176), 0.92),
        ("GPT-5.6 Luna", "4", (91, 157, 255), 0.42),
        ("GPT-5.6 Terra", "2", (245, 173, 40), 0.22),
    ]
    for index, (name, count, color, progress) in enumerate(models):
        y = (164 + index * 42) * scale
        text(draw, (780 * scale, y), name, 16 * scale, (202, 216, 231), "regular", "lm")
        x1, x2 = 982 * scale, 1280 * scale
        rounded(draw, (x1, y - 7 * scale, x2, y + 3 * scale), 5 * scale, (38, 60, 86))
        rounded(draw, (x1, y - 7 * scale, x1 + (x2 - x1) * progress, y + 3 * scale), 5 * scale, color)
        text(draw, (1320 * scale, y - 2 * scale), count, 17 * scale, color, "bold", "rm")

    draw_chart(draw, (780 * scale, 300 * scale, 1320 * scale, 396 * scale), scale)
    draw.line((780 * scale, 418 * scale, 1320 * scale, 418 * scale), fill=(48, 75, 105), width=scale)
    text(draw, (780 * scale, 448 * scale), "Export scope", 14 * scale, (132, 156, 183), "semibold")
    x = 910 * scale
    x = pill(draw, x, 432 * scale, "Current", scale, True) + 10 * scale
    x = pill(draw, x, 432 * scale, "Selected", scale, False) + 10 * scale
    pill(draw, x, 432 * scale, "All", scale, False)

    text(draw, (780 * scale, 493 * scale), "JSON   MD   PDF   DOCX   PNG   →   ZIP for multiple chats", 14 * scale, (199, 216, 233), "semibold")

    image.resize((1400, 560), Image.Resampling.LANCZOS).save(OUT / "marquee-1400x560.png", optimize=True)


def small():
    scale = 3
    width, height = 440 * scale, 280 * scale
    image = gradient(width, height)
    draw = ImageDraw.Draw(image)

    draw.ellipse((740, -250, 1500, 510), fill=(18, 72, 99))
    rounded(draw, (26 * scale, 25 * scale, 246 * scale, 53 * scale), 14 * scale, (7, 39, 52), (18, 132, 139), scale)
    text(draw, (37 * scale, 39 * scale), "●  EXACT MODELS · PRIVATE EXPORTS", 9 * scale, (84, 238, 222), "semibold", "lm")

    text(draw, (26 * scale, 75 * scale), "ChatGPT", 31 * scale, (244, 248, 255), "bold")
    text(draw, (26 * scale, 112 * scale), "Model Usage", 31 * scale, (59, 226, 207), "bold")
    text(draw, (26 * scale, 149 * scale), "Counter", 31 * scale, (244, 248, 255), "bold")

    text(draw, (28 * scale, 203 * scale), "Current · Selected · All", 14 * scale, (202, 216, 231), "semibold")
    text(draw, (28 * scale, 228 * scale), "JSON · MD · PDF · DOCX · PNG", 12 * scale, (151, 176, 203))
    text(draw, (28 * scale, 253 * scale), "Multi-chat ZIP + integrity report", 12 * scale, (151, 176, 203))

    card = (258 * scale, 72 * scale, 426 * scale, 254 * scale)
    rounded(draw, card, 16 * scale, (17, 38, 62), (48, 75, 105), scale)
    text(draw, (276 * scale, 92 * scale), "Export", 16 * scale, (239, 246, 255), "bold")
    x = 276 * scale
    x = pill(draw, x, 112 * scale, "Current", scale, True)
    x = 276 * scale
    x = pill(draw, x, 149 * scale, "Selected", scale, False)
    x = 276 * scale
    pill(draw, x, 186 * scale, "All", scale, False)
    text(draw, (276 * scale, 232 * scale), "5 formats  →  ZIP", 11 * scale, (199, 216, 233), "semibold")

    image.resize((440, 280), Image.Resampling.LANCZOS).save(OUT / "small-promo-440x280.png", optimize=True)


if __name__ == "__main__":
    marquee()
    small()
