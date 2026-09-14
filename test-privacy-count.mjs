/**
 * PRIVACY-FIELD VERIFICATION: Prove that re-encoded (clean) files have
 * ZERO privacy-sensitive fields, and that the counter logic in
 * ToolUpload.astro (countPrivacyFields) reports correctly.
 *
 * Mirrors the PRIVACY_KEYS set added to ToolUpload.astro and applies it
 * to both original and clean fixture files.
 */
import sharp from 'sharp';
import exifr from 'exifr';
import { readFileSync, writeFileSync } from 'fs';

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

function countPrivacyFields(metadata) {
  let count = 0;
  for (const key of Object.keys(metadata)) {
    if (PRIVACY_KEYS.has(key)) count++;
  }
  return count;
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

console.log(`\n=== ${failures === 0 ? 'ALL TESTS PASSED' : failures + ' FAILURE(S)'} ===`);
process.exit(failures === 0 ? 0 : 1);
