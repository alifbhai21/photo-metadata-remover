/**
 * One-off sanity harness for the PNG fixtures: generates every fixture and
 * prints its chunk list so the test expectations are grounded in what the
 * builders actually produce. Not a Playwright spec.
 */
import {
  buildRgbExifPng, buildRgbaExifPng, buildIccPng, buildTextualPng,
  buildPalettePng, buildTransparencyPng, build16BitPng, buildPlainPng,
  buildMalformedPng, buildGarbagePng, buildUnknownChunkPng,
  readPngChunks, pngChunkTypes, readIhdr, parsePngMetadata, leakedPrivacyValues,
} from './test-png-fixture.mjs';
import sharp from 'sharp';

const fixtures = {
  rgbExif: await buildRgbExifPng(),
  rgbaExif: await buildRgbaExifPng(),
  icc: await buildIccPng(),
  textual: await buildTextualPng(),
  palette: await buildPalettePng(),
  transparency: await buildTransparencyPng(),
  sixteenBit: await build16BitPng(),
  plain: await buildPlainPng(),
  unknown: await buildUnknownChunkPng(),
};

for (const [name, buf] of Object.entries(fixtures)) {
  const ihdr = readIhdr(buf);
  console.log(
    `${name}: ${buf.length} bytes, ${ihdr.width}x${ihdr.height} depth=${ihdr.bitDepth} colorType=${ihdr.colorType}`,
  );
  console.log(`  chunks: ${pngChunkTypes(buf).join(', ')}`);
  console.log(`  leaked: ${leakedPrivacyValues(buf).join(', ') || '(none)'}`);
  console.log(`  meta: ${JSON.stringify(Object.keys(await parsePngMetadata(buf)))}`);
}

// sharp must be able to decode every generated fixture.
for (const [name, buf] of Object.entries(fixtures)) {
  try {
    const meta = await sharp(buf).metadata();
    console.log(`sharp ok: ${name} (${meta.width}x${meta.height}, ${meta.format}, icc=${!!meta.icc})`);
  } catch (err) {
    console.log(`sharp FAILED on ${name}: ${err.message}`);
  }
}

console.log('malformed valid?', (() => { try { readPngChunks(buildMalformedPng()); return true; } catch { return false; } })());
console.log('garbage valid?', (() => { try { readPngChunks(buildGarbagePng()); return true; } catch { return false; } })());
