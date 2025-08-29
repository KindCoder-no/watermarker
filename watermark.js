#!/usr/bin/env node
/**
 * Watermark photos with an image or text.
 * - Preserves EXIF/ICC using withMetadata()
 * - Supports batch folders
 * - Positions: top-left, top-right, bottom-left, bottom-right, center
 * - Scale is relative to base image width
 * - Opacity 0..1
 *
 * Examples:
 *  node watermark.js --input ./images --out ./out --wmImg ./logo.png --position bottom-right --scale 0.2 --opacity 0.5 --margin 24
 *  node watermark.js --input ./photo.jpg --wmText "© Emre" --position center --scale 0.3 --opacity 0.2
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");

const SUPPORTED_EXT = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".tiff", ".avif", ".heic", ".heif", ".gif" // gif will be flattened to first frame
]);

const argv = yargs(hideBin(process.argv))
  .option("input", {
    alias: "i",
    type: "string",
    demandOption: true,
    describe: "Path to an image file or a folder of images",
  })
  .option("out", {
    alias: "o",
    type: "string",
    default: "./watermarked",
    describe: "Output folder (will be created if missing)",
  })
  .option("wmImg", {
    type: "string",
    describe: "Path to a watermark image (PNG recommended with transparency)",
  })
  .option("wmText", {
    type: "string",
    describe: "Watermark text (ignored if --wmImg is provided)",
  })
  .option("position", {
    alias: "p",
    choices: ["top-left","top-right","bottom-left","bottom-right","center"],
    default: "bottom-right",
    describe: "Where to place the watermark",
  })
  .option("scale", {
    alias: "s",
    type: "number",
    default: 0.2,
    describe: "Watermark width as a fraction of the base image width (e.g. 0.2 = 20%)",
  })
  .option("opacity", {
    alias: "a",
    type: "number",
    default: 0.4,
    describe: "Watermark opacity 0..1",
  })
  .option("margin", {
    alias: "m",
    type: "number",
    default: 24,
    describe: "Margin in pixels from the edges",
  })
  .option("suffix", {
    type: "string",
    default: "_wm",
    describe: "Suffix to append to output filenames",
  })
  .option("quality", {
    type: "number",
    default: 90,
    describe: "Quality for JPEG/WebP/AVIF outputs where applicable",
  })
  .check((args) => {
    if (!args.wmImg && !args.wmText) {
      throw new Error("You must provide either --wmImg or --wmText.");
    }
    if (args.scale <= 0 || args.scale > 1.0) {
      throw new Error("--scale must be in (0, 1].");
    }
    if (args.opacity < 0 || args.opacity > 1.0) {
      throw new Error("--opacity must be in [0, 1].");
    }
    return true;
  })
  .help()
  .argv;

(async function main() {
  try {
    const stat = fs.statSync(argv.input);
    if (!fs.existsSync(argv.out)) fs.mkdirSync(argv.out, { recursive: true });

    if (stat.isDirectory()) {
      const files = fs.readdirSync(argv.input)
        .filter(f => SUPPORTED_EXT.has(path.extname(f).toLowerCase()))
        .map(f => path.join(argv.input, f));

      if (files.length === 0) {
        console.log("No supported images found in folder:", argv.input);
        process.exit(0);
      }
      for (const file of files) {
        await processOne(file, argv.out);
      }
      console.log(`Done. Processed ${files.length} file(s) → ${argv.out}`);
    } else {
      await processOne(argv.input, argv.out);
      console.log(`Done. Output saved in: ${argv.out}`);
    }
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
})();

async function processOne(inputPath, outDir) {
  const base = sharp(inputPath, { animated: false });
  const meta = await base.metadata();

  // Ensure we have width/height
  if (!meta.width || !meta.height) {
    throw new Error(`Could not read dimensions for ${inputPath}`);
  }

  const imgWidth = meta.width;
  let overlay;

  if (argv.wmImg) {
    // Prepare watermark image
    const wm = sharp(argv.wmImg).png();
    const wmMeta = await wm.metadata();

    // Resize watermark to target width = imgWidth * scale
    const targetW = Math.max(1, Math.round(imgWidth * argv.scale));
    overlay = await wm.resize({ width: targetW }).toBuffer();
  } else {
    // Prepare text watermark as SVG
    const text = argv.wmText;
    // crude font size estimate so text width ≈ imgWidth * scale
    const approxCharWidthFactor = 0.6; // rough average
    const targetTextWidth = imgWidth * argv.scale;
    const fontSize = Math.max(
      10,
      Math.round(targetTextWidth / Math.max(1, text.length * approxCharWidthFactor))
    );

    // Add slight padding inside the text box
    const pad = Math.round(fontSize * 0.35);

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(targetTextWidth) + pad * 2}" height="${fontSize + pad * 2}">
        <style>
          @supports (font-kerning: normal) {
            text { font-kerning: normal; }
          }
        </style>
        <rect x="0" y="0" width="100%" height="100%" fill="none"/>
        <text x="${pad}" y="${fontSize + Math.round(pad * 0.2)}"
              font-family="Arial, Helvetica, sans-serif"
              font-size="${fontSize}"
              fill="white"
              stroke="black"
              stroke-opacity="0.4"
              stroke-width="${Math.max(1, Math.round(fontSize * 0.08))}">
          ${escapeXml(text)}
        </text>
      </svg>
    `;
    overlay = Buffer.from(svg);
  }

  // Compute position
  const { left, top } = await computePosition(meta, overlay, argv.position, argv.margin);

  // Build pipeline
  let pipeline = sharp(inputPath, { animated: false })
    .withMetadata(); // keep EXIF/ICC/orientation

  pipeline = pipeline.composite([{
    input: overlay,
    left,
    top,
    gravity: undefined, // using explicit coordinates
    blend: "over",
    opacity: argv.opacity,
  }]);

  // Decide output filename & format (keep original extension)
  const ext = (path.extname(inputPath) || ".jpg").toLowerCase();
  const name = path.basename(inputPath, ext);
  const outPath = path.join(outDir, `${name}${argv.suffix}${ext}`);

  // Format-specific options
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      pipeline = pipeline.jpeg({ quality: argv.quality, mozjpeg: true });
      break;
    case ".png":
      pipeline = pipeline.png();
      break;
    case ".webp":
      pipeline = pipeline.webp({ quality: argv.quality });
      break;
    case ".avif":
      pipeline = pipeline.avif({ quality: argv.quality });
      break;
    case ".tiff":
      pipeline = pipeline.tiff({ quality: argv.quality });
      break;
    case ".gif":
      // flatten to single frame already; output png for quality
      pipeline = pipeline.png();
      break;
    case ".heic":
    case ".heif":
      // keep as heif if supported by libvips; otherwise fallback to jpeg
      try {
        pipeline = pipeline.heif({ quality: argv.quality });
      } catch {
        pipeline = pipeline.jpeg({ quality: argv.quality, mozjpeg: true });
      }
      break;
    default:
      // fallback to original
      break;
  }

  await pipeline.toFile(outPath);
}

async function computePosition(meta, overlayBuffer, position, margin) {
  // measure overlay dimensions by letting sharp probe it
  const ovMeta = await sharp(overlayBuffer).metadata();
  const ow = ovMeta.width || 0;
  const oh = ovMeta.height || 0;

  const W = meta.width || 0;
  const H = meta.height || 0;

  let left = margin;
  let top = margin;

  switch (position) {
    case "top-left":
      left = margin; top = margin; break;
    case "top-right":
      left = Math.max(0, W - ow - margin); top = margin; break;
    case "bottom-left":
      left = margin; top = Math.max(0, H - oh - margin); break;
    case "bottom-right":
      left = Math.max(0, W - ow - margin); top = Math.max(0, H - oh - margin); break;
    case "center":
      left = Math.max(0, Math.round((W - ow) / 2));
      top = Math.max(0, Math.round((H - oh) / 2));
      break;
  }
  return { left, top };
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
