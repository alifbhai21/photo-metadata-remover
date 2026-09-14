/**
 * SIMULATE EXACT BROWSER CANVAS BEHAVIOR
 * 
 * Browser canvas.toBlob('image/jpeg') produces a JPEG with:
 *   - JFIF APP0 marker (JFIFVersion, JFIFUnit, JFIFXDensity, JFIFYDensity)
 *   - NO EXIF (stripped)
 *   - Possibly ICC profile
 * 
 * This causes exifr to report MORE fields in the "clean" file than the original
 * if the original was a PNG or WebP without JFIF.
 * 
 * We simulate by:
 * 1. Creating a PNG with EXIF (no JFIF) → exifr finds N fields
 * 2. Converting to JPEG (adds JFIF) → exifr finds N+J fields
 * 3. Showing the exact discrepancy
 */
import sharp from 'sharp';
import exifr from 'exifr';
import { writeFileSync } from 'fs';

console.log('=== BROWSER CANVAS SIMULATION ===\n');

// ─── SCENARIO 1: PNG original → JPEG clean ─────────────────────────
// A phone camera might produce a PNG with EXIF (no JFIF)
const pngOrig = await sharp({
  create: { width: 320, height: 240, channels: 3, background: { r: 200, g: 150, b: 100 } },
})
  .png()
  .withMetadata({
    exif: {
      IFD0: {
        Make: 'Apple',
        Model: 'iPhone 15 Pro',
        DateTime: '2024:03:15 14:30:22',
        Software: '17.3.1',
      },
      IFD2: {
        DateTimeOriginal: '2024:03:15 14:30:22',
      },
    },
  })
  .toBuffer();

writeFileSync('sim-png-orig.png', pngOrig);
const pngMeta = await exifr.parse(pngOrig);
const pngKeys = pngMeta ? Object.keys(pngMeta).sort() : [];
console.log(`PNG original: ${pngKeys.length} fields`);
for (const k of pngKeys) console.log(`  ${k}: ${JSON.stringify(pngMeta[k]).substring(0, 80)}`);

// Convert to JPEG (simulates canvas.toBlob('image/jpeg'))
const jpegClean = await sharp(pngOrig).jpeg({ quality: 0.92 * 100 }).toBuffer();
writeFileSync('sim-jpeg-clean.jpg', jpegClean);
const jpegMeta = await exifr.parse(jpegClean);
const jpegKeys = jpegMeta ? Object.keys(jpegMeta).sort() : [];
console.log(`\nJPEG clean (after canvas): ${jpegKeys.length} fields`);
for (const k of jpegKeys) console.log(`  ${k}: ${JSON.stringify(jpegMeta[k]).substring(0, 80)}`);

console.log(`\nDISCREPANCY: ${pngKeys.length} → ${jpegKeys.length} (+${jpegKeys.length - pngKeys.length})`);

// ─── SCENARIO 2: JPEG original with EXIF → JPEG clean ──────────────
// A DSLR camera produces a JPEG with EXIF + ICC
const jpegOrig = await sharp({
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
      },
      IFD2: {
        DateTimeOriginal: '2024:03:15 14:30:22',
        OffsetTimeOriginal: '+02:00',
      },
    },
  })
  .toBuffer();

writeFileSync('sim-jpeg-orig.jpg', jpegOrig);
const origMeta2 = await exifr.parse(jpegOrig);
const origKeys2 = origMeta2 ? Object.keys(origMeta2).sort() : [];
console.log(`\n--- SCENARIO 2: JPEG → JPEG ---`);
console.log(`JPEG original: ${origKeys2.length} fields`);
for (const k of origKeys2) console.log(`  ${k}: ${JSON.stringify(origMeta2[k]).substring(0, 80)}`);

// Re-encode (simulates canvas)
const clean2 = await sharp(jpegOrig).jpeg({ quality: 92 }).toBuffer();
writeFileSync('sim-jpeg-clean2.jpg', clean2);
const cleanMeta2 = await exifr.parse(clean2);
const cleanKeys2 = cleanMeta2 ? Object.keys(cleanMeta2).sort() : [];
console.log(`\nJPEG clean: ${cleanKeys2.length} fields`);
for (const k of cleanKeys2) console.log(`  ${k}: ${JSON.stringify(cleanMeta2[k]).substring(0, 80)}`);
console.log(`\nDISCREPANCY: ${origKeys2.length} → ${cleanKeys2.length} (+${cleanKeys2.length - origKeys2.length})`);

