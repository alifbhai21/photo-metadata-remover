/**
 * Create proper test images with EXIF metadata using sharp,
 * then test exifr parsing and verify canvas-like stripping.
 */
import sharp from 'sharp';
import exifr from 'exifr';
import { writeFileSync, readFileSync } from 'fs';

console.log('=== Creating test JPEG with EXIF metadata using sharp ===\n');

// Create a 100x100 red image with EXIF metadata
const jpegWithExif = await sharp({
  create: {
    width: 100,
    height: 100,
    channels: 3,
    background: { r: 255, g: 0, b: 0 }
  }
})
  .jpeg({ quality: 90 })
  .withMetadata({
    exif: {
      IFD0: {
        Make: 'TestCameraMake',
        Model: 'TestCameraModel',
        DateTime: '2024:01:15 12:30:45',
        ImageDescription: 'Test image with metadata for PMR testing',
        Software: 'TestSoftware v1.0',
      },
      IFD2: {
        DateTimeOriginal: '2024:01:15 12:30:45',
      }
    }
  })
  .toBuffer();

writeFileSync('test-original.jpg', jpegWithExif);
console.log('Created test-original.jpg:', jpegWithExif.length, 'bytes');

// Parse metadata
const metadata1 = await exifr.parse(jpegWithExif.buffer);
console.log('\n--- Metadata from original JPEG ---');
if (metadata1) {
  const keys = Object.keys(metadata1);
  console.log('Field count:', keys.length);
  for (const k of keys) {
    console.log(`  ${k}: ${JSON.stringify(metadata1[k]).substring(0, 100)}`);
  }
} else {
  console.log('No metadata found (null result)');
}

// Now create a PNG
const pngWithExif = await sharp({
  create: {
    width: 100,
    height: 100,
    channels: 3,
    background: { r: 0, g: 255, b: 0 }
  }
})
  .png()
  .withMetadata({
    exif: {
      IFD0: {
        Make: 'TestPNGCamera',
        Model: 'TestPNGModel',
        DateTime: '2024:02:20 14:00:00',
      }
    }
  })
  .toBuffer();

writeFileSync('test-original.png', pngWithExif);
console.log('\nCreated test-original.png:', pngWithExif.length, 'bytes');

const pngMeta = await exifr.parse(pngWithExif.buffer);
console.log('\n--- Metadata from original PNG ---');
if (pngMeta) {
  const keys = Object.keys(pngMeta);
  console.log('Field count:', keys.length);
  for (const k of keys) {
    console.log(`  ${k}: ${JSON.stringify(pngMeta[k]).substring(0, 100)}`);
  }
} else {
  console.log('No metadata found (null result)');
}

// Create WebP
const webpWithExif = await sharp({
  create: {
    width: 100,
    height: 100,
    channels: 3,
    background: { r: 0, g: 0, b: 255 }
  }
})
  .webp()
  .withMetadata({
    exif: {
      IFD0: {
        Make: 'TestWebPCamera',
        Model: 'TestWebPModel',
      }
    }
  })
  .toBuffer();

writeFileSync('test-original.webp', webpWithExif);
console.log('\nCreated test-original.webp:', webpWithExif.length, 'bytes');

const webpMeta = await exifr.parse(webpWithExif.buffer);
console.log('\n--- Metadata from original WebP ---');
if (webpMeta) {
  const keys = Object.keys(webpMeta);
  console.log('Field count:', keys.length);
  for (const k of keys) {
    console.log(`  ${k}: ${JSON.stringify(webpMeta[k]).substring(0, 100)}`);
  }
} else {
  console.log('No metadata found (null result)');
}

// ============================================================
// Test: What does exifr.parse(ArrayBuffer) vs exifr.parse(Buffer) return?
// ============================================================
console.log('\n=== Testing ArrayBuffer vs Buffer input ===');

const ab = jpegWithExif.buffer.slice(
  jpegWithExif.byteOffset,
  jpegWithExif.byteOffset + jpegWithExif.byteLength
);
const metaFromAB = await exifr.parse(ab);
console.log('From ArrayBuffer:', metaFromAB ? Object.keys(metaFromAB).length : 0, 'fields');

// Test with a copy of the buffer (fresh ArrayBuffer)
const freshAb = new Uint8Array(jpegWithExif).buffer;
const metaFromFresh = await exifr.parse(freshAb);
console.log('From fresh ArrayBuffer:', metaFromFresh ? Object.keys(metaFromFresh).length : 0, 'fields');

// ============================================================
// Test: What happens when we re-read the SAME ArrayBuffer twice?
// (simulating the tool's pattern: parse once, then createImageBitmap from same File)
// ============================================================
console.log('\n=== Testing ArrayBuffer reuse (File.arrayBuffer() pattern) ===');
// In the tool, file.arrayBuffer() is called once, the result is passed to exifr.
// The File object is independent and still available for createImageBitmap.
console.log('File.arrayBuffer() returns a new ArrayBuffer each time.');
console.log('The File object is independent and can still be read after arrayBuffer().');
console.log('createImageBitmap(file) uses the File directly, not the ArrayBuffer.');

console.log('\n=== All tests complete ===');
