/**
 * Node-side verification of the downloaded clean file produced by the REAL app.
 */
import { readFileSync, statSync } from 'node:fs';
import exifr from 'exifr';
import sharp from 'sharp';
import { createHash } from 'node:crypto';

const SRC = 'C:\\Users\\HP\\Desktop\\IMG_0934.JPG';
const CLEAN = 'C:\\Users\\HP\\AppData\\Local\\Temp\\pmr-cdp-dl\\IMG_0934-clean.jpg';

const src = readFileSync(SRC);
const clean = readFileSync(CLEAN);
const md5 = (b) => createHash('md5').update(b).digest('hex');

const out = {};

// 1. Magic bytes
out.srcMagic = src.subarray(0, 3).toString('hex');
out.cleanMagic = clean.subarray(0, 3).toString('hex');
out.isJpeg = clean[0] === 0xff && clean[1] === 0xd8 && clean[2] === 0xff;

// 2. File sizes + hashes (not just renamed)
out.srcSize = statSync(SRC).size;
out.cleanSize = statSync(CLEAN).size;
out.srcMd5 = md5(src);
out.cleanMd5 = md5(clean);
out.identicalToSource = out.srcMd5 === out.cleanMd5;

// 3. Dimensions preserved + decodable
const meta = await sharp(CLEAN).metadata();
out.cleanDimensions = { width: meta.width, height: meta.height, format: meta.format };
const srcMeta = await sharp(SRC).metadata();
out.srcDimensions = { width: srcMeta.width, height: srcMeta.height, format: srcMeta.format };
out.dimensionsPreserved = out.srcDimensions.width === out.cleanDimensions.width && out.srcDimensions.height === out.cleanDimensions.height;

// 4. Metadata re-scan (exifr default + full)
const parsedDefault = await exifr.parse(clean);
const parsedAll = await exifr.parse(clean, { all: true });
out.cleanExifrDefaultFields = parsedDefault ? Object.keys(parsedDefault) : [];
out.cleanExifrAllFields = parsedAll ? Object.keys(parsedAll) : [];
out.cleanFieldCount = (parsedAll ? Object.keys(parsedAll).length : 0) + (parsedDefault ? Object.keys(parsedDefault).length : 0);
out.cleanHasMakeModel = !!((parsedAll?.Make) || (parsedDefault?.Make));

// 5. JPEG segment scan for metadata family markers (proper entropy skipping)
function segments(buf) {
  const segs = [];
  let i = 2;
  const markerName = (m) => ({
    '0xe1': 'APP1', '0xe2': 'APP2', '0xed': 'APP13', '0xfe': 'COM',
    '0xe0': 'APP0', '0xdb': 'DQT', '0xc0': 'SOF0', '0xc2': 'SOF2',
    '0xda': 'SOS', '0xff': 'STUFFED',
  }[('0x' + m)] || '0x' + m);
  while (i + 4 < buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    if (marker === 0xd8) { i += 2; continue; }
    if (marker === 0xd9) break; // EOI
    if (marker >= 0xd0 && marker <= 0xd7) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    const payload = buf.subarray(i + 4, i + 2 + len);
    segs.push({ marker: markerName(marker.toString(16)), addr: i, len, head: payload.subarray(0, 24).toString('latin1').replace(/[^\x20-\x7E]/g, '.') });
    if (marker === 0xda) break; // SOS: rest is entropy-coded image data
    i += 2 + len;
  }
  return segs;
}
const segs = segments(clean);
out.cleanSegments = segs.map(s => ({ marker: s.marker, len: s.len, head: s.head }));
out.hasExifSegment = segs.some(s => s.marker === 'APP1' && s.head.includes('Exif'));
out.hasXmpSegment = segs.some(s => s.marker === 'APP1' && (s.head.includes('xmp') || s.head.includes('adobe')));
out.hasIptcSegment = segs.some(s => s.marker === 'APP13' && s.head.includes('Photoshop'));
out.hasComSegment = segs.some(s => s.marker === 'COM');
out.hasIccSegment = segs.some(s => s.marker === 'APP2' && (s.head.includes('ICC_PROFILE') || s.head.startsWith('ICC')));

// 6. Thumbnail check via exifr (a real Canon JPEG carries an embedded thumbnail)
const thumb = await exifr.thumbnail(clean).catch(() => null);
out.cleanThumbnailBytes = thumb ? thumb.length : 0;

// 7. Original field list for before/after comparison
const srcParse = await exifr.parse(src);
out.srcFields = srcParse ? Object.keys(srcParse).sort() : [];
out.srcFieldCount = out.srcFields.length;
out.srcHasGps = !!(srcParse?.latitude || srcParse?.GPSLatitude || srcParse?.longitude || srcParse?.GPSLongitude);

console.log('VERIFY_JSON ' + JSON.stringify(out, null, 2));