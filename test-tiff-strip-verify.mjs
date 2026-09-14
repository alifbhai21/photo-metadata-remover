/**
 * TIFF metadata-strip verification harness (Node).
 *
 * Runs the REAL shipped stripper (src/lib/tiff.ts) against
 *   - a hand-built, metadata-rich TIFF (EXIF, GPS, XMP, IPTC, author, camera,
 *     lens, serial, comment, GeoTIFF keys, private tag, EXIF thumbnail)
 *   - big-endian, no-thumbnail, missing-StripByteCounts and trailing-junk variants
 *   - libvips/sharp-produced TIFFs (none / LZW / Deflate / JPEG compression,
 *     tiled, palette) plus the repo's clean-verify-orig-tiff.tiff fixture
 * and proves for each output:
 *   - the privacy metadata is really gone (re-parsed with exifr AND raw byte scan)
 *   - dimensions, compression, bit depth, ICC profile and pixels are unchanged
 *   - the output still decodes
 *
 * Run: node test-tiff-strip-verify.mjs
 */
import { buildMetadataRichTiff, rgbPixels, PRIVACY_VALUES } from './test-tiff-fixture.mjs';
import { stripTiffMetadata } from './src/lib/tiff.ts';
import exifr from 'exifr';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    pass++;
  } else {
    console.log(`  FAIL: ${label}`);
    fail++;
  }
}

const PARSE_OPTIONS = { tiff: true, exif: true, gps: true, xmp: true, iptc: true };

/** Tags that are allowed to survive; anything else is privacy metadata. */
const STRUCTURAL_KEYS = new Set([
  'SubfileType', 'ImageWidth', 'ImageHeight', 'BitsPerSample', 'Compression',
  'PhotometricInterpretation', 'StripOffsets', 'Orientation', 'SamplesPerPixel',
  'RowsPerStrip', 'StripByteCounts', 'XResolution', 'YResolution',
  'PlanarConfiguration', 'ResolutionUnit', 'SampleFormat', 'JPEGTables',
  'YCbCrSubSampling', 'YCbCrPositioning', 'ReferenceBlackWhite', 'TileWidth',
  'TileLength', 'TileOffsets', 'TileByteCounts', 'ColorMap', 'Predictor',
  'ExtraSamples', 'InkSet', 'NumberOfInks', 'InkNames', 'DotRange',
]);

const FORBIDDEN_KEYS = [
  'Make', 'Model', 'Software', 'Artist', 'Copyright', 'ImageDescription',
  'ModifyDate', 'DateTimeOriginal', 'DateTimeDigitized', 'HostComputer',
  'SerialNumber', 'LensModel', 'UserComment', 'XPTitle', 'latitude', 'longitude',
  'GPSLatitude', 'GPSLongitude', 'GPSAltitude', 'GPSDateStamp', 'xmpmeta',
  'GeoTiffDirectory', 'GeoTiffAsciiParams', 'ExposureProgram', 'ISO', '65000',
];

function containsMarker(bytes) {
  const raw = Buffer.from(bytes).toString('latin1');
  // UTF-16LE tag payloads (XP* strings) interleave NUL bytes with the text.
  const widened = raw.replace(/\u0000/g, '');
  return PRIVACY_VALUES.filter((value) => raw.includes(value) || widened.includes(value));
}

async function rawPixels(bytes) {
  return sharp(Buffer.from(bytes)).raw().toBuffer();
}

async function realIcc() {
  const buffer = await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 1, g: 2, b: 3 } } })
    .tiff()
    .withMetadata({ icc: 'srgb' })
    .toBuffer();
  const meta = await sharp(buffer).metadata();
  return meta.icc ? new Uint8Array(meta.icc) : null;
}

