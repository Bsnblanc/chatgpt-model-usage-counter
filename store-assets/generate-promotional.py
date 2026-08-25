from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "promotional"
SCREENSHOTS = ROOT / "screenshots"
APP_ICON = ROOT.parent / "icons" / "icon128.png"
VERSION = "1.5.0"
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
        ("gpt-5-6-thinking", (39, 214, 176), [0.18, 0.28, 0.24, 0.52, 0.68, 0.78]),
        ("gpt-5-6-pro", (91, 157, 255), [0.10, 0.22, 0.42, 0.33, 0.52, 0.56]),
        ("gpt-5-6", (245, 173, 40), [0.04, 0.08, 0.14, 0.09, 0.16, 0.20]),
        ("gpt-5-5", (224, 103, 194), [0.02, 0.04, 0.03, 0.08, 0.07, 0.11]),
    ]
    for label, color, values in series:
        points = []
        for index, value in enumerate(values):
            x = x1 + (x2 - x1) * index / (len(values) - 1)
            y = y2 - (y2 - y1) * value
            points.append((x, y))
        draw.line(points, fill=color, width=3 * scale, joint="curve")
        px, py = points[-1]
        draw.ellipse((px - 4 * scale, py - 4 * scale, px + 4 * scale, py + 4 * scale), fill=color)
        text(draw, (px + 10 * scale, py), label, 8 * scale, color, "semibold", "lm")


def draw_icon_button(draw, center, kind, scale=1):
    cx, cy = center
    radius = 14 * scale
    ink = (183, 202, 220)
    stroke = max(1, round(2 * scale))
    rounded(
        draw,
        (cx - radius, cy - radius, cx + radius, cy + radius),
        7 * scale,
        (24, 47, 72),
    )
    if kind == "refresh":
        draw.arc(
            (cx - 7 * scale, cy - 7 * scale, cx + 7 * scale, cy + 7 * scale),
            35,
            310,
            fill=ink,
            width=stroke,
        )
        draw.polygon(
            (
                (cx + 5 * scale, cy - 7 * scale),
                (cx + 9 * scale, cy - 6 * scale),
                (cx + 7 * scale, cy - 2 * scale),
            ),
            fill=ink,
        )
    elif kind == "settings":
        draw.ellipse(
            (cx - 7 * scale, cy - 7 * scale, cx + 7 * scale, cy + 7 * scale),
            outline=ink,
            width=stroke,
        )
        draw.ellipse(
            (cx - 2.5 * scale, cy - 2.5 * scale, cx + 2.5 * scale, cy + 2.5 * scale),
            fill=ink,
        )
    else:
        draw.line(
            (cx - 6 * scale, cy - 6 * scale, cx + 6 * scale, cy + 6 * scale),
            fill=ink,
            width=stroke,
        )
        draw.line(
            (cx + 6 * scale, cy - 6 * scale, cx - 6 * scale, cy + 6 * scale),
            fill=ink,
            width=stroke,
        )


def draw_chart_legend(draw, x, y, items, scale=1, columns=2, column_width=260):
    for index, (label, count, color) in enumerate(items):
        column = index % columns
        row = index // columns
        item_x = x + column * column_width * scale
        item_y = y + row * 22 * scale
        draw.ellipse(
            (
                item_x,
                item_y + 5 * scale,
                item_x + 9 * scale,
                item_y + 14 * scale,
            ),
            fill=color,
        )
        text(
            draw,
            (item_x + 16 * scale, item_y + 10 * scale),
            label,
            10 * scale,
            color,
            "semibold",
            "lm",
        )
        text(
            draw,
            (item_x + (column_width - 12) * scale, item_y + 10 * scale),
            str(count),
            10 * scale,
            (205, 219, 234),
            "bold",
            "rm",
        )


def draw_donut(draw, center, radius, values, scale=1, hole_fill=(18, 38, 62)):
    cx, cy = center
    total = sum(value for value, _ in values) or 1
    start = -90
    box = (
        cx - radius * scale,
        cy - radius * scale,
        cx + radius * scale,
        cy + radius * scale,
    )
    for value, color in values:
        sweep = 360 * value / total
        draw.pieslice(box, start=start, end=start + sweep, fill=color)
        start += sweep
    hole = radius * 0.58 * scale
    draw.ellipse(
        (cx - hole, cy - hole, cx + hole, cy + hole),
        fill=hole_fill,
    )
    text(draw, (cx, cy - 3 * scale), str(total), 16 * scale, (239, 246, 255), "bold", "mm")
    text(draw, (cx, cy + 13 * scale), "calls", 8 * scale, (137, 159, 182), "regular", "mm")


