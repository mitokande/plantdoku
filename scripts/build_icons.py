"""Rebuild the app icon set from the new Plantdoku logo."""
import os
from PIL import Image, ImageOps

SRC = "art/logo.png"
OUT = "assets"
BG = (243, 246, 234)  # theme bg / app.json backgroundColor #F3F6EA

art = Image.open(SRC).convert("RGBA")
art = art.crop(art.getbbox())


def fitted(size, scale):
    """Art scaled so its longest side is `scale` * size, centred on a transparent canvas."""
    target = int(round(size * scale))
    w, h = art.size
    k = target / max(w, h)
    a = art.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(a, ((size - a.width) // 2, (size - a.height) // 2), a)
    return canvas


def flatten(img, bg):
    base = Image.new("RGBA", img.size, bg + (255,))
    base.alpha_composite(img)
    return base.convert("RGB")


# iOS / store icon: opaque square, art nearly edge to edge.
flatten(fitted(1024, 0.94), BG).save(f"{OUT}/icon.png")

# Splash: transparent, contained by expo-splash-screen.
fitted(1024, 1.0).save(f"{OUT}/splash-icon.png")

# Web favicon.
fitted(196, 1.0).save(f"{OUT}/favicon.png")

# Android adaptive icon: foreground inside the 66% safe zone, flat background.
fitted(1024, 0.66).save(f"{OUT}/android-icon-foreground.png")
Image.new("RGB", (1024, 1024), BG).save(f"{OUT}/android-icon-background.png")

# Themed (monochrome) icon: white silhouette from the artwork's dark linework.
mono_src = fitted(1024, 0.66)
lum = ImageOps.grayscale(flatten(mono_src, (255, 255, 255)))
alpha = lum.point(lambda v: max(0, min(255, int((205 - v) * 2.4))))
alpha = Image.composite(alpha, Image.new("L", alpha.size, 0), mono_src.split()[3].point(lambda v: 255 if v > 40 else 0))
mono = Image.merge("RGBA", (Image.new("L", alpha.size, 255),) * 3 + (alpha,))
mono.save(f"{OUT}/android-icon-monochrome.png")

for f in ("icon.png", "splash-icon.png", "favicon.png", "android-icon-foreground.png",
          "android-icon-background.png", "android-icon-monochrome.png"):
    im = Image.open(f"{OUT}/{f}")
    print(f, im.size, im.mode, f"{os.path.getsize(f'{OUT}/{f}') / 1024:.0f}KB")
