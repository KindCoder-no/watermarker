# 📷 Photo Watermarker (Node.js)

A simple Node.js CLI tool to add watermarks to your photos.  
Supports both **image watermarks (logos)** and **text watermarks**, with options for position, opacity, scaling, and batch-processing entire folders.

---

## 🚀 Features
- ✅ Add **text** or **image** watermark
- ✅ Batch process **folders of images**
- ✅ Preserve **EXIF / ICC metadata**
- ✅ Supports `.jpg`, `.png`, `.webp`, `.tiff`, `.avif`, `.heic`, `.heif`
- ✅ Control **position, opacity, scale, margin**
- ✅ Output keeps original file extension + suffix

---

## 📦 Installation

Clone or download this repo, then install dependencies:

```bash
npm install
```

Make sure you have Node.js v16+ (v18+ recommended).

## ⚡ Usage
### Watermark with Text
Process all images in a folder, put text bottom-left:

```bash
node watermark.js \
  --input "./images" \
  --out "./watermarked" \
  --wmText "© Emre" \
  --position bottom-left \
  --scale 0.25 \
  --opacity 0.4 \
  --margin 24
```

### Watermark with Image (Logo)
Place a logo in the bottom-right:
```bash
node watermark.js \
  --input "./photos" \
  --out "./wm" \
  --wmImg "./logo.png" \
  --position bottom-right \
  --scale 0.2 \
  --opacity 0.5 \
  --margin 32
```

### Single Image Example
Add a centered text watermark to one photo:
```bash
node watermark.js \
  --input "./photo.jpg" \
  --out "./wm" \
  --wmText "Demo" \
  --position center \
  --scale 0.3 \
  --opacity 0.25
```

## ⚙️ Options


| Option       | Alias | Type   | Default         | Description                                                      |
| ------------ | ----- | ------ | --------------- | ---------------------------------------------------------------- |
| `--input`    | `-i`  | string | **required**    | Input image or folder                                            |
| `--out`      | `-o`  | string | `./watermarked` | Output folder                                                    |
| `--wmImg`    |       | string |                 | Path to watermark image (PNG recommended)                        |
| `--wmText`   |       | string |                 | Watermark text (ignored if `--wmImg` is set)                     |
| `--position` | `-p`  | choice | `bottom-right`  | `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center` |
| `--scale`    | `-s`  | number | `0.2`           | Watermark width as fraction of image width                       |
| `--opacity`  | `-a`  | number | `0.4`           | Transparency (0 = invisible, 1 = solid)                          |
| `--margin`   | `-m`  | number | `24`            | Margin from edges (px)                                           |
| `--suffix`   |       | string | `_wm`           | Output filename suffix                                           |
| `--quality`  |       | number | `90`            | JPEG/WebP/AVIF quality                                           |

## 📝 Notes

- Use transparent PNG or SVG for best image watermark results.
- GIFs are flattened to the first frame (saved as PNG).
- HEIC/HEIF output depends on your sharp installation.
- Adjust --scale and --margin for different image sizes.

## 📄 License

MIT © 2025 KindCoder-NO