def paste_app_icon(image, box):
    if not APP_ICON.is_file():
        return
    x1, y1, x2, y2 = [round(value) for value in box]
    icon = Image.open(APP_ICON).convert("RGBA")
    icon.thumbnail((x2 - x1, y2 - y1), Image.Resampling.LANCZOS)
    image.paste(icon, (x1, y1), icon)


def marquee():
    scale = 2
    width, height = 1400 * scale, 560 * scale
    image = gradient(width, height)
    draw = ImageDraw.Draw(image)

    # Soft decorative glows.
    draw.ellipse((1880, -360, 3020, 780), fill=(18, 72, 99))
    draw.ellipse((-520, 700, 420, 1640), fill=(7, 50, 62))

    rounded(draw, (88 * scale, 46 * scale, 430 * scale, 84 * scale), 19 * scale, (7, 39, 52), (18, 132, 139), scale)
    text(
        draw,
        (105 * scale, 65 * scale),
        f"●  v{VERSION} · LOCAL STATS · CHAT + WORK · PRIVATE",
        13 * scale,
        (84, 238, 222),
        "semibold",
        "lm",
    )

    text(draw, (88 * scale, 116 * scale), "ChatGPT", 57 * scale, (243, 248, 255), "bold")
    text(draw, (88 * scale, 178 * scale), "Model Usage", 57 * scale, (59, 226, 207), "bold")
    text(draw, (88 * scale, 240 * scale), "Counter", 57 * scale, (243, 248, 255), "bold")
    paste_app_icon(image, (626 * scale, 112 * scale, 696 * scale, 182 * scale))

    text(draw, (90 * scale, 326 * scale), "Basic public models or Advanced internal routes.", 20 * scale, (168, 190, 215))
    text(draw, (90 * scale, 358 * scale), "Line, donut and text views with direct in-chart labels.", 20 * scale, (168, 190, 215))

    draw_check(draw, 90 * scale, 414 * scale, "Chat + Work · request route · actual response model", scale)
    draw_check(draw, 90 * scale, 458 * scale, "Thinking → Thinking · Pro → Pro · exact evidence", scale)
    draw_check(draw, 90 * scale, 502 * scale, "Project selection · 5 formats · backup + import", scale)

    card = (742 * scale, 72 * scale, 1360 * scale, 524 * scale)
    rounded(draw, card, 24 * scale, (18, 38, 62), (48, 75, 105), scale)
    text(draw, (780 * scale, 108 * scale), "Model usage", 23 * scale, (239, 246, 255), "bold")
    for index, kind in enumerate(("refresh", "settings")):
        draw_icon_button(draw, ((1290 + index * 34) * scale, 108 * scale), kind, scale)

    rounded(draw, (780 * scale, 136 * scale, 1050 * scale, 168 * scale), 8 * scale, (11, 29, 48))
    for index, label in enumerate(("Usage", "Status", "Export")):
        if index == 0:
            rounded(
                draw,
                ((786 + index * 86) * scale, 141 * scale, (864 + index * 86) * scale, 163 * scale),
                6 * scale,
                (30, 66, 82),
            )
        text(
            draw,
            ((825 + index * 86) * scale, 152 * scale),
            label,
            10 * scale,
            (99, 230, 211) if index == 0 else (151, 172, 195),
            "semibold",
            "mm",
        )
    text(draw, (1320 * scale, 153 * scale), "Advanced", 11 * scale, (132, 156, 183), "semibold", "rm")

    text(draw, (780 * scale, 193 * scale), "Model usage trend", 14 * scale, (230, 239, 249), "bold")
    draw_chart(draw, (780 * scale, 218 * scale, 1165 * scale, 330 * scale), scale)

    draw.line((780 * scale, 348 * scale, 1320 * scale, 348 * scale), fill=(48, 75, 105), width=scale)
    text(draw, (780 * scale, 374 * scale), "Exact model relations", 13 * scale, (230, 239, 249), "bold")
    text(draw, (780 * scale, 402 * scale), "gpt-5-6-thinking", 11 * scale, (39, 214, 176), "semibold")
    text(draw, (780 * scale, 423 * scale), "→ gpt-5-6-thinking · high", 10 * scale, (179, 199, 219))
    text(draw, (780 * scale, 452 * scale), "gpt-5-6-pro", 11 * scale, (91, 157, 255), "semibold")
    text(draw, (780 * scale, 473 * scale), "→ gpt-5-6-pro · max", 10 * scale, (179, 199, 219))

    text(draw, (1098 * scale, 374 * scale), "Composition", 13 * scale, (230, 239, 249), "bold")
    draw_donut(
        draw,
        (1160 * scale, 437 * scale),
        52,
        [
            (11, (39, 214, 176)),
            (6, (91, 157, 255)),
            (4, (245, 173, 40)),
            (2, (224, 103, 194)),
        ],
        scale,
    )
    text(draw, (1226 * scale, 412 * scale), "Thinking  47.8%", 9 * scale, (39, 214, 176), "semibold")
    text(draw, (1226 * scale, 435 * scale), "Pro       26.1%", 9 * scale, (91, 157, 255), "semibold")
    text(draw, (1226 * scale, 458 * scale), "Instant   17.4%", 9 * scale, (245, 173, 40), "semibold")
    text(draw, (1226 * scale, 481 * scale), "GPT-5.5    8.7%", 9 * scale, (224, 103, 194), "semibold")

    image.resize((1400, 560), Image.Resampling.LANCZOS).save(OUT / "marquee-1400x560.png", optimize=True)


