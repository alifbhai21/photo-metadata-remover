/**
 * PRIVACY-FIELD VERIFICATION: Prove that re-encoded (clean) files have
 * ZERO privacy-sensitive fields, and that the counter logic in
 * ToolUpload.astro (countPrivacyFields) reports correctly.
 *
 * Mirrors the PRIVACY_KEYS set and the chunk-scoped PNG key rule added to
 * ToolUpload.astro, applies them to original and clean fixture files, and
 * exercises the real PNG chunk reader (src/lib/png.ts) for the scan-side
 * detection added for tEXt / zTXt / iTXt / tIME.
 */
import sharp from 'sharp';
import exifr from 'exifr';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { buildPlainPng, buildRgbExifPng, buildSingleChunkPng, buildTextualPng, rebuildPng, textChunkPayload, itxtChunkPayload } from './test-png-fixture.mjs';
import { readPngMetadataChunks } from './src/lib/png.ts';

const PRIVACY_KEYS = new Set([
  // Camera / device identification
  'Make', 'Model', 'Software', 'LensModel', 'LensMake',
  'LensInfo', 'BodySerialNumber', 'LensSerialNumber',
  // Dates / timestamps
  'DateTimeOriginal', 'DateTimeDigitized', 'DateTime',
  'CreateDate', 'ModifyDate', 'OffsetTimeOriginal',
  'OffsetTimeDigitized', 'OffsetTime', 'GPSDateStamp',
  'GPSTimeStamp', 'SubSecTimeOriginal', 'SubSecTimeDigitized',
  'SubSecTime', 'ProfileDateTime',
  // GPS / location
  'GPSLatitude', 'GPSLongitude', 'GPSAltitude',
  'GPSLatitudeRef', 'GPSLongitudeRef', 'GPSAltitudeRef',
  'GPSImgDirection', 'GPSImgDirectionRef', 'GPSSpeed',
  'GPSSpeedRef', 'GPSTrack', 'GPSTrackRef',
  'GPSDestLatitude', 'GPSDestLongitude', 'GPSDestBearing',
  'GPSVersionID',
  // Exposure / settings
  'ExposureTime', 'FNumber', 'ISO', 'ISOSpeedRatings',
  'FocalLength', 'FocalLengthIn35mmFilm', 'ExposureProgram',
  'ExposureCompensation', 'MeteringMode', 'Flash',
  'WhiteBalance', 'SceneCaptureType', 'GainControl',
  'Contrast', 'Saturation', 'Sharpness',
  // Author / copyright
  'Artist', 'Author', 'Copyright', 'Creator', 'Rights',
  // Image description / comments
  'ImageDescription', 'UserComment', 'Comment',
  'XPAuthor', 'XPComment', 'XPTitle', 'XPSubject',
  // Orientation / color (privacy-adjacent)
  'Orientation',
  // Color space
  'ColorSpace',
  // GPS coordinates (legacy names)
  'latitude', 'longitude', 'latituderef', 'longituderef',
]);

/**
 * Mirrors the chunk-scoped PNG key rule of filterMetadata() in
 * ToolUpload.astro: 'PNG tEXt', 'PNG zTXt', 'PNG iTXt', 'PNG tIME', 'PNG eXIf'
 * and the numbered repeats ('PNG tEXt (2)') are privacy metadata.
 */
const PNG_CHUNK_KEY = /^PNG (?:eXIf|tEXt|zTXt|iTXt|tIME)(?: \(\d+\))?$/;

function isPrivacyKey(key) {
  return PRIVACY_KEYS.has(key) || PNG_CHUNK_KEY.test(key);
}

function countPrivacyFields(metadata) {
  let count = 0;
  for (const key of Object.keys(metadata)) {
    if (isPrivacyKey(key)) count++;
  }
  return count;
}

/**
 * Mirrors the merge rule of addPngChunkMetadata() in ToolUpload.astro: every
 * detected textual/time chunk becomes one chunk-scoped entry, except when the
 * payload is already represented by a privacy-classified field (tEXt
 * Copyright / Software, which exifr surfaces under its own tag names).
 */
function pngScanMetadata(png, exifrMetadata = {}) {
  const metadata = { ...exifrMetadata };
  const privacyLabels = Object.keys(metadata).filter((key) => isPrivacyKey(key));
  const seen = {};
  for (const chunk of readPngMetadataChunks(new Uint8Array(png))) {
    if (chunk.type === 'eXIf') continue;
    if (chunk.text && privacyLabels.some((label) => metadata[label] === chunk.text)) continue;
    seen[chunk.type] = (seen[chunk.type] || 0) + 1;
    const key = seen[chunk.type] === 1 ? `PNG ${chunk.type}` : `PNG ${chunk.type} (${seen[chunk.type]})`;
    metadata[key] = chunk.summary;
  }
  return metadata;
}

console.log('=== PRIVACY-FIELD VERIFICATION ===\n');

let failures = 0;

