/**
 * BINARY-LEVEL INSPECTION: Prove exactly what metadata exists in original vs clean.
 * 
 * This script:
 * 1. Creates a realistic camera-like JPEG with multiple EXIF fields
 * 2. Parses with exifr — lists ALL keys
 * 3. Re-encodes via sharp (simulates canvas.toBlob)
 * 4. Re-parses clean file — lists ALL keys
 * 5. Binary-level JPEG segment scan on BOTH files
 * 6. Classifies every field as privacy-sensitive vs technical
 * 7. Shows the EXACT discrepancy the user would see
 */
import sharp from 'sharp';
import exifr from 'exifr';
import { writeFileSync, readFileSync } from 'fs';

console.log('=== BINARY-LEVEL METADATA INSPECTION ===\n');

// ─── 1. CREATE REALISTIC CAMERA JPEG ───────────────────────────────
// Simulate what a Canon/Nikon/Sony camera would produce:
// IFD0: Make, Model, DateTime, Software, ImageDescription, Orientation
// IFD2: DateTimeOriginal, OffsetTimeOriginal
// EXIF sub: ExposureTime, FNumber, ISOSpeedRatings, FocalLength
// GPS: latitude, longitude
// ICC profile (embedded by camera)
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
        ImageDescription: 'Sunset over mountains',
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
        GPSAltitudeRef: '0',
        GPSAltitude: '45000/100',
      },
    },
  })
  .toBuffer();

writeFileSync('test-binary-orig.jpg', origBuf);
console.log(`Original JPEG: ${origBuf.length} bytes`);

// ─── 2. PARSE ORIGINAL WITH EXIFR ─────────────────────────────────
const origMeta = await exifr.parse(origBuf);
const origKeys = origMeta ? Object.keys(origMeta).sort() : [];
console.log(`\n--- ORIGINAL: ${origKeys.length} fields ---`);
for (const k of origKeys) {
  const v = JSON.stringify(origMeta[k]);
  console.log(`  ${k}: ${v.substring(0, 120)}${v.length > 120 ? '...' : ''}`);
}

// ─── 3. RE-ENCODE VIA SHARP (simulates canvas.toBlob) ──────────────
const cleanBuf = await sharp(origBuf).jpeg({ quality: 92 }).toBuffer();
writeFileSync('test-binary-clean.jpg', cleanBuf);
console.log(`\nClean JPEG: ${cleanBuf.length} bytes (original was ${origBuf.length} bytes)`);

// ─── 4. PARSE CLEAN FILE WITH EXIFR ───────────────────────────────
const cleanMeta = await exifr.parse(cleanBuf);
const cleanKeys = cleanMeta ? Object.keys(cleanMeta).sort() : [];
console.log(`\n--- CLEAN: ${cleanKeys.length} fields ---`);
for (const k of cleanKeys) {
  const v = JSON.stringify(cleanMeta[k]);
  console.log(`  ${k}: ${v.substring(0, 120)}${v.length > 120 ? '...' : ''}`);
}

// ─── 5. FIELD-BY-FIELD COMPARISON ──────────────────────────────────
console.log('\n--- FIELD-BY-FIELD COMPARISON ---');
const inOrigNotClean = origKeys.filter(k => !cleanKeys.includes(k));
const inCleanNotOrig = cleanKeys.filter(k => !origKeys.includes(k));
const inBoth = origKeys.filter(k => cleanKeys.includes(k));

console.log(`Fields ONLY in original (${inOrigNotClean.length}):`, inOrigNotClean.length ? inOrigNotClean : '(none)');
console.log(`Fields ONLY in clean (${inCleanNotOrig.length}):`, inCleanNotOrig.length ? inCleanNotOrig : '(none)');
console.log(`Fields in BOTH (${inBoth.length}):`, inBoth.length ? inBoth : '(none)');

// ─── 6. CLASSIFY FIELDS: PRIVACY vs TECHNICAL ─────────────────────
const PRIVACY_KEYS = new Set([
  // Camera/device identification
  'Make', 'Model', 'Software', 'Artist', 'XPAuthor', 'XPTitle',
  'ImageDescription', 'Copyright', 'HostComputer',
  // Timestamps (privacy-sensitive)
  'DateTime', 'DateTimeOriginal', 'DateTimeDigitized',
  'OffsetTime', 'OffsetTimeOriginal', 'OffsetTimeDigitized',
  'SubSecTime', 'SubSecTimeOriginal', 'SubSecTimeDigitized',
  // GPS (privacy-critical)
  'latitude', 'longitude', 'latitudeRaw', 'longitudeRaw',
  'GPSLatitude', 'GPSLatitudeRef', 'GPSLongitude', 'GPSLongitudeRef',
  'GPSAltitude', 'GPSAltitudeRef', 'GPSDateStamp', 'GPSTimeStamp',
  'GPSLatitudeDMS', 'GPSLongitudeDMS',
  // Image description / author
  'ImageUniqueID', 'LensModel', 'LensMake', 'LensSerialNumber',
  'BodySerialNumber', 'LensID',
  // Thumbnail (can contain a smaller version of the photo)
  'Thumbnail', 'ThumbnailOffset', 'ThumbnailLength',
  'thumbnailWidth', 'thumbnailHeight',
  // XMP / IPTC
  'ObjectDescription', 'Keywords', 'Subject', 'Rating',
  'Creator', 'Title', 'Description',
  // Other sensitive
  'UserComment', 'ImageComments',
]);

