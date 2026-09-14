import sharp from 'sharp';
import exifr from 'exifr';
import { writeFileSync } from 'fs';

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
  'latitude', 'longitude', 'latituderef', 'longituderef',
]);

// Create a realistic JPEG with lots of metadata (simulates iPhone photo)
const exifJPEG = {
  IFD0: {
    Make: 'Apple',
    Model: 'iPhone 15 Pro',
    Software: '17.3.1',
    DateTime: '2024:03:15 08:30:22',
    Orientation: 'Horizontal (normal)',
    Artist: 'John Doe',
    Copyright: '© 2024 John Doe',
    ImageDescription: 'A beautiful sunset',
  },
  IFD1: {},
  exif: {
    DateTimeOriginal: '2024:03:15 08:30:22',
    DateTimeDigitized: '2024:03:15 08:30:22',
    ExposureTime: 0.002,
    FNumber: 1.78,
    ISO: 100,
    FocalLength: '6.765 mm',
    FocalLengthIn35mmFilm: 24,
    ExposureProgram: 'Program normal',
    ExposureCompensation: 0,
    MeteringMode: 'Multi-segment',
    Flash: 'No flash',
    WhiteBalance: 'Auto',
    LensModel: 'iPhone 15 Pro back triple camera 6.765 mm f/1.78',
    LensMake: 'Apple',
    ColorSpace: 'sRGB',
  },
  gps: {
    GPSLatitude: 37.7749,
    GPSLongitude: -122.4194,
    GPSLatitudeRef: 'N',
    GPSLongitudeRef: 'W',
    GPSAltitude: 16,
    GPSAltitudeRef: 'M',
  },
};

const jpegBuf = await sharp({
  create: { width: 200, height: 200, channels: 3, background: { r: 220, g: 100, b: 50 } }
})
  .jpeg({ quality: 92 })
  .withExifMerge(exifJPEG)
  .toBuffer();

writeFileSync('clean-verify-heavy-jpeg.jpg', jpegBuf);

// Parse original
const origParsed = await exifr.parse(jpegBuf);
console.log('=== ORIGINAL JPEG ===');
console.log(`Total fields: ${Object.keys(origParsed).length}`);
let origPrivacy = 0;
for (const [k, v] of Object.entries(origParsed)) {
  const isP = PRIVACY_KEYS.has(k);
  if (isP) origPrivacy++;
  console.log(`  ${isP ? '⚠️  PRIVACY' : '     container'} | ${k} = ${typeof v === 'object' && v !== null ? '[object]' : String(v).slice(0, 60)}`);
}
console.log(`Privacy fields in original: ${origPrivacy}`);

// Simulate browser binary strip (just use sharp to re-encode like canvas does)
const cleanBuf = await sharp(jpegBuf).jpeg().toBuffer();
writeFileSync('clean-verify-heavy-jpeg-clean.jpg', cleanBuf);

// Parse clean
const cleanParsed = await exifr.parse(cleanBuf);
console.log('\n=== CLEAN JPEG (after re-encode) ===');
console.log(`Total fields: ${Object.keys(cleanParsed).length}`);
let cleanPrivacy = 0;
for (const [k, v] of Object.entries(cleanParsed)) {
  const isP = PRIVACY_KEYS.has(k);
  if (isP) cleanPrivacy++;
  console.log(`  ${isP ? '⚠️  PRIVACY' : '     container'} | ${k} = ${typeof v === 'object' && v !== null ? '[object]' : String(v).slice(0, 60)}`);
}
console.log(`Privacy fields in clean: ${cleanPrivacy}`);
console.log(`\n✅ VERDICT: ${cleanPrivacy === 0 ? 'NO privacy leak' : `⚠️ ${cleanPrivacy} PRIVACY FIELDS LEAKED`}`);