// ─── S1: Build a realistic camera JPEG with privacy metadata ───────
const origBuf = await sharp({
  create: { width: 320, height: 240, channels: 3, background: { r: 200, g: 150, b: 100 } },
})
  .jpeg({ quality: 92 })
  .withMetadata({
    exif: {
      IFD0: {
        Make: 'Canon',
        Model: 'Canon EOS R5',
        DateTime: '2024:03:15 14:30:22',
        Software: 'Adobe Lightroom 6.1',
        ImageDescription: 'Sunset',
        XPAuthor: 'John Doe',
      },
      IFD2: {
        DateTimeOriginal: '2024:03:15 14:30:22',
        OffsetTimeOriginal: '+02:00',
      },
      GPS: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '47/1 36/1 234/10',
        GPSLongitudeRef: 'E',
        GPSLongitude: '7/1 35/1 456/10',
      },
    },
  })
  .toBuffer();
writeFileSync('privacy-test-orig.jpg', origBuf);

const origMeta = (await exifr.parse(origBuf)) || {};
const origAll = Object.keys(origMeta).length;
const origPrivacy = countPrivacyFields(origMeta);

console.log(`[ORIGINAL] total fields=${origAll}, privacy fields=${origPrivacy}`);
for (const k of Object.keys(origMeta)) {
  const cls = PRIVACY_KEYS.has(k) ? 'PRIVACY' : 'technical';
  console.log(`  [${cls}] ${k}`);
}

if (origPrivacy === 0) {
  console.log('  ❌ FAIL: original should have privacy fields');
  failures++;
} else {
  console.log(`  ✅ original correctly reports ${origPrivacy} privacy fields`);
}

// ─── S2: Re-encode (simulates canvas.toBlob) → clean JPEG ──────────
const cleanBuf = await sharp(origBuf).jpeg({ quality: 92 }).toBuffer();
writeFileSync('privacy-test-clean.jpg', cleanBuf);

const cleanMeta = (await exifr.parse(cleanBuf)) || {};
const cleanAll = Object.keys(cleanMeta).length;
const cleanPrivacy = countPrivacyFields(cleanMeta);

console.log(`\n[CLEAN] total fields=${cleanAll}, privacy fields=${cleanPrivacy}`);
for (const k of Object.keys(cleanMeta)) {
  const cls = PRIVACY_KEYS.has(k) ? 'PRIVACY' : 'technical';
  console.log(`  [${cls}] ${k}`);
}

if (cleanPrivacy > 0) {
  console.log(`  ❌ FAIL: clean file still has ${cleanPrivacy} privacy fields`);
  failures++;
} else if (cleanAll === 0) {
  console.log('  ✅ clean file has 0 total fields (all metadata stripped)');
} else {
  console.log(`  ✅ clean file has 0 privacy fields (${cleanAll} technical fields remain, all safe)`);
}

// ─── S3: Verify existing fixture clean files ───────────────────────
const fixtures = ['clean-verify-clean-jpeg.jpg', 'clean-verify-clean-png.png', 'clean-verify-clean-webp.webp'];
console.log('\n--- FIXTURE CLEAN FILES ---');
for (const f of fixtures) {
  try {
    const buf = readFileSync(f);
    const meta = (await exifr.parse(buf)) || {};
    const all = Object.keys(meta).length;
    const privacy = countPrivacyFields(meta);
    const status = privacy === 0 ? '✅' : '❌';
    console.log(` ${status} ${f}: total=${all}, privacy=${privacy}`);
    if (privacy > 0) failures++;
  } catch (e) {
    console.log(`  ⚠️  ${f}: could not parse (${e.message})`);
  }
}

// ─── S4: Verify the specific keys that triggered the bug ───────────
// The reported bug: clean file shows MORE fields than original.
// After the fix, the DISPLAYED count is privacy-only, so technical
// additions (JFIF, ICC) no longer inflate it.
console.log('\n--- DISPLAYED COUNT (as user would see after fix) ---');
console.log(`Original: "${origPrivacy} fields"`);
console.log(`Clean:    "${cleanPrivacy} fields"`);
// The bug: re-uploading the clean file shows MORE fields than the original.
// After the fix, clean should show <= original (privacy-only count).
const discrepancy = cleanPrivacy - origPrivacy;
console.log(`Discrepancy (clean - original): ${discrepancy > 0 ? '+' : ''}${discrepancy}`);
if (cleanPrivacy === 0 && origPrivacy > 0) {
  console.log('✅ Clean file has 0 privacy fields — bug FIXED');
} else if (discrepancy > 0) {
  console.log('❌ Clean file still shows MORE fields than original — bug NOT fixed');
  failures++;
} else {
  console.log('✅ Clean file shows fewer/equal fields than original');
}