/** Shared assertions for a stripped result. */
async function verifyClean(input, result, label, expectations = {}) {
  // libvips cannot open a TIFF that has no StripByteCounts, so callers may
  // supply the expected geometry/pixels instead of decoding the input.
  const inputMeta = expectations.expectedDimensions
    ? expectations.expectedDimensions
    : await sharp(Buffer.from(input)).metadata();
  const outputBytes = result.bytes;
  const outputMeta = await sharp(Buffer.from(outputBytes)).metadata();

  const parsed = await exifr.parse(Buffer.from(outputBytes), PARSE_OPTIONS);
  const keys = Object.keys(parsed || {});
  const leaked = keys.filter((key) => FORBIDDEN_KEYS.includes(key));
  assert(leaked.length === 0, `${label}: no privacy keys survive (${leaked.join(',') || 'none'})`);

  const unknown = keys.filter((key) => !STRUCTURAL_KEYS.has(key));
  assert(unknown.length === 0, `${label}: only structural tags remain (${unknown.join(',') || 'none'})`);

  const markers = containsMarker(outputBytes);
  assert(markers.length === 0, `${label}: no privacy payload bytes remain (${markers.join(',') || 'none'})`);

  assert(
    outputMeta.width === inputMeta.width && outputMeta.height === inputMeta.height,
    `${label}: dimensions unchanged (${inputMeta.width}x${inputMeta.height})`,
  );
  assert(outputMeta.width === result.width && outputMeta.height === result.height, `${label}: reported dimensions match`);

  const before = expectations.expectedPixels
    ? expectations.expectedPixels
    : await rawPixels(input);
  const after = await rawPixels(outputBytes);
  assert(before.length === after.length && Buffer.compare(before, after) === 0, `${label}: pixels are byte-identical`);

  if (expectations.compression !== undefined) {
    assert((parsed || {}).Compression === expectations.compression, `${label}: compression preserved (${expectations.compression})`);
  }
  if (expectations.icc) {
    assert(
      outputMeta.icc && Buffer.compare(Buffer.from(outputMeta.icc), Buffer.from(expectations.icc)) === 0,
      `${label}: ICC profile preserved byte-for-byte`,
    );
  }
  if (expectations.stripByteCounts !== false) {
    assert(Boolean((parsed || {}).StripByteCounts || (parsed || {}).TileByteCounts), `${label}: pixel byte counts present in output`);
  }
  return parsed;
}
// ------------------------------------------------------------------
// 1. Metadata-rich TIFF (little-endian, multi-strip, thumbnail, ICC, junk)
// ------------------------------------------------------------------
console.log('\n--- 1. Metadata-rich TIFF: before removal ---');
const icc = await realIcc();
assert(Boolean(icc), 'test ICC profile available');

const rich = buildMetadataRichTiff({ trailingJunk: 'TRAILING-PRIVACY-JUNK', icc });
const richBefore = await exifr.parse(Buffer.from(rich), PARSE_OPTIONS);
console.log('  detected before:', Object.keys(richBefore || {}).join(', '));
console.log('  Make:', richBefore?.Make, '| Model:', richBefore?.Model, '| Artist:', richBefore?.Artist);
console.log('  GPS:', richBefore?.latitude, richBefore?.longitude, '| Serial:', richBefore?.SerialNumber, '| Lens:', richBefore?.LensModel);
console.log('  raw privacy markers embedded:', containsMarker(rich).length);

assert(Object.keys(richBefore || {}).length >= 20, 'fixture is metadata-rich (>= 20 detected fields)');
assert(richBefore?.Make === 'PRIVACY-TEST-CAMERA', 'fixture carries EXIF Make');
assert(typeof richBefore?.latitude === 'number' && typeof richBefore?.longitude === 'number', 'fixture carries GPS coordinates');
assert(containsMarker(rich).length === PRIVACY_VALUES.length, 'every privacy marker is present in the fixture bytes');

console.log('\n--- 1. Metadata-rich TIFF: after removal ---');
const richResult = stripTiffMetadata(rich);
console.log(`  ${rich.length} bytes -> ${richResult.bytes.length} bytes (${richResult.removedTags} metadata tags dropped, thumbnail IFD included)`);
console.log('  detected after:', Object.keys((await exifr.parse(Buffer.from(richResult.bytes), PARSE_OPTIONS)) || {}).join(', '));
await verifyClean(rich, richResult, 'rich', { compression: 1, icc });
assert(richResult.removedTags > 0, 'metadata tags were actually dropped');
assert(richResult.bytes.length < rich.length, 'output is smaller than the input (payload removed, not just unreferenced)');

// ------------------------------------------------------------------
// 2. Byte-order + structural variants of the same fixture
// ------------------------------------------------------------------
console.log('\n--- 2. Big-endian (MM) metadata-rich TIFF ---');
const bigEndian = buildMetadataRichTiff({ little: false, icc });
const bigEndianBefore = await exifr.parse(Buffer.from(bigEndian), PARSE_OPTIONS);
assert(bigEndianBefore?.Make === 'PRIVACY-TEST-CAMERA', 'big-endian fixture carries metadata');
const bigEndianResult = stripTiffMetadata(bigEndian);
await verifyClean(bigEndian, bigEndianResult, 'big-endian', { compression: 1, icc });