// ─── SCENARIO 3: WebP original → JPEG clean ────────────────────────
const webpOrig = await sharp({
  create: { width: 320, height: 240, channels: 3, background: { r: 200, g: 150, b: 100 } },
})
  .webp()
  .withMetadata({
    exif: {
      IFD0: {
        Make: 'Google',
        Model: 'Pixel 8',
        DateTime: '2024:03:15 14:30:22',
      },
    },
  })
  .toBuffer();

writeFileSync('sim-webp-orig.webp', webpOrig);
const webpMeta = await exifr.parse(webpOrig);
const webpKeys = webpMeta ? Object.keys(webpMeta).sort() : [];
console.log(`\n--- SCENARIO 3: WebP → JPEG ---`);
console.log(`WebP original: ${webpKeys.length} fields`);
for (const k of webpKeys) console.log(`  ${k}: ${JSON.stringify(webpMeta[k]).substring(0, 80)}`);

const jpegClean3 = await sharp(webpOrig).jpeg({ quality: 92 }).toBuffer();
writeFileSync('sim-jpeg-clean3.jpg', jpegClean3);
const cleanMeta3 = await exifr.parse(jpegClean3);
const cleanKeys3 = cleanMeta3 ? Object.keys(cleanMeta3).sort() : [];
console.log(`\nJPEG clean: ${cleanKeys3.length} fields`);
for (const k of cleanKeys3) console.log(`  ${k}: ${JSON.stringify(cleanMeta3[k]).substring(0, 80)}`);
console.log(`\nDISCREPANCY: ${webpKeys.length} → ${cleanKeys3.length} (+${cleanKeys3.length - webpKeys.length})`);

// ─── BINARY SEGMENT SCAN ───────────────────────────────────────────
function scanJpeg(buf) {
  const segs = [];
  let i = 2;
  const names = {
    0xe0: 'APP0/JFIF', 0xe1: 'APP1/EXIF', 0xe2: 'APP2/ICC',
    0xed: 'APP13/IPTC', 0xfe: 'COM', 0xdb: 'DQT', 0xc0: 'SOF0',
    0xc2: 'SOF2', 0xda: 'SOS', 0xd9: 'EOI',
  };
  while (i + 3 < buf.length) {
    if (buf[i] !== 0xff) break;
    const m = buf[i + 1];
    if (m === 0xd8) { i += 2; continue; }
    if (m === 0xd9) break;
    if (m >= 0xd0 && m <= 0xd7) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    const name = names[m] || `0x${m.toString(16).toUpperCase()}`;
    segs.push({ marker: name, offset: i, length: len });
    if (m === 0xda) break;
    i += 2 + len;
  }
  return segs;
}

console.log('\n--- BINARY SEGMENTS ---');
console.log('PNG original segments:', scanJpeg(pngOrig).map(s => s.marker).join(', ') || '(PNG container, not JPEG segments)');
console.log('JPEG clean segments:', scanJpeg(jpegClean).map(s => s.marker).join(', '));
console.log('JPEG orig segments:', scanJpeg(jpegOrig).map(s => s.marker).join(', '));
console.log('JPEG clean2 segments:', scanJpeg(clean2).map(s => s.marker).join(', '));

// ─── SUMMARY ───────────────────────────────────────────────────────
console.log('\n=== ROOT CAUSE SUMMARY ===');
console.log('When canvas.toBlob("image/jpeg") re-encodes:');
console.log('  1. ALL EXIF metadata is stripped (Make, Model, DateTime, GPS, etc.)');
console.log('  2. A JFIF APP0 header is ADDED (JFIFVersion, JFIFUnit, JFIFXDensity, JFIFYDensity)');
console.log('  3. An ICC profile may be ADDED');
console.log('');
console.log('The counter shows "7 fields" because exifr detects:');
console.log('  - JFIFVersion (added by canvas)');
console.log('  - JFIFUnit (added by canvas)');
console.log('  - JFIFXDensity (added by canvas)');
console.log('  - JFIFYDensity (added by canvas)');
console.log('  - Possibly other technical fields');
console.log('');
console.log('These are ALL technical/container fields, NOT privacy-sensitive.');
console.log('The fix: classify fields and only count privacy-sensitive ones.');