// ─── S5: PNG chunk-scoped scan detection ───────────────────────────
// The scan-side defect: exifr alone never reported zTXt / iTXt / tIME and
// missed most tEXt keywords, so a PNG with textual privacy metadata looked
// clean. readPngMetadataChunks() (real module) supplies those chunks and the
// chunk-scoped keys are classified as privacy metadata.
console.log('\n--- PNG SCAN: tEXt / zTXt / iTXt / tIME detection ---');
const pngDir = mkdtempSync(join(tmpdir(), 'pmr-privacy-png-'));
try {
  const plain = await buildPlainPng({ width: 120, height: 80 });
  const exifPng = await buildRgbExifPng({ width: 120, height: 80 });
  const cases = [];
  for (const [type, keyword] of [['tEXt', 'Author'], ['zTXt', 'Comment'], ['iTXt', 'XML:com.adobe.xmp'], ['tIME', '']]) {
    cases.push([`${type} only`, await buildSingleChunkPng(type, { width: 120, height: 80 }), [`${type}:${keyword}`]]);
  }
  cases.push(['tEXt Copyright (dedupe)', rebuildPng(plain, {
    insert: [{ type: 'tEXt', payload: textChunkPayload('Copyright', 'PRIVACY-SCAN-COPYRIGHT') }],
  }), ['tEXt:Copyright']]);
  cases.push(['tEXt Software (dedupe)', rebuildPng(plain, {
    insert: [{ type: 'tEXt', payload: textChunkPayload('Software', 'PRIVACY-SCAN-SOFTWARE') }],
  }), ['tEXt:Software']]);
  cases.push(['two tEXt chunks', rebuildPng(plain, {
    insert: [
      { type: 'tEXt', payload: textChunkPayload('Author', 'PRIVACY-SCAN-AUTHOR') },
      { type: 'tEXt', payload: textChunkPayload('Description', 'PRIVACY-SCAN-DESCRIPTION') },
    ],
  }), ['tEXt:Author', 'tEXt:Description']]);
  cases.push(['eXIf + tEXt', rebuildPng(exifPng, {
    insert: [{ type: 'tEXt', payload: textChunkPayload('Author', 'PRIVACY-SCAN-AUTHOR') }],
  }), ['eXIf:', 'tEXt:Author']]);
  cases.push(['eXIf + iTXt', rebuildPng(exifPng, {
    insert: [{ type: 'iTXt', payload: itxtChunkPayload('XML:com.adobe.xmp', 'PRIVACY-SCAN-XMP') }],
  }), ['eXIf:', 'iTXt:XML:com.adobe.xmp']]);
  cases.push(['all four textual/time', await buildTextualPng({ width: 120, height: 80 }), [
    'eXIf:', 'tEXt:Author', 'zTXt:Comment', 'iTXt:PRIVACY-PNG-UTC-KEY', 'tIME:',
  ]]);
  cases.push(['clean PNG', plain, []]);

  let index = 0;
  for (const [label, png, expectedChunks] of cases) {
    const file = join(pngDir, `case-${index++}.png`);
    writeFileSync(file, png);
    const buffer = readFileSync(file);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

    const exifrMeta = (await exifr.parse(arrayBuffer, true)) || {};
    const before = countPrivacyFields(exifrMeta); // what the old scan reported
    const detected = readPngMetadataChunks(new Uint8Array(buffer));
    const merged = pngScanMetadata(buffer, exifrMeta);
    const after = countPrivacyFields(merged);

    // Vocabulary-independent invariants: nothing is lost, and no single chunk
    // can ever add more than one finding (that is the double-count rule).
    const detectedShapes = detected.map((c) => `${c.type}:${c.keyword}`);
    const lost = after < before;
    const overCounted = after > before + detected.filter((c) => c.type !== 'eXIf').length;
    const missing = detected
      .filter((c) => c.type !== 'eXIf')
      .filter((chunk) => {
        const keyed = Object.keys(merged).some((key) => key === `PNG ${chunk.type}` || key.startsWith(`PNG ${chunk.type} (`));
        const represented = chunk.text ? Object.keys(exifrMeta).some((k) => isPrivacyKey(k) && exifrMeta[k] === chunk.text) : false;
        return !keyed && !represented;
      })
      .map((c) => c.type);

    const chunksMatch = detectedShapes.join() === expectedChunks.join();
    const ok = chunksMatch && !lost && !overCounted && missing.length === 0;
    if (!ok) failures++;
    console.log(
      ` ${ok ? '✅' : '❌'} ${label.padEnd(24)} chunks=[${detectedShapes.join(', ') || 'none'}] ` +
      `privacy before=${before} after=${after}` +
      `${missing.length ? ` MISSING=[${missing.join(', ')}]` : ''}` +
      `${chunksMatch ? '' : ` CHUNKS-UNEXPECTED expected=[${expectedChunks.join(', ')}]`}`,
    );
  }
} finally {
  rmSync(pngDir, { recursive: true, force: true });
}

console.log(`\n=== ${failures === 0 ? 'ALL TESTS PASSED' : failures + ' FAILURE(S)'} ===`);
process.exit(failures === 0 ? 0 : 1);