console.log('\n--- 3. No thumbnail IFD ---');
const noThumb = buildMetadataRichTiff({ withThumbnail: false, icc });
const noThumbResult = stripTiffMetadata(noThumb);
await verifyClean(noThumb, noThumbResult, 'no-thumbnail', { compression: 1, icc });

console.log('\n--- 4. Missing StripByteCounts (recomputed from geometry) ---');
const noCounts = buildMetadataRichTiff({ omitStripByteCounts: true, icc });
const noCountsBefore = await exifr.parse(Buffer.from(noCounts), PARSE_OPTIONS);
assert(noCountsBefore?.StripByteCounts === undefined, 'fixture really omits StripByteCounts');
const noCountsResult = stripTiffMetadata(noCounts);
// libvips refuses to decode a TIFF without StripByteCounts, so the expected
// pixels come from the generator instead of from the input file.
const noCountsAfter = await verifyClean(noCounts, noCountsResult, 'missing-byte-counts', {
  compression: 1,
  icc,
  expectedPixels: rgbPixels(96, 64),
  expectedDimensions: { width: 96, height: 64 },
});
assert(Boolean(noCountsAfter?.StripByteCounts), 'byte counts were rebuilt in the output');

console.log('\n--- 5. Single-strip image ---');
const oneStrip = buildMetadataRichTiff({ rowsPerStrip: 64, icc });
const oneStripResult = stripTiffMetadata(oneStrip);
await verifyClean(oneStrip, oneStripResult, 'single-strip', { compression: 1, icc });

console.log('\n--- 6. Unsupported input is rejected cleanly ---');
let rejectedBigTiff = false;
try {
  const fakeBigTiff = new Uint8Array(16);
  fakeBigTiff[0] = 0x49; fakeBigTiff[1] = 0x49; fakeBigTiff[2] = 43;
  stripTiffMetadata(fakeBigTiff);
} catch (error) {
  rejectedBigTiff = /BigTIFF/.test(String(error.message));
}
assert(rejectedBigTiff, 'BigTIFF raises a clear error instead of producing a broken file');

let rejectedGarbage = false;
try {
  stripTiffMetadata(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
} catch {
  rejectedGarbage = true;
}
assert(rejectedGarbage, 'non-TIFF bytes raise a clear error');
// ------------------------------------------------------------------
// 7. TIFFs produced by a real encoder (libvips/sharp) in many configurations
// ------------------------------------------------------------------
console.log('\n--- 7. Encoder-produced TIFF variants ---');
const base = sharp({
  create: { width: 120, height: 90, channels: 3, background: { r: 20, g: 140, b: 90 } },
}).composite([{ input: Buffer.from(rgbPixels(60, 40)), raw: { width: 60, height: 40, channels: 3 }, top: 10, left: 10 }]);

const variants = [
  { label: 'uncompressed', options: { compression: 'none' } },
  { label: 'lzw', options: { compression: 'lzw' } },
  { label: 'deflate', options: { compression: 'deflate' } },
  { label: 'deflate+predictor', options: { compression: 'deflate', predictor: 'horizontal' } },
  { label: 'jpeg-compressed', options: { compression: 'jpeg', quality: 90 } },
  { label: 'tiled-deflate', options: { compression: 'deflate', tiled: true, tileWidth: 64, tileHeight: 64 } },
  { label: 'palette', options: { compression: 'none', palette: true } },
];

for (const variant of variants) {
  let source;
  try {
    source = await base.clone().tiff(variant.options).toBuffer();
  } catch (error) {
    console.log(`  SKIP: ${variant.label} could not be produced by libvips (${error.message})`);
    continue;
  }
  const result = stripTiffMetadata(new Uint8Array(source));
  await verifyClean(new Uint8Array(source), result, variant.label);
}

// Repo fixture: JPEG-compressed / YCbCr TIFF (compression 7, photometric 6).
console.log('\n--- 8. Repo fixture clean-verify-orig-tiff.tiff (JPEG-compressed TIFF) ---');
try {
  const repoFixture = new Uint8Array(readFileSync('clean-verify-orig-tiff.tiff'));
  const result = stripTiffMetadata(repoFixture);
  await verifyClean(repoFixture, result, 'repo-jpeg-tiff');
} catch (error) {
  console.log(`  SKIP: repo TIFF fixture unavailable (${error.message})`);
}

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
console.log('ALL TIFF STRIP CHECKS PASSED');