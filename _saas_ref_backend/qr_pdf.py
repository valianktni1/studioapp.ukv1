import os
import io
import qrcode
from PIL import Image, ImageDraw, ImageFont

# Three tasteful QR-card designs delivered as printable A6 PDFs.
PALETTES = {
    "minimal": {"bg": (255, 255, 255), "fg": (26, 26, 26), "accent": (26, 26, 26), "sub": (120, 120, 120), "qr": (26, 26, 26)},
    "classic": {"bg": (250, 247, 240), "fg": (44, 36, 22), "accent": (183, 143, 63), "sub": (140, 120, 90), "qr": (44, 36, 22)},
    "botanical": {"bg": (243, 246, 240), "fg": (39, 54, 40), "accent": (95, 130, 90), "sub": (110, 130, 108), "qr": (39, 54, 40)},
}
W, H = 1240, 1748  # A6 @ ~300dpi portrait


def _font(size, bold=False):
    paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif%s.ttf" % ("-Bold" if bold else ""),
        "/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf" % ("-Bold" if bold else ""),
    ]
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                pass
    return ImageFont.load_default()


def _centered(draw, text, y, font, fill):
    bb = draw.textbbox((0, 0), text, font=font)
    w = bb[2] - bb[0]
    draw.text(((W - w) / 2, y), text, font=font, fill=fill)


def build_qr_pdf(url, couple, brand, design="minimal"):
    pal = PALETTES.get(design, PALETTES["minimal"])
    card = Image.new("RGB", (W, H), pal["bg"])
    d = ImageDraw.Draw(card)

    # border frame
    d.rectangle([40, 40, W - 40, H - 40], outline=pal["accent"], width=3)
    if design != "minimal":
        d.rectangle([58, 58, W - 58, H - 58], outline=pal["accent"], width=1)

    # botanical corner flourishes
    if design == "botanical":
        for cx, cy, s in [(90, 90, 1), (W - 90, 90, -1), (90, H - 90, 1), (W - 90, H - 90, -1)]:
            for i in range(5):
                d.ellipse([cx - 6 + i * s * 14, cy - 6, cx + 6 + i * s * 14, cy + 6], outline=pal["accent"], width=2)

    # header
    _centered(d, brand, 150, _font(46, True), pal["accent"])
    _centered(d, "invite you to view", 230, _font(34), pal["sub"])
    _centered(d, couple, 300, _font(72, True), pal["fg"])

    # diamond separator
    _centered(d, "\u2726", 430, _font(40), pal["accent"])

    # QR
    qr = qrcode.QRCode(box_size=10, border=2)
    qr.add_data(url); qr.make(fit=True)
    qimg = qr.make_image(fill_color=pal["qr"], back_color=pal["bg"]).convert("RGB")
    qs = 640
    qimg = qimg.resize((qs, qs))
    card.paste(qimg, (int((W - qs) / 2), 520))

    # footer
    _centered(d, "Scan to open your gallery", 1210, _font(38, True), pal["fg"])
    short = url.replace("https://", "").replace("http://", "")
    _centered(d, short, 1275, _font(28), pal["sub"])
    _centered(d, "\u2726", 1380, _font(34), pal["accent"])

    buf = io.BytesIO()
    card.save(buf, format="PDF", resolution=300.0)
    buf.seek(0)
    return buf
