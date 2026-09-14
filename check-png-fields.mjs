import sharp from 'sharp';
import exifr from 'exifr';

// PRIVACY_KEYS from ToolUpload.astro
const PRIVACY_KEYS = new Set([
  'Make', 'Model', 'Software', 'LensModel', 'LensMake',
  'LensInfo', 'BodySerialNumber', 'LensSerialNumber',
  'DateTimeOriginal', 'DateTimeDigitized', 'DateTime',
  'CreateDate', 'ModifyDate', 'OffsetTimeOriginal',
  'OffsetTimeDigitized', 'OffsetTime', 'GPSDateStamp',
  'GPSTimeStamp', 'SubSecTimeOriginal', 'SubSecTimeDigitized',
  'SubSecTime', 'ProfileDateTime',
  'GPSLatitude', 'GPSLongitude', 'GPSAltitude',
  'GPSLatitudeRef', 'GPSLongitudeRef', 'GPSAltitudeRef',
  'GPSImgDirection', 'GPSImgDirectionRef', 'GPSSpeed',
  'GPSSpeedRef', 'GPSTrack', 'GPSTrackRef',
  'GPSDestLatitude', 'GPSDestLongitude', 'GPSDestBearing',
  'GPSVersionID',
  'ExposureTime', 'FNumber', 'ISO', 'ISOSpeedRatings',
  'FocalLength', 'FocalLengthIn35mmFilm', 'FocalLengthIn35mmFormat', 'ExposureProgram',
  'ExposureCompensation', 'MeteringMode', 'Flash',
  'WhiteBalance', 'SceneCaptureType', 'GainControl',
  'Contrast', 'Saturation', 'Sharpness',
  'Artist', 'Author', 'Copyright', 'Creator', 'Rights',
  'ImageDescription', 'UserComment', 'Comment',
  'XPAuthor', 'XPComment', 'XPTitle', 'XPSubject',
  'Orientation',
  'ColorSpace',
]);

// Step 1: Create PNG with metadata (mirrors pipeline test)
const MK = 'TestCameraMakeForPMR';
const MD = 'TestCameraModelForPMR';
const exifPNG = { IFD0: { Make: MK, Model: MD, DateTime: '2024:02:20 14:00:00' } };

const original = await sharp({
  create: { width: 100, height: 100, channels: 4, background: { r: 10, g: 220, b: 10, alpha: 1 } }
})
  .png()
  .withExifMerge(exifPNG)
  .toBuffer();

console.log('=== STEP 1: Original PNG with injected metadata ===');
const origParsed = await exifr.parse(original);
const origFields = origParsed ? Object.keys(origParsed) : [];
console.log(`exifr found ${origFields.length} fields:`);
for (const k of origFields) {
  console.log(`  ${PRIVACY_KEYS.has(k) ? '⚠️  PRIVACY' : '     container'} | ${k} = ${JSON.stringify(origParsed[k])}`);
}

// Step 2: Strip via sharp re-encode (simulates canvas re-encode)
const clean = await sharp(original).png().toBuffer();
console.log('\n=== STEP 2: After sharp re-encode (simulates canvas strip) ===');
const cleanParsed = await exifr.parse(clean);
const cleanFields = cleanParsed ? Object.keys(cleanParsed) : [];
console.log(`exifr found ${cleanFields.length} fields on clean PNG:`);

const privacyLeak = [];
const containerFields = [];

for (const k of cleanFields) {
  const isPrivacy = PRIVACY_KEYS.has(k);
  if (isPrivacy) {
    privacyLeak.push({ key: k, val: cleanParsed[k] });
    console.log(`  ⚠️  PRIVACY  | ${k} = ${JSON.stringify(cleanParsed[k])}`);
  } else {
    containerFields.push({ key: k, val: cleanParsed[k] });
    console.log(`     container | ${k} = ${JSON.stringify(cleanParsed[k])}`);
  }
}

console.log('\n=== FINAL VERDICT ===');
console.log(`Total exifr fields in clean PNG: ${cleanFields.length}`);
console.log(`PRIVACY fields still present: ${privacyLeak.length}`);
if (privacyLeak.length > 0) {
  console.log('⚠️  LEAKED PRIVACY FIELDS:');
  for (const f of privacyLeak) {
    console.log(`  ⚠️  ${f.key} = ${JSON.stringify(f.val)}`);
  }
} else {
  console.log('✅ No privacy fields leaked');
}
console.log(`Container (non-privacy) fields: ${containerFields.length}`);
for (const f of containerFields) {
  console.log(`     ${f.key} = ${JSON.stringify(f.val)}`);
}