def small():
    scale = 3
    width, height = 440 * scale, 280 * scale
    image = gradient(width, height)
    draw = ImageDraw.Draw(image)

    draw.ellipse((740, -250, 1500, 510), fill=(18, 72, 99))
    rounded(draw, (26 * scale, 25 * scale, 256 * scale, 53 * scale), 14 * scale, (7, 39, 52), (18, 132, 139), scale)
    text(draw, (37 * scale, 39 * scale), f"●  v{VERSION} · CHAT + WORK · LOCAL", 9 * scale, (84, 238, 222), "semibold", "lm")

    text(draw, (26 * scale, 75 * scale), "ChatGPT", 31 * scale, (244, 248, 255), "bold")
    text(draw, (26 * scale, 112 * scale), "Model Usage", 31 * scale, (59, 226, 207), "bold")
    text(draw, (26 * scale, 149 * scale), "Counter", 31 * scale, (244, 248, 255), "bold")
    paste_app_icon(image, (374 * scale, 20 * scale, 420 * scale, 66 * scale))

    text(draw, (28 * scale, 203 * scale), "Line · donut · text statistics", 14 * scale, (202, 216, 231), "semibold")
    text(draw, (28 * scale, 228 * scale), "Direct labels · exact routes", 12 * scale, (151, 176, 203))
    text(draw, (28 * scale, 253 * scale), "Projects · 5 formats · backup", 12 * scale, (151, 176, 203))

    card = (258 * scale, 72 * scale, 426 * scale, 254 * scale)
    rounded(draw, card, 16 * scale, (17, 38, 62), (48, 75, 105), scale)
    text(draw, (274 * scale, 92 * scale), "Model usage", 13 * scale, (239, 246, 255), "bold")
    for index, kind in enumerate(("refresh", "settings")):
        draw_icon_button(draw, ((382 + index * 24) * scale, 91 * scale), kind, 0.65 * scale)
    text(draw, (274 * scale, 119 * scale), "gpt-5-6-thinking   11", 8 * scale, (39, 214, 176), "semibold")
    text(draw, (274 * scale, 137 * scale), "gpt-5-6-pro          6", 8 * scale, (91, 157, 255), "semibold")
    draw_donut(
        draw,
        (310 * scale, 190 * scale),
        34,
        [(11, (39, 214, 176)), (6, (91, 157, 255)), (4, (245, 173, 40))],
        scale,
    )
    text(draw, (350 * scale, 174 * scale), "high", 8 * scale, (39, 214, 176), "semibold")
    text(draw, (350 * scale, 194 * scale), "max", 8 * scale, (91, 157, 255), "semibold")
    text(draw, (274 * scale, 236 * scale), "Line · donut · text", 9 * scale, (199, 216, 233), "semibold")

    image.resize((440, 280), Image.Resampling.LANCZOS).save(OUT / "small-promo-440x280.png", optimize=True)


