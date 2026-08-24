from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "promotional"
SCREENSHOTS = ROOT / "screenshots"
APP_ICON = ROOT.parent / "icons" / "icon128.png"
OUT.mkdir(parents=True, exist_ok=True)
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

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

    rounded(draw, (88 * scale, 46 * scale, 430 * scale, 84 * scale), 19 * scale, (7, 39, 52), (18, 132, 139), scale)
    text(draw, (105 * scale, 65 * scale), "●  LOCAL STATS · CHAT + WORK · PRIVATE", 13 * scale, (84, 238, 222), "semibold", "lm")

    text(draw, (88 * scale, 116 * scale), "ChatGPT", 57 * scale, (243, 248, 255), "bold")
    text(draw, (88 * scale, 178 * scale), "Model Usage", 57 * scale, (59, 226, 207), "bold")
    text(draw, (88 * scale, 240 * scale), "Counter", 57 * scale, (243, 248, 255), "bold")

    text(draw, (90 * scale, 326 * scale), "Basic public models or Advanced internal routes.", 20 * scale, (168, 190, 215))
    text(draw, (90 * scale, 358 * scale), "Trend, composition, projects and readable exports.", 20 * scale, (168, 190, 215))

    draw_check(draw, 90 * scale, 414 * scale, "Chat + Work · request route · actual response model", scale)
    draw_check(draw, 90 * scale, 458 * scale, "Line trend · model → reasoning-effort donut", scale)
    draw_check(draw, 90 * scale, 502 * scale, "Project selection · 5 formats · backup + import", scale)

    card = (742 * scale, 72 * scale, 1360 * scale, 524 * scale)
    rounded(draw, card, 24 * scale, (18, 38, 62), (48, 75, 105), scale)
    text(draw, (780 * scale, 112 * scale), "Usage · export · backup", 24 * scale, (239, 246, 255), "bold")
    text(draw, (1318 * scale, 116 * scale), "Basic / Advanced", 13 * scale, (132, 156, 183), "regular", "rm")

    models = [
        ("GPT-5.6 Sol", "11", (39, 214, 176), 0.92),
        ("GPT-5.6 Luna", "4", (91, 157, 255), 0.42),
        ("GPT-5.5", "2", (245, 173, 40), 0.22),
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
    text(draw, (780 * scale, 444 * scale), "Project-aware conversation list", 14 * scale, (132, 156, 183), "semibold")
    for index, (label, checked) in enumerate([
        ("Launch / Research", True),
        ("Launch / Code review", True),
        ("Archive / Planning", False),
    ]):
        x = (918 + index * 132) * scale
        y = 436 * scale
        draw.rounded_rectangle(
            (x, y, x + 18 * scale, y + 18 * scale),
            radius=4 * scale,
            fill=(23, 184, 166) if checked else (27, 47, 70),
            outline=(45, 212, 191) if checked else (63, 86, 113),
            width=scale,
        )
        if checked:
            text(draw, (x + 9 * scale, y + 8 * scale), "✓", 12 * scale, (5, 27, 38), "bold", "mm")
        text(draw, (x + 24 * scale, y + 9 * scale), label, 10 * scale, (213, 226, 240), "regular", "lm")

    text(draw, (780 * scale, 493 * scale), "5 formats   ·   multi-chat ZIP   ·   statistics backup / import", 14 * scale, (199, 216, 233), "semibold")

    image.resize((1400, 560), Image.Resampling.LANCZOS).save(OUT / "marquee-1400x560.png", optimize=True)


def small():
    scale = 3
    width, height = 440 * scale, 280 * scale
    image = gradient(width, height)
    draw = ImageDraw.Draw(image)

    draw.ellipse((740, -250, 1500, 510), fill=(18, 72, 99))
    rounded(draw, (26 * scale, 25 * scale, 256 * scale, 53 * scale), 14 * scale, (7, 39, 52), (18, 132, 139), scale)
    text(draw, (37 * scale, 39 * scale), "●  CHAT + WORK · LOCAL & PRIVATE", 9 * scale, (84, 238, 222), "semibold", "lm")

    text(draw, (26 * scale, 75 * scale), "ChatGPT", 31 * scale, (244, 248, 255), "bold")
    text(draw, (26 * scale, 112 * scale), "Model Usage", 31 * scale, (59, 226, 207), "bold")
    text(draw, (26 * scale, 149 * scale), "Counter", 31 * scale, (244, 248, 255), "bold")

    text(draw, (28 * scale, 203 * scale), "Basic / Advanced model stats", 14 * scale, (202, 216, 231), "semibold")
    text(draw, (28 * scale, 228 * scale), "Line + model → effort donut", 12 * scale, (151, 176, 203))
    text(draw, (28 * scale, 253 * scale), "Projects · 5 formats · backup", 12 * scale, (151, 176, 203))

    card = (258 * scale, 72 * scale, 426 * scale, 254 * scale)
    rounded(draw, card, 16 * scale, (17, 38, 62), (48, 75, 105), scale)
    text(draw, (276 * scale, 92 * scale), "Project export", 16 * scale, (239, 246, 255), "bold")
    for index, (label, checked) in enumerate([
        ("Launch / Research", True),
        ("Launch / Code", True),
        ("Archive / Plan", False),
    ]):
        x = 276 * scale
        y = (119 + index * 35) * scale
        draw.rounded_rectangle(
            (x, y, x + 17 * scale, y + 17 * scale),
            radius=4 * scale,
            fill=(23, 184, 166) if checked else (27, 47, 70),
            outline=(45, 212, 191) if checked else (63, 86, 113),
            width=scale,
        )
        if checked:
            text(draw, (x + 8.5 * scale, y + 8 * scale), "✓", 11 * scale, (5, 27, 38), "bold", "mm")
        text(draw, (x + 24 * scale, y + 8 * scale), label, 10 * scale, (213, 226, 240), "regular", "lm")
    text(draw, (276 * scale, 232 * scale), "5 formats · ZIP", 11 * scale, (199, 216, 233), "semibold")

    image.resize((440, 280), Image.Resampling.LANCZOS).save(OUT / "small-promo-440x280.png", optimize=True)


def preview_card(canvas, draw, image, box, label, scale=1):
    x1, y1, x2, y2 = box
    rounded(draw, box, 18 * scale, (17, 38, 62), (58, 88, 119), scale)
    inner_width = x2 - x1 - 28 * scale
    inner_height = y2 - y1 - 82 * scale
    preview = image.convert("RGB")
    preview.thumbnail((inner_width, inner_height), Image.Resampling.LANCZOS)
    px = x1 + (x2 - x1 - preview.width) // 2
    py = y1 + 16 * scale
    draw.rounded_rectangle(
        (px - 4 * scale, py - 4 * scale, px + preview.width + 4 * scale, py + preview.height + 4 * scale),
        radius=7 * scale,
        fill=(238, 242, 247),
    )
    canvas.paste(preview, (px, py))
    pill_width = 66 * scale
    pill_y = y2 - 50 * scale
    rounded(
        draw,
        (x1 + 16 * scale, pill_y, x1 + 16 * scale + pill_width, pill_y + 30 * scale),
        15 * scale,
        (19, 196, 181),
    )
    text(draw, (x1 + 16 * scale + pill_width / 2, pill_y + 14 * scale), label, 12 * scale, (5, 27, 38), "bold", "mm")
    text(draw, (x1 + 92 * scale, pill_y + 15 * scale), "verified", 11 * scale, (177, 198, 218), "regular", "lm")


def demo_export_preview(kind):
    width, height = 460, 700
    image = Image.new("RGB", (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(image)
    accent = (15, 118, 110)
    ink = (26, 39, 54)
    muted = (92, 108, 126)
    light = (225, 232, 238)

    if APP_ICON.is_file():
        icon = Image.open(APP_ICON).convert("RGBA")
        icon.thumbnail((48, 48), Image.Resampling.LANCZOS)
        image.paste(icon, (34, 27), icon)
    text(draw, (94, 34), "ChatGPT Model Usage Counter", 19, ink, "bold")
    text(draw, (94, 61), f"{kind} export · v1.4.0", 13, muted)
    draw.line((34, 93, 426, 93), fill=light, width=2)

    text(draw, (34, 119), "Quarterly product research", 24, ink, "bold")
    text(draw, (34, 154), "Exported 2026-08-24 · 4 messages", 13, muted)

    blocks = [
        ("USER", "Compare the launch options and keep the decision criteria clear."),
        ("ASSISTANT", "Recommended structure",),
    ]
    y = 198
    for label, value in blocks:
        text(draw, (34, y), label, 11, accent, "bold")
        y += 24
        text(draw, (34, y), value, 14, ink, "regular")
        y += 35

    rounded(draw, (34, y, 426, y + 122), 10, (239, 245, 247), (211, 224, 229))
    text(draw, (52, y + 19), "Decision matrix", 15, ink, "bold")
    draw.line((52, y + 50, 408, y + 50), fill=(196, 211, 219), width=2)
    text(draw, (52, y + 64), "Option", 12, muted, "semibold")
    text(draw, (214, y + 64), "Score", 12, muted, "semibold")
    text(draw, (315, y + 64), "Status", 12, muted, "semibold")
    text(draw, (52, y + 91), "Focused", 13, ink)
    text(draw, (214, y + 91), "9 / 10", 13, ink)
    text(draw, (315, y + 91), "Selected", 13, accent, "semibold")
    y += 150

    text(draw, (34, y), "Implementation notes", 17, ink, "bold")
    y += 34
    for line in (
        "• Keep headings and lists visually distinct.",
        "• Preserve tables, links and code blocks.",
        "• Export one chat per file inside a ZIP.",
    ):
        text(draw, (42, y), line, 13, ink)
        y += 28

    rounded(draw, (34, 574, 426, 632), 9, (19, 35, 54))
    text(draw, (51, 591), "status = readable && complete", 14, (113, 231, 215), "semibold")
    text(draw, (34, 663), "Local export · sanitized preview", 12, muted)
    return image


def readable_exports():
    scale = 2
    width, height = 1280 * scale, 800 * scale
    image = gradient(width, height)
    draw = ImageDraw.Draw(image)

    draw.ellipse((1810, -480, 3000, 710), fill=(18, 72, 99))
    draw.ellipse((-650, 900, 520, 2070), fill=(6, 64, 68))

    rounded(
        draw,
        (70 * scale, 54 * scale, 358 * scale, 92 * scale),
        19 * scale,
        (7, 39, 52),
        (18, 132, 139),
        scale,
    )
    text(draw, (88 * scale, 73 * scale), "READABLE LOCAL EXPORTS · v1.4.0", 12 * scale, (84, 238, 222), "semibold", "lm")
    text(draw, (70 * scale, 142 * scale), "One chat.", 48 * scale, (245, 249, 255), "bold")
    text(draw, (70 * scale, 197 * scale), "Five readable formats.", 48 * scale, (59, 226, 207), "bold")
    text(
        draw,
        (70 * scale, 282 * scale),
        "The same conversation keeps its hierarchy, tables, code and links",
        19 * scale,
        (179, 199, 219),
    )
    text(
        draw,
        (70 * scale, 314 * scale),
        "across PDF, editable DOCX and one complete PNG image.",
        19 * scale,
        (179, 199, 219),
    )

    draw_check(draw, 72 * scale, 384 * scale, "PDF paginates without clipped text", scale)
    draw_check(draw, 72 * scale, 435 * scale, "DOCX keeps headings, tables, code and links editable", scale)
    draw_check(draw, 72 * scale, 486 * scale, "Long PNG stays one image with the extension watermark", scale)

    chip_x = 72 * scale
    for label in ("JSON", "Markdown", "PDF", "DOCX", "PNG"):
        chip_x = pill(draw, chip_x, 570 * scale, label, scale) + 10 * scale

    text(draw, (72 * scale, 724 * scale), "ChatGPT Model Usage Counter", 14 * scale, (142, 171, 194), "regular")
    text(draw, (319 * scale, 724 * scale), "v1.4.0", 14 * scale, (84, 238, 222), "bold")

    card_width = 164 * scale
    card_gap = 18 * scale
    card_left = 692 * scale
    for index, label in enumerate(("PDF", "DOCX", "PNG")):
        x1 = card_left + index * (card_width + card_gap)
        preview_card(
            image,
            draw,
            demo_export_preview(label),
            (x1, 128 * scale, x1 + card_width, 664 * scale),
            label,
            scale,
        )

    image.resize((1280, 800), Image.Resampling.LANCZOS).save(
        SCREENSHOTS / "03-readable-exports-1280x800.png",
        optimize=True,
    )


if __name__ == "__main__":
    marquee()
    small()
    readable_exports()
