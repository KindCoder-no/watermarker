# 📷🎞️ Photo & Video Watermarker (Node.js + ffmpeg)

A Node.js CLI tool to add **watermarks** to both **images** and **videos**.  
- Uses **sharp** for images  
- Uses **ffmpeg/ffprobe** for videos  
- Supports **text** or **image logo** watermarks  
- Works on **single files** or **whole folders**  

---

## 🚀 Features
- ✅ Add **text** or **logo image** watermark  
- ✅ Works with **images** (`jpg`, `png`, `webp`, `avif`, `heic/heif`, `tiff`, `gif`)  
- ✅ Works with **videos** (`mp4`, `mov`, `m4v`, `mkv`, `webm`, `avi`)  
- ✅ Batch process folders  
- ✅ Position: `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center`  
- ✅ Control **opacity, scale, margin**  
- ✅ Image watermarks preserve EXIF/ICC metadata  
- ✅ Video watermarks re-encode video and copy audio (configurable codec/CRF/preset)  

---

## 📦 Requirements
- **Node.js 16+** (Node 18+ recommended)  
- **ffmpeg + ffprobe** installed and in your PATH  
  - macOS: `brew install ffmpeg`  
  - Ubuntu/Debian: `sudo apt install ffmpeg`  
  - Windows: [Download FFmpeg](https://ffmpeg.org/download.html)  

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

### 🖼️ Logo watermark (bottom-right on a video)
```bash
node watermark.js \
  --input "./clip.mp4" \
  --out "./wm" \
  --wmImg "./logo.png" \
  --position bottom-right \
  --scale 0.2 \
  --opacity 0.5 \
  --margin 32
```

### 🎞️ Single video with centered text watermark
```bash
node watermark.js \
  --input "./movie.mov" \
  --out "./wm" \
  --wmText "Demo" \
  --position center \
  --scale 0.3 \
  --opacity 0.3 \
  --fontFile "/Library/Fonts/Arial.ttf"
```

## ⚙️ Options

| Option          | Alias | Default         | Description                                                      |
| --------------- | ----- | --------------- | ---------------------------------------------------------------- |
| `--input`       | `-i`  | **required**    | Input image/video file or folder                                 |
| `--out`         | `-o`  | `./watermarked` | Output folder                                                    |
| `--wmImg`       |       |                 | Path to watermark image (PNG recommended)                        |
| `--wmText`      |       |                 | Watermark text (ignored if `--wmImg` is given)                   |
| `--position`    | `-p`  | `bottom-right`  | `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center` |
| `--scale`       | `-s`  | `0.2`           | Watermark width as fraction of base width                        |
| `--opacity`     | `-a`  | `0.4`           | Transparency (0 = invisible, 1 = solid)                          |
| `--margin`      | `-m`  | `24`            | Margin in pixels from edges                                      |
| `--suffix`      |       | `_wm`           | Suffix added to output filenames                                 |
| `--quality`     |       | `90`            | Image quality (JPEG/WebP/AVIF/TIFF)                              |
| `--ffmpegPath`  |       | `ffmpeg`        | Path to ffmpeg binary                                            |
| `--ffprobePath` |       | `ffprobe`       | Path to ffprobe binary                                           |
| `--fontFile`    |       | system default  | Path to `.ttf` or `.otf` font (videos only)                      |
| `--vcodec`      |       | `libx264`       | Video codec (e.g. `libx264`, `libx265`, `libvpx-vp9`)            |
| `--crf`         |       | `20`            | Video quality (lower = better, typical 18–24)                    |
| `--preset`      |       | `medium`        | ffmpeg encode preset (`ultrafast` → `veryslow`)                  |


## 📝 Notes

- Use transparent PNG or SVG for best image watermark results.
- For text watermarks on videos, specify a --fontFile if you need a particular font.
- GIFs are flattened to the first frame (saved as PNG).
- HEIC/HEIF output depends on your sharp installation.
- Adjust --scale and --margin for different image sizes.
- Videos are re-encoded, so expect processing time proportional to video length.

## 📄 License

MIT © 2025 KindCoder-NO
