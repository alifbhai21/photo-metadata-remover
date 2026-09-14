import exifr from 'exifr';
import { readFileSync, readdirSync } from 'fs';

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
  'Orientation', 'ColorSpace',
  'latitude', 'longitude', 'latituderef', 'longituderef',
]);

// Check all clean files from E2E tests
const files = readdirSync('.').filter(f => f.includes('e2e-clean'));
console.log('Clean files found:', files);

for (const file of files) {
  const buf = readFileSync(file);
  const ext = file.split('.').pop();
  
  let parsed;
  try {
    parsed = await exifr.parse(buf);
  } catch (e) {
    console.log(`\n=== ${file} ===`);
    console.log(`  exifr error: ${e.message}`);
    continue;
  }
  
  console.log(`\n=== ${file} ===`);
  if (!parsed || Object.keys(parsed).length === 0) {
    console.log('  No metadata found by exifr');
    continue;
  }
  
  const fields = Object.keys(parsed);
  console.log(`  Total exifr fields: ${fields.length}`);
  
  let privacyCount = 0;
  for (const k of fields) {
    const isP = PRIVACY_KEYS.has(k);
    if (isP) privacyCount++;
    console.log(`    ${isP ? '⚠️  PRIVACY' : '     container'} | ${k} = ${JSON.stringify(parsed[k]).slice(0, 80)}`);
  }
  console.log(`  Privacy fields: ${privacyCount} ${privacyCount === 0 ? '✅' : '❌ LEAKED!'}`);
}