function classifyField(key) {
  if (PRIVACY_KEYS.has(key)) return 'PRIVACY (must remove)';
  // Technical/container fields — ok to preserve
  const TECHNICAL = new Set([
    'JFIFVersion', 'JFIFUnit', 'JFIFXDensity', 'JFIFYDensity',
    'XResolution', 'YResolution', 'ResolutionUnit',
    'YCbCrPositioning', 'XResolution', 'YResolution',
    'componentsConfiguration', 'BitsPerSample',
    'PixelXDimension', 'PixelYDimension',
    'ImageWidth', 'ImageLength', 'BitsPerSample',
    'Compression', 'PhotometricInterpretation',
    'Orientation',  // Actually privacy-adjacent; some consider it technical
  ]);
  if (TECHNICAL.has(key)) return 'TECHNICAL (ok to keep)';
  return 'UNKNOWN (need review)';
}

console.log('\n--- CLASSIFICATION ---');
for (const k of origKeys) {
  const inClean = cleanKeys.includes(k);
  const cls = classifyField(k);
  const status = inClean ? '⚠️  STILL IN CLEAN' : '✅ removed';
  console.log(`  ${status} | ${cls} | ${k}`);
}
for (const k of cleanKeys) {
  if (!origKeys.includes(k)) {
    const cls = classifyField(k);
    console.log(`  🆕 ADDED by re-encode | ${cls} | ${k}`);
  }
}

// ─── 7. BINARY-LEVEL JPEG SEGMENT SCAN ─────────────────────────────
function scanJpegSegments(buf) {
  const segs = [];
  let i = 2; // skip SOI
  const markerNames = {
    0xe0: 'APP0/JFIF', 0xe1: 'APP1/EXIF', 0xe2: 'APP2/ICC',
    0xed: 'APP13/IPTC', 0xfe: 'COM', 0xdb: 'DQT', 0xc0: 'SOF0',
    0xc2: 'SOF2', 0xda: 'SOS', 0xd9: 'EOI',
    0xe3: 'APP3', 0xe4: 'APP4', 0xe5: 'APP5', 0xe6: 'APP6',
    0xe7: 'APP7', 0xe8: 'APP8', 0xe9: 'APP9', 0xea: 'APPA',
    0xeb: 'APPB', 0xec: 'APPC', 0xee: 'APPD', 0xef: 'APPE',
  };
  while (i + 3 < buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    if (marker === 0xd8) { i += 2; continue; }
    if (marker === 0xd9) { segs.push({ marker: 'EOI', offset: i, length: 0 }); break; }
    if (marker >= 0xd0 && marker <= 0xd7) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    const payload = buf.subarray(i + 4, Math.min(i + 2 + len, buf.length));
    const name = markerNames[marker] || `0x${marker.toString(16).toUpperCase()}`;
    const head = payload.subarray(0, Math.min(48, payload.length));
    // Check for readable strings in header
    let ascii = '';
    for (let j = 0; j < head.length; j++) {
      ascii += (head[j] >= 0x20 && head[j] <= 0x7e) ? String.fromCharCode(head[j]) : '.';
    }
    segs.push({ marker: name, offset: i, length: len, headerAscii: ascii });
    if (marker === 0xda) break; // SOS: entropy-coded data follows
    i += 2 + len;
  }
  return segs;
}

console.log('\n--- BINARY SEGMENTS: ORIGINAL ---');
const origSegs = scanJpegSegments(origBuf);
for (const s of origSegs) {
  console.log(`  [${s.marker}] offset=${s.offset} len=${s.length} header="${s.headerAscii}"`);
}

console.log('\n--- BINARY SEGMENTS: CLEAN ---');
const cleanSegs = scanJpegSegments(cleanBuf);
for (const s of cleanSegs) {
  console.log(`  [${s.marker}] offset=${s.offset} len=${s.length} header="${s.headerAscii}"`);
}

// ─── 8. CHECK WHAT THE USER WOULD SEE ─────────────────────────────
console.log('\n--- WHAT THE USER SEES ---');
console.log(`Original: ${origKeys.length} metadata fields detected`);
console.log(`Clean:    ${cleanKeys.length} metadata fields detected`);
console.log(`Discrepancy: ${cleanKeys.length - origKeys.length} MORE fields in clean file`);

if (cleanKeys.length > origKeys.length) {
  console.log('\n⚠️  ROOT CAUSE: Re-encode ADDS metadata (JFIF header, ICC profile, etc.)');
  console.log('   The clean file has MORE fields than the original.');
  console.log('   This is because canvas.toBlob (and sharp) write technical headers.');
}

// ─── 9. EXACT FIX NEEDED ──────────────────────────────────────────
console.log('\n--- REQUIRED FIX ---');
console.log('The metadata counter in ToolUpload.astro should:');
console.log('1. Classify each exifr key as privacy-sensitive vs technical');
console.log('2. Only count privacy-sensitive fields in the status display');
console.log('3. Keep the full count available in the expandable details');
console.log('4. Privacy fields: Make, Model, DateTime, GPS*, Author, etc.');
console.log('5. Technical fields: JFIF*, XResolution, YResolution, ResolutionUnit');
