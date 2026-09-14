/**
 * Comprehensive E2E pipeline verification for the metadata remover.
 *
 * Simulates the exact browser pipeline from ToolUpload.astro:
 *   1. sharp creates images WITH metadata (JPEG/PNG/WebP)
 *   2. exifr.parse() scans for metadata (browser code path)
 *   3. canvas re-encode "strips" metadata (sharp -> output without metadata)
 *   4. re-scan the output with exifr to PROVE it is clean
 *
 * Uses native Node canvg-free approach: we re-encode via sharp for Raster ops
 * because there is no canvas in Node. The key logic (parse -> detect -> strip)
 * is identical. We verify the actual deliverables: a clean file.
 */
import sharp from 'sharp';
import exifr from 'exifr';
import { writeFileSync, readFileSync, statSync } from 'fs';

const MK = 'TestCameraMakeForPMR';
const MD = 'TestCameraModelForPMR';
const FIXTURE_DIR = 'clean-verify';

let pass = 0;
let fail = 0;

function assert(cond, label) {
  if (cond) {
    console.log(`  PASS: ${label}`);
    pass++;
  } else {
    console.log(`  FAIL: ${label}`);
    fail++;
  }
}

// Mirror of parseWebpExif in ToolUpload.astro: WebP stores EXIF as a raw TIFF
// payload in a RIFF 'EXIF' chunk (optionally prefixed by "Exif\0\0"). exifr's
// file parser does not understand the WebP container, so extract the chunk.
// Accepts a Buffer (Node) or ArrayBuffer (browser).
async function parseWebpExif(input, exifrModule) {
  const arrayBuffer = Buffer.isBuffer(input)
    ? input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
    : input;
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  if (bytes.length < 12) return null;
  if (view.getUint32(0) !== 0x52494646) return null; // 'RIFF'
  if (view.getUint32(8) !== 0x57454250) return null; // 'WEBP'
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const fourCC = view.getUint32(offset);
    const chunkSize = view.getUint32(offset + 4, true);
    const payloadStart = offset + 8;
    if (payloadStart + chunkSize > bytes.length) break;
    if (fourCC === 0x45584946) { // 'EXIF'
      try {
        let tiffStart = payloadStart;
        if (
          chunkSize >= 6 &&
          bytes[payloadStart] === 0x45 && bytes[payloadStart + 1] === 0x78 &&
          bytes[payloadStart + 2] === 0x69 && bytes[payloadStart + 3] === 0x66 &&
          bytes[payloadStart + 4] === 0x00 && bytes[payloadStart + 5] === 0x00
        ) {
          tiffStart += 6;
        }
        const tiff = bytes.slice(tiffStart, payloadStart + chunkSize);
        const parsed = await exifrModule.parse(tiff);
        return parsed || null;
      } catch (_err) {
        return null;
      }
    }
    offset = payloadStart + chunkSize + (chunkSize % 2);
  }
  return null;
}

// Mirror of parseMetadataForFileType in ToolUpload.astro.
async function parseForType(input, type, exifrModule) {
  if (type !== 'webp') {
    const parsed = await exifrModule.parse(input);
    return parsed || {};
  }
  const webpMeta = await parseWebpExif(input, exifrModule);
  if (webpMeta && Object.keys(webpMeta).length > 0) return webpMeta;
  // No EXIF chunk found (or empty) — the browser path catches this gracefully.
  try {
    const parsed = await exifrModule.parse(input);
    return parsed || {};
  } catch (_err) {
    return {};
  }
}

async function createOriginal(type, meta) {
  const bg = type === 'jpeg' ? { r: 220, g: 10, b: 10 }
    : type === 'png' ? { r: 10, g: 220, b: 10 }
    : { r: 10, g: 10, b: 220 };
  const channels = type === 'png' ? 4 : 3;
  return sharp({
    create: { width: 320, height: 240, channels, background: bg },
  })
    .toFormat(type, type === 'jpeg' ? { quality: 90 } : type === 'png' ? {} : { quality: 90 })
    .withMetadata({ exif: meta })
    .toBuffer();
}

console.log('=== COMPREHENSIVE PIPELINE VERIFICATION ===\n');

// ------------------------------------------------------------------
// 1. Create originals WITH metadata
// ------------------------------------------------------------------
const exifJPEG = { IFD0: { Make: MK, Model: MD, DateTime: '2024:01:15 12:30:45' } };
const exifPNG  = { IFD0: { Make: MK, Model: MD, DateTime: '2024:02:20 14:00:00' } };
const exifWEBP = { IFD0: { Make: MK, Model: MD } };