def export_selection():
    scale = 2
    width, height = 1280 * scale, 800 * scale
    image = gradient(width, height)
    draw = ImageDraw.Draw(image)

    draw.ellipse((1880, -420, 2980, 680), fill=(18, 72, 99))
    draw.ellipse((-620, 980, 460, 2060), fill=(6, 64, 68))

    rounded(
        draw,
        (74 * scale, 98 * scale, 318 * scale, 136 * scale),
        19 * scale,
        (7, 39, 52),
        (18, 132, 139),
        scale,
    )
    text(draw, (90 * scale, 117 * scale), "READABLE CHAT EXPORTS", 13 * scale, (84, 238, 222), "semibold", "lm")
    text(draw, (74 * scale, 170 * scale), "Choose chats or project", 47 * scale, (245, 249, 255), "bold")
    text(draw, (74 * scale, 222 * scale), "folders.", 47 * scale, (245, 249, 255), "bold")
    text(draw, (74 * scale, 282 * scale), "Current chat first. Import official history, then select", 18 * scale, (210, 224, 239))
    text(draw, (74 * scale, 314 * scale), "one, many, or a whole project and choose a format.", 18 * scale, (210, 224, 239))

    draw_check(draw, 74 * scale, 370 * scale, "Current chat is first and initially selected", scale)
    draw_check(draw, 74 * scale, 414 * scale, "Official ZIP / conversations.json imports locally", scale)
    draw_check(draw, 74 * scale, 458 * scale, "Per-chat and per-project selection", scale)
    draw_check(draw, 74 * scale, 502 * scale, "JSON · Markdown · PDF · DOCX · PNG", scale)
    draw_check(draw, 74 * scale, 546 * scale, "One chat = one file · multiple chats = one ZIP", scale)

    text(draw, (74 * scale, 718 * scale), "ChatGPT Model Usage Counter", 14 * scale, (142, 171, 194))
    text(draw, (297 * scale, 718 * scale), f"v{VERSION}", 14 * scale, (84, 238, 222), "bold")

    panel = (785 * scale, 104 * scale, 1216 * scale, 706 * scale)
    rounded(draw, panel, 12 * scale, (42, 43, 51), (203, 213, 224), scale)
    text(draw, (796 * scale, 124 * scale), "Export", 16 * scale, (245, 247, 250), "bold")
    draw_icon_button(draw, (1144 * scale, 127 * scale), "refresh", 0.72 * scale)
    draw_icon_button(draw, (1178 * scale, 127 * scale), "settings", 0.72 * scale)

    rounded(draw, (796 * scale, 151 * scale, 1191 * scale, 176 * scale), 7 * scale, (30, 30, 34), (76, 77, 86), scale)
    for index, label in enumerate(("Usage", "Status", "Export")):
        tab_x = (798 + index * 131) * scale
        if label == "Export":
            rounded(draw, (tab_x, 154 * scale, tab_x + 127 * scale, 173 * scale), 6 * scale, (50, 51, 61))
        text(
            draw,
            (tab_x + 63 * scale, 164 * scale),
            label,
            11 * scale,
            (249, 250, 251) if label == "Export" else (216, 224, 234),
            "semibold",
            "mm",
        )

    rounded(draw, (798 * scale, 190 * scale, 939 * scale, 220 * scale), 7 * scale, (25, 111, 96), (61, 203, 176), scale)
    text(draw, (868 * scale, 205 * scale), "Import official export", 10 * scale, (239, 255, 251), "semibold", "mm")
    text(draw, (950 * scale, 205 * scale), "Local only · cached in this browser", 9 * scale, (176, 184, 196), "regular", "lm")

    rounded(draw, (798 * scale, 232 * scale, 983 * scale, 261 * scale), 7 * scale, (47, 48, 56), (82, 84, 95), scale)
    text(draw, (808 * scale, 246 * scale), "Search chats or project folders", 9 * scale, (142, 148, 161), "regular", "lm")
    rounded(draw, (989 * scale, 232 * scale, 1059 * scale, 261 * scale), 7 * scale, (48, 49, 58), (82, 84, 95), scale)
    rounded(draw, (1065 * scale, 232 * scale, 1132 * scale, 261 * scale), 7 * scale, (48, 49, 58), (82, 84, 95), scale)
    text(draw, (1024 * scale, 246 * scale), "Select all", 9 * scale, (224, 228, 235), "semibold", "mm")
    text(draw, (1098 * scale, 246 * scale), "Clear", 9 * scale, (224, 228, 235), "semibold", "mm")
    text(draw, (1191 * scale, 246 * scale), "2 selected", 9 * scale, (162, 167, 179), "regular", "rm")

    list_box = (798 * scale, 273 * scale, 1191 * scale, 518 * scale)
    rounded(draw, list_box, 7 * scale, (43, 44, 52), (76, 77, 87), scale)

    # Current chat first.
    draw.rounded_rectangle((812 * scale, 288 * scale, 824 * scale, 300 * scale), radius=2 * scale, fill=(91, 157, 255))
    draw.line((815 * scale, 294 * scale, 818 * scale, 297 * scale, 822 * scale, 291 * scale), fill=(242, 247, 255), width=2 * scale)
    text(draw, (836 * scale, 290 * scale), "Quarterly review · GPT-5.6 Sol", 11 * scale, (240, 243, 248), "semibold")
    rounded(draw, (1103 * scale, 286 * scale, 1177 * scale, 305 * scale), 9 * scale, (32, 72, 76), (46, 137, 126), scale)
    text(draw, (1140 * scale, 295 * scale), "Current chat", 8 * scale, (119, 234, 214), "semibold", "mm")
    text(draw, (836 * scale, 309 * scale), "Updated 08-25 08:05", 8 * scale, (143, 148, 160))
    draw.line((812 * scale, 326 * scale, 1178 * scale, 326 * scale), fill=(65, 66, 76), width=scale)

    # Project group checkbox and two member chats.
    draw.polygon(
        ((811 * scale, 343 * scale), (817 * scale, 343 * scale), (814 * scale, 348 * scale)),
        fill=(157, 164, 178),
    )
    rounded(draw, (825 * scale, 340 * scale, 839 * scale, 352 * scale), 2 * scale, (21, 164, 133))
    draw.line((829 * scale, 346 * scale, 835 * scale, 346 * scale), fill=(235, 255, 249), width=2 * scale)
    text(draw, (847 * scale, 346 * scale), "Product launch", 12 * scale, (240, 243, 248), "bold", "lm")
    text(draw, (1178 * scale, 346 * scale), "2", 9 * scale, (176, 182, 193), "semibold", "rm")

    for row, (checked, title_value, updated) in enumerate(
        (
            (True, "Product research", "Updated 08-21 08:05"),
            (False, "Code review notes", "Updated 08-20 08:05"),
        )
    ):
        y = (371 + row * 55) * scale
        draw.rounded_rectangle((833 * scale, y, 845 * scale, y + 12 * scale), radius=2 * scale, outline=(106, 110, 123), width=scale)
        if checked:
            draw.rounded_rectangle((833 * scale, y, 845 * scale, y + 12 * scale), radius=2 * scale, fill=(91, 157, 255))
            draw.line((836 * scale, y + 6 * scale, 839 * scale, y + 9 * scale, 843 * scale, y + 3 * scale), fill=(245, 248, 255), width=2 * scale)
        text(draw, (857 * scale, y - 1 * scale), title_value, 10 * scale, (236, 239, 245), "semibold")
        text(draw, (857 * scale, y + 17 * scale), updated, 8 * scale, (143, 148, 160))

    text(draw, (798 * scale, 540 * scale), "One selection downloads one file. Multiple selections download one ZIP", 9 * scale, (191, 195, 204))
    text(draw, (798 * scale, 556 * scale), "with one independent file per selected chat.", 9 * scale, (191, 195, 204))
    rounded(draw, (798 * scale, 574 * scale, 1191 * scale, 612 * scale), 7 * scale, (30, 30, 34), (76, 77, 86), scale)
    for index, label in enumerate(("JSON", "Markdown", "PDF", "PNG", "DOCX")):
        text(draw, ((837 + index * 76) * scale, 593 * scale), label, 10 * scale, (241, 243, 247), "semibold", "mm")

    image.resize((1280, 800), Image.Resampling.LANCZOS).save(
        SCREENSHOTS / "02-select-chats-formats-1280x800.png",
        optimize=True,
    )


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
    text(draw, (94, 61), f"{kind} export · v{VERSION}", 13, muted)
    draw.line((34, 93, 426, 93), fill=light, width=2)

    text(draw, (34, 119), "Quarterly product research", 24, ink, "bold")
    text(draw, (34, 154), "Exported 2026-08-25 · 4 messages", 13, muted)

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
    text(draw, (88 * scale, 73 * scale), f"READABLE LOCAL EXPORTS · v{VERSION}", 12 * scale, (84, 238, 222), "semibold", "lm")
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

    paste_app_icon(image, (70 * scale, 707 * scale, 102 * scale, 739 * scale))
    text(draw, (112 * scale, 724 * scale), "ChatGPT Model Usage Counter", 14 * scale, (142, 171, 194), "regular")
    text(draw, (359 * scale, 724 * scale), f"v{VERSION}", 14 * scale, (84, 238, 222), "bold")

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
    export_selection()
    readable_exports()
