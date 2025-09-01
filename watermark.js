#!/usr/bin/env node
/**
 * Watermark images & videos with an image or text.
 * - Images: sharp (preserves EXIF/ICC)
 * - Videos: ffmpeg/ffprobe (re-encodes video, copies audio)
 * - Positions: top-left, top-right, bottom-left, bottom-right, center
 * - Scale is relative to base media width
 * - Opacity 0..1
 *
 * Examples:
 *  node watermark.js --input ./images --out ./out --wmImg ./logo.png --position bottom-right --scale 0.2 --opacity 0.5 --margin 24
 *  node watermark.js --input ./video.mp4 --out ./out --wmText "© Emre" --position bottom-left --scale 0.25 --opacity 0.35
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { spawn } = require("child_process");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");

// ---------- File type support ----------
const IMAGE_EXT = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".tiff", ".avif", ".heic", ".heif", ".gif"
]);

const VIDEO_EXT = new Set([
  ".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi"
]);

// ---------- CLI ----------
const argv = yargs(hideBin(process.argv))
  .option("input", {
    alias: "i",
    type: "string",
    demandOption: true,
    describe: "Path to an image/video file or a folder of media",
  })
  .option("out", {
    alias: "o",
    type: "string",
    default: "./watermarked",
    describe: "Output folder (will be created if missing)",
  })
  .option("wmImg", {
    type: "string",
    describe: "Path to a watermark image (PNG recommended w/ transparency)",
  })
  .option("wmText", {
    type: "string",
    describe: "Watermark text (ignored if --wmImg is provided)",
  })
  .option("position", {
    alias: "p",
    choices: ["top-left", "top-right", "bottom-left", "bottom-right", "center"],
    default: "bottom-right",
    describe: "Where to place the watermark",
  })
  .option("scale", {
    alias: "s",
    type: "number",
    default: 0.2,
    describe: "Watermark width as a fraction of the base width (0 < s ≤ 1)",
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
    describe: "Quality for JPEG/WebP/AVIF/TIFF images",
  })
  // Video-specific (optional)
  .option("ffmpegPath", {
    type: "string",
    default: "ffmpeg",
    describe: "Path to ffmpeg binary",
  })
  .option("ffprobePath", {
    type: "string",
    default: "ffprobe",
    describe: "Path to ffprobe binary",
  })
  .option("fontFile", {
    type: "string",
    describe: "Path to a .ttf/.otf for drawtext (videos only, optional)",
  })
  .option("vcodec", {
    type: "string",
    default: "libx264",
    describe: "Video codec for output (e.g. libx264, libx265, libvpx-vp9)",
  })
  .option("crf", {
    type: "number",
    default: 20,
    describe: "CRF for video quality (lower = higher quality; typical 18–24)",
  })
  .option("preset", {
    type: "string",
    default: "medium",
    describe: "ffmpeg encode preset (ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow)",
  })
  .option("verbose", {
    alias: "v",
    type: "boolean",
    default: false,
    describe: "Show more detailed output for debugging"
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

// ---------- Main ----------
(async function main() {
  try {
    const stat = fs.statSync(argv.input);
    if (!fs.existsSync(argv.out)) fs.mkdirSync(argv.out, { recursive: true });

    if (stat.isDirectory()) {
      const entries = fs.readdirSync(argv.input);
      const files = entries
        .filter(f => IMAGE_EXT.has(ext(f)) || VIDEO_EXT.has(ext(f)))
        .map(f => path.join(argv.input, f));

      if (files.length === 0) {
        console.log("No supported images/videos found in folder:", argv.input);
        process.exit(0);
      }

      let processed = 0;
      for (let idx = 0; idx < files.length; idx++) {
        const file = files[idx];
        const e = ext(file);
        const tag = IMAGE_EXT.has(e) ? "image" : VIDEO_EXT.has(e) ? "video" : "skip";
        console.log(`[${idx + 1}/${files.length}] ${tag}: ${path.basename(file)}`);
        await processOne(file, argv.out);
        processed++;
      }
      console.log(`\nDone. Processed ${processed} item(s) → ${argv.out}`);
    } else {
      const e = ext(argv.input);
      const tag = IMAGE_EXT.has(e) ? "image" : VIDEO_EXT.has(e) ? "video" : "file";
      console.log(`${tag}: ${path.basename(argv.input)}`);
      await processOne(argv.input, argv.out);
      console.log(`\nDone. Output saved in: ${argv.out}`);
    }
  } catch (err) {
    console.error("\nError:", err.message);
    process.exit(1);
  }
})();

async function processOne(inputPath, outDir) {
  const e = ext(inputPath);
  if (IMAGE_EXT.has(e)) {
    await processImage(inputPath, outDir);
  } else if (VIDEO_EXT.has(e)) {
    await processVideo(inputPath, outDir);
  } else {
    console.warn(`Skipping unsupported file: ${inputPath}`);
  }
}

// ---------- Images via sharp ----------
async function processImage(inputPath, outDir) {
  console.log(`   • Processing image...`);
  const base = sharp(inputPath, { animated: false });
  const meta = await base.metadata();
  if (!meta.width || !meta.height) {
    throw new Error(`Could not read dimensions for ${inputPath}`);
  }
  const imgWidth = meta.width;
  let overlay;

  if (argv.wmImg) {
    const wm = sharp(argv.wmImg).png();
    const targetW = Math.max(1, Math.round(imgWidth * argv.scale));
    overlay = await wm.resize({ width: targetW }).toBuffer();
  } else {
    // Text watermark as SVG
    const text = argv.wmText;
    const approxCharWidthFactor = 0.6;
    const targetTextWidth = imgWidth * argv.scale;
    const fontSize = Math.max(
      10,
      Math.round(targetTextWidth / Math.max(1, text.length * approxCharWidthFactor))
    );
    const pad = Math.round(fontSize * 0.35);
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(targetTextWidth) + pad * 2}" height="${fontSize + pad * 2}">
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

  const { left, top } = await computePositionSharp(meta, overlay, argv.position, argv.margin);

  let pipeline = sharp(inputPath, { animated: false }).withMetadata();
  pipeline = pipeline.composite([{
    input: overlay,
    left, top,
    blend: "over",
    opacity: argv.opacity,
  }]);

  const e = ext(inputPath);
  const name = path.basename(inputPath, e);
  const outPath = path.join(outDir, `${name}${argv.suffix}${e}`);

  switch (e) {
    case ".jpg":
    case ".jpeg":
      pipeline = pipeline.jpeg({ quality: argv.quality, mozjpeg: true }); break;
    case ".png":
      pipeline = pipeline.png(); break;
    case ".webp":
      pipeline = pipeline.webp({ quality: argv.quality }); break;
    case ".avif":
      pipeline = pipeline.avif({ quality: argv.quality }); break;
    case ".tiff":
      pipeline = pipeline.tiff({ quality: argv.quality }); break;
    case ".gif":
      pipeline = pipeline.png(); break; // flatten → PNG
    case ".heic":
    case ".heif":
      try { pipeline = pipeline.heif({ quality: argv.quality }); }
      catch { pipeline = pipeline.jpeg({ quality: argv.quality, mozjpeg: true }); }
      break;
  }

  await pipeline.toFile(outPath);
  console.log(`   • Saved → ${outPath}`);
}

async function computePositionSharp(meta, overlayBuffer, position, margin) {
  const ovMeta = await sharp(overlayBuffer).metadata();
  const ow = ovMeta.width || 0;
  const oh = ovMeta.height || 0;
  const W = meta.width || 0;
  const H = meta.height || 0;

  let left = margin, top = margin;
  switch (position) {
    case "top-left": break;
    case "top-right": left = Math.max(0, W - ow - margin); break;
    case "bottom-left": top = Math.max(0, H - oh - margin); break;
    case "bottom-right":
      left = Math.max(0, W - ow - margin);
      top = Math.max(0, H - oh - margin);
      break;
    case "center":
      left = Math.max(0, Math.round((W - ow) / 2));
      top  = Math.max(0, Math.round((H - oh) / 2));
      break;
  }
  return { left, top };
}

// ---------- Videos via ffmpeg ----------
async function processVideo(inputPath, outDir) {
  const dims = await ffprobeDimensions(inputPath);
  if (!dims || !dims.width || !dims.height) {
    throw new Error(`ffprobe couldn't read video dimensions for ${inputPath}`);
  }

  const duration = await ffprobeDuration(inputPath);
  const mainW = dims.width;

  const e = ext(inputPath);
  const name = path.basename(inputPath, e);
  const outPath = path.join(outDir, `${name}${argv.suffix}${e}`);

  const coord = overlayCoords(argv.position, argv.margin);

  let filterComplex;
  const inputs = ["-i", inputPath];

  if (argv.wmImg) {
    // Two inputs: [0:v] main, [1:v] logo
    inputs.push("-i", argv.wmImg);

    const targetLogoW = Math.max(1, Math.round(mainW * argv.scale));
    const wmChain =
      `[1:v]scale=${targetLogoW}:-1:flags=lanczos,format=rgba,` +
      `colorchannelmixer=aa=${clamp01(argv.opacity)}[wm]`;

    const overlay = `[0:v][wm]overlay=${coord.x}:${coord.y}:eval=init:format=auto[v]`;
    filterComplex = `${wmChain};${overlay}`;
  } else {
    // Text watermark with enhanced visibility
    const fontSize = Math.max(16, Math.round(mainW * argv.scale * 0.08)); // Larger font for better visibility
    
    // Explicitly handle positioning
    let xPos = coord.x;
    let yPos = coord.y;
    
    // For bottom positions, ensure we're using h_margin from the bottom
    if (argv.position === "bottom-left" || argv.position === "bottom-right") {
      yPos = `h-${fontSize*1.5}-${argv.margin}`;  // Account for text height + padding
    }
    
    const drawTextParts = [
      `drawtext=text='${escapeDrawtext(argv.wmText)}'`,
      argv.fontFile ? `fontfile='${escapePath(argv.fontFile)}'` : null,
      `fontsize=${fontSize}`,
      `fontcolor=white@${clamp01(argv.opacity)}`,
      `shadowcolor=black@0.8`,  // Add shadow
      `shadowx=2`,              // Shadow offset
      `shadowy=2`,              // Shadow offset
      `borderw=${Math.max(2, Math.round(fontSize * 0.1))}`, // Thicker border
      `bordercolor=black@${Math.min(1, argv.opacity + 0.2).toFixed(2)}`,
      `x=${xPos}`,
      `y=${yPos}`,
      `box=1`,                  // Add a box behind text
      `boxcolor=black@0.5`,     // Semi-transparent black box
      `boxborderw=5`            // Box padding
    ].filter(Boolean).join(":");

    filterComplex = `[0:v]${drawTextParts}[v]`;
  }

  const args = [
    "-y",
    ...inputs,
    "-filter_complex", filterComplex,
    "-map", "[v]",
    "-map", "0:a?",
    "-c:v", argv.vcodec,
    "-preset", argv.preset,
    "-crf", String(argv.crf),
    "-c:a", "copy",
    outPath
  ];

  console.log(`   • Processing video... (${duration ? `${duration.toFixed(1)}s` : "unknown length"})`);

  if (argv.verbose) {
    console.log(`   • ffmpeg command: ${argv.ffmpegPath} ${args.join(' ')}`);
    console.log(`   • Filter complex: ${filterComplex}`);
  }

  await spawnPromise(argv.ffmpegPath, args, {
    onProgress: (msg) => {
      if (argv.verbose) {
        console.log(`   • ffmpeg: ${msg.trim()}`);
      } else if (duration) {
        const m = /time=(\d+:\d+:\d+\.\d+)/.exec(msg);
        if (m) {
          const sec = parseFfmpegTime(m[1]);
          const pct = Math.min(100, (sec / duration) * 100);
          process.stdout.write(`\r     → ${pct.toFixed(1)}%`);
        }
      }
    }
  });

  process.stdout.write(`\r     → 100%\n`);
  console.log(`   • Saved → ${outPath}`);
}

// ---------- ffprobe helpers ----------
async function ffprobeDimensions(file) {
  const args = [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-of", "json",
    file
  ];
  if (argv.verbose) {
    console.log(`   • Running ffprobe command: ${argv.ffprobePath} ${args.join(' ')}`);
  }
  const { stdout } = await spawnPromise(argv.ffprobePath, args);
  try {
    const j = JSON.parse(stdout);
    const s = j.streams && j.streams[0];
    if (argv.verbose) {
      console.log(`   • Video dimensions: ${s ? s.width + 'x' + s.height : 'unknown'}`);
    }
    return s ? { width: s.width, height: s.height } : null;
  } catch (err) {
    console.error(`   • Error parsing ffprobe output: ${err.message}`);
    return null;
  }
}

async function ffprobeDuration(file) {
  const args = [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file
  ];
  try {
    const { stdout } = await spawnPromise(argv.ffprobePath, args);
    const d = parseFloat(stdout.trim());
    return Number.isFinite(d) ? d : 0;
  } catch {
    return 0;
  }
}

// ---------- Utilities ----------
function spawnPromise(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    try {
      if (argv.verbose) {
        console.log(`   • Executing: ${cmd} ${args.join(' ')}`);
      } else {
        console.log(`   • Executing: ${cmd}...`);
      }
      
      // Check that ffmpeg/ffprobe commands exist
      if ((cmd.includes('ffmpeg') || cmd.includes('ffprobe')) && !fs.existsSync(cmd) && !isCommandAvailable(cmd)) {
        throw new Error(`Command '${cmd}' not found. Make sure it's installed and in your PATH.`);
      }
      
      const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "", stderr = "";

      child.stdout.on("data", d => stdout += d.toString());

      child.stderr.on("data", d => {
        const msg = d.toString();
        stderr += msg;
        if (opts.onProgress) opts.onProgress(msg);
      });

      child.on("error", (err) => {
        console.error(`   • Error executing ${cmd}: ${err.message}`);
        if (err.code === 'ENOENT') {
          console.error(`   • ${cmd} not found. Make sure it's installed and in your PATH.`);
        }
        reject(err);
      });
      
      child.on("close", code => {
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(`${cmd} exited with code ${code}\n${stderr}`));
      });
    } catch (err) {
      reject(err);
    }
  });
}

// Helper to check if a command is available in PATH
function isCommandAvailable(cmd) {
  try {
    // Use 'which' on Unix/Mac or 'where' on Windows
    const checkCmd = process.platform === 'win32' ? 'where' : 'which';
    require('child_process').execSync(`${checkCmd} ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

function overlayCoords(position, margin) {
  const M = Math.max(0, margin);
  switch (position) {
    case "top-left": return { x: M, y: M };
    case "top-right": return { x: `W-w-${M}`, y: M };
    case "bottom-left": return { x: M, y: `H-h-${M}` };
    case "bottom-right": return { x: `W-w-${M}`, y: `H-h-${M}` };
    case "center": return { x: `(W-w)/2`, y: `(H-h)/2` };
    default: return { x: `W-w-${M}`, y: `H-h-${M}` };
  }
}

function parseFfmpegTime(str) {
  // Matches "HH:MM:SS.xx"
  const m = /(\d+):(\d+):(\d+\.?\d*)/.exec(str);
  if (!m) return 0;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const s = parseFloat(m[3]);
  return h * 3600 + min * 60 + s;
}

function ext(f) { return path.extname(f).toLowerCase(); }
function clamp01(x) { return Math.max(0, Math.min(1, Number(x))); }
function escapeXml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function escapeDrawtext(s) {
  // Escape characters significant to drawtext parsing: ':', '\'', '\n', '%', '\'
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/%/g, "\\%");
}
function escapePath(p) {
  // wrapped in single quotes by caller; escape internal single quotes
  return String(p).replace(/'/g, "'\\''");
}