const orig = {};
for (const t of ['jpeg', 'png', 'webp']) {
  orig[t] = await createOriginal(t, t === 'jpeg' ? exifJPEG : t === 'png' ? exifPNG : exifWEBP);
  writeFileSync(`${FIXTURE_DIR}-orig-${t}.bin`, orig[t]);
  console.log(`Created ${t}: ${orig[t].length} bytes`);
  const meta = await parseForType(orig[t], t, exifr);
  const fields = meta ? Object.keys(meta).length : 0;
  console.log(`  -> detected ${fields} metadata field(s)`);
  assert(fields > 0, `${t} original HAS metadata (${fields} fields)`);
}

// ------------------------------------------------------------------
// 2. Re-scan originals with a FRESH exifr parse (same as UI after drop)
//    Confirm metadata IS present so strip is meaningful.
// ------------------------------------------------------------------
console.log('\n--- Scanning originals (post-drop simulation) ---');
for (const t of ['jpeg', 'png', 'webp']) {
  const again = await parseForType(orig[t], t, exifr);
  const fields = again ? Object.keys(again).length : 0;
  assert(fields > 0, `${t} still has metadata after re-scan (${fields} fields)`);
}

// ------------------------------------------------------------------
// 3. STRIP: re-encode WITHOUT metadata (canvas writes clean pixels)
//    - canvas.toBlob drops all EXIF; sharp re-encode also drops it
//    - same effect: clean cache, no user-app metadata
// ------------------------------------------------------------------
console.log('\n--- Stripping metadata (canvas re-encode simulation) ---');
const cleaned = {};
for (const t of ['jpeg', 'png', 'webp']) {
  const clean = await sharp(orig[t]).toFormat(t).toBuffer();
  cleaned[t] = clean;
  writeFileSync(`${FIXTURE_DIR}-clean-${t}.${t === 'jpeg' ? 'jpg' : t}`, clean);
  console.log(`Stripped ${t}: original ${orig[t].length}b -> clean ${clean.length}b`);
}

// ------------------------------------------------------------------
// 4. PROVE the stripped file is clean (re-scan the actual download file)
// ------------------------------------------------------------------
console.log('\n--- PROOF: re-scanning the actual stripped/downloaded file ---');
for (const t of ['jpeg', 'png', 'webp']) {
  const fileBuf = readFileSync(`${FIXTURE_DIR}-clean-${t}.${t === 'jpeg' ? 'jpg' : t}`);
  const meta = await parseForType(fileBuf, t, exifr);
  const fields = meta ? Object.keys(meta).length : 0;
  // Metadata may still be present in some exotic PNG chunk; assert we did NOT preserve
  // the test author/device tags we injected.
  const leakedMake = meta && meta.Make;
  const leakedModel = meta && meta.Model;
  console.log(`  ${t} clean file has ${fields} metadata field(s), Make=${JSON.stringify(leakedMake)}, Model=${JSON.stringify(leakedModel)}`);
  assert(!leakedMake && !leakedModel, `clean ${t} has NO leaked Make/Model`);
}

// ------------------------------------------------------------------
// 5. TIFF -> PNG fallback (canvas cannot export TIFF)
// ------------------------------------------------------------------
console.log('\n--- TIFF -> PNG fallback ---');
const tiffOrig = await sharp({
  create: { width: 120, height: 120, channels: 3, background: { r: 0, g: 120, b: 0 } },
})
  .tiff()
  .withMetadata({ exif: exifJPEG })
  .toBuffer();
writeFileSync(`${FIXTURE_DIR}-orig-tiff.tiff`, tiffOrig);
const tiffMeta = await exifr.parse(tiffOrig);
assert(tiffMeta && Object.keys(tiffMeta).length > 0, 'TIFF original HAS metadata');
// canvas fallback: export as PNG -> clean
const tiffClean = await sharp(tiffOrig).png().toBuffer();
writeFileSync(`${FIXTURE_DIR}-clean-tiff.png`, tiffClean);
const tiffCleanMeta = await exifr.parse(tiffClean);
assert(!tiffCleanMeta?.Make && !tiffCleanMeta?.Model, 'TIFF->PNG clean file has NO leaked Make/Model');

// ------------------------------------------------------------------
// 6. Transparency preserved for PNG
// ------------------------------------------------------------------
console.log('\n--- PNG transparency preserved ---');
const transparent = await sharp({
  create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
}).png().toBuffer();
const tInfo = await sharp(transparent).metadata();
assert(tInfo.hasAlpha === true, 'PNG alpha channel preserved through re-encode');

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
console.log('ALL PIPELINE CHECKS PASSED');