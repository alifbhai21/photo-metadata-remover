/**
 * Node harness for src/lib/png.ts: structural PNG metadata stripping.
 *
 * For every fixture it proves:
 *   - the output is a valid PNG (signature, CRCs, parseable chunk list)
 *   - eXIf / tEXt / zTXt / iTXt / tIME are physically gone
 *   - no planted privacy payload string survives anywhere in the bytes
 *   - IHDR (dimensions, bit depth, colour type) is untouched
 *   - every retained chunk is copied byte-for-byte (IDAT, PLTE, iCCP,
 *     pHYs, unknown ancillary chunks)
 *   - a malformed / garbage PNG is rejected instead of producing corrupt output
 *
 * Run: node test-png-strip-verify.mjs
 */
import assert from 'node:assert';
import {
  buildRgbExifPng, buildRgbaExifPng, buildIccPng, buildTextualPng,
  buildPalettePng, buildTransparencyPng, buildTrnsPng, build16BitPng,
  buildPlainPng, buildMalformedPng, buildGarbagePng, buildUnknownChunkPng,
  buildSingleChunkPng, buildUnverifiableXmpPng, buildBadCrcPng, buildNoIendPng,
  rebuildPng, textChunkPayload, itxtChunkPayload,
  readPngChunks, pngChunkTypes, findPngChunk, readIhdr, rawChunkBytes,
  idatBytes, leakedPrivacyValues, parsePngMetadata, PNG_PRIVACY_CHUNKS,
  XMP_PAYLOAD_SIGNATURE,
} from './test-png-fixture.mjs';
import { transform } from 'esbuild';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

// Node cannot strip TS interfaces natively, so transpile the modules with the
// project's own esbuild into temp .mjs siblings and import those. The verbatim
// verifier is transpiled as well, so the byte-level checks the UI runs on the
// generated output are exercised here too.
const { code: pngCode } = await transform(readFileSync('src/lib/png.ts', 'utf8'), { loader: 'ts' });
writeFileSync('src/lib/png.mjs', pngCode);
const { code: verifyCode } = await transform(readFileSync('src/lib/verify.ts', 'utf8'), { loader: 'ts' });
writeFileSync('src/lib/verify.mjs', verifyCode);
const { stripPngMetadata, readPngMetadataChunks } = await import('./src/lib/png.mjs');
const { findPngPrivacyFindings, findOutputPrivacyFindings } = await import('./src/lib/verify.mjs');

// The scan-side classifier lives inside the Astro component's client script, so
// the block is sliced out and transpiled with the same esbuild path - the real
// classifier is exercised, not a mirrored copy of its privacy vocabulary.
const toolUploadSource = readFileSync('src/components/ToolUpload.astro', 'utf8').replace(/\r\n/g, '\n');
const classifierStart = toolUploadSource.indexOf('  /**\n   * Chunk-scoped keys the PNG scan adds');
const classifierEnd = toolUploadSource.indexOf('  function formatFileSize(');
if (classifierStart === -1 || classifierEnd === -1) {
  throw new Error('scan classifier block not found in src/components/ToolUpload.astro');
}
const { code: classifierCode } = await transform(
  toolUploadSource.slice(classifierStart, classifierEnd) + '\nexport { filterMetadata, countPrivacyFields };\n',
  { loader: 'ts' },
);
const classifierPath = join(tmpdir(), `pmr-scan-classifier-${process.pid}.mjs`);
writeFileSync(classifierPath, classifierCode);
const { filterMetadata, countPrivacyFields } = await import(pathToFileURL(classifierPath).href);
rmSync(classifierPath, { force: true });

let failures = 0;
function check(label, fn) {
  try {
    fn();
    console.log(`  ok: ${label}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL: ${label}: ${err.message}`);
  }
}

async function verifyStrip(label, source, { expectIhdr } = {}) {
  console.log(`\n--- ${label} ---`);
  const inIhdr = readIhdr(source);
  const inChunks = readPngChunks(source);

  const result = stripPngMetadata(new Uint8Array(source));
  const out = Buffer.from(result.bytes);
  const outChunks = readPngChunks(out); // throws on any structural/CRC defect

  check('output starts with the PNG signature', () =>
    assert.deepStrictEqual([...out.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

  check('first chunk is a 13-byte IHDR', () => {
    assert.strictEqual(outChunks[0].type, 'IHDR');
    assert.strictEqual(outChunks[0].size, 13);
  });

  const outIhdr = readIhdr(out);
  check('dimensions unchanged', () => {
    assert.strictEqual(outIhdr.width, inIhdr.width);
    assert.strictEqual(outIhdr.height, inIhdr.height);
  });
  check('bit depth + colour type unchanged', () => {
    assert.strictEqual(outIhdr.bitDepth, inIhdr.bitDepth);
    assert.strictEqual(outIhdr.colorType, inIhdr.colorType);
  });
  if (expectIhdr) {
    check('expected IHDR shape', () => {
      if (expectIhdr.bitDepth) assert.strictEqual(outIhdr.bitDepth, expectIhdr.bitDepth);
      if (expectIhdr.colorType !== undefined) assert.strictEqual(outIhdr.colorType, expectIhdr.colorType);
    });
  }

  for (const type of PNG_PRIVACY_CHUNKS) {
    check(`privacy chunk ${type} is gone`, () =>
      assert.ok(!outChunks.some((c) => c.type === type), `${type} survived`));
  }

  check('no planted privacy payload survives anywhere in the bytes', () =>
    assert.deepStrictEqual(leakedPrivacyValues(out), []));

  const meta = await parsePngMetadata(out);
  const privacyKeys = Object.keys(meta).filter((k) =>
    ['Make', 'Model', 'Software', 'Artist', 'Copyright', 'texts', 'ztxt', 'time'].includes(k));
  check('re-scan of the OUTPUT bytes: no privacy fields parseable', () =>
    assert.deepStrictEqual(privacyKeys, []));

  // Every retained input chunk must appear in the output byte-for-byte.
  const retainedTypes = inChunks.filter((c) => !PNG_PRIVACY_CHUNKS.includes(c.type));
  check('all retained chunks copied byte-for-byte', () => {
    for (const inChunk of retainedTypes) {
      const inRaw = rawChunkBytes(source, inChunk.type);
      const outRaw = rawChunkBytes(out, inChunk.type);
      assert.ok(
        inRaw.every((raw) => outRaw.some((o) => o.equals(raw))),
        `chunk ${inChunk.type} not found verbatim in output`,
      );
    }
  });

  check('IDAT image data is byte-identical (no re-encode)', () =>
    assert.ok(idatBytes(out).equals(idatBytes(source))));

  const meta2 = await sharp(out).metadata();
  check('sharp reports PNG + same dimensions', () => {
    assert.strictEqual(meta2.format, 'png');
    assert.strictEqual(meta2.width, inIhdr.width);
    assert.strictEqual(meta2.height, inIhdr.height);
  });

  return { source, out };
}

// 1. Standard RGB PNG + EXIF
await verifyStrip('RGB PNG + eXIf', await buildRgbExifPng(), { expectIhdr: { colorType: 2, bitDepth: 8 } });

// 2. RGBA PNG + EXIF
await verifyStrip('RGBA PNG + eXIf', await buildRgbaExifPng(), { expectIhdr: { colorType: 6, bitDepth: 8 } });

// 3 + 16. PNG with iCCP/ICC profile: the profile must survive byte-for-byte.
{
  console.log('\n--- PNG + iCCP (ICC profile preserved) ---');
  const source = await buildIccPng();
  const { out } = await verifyStrip('ICC PNG + eXIf', source);
  check('iCCP chunk present in output', () => assert.ok(findPngChunk(out, 'iCCP')));
  check('iCCP chunk is byte-identical to the input', () => {
    const inIccp = rawChunkBytes(source, 'iCCP');
    const outIccp = rawChunkBytes(out, 'iCCP');
    assert.strictEqual(outIccp.length, 1);
    assert.ok(outIccp[0].equals(inIccp[0]));
  });
  const iccMeta = await sharp(out).metadata();
  check('sharp still reports an ICC profile', () => assert.ok(iccMeta.icc));
}

// 4-7. tEXt / zTXt / iTXt / tIME all removed together.
{
  console.log('\n--- PNG + tEXt/zTXt/iTXt/tIME ---');
  const source = await buildTextualPng();
  assert.ok(pngChunkTypes(source).includes('tEXt'));
  assert.ok(pngChunkTypes(source).includes('zTXt'));
  assert.ok(pngChunkTypes(source).includes('iTXt'));
  assert.ok(pngChunkTypes(source).includes('tIME'));
  const { out } = await verifyStrip('textual PNG', source);
  check('all four textual/time chunk types removed', () => {
    for (const t of ['tEXt', 'zTXt', 'iTXt', 'tIME']) assert.ok(!findPngChunk(out, t));
  });
}

// 8. Transparency (RGBA with fully transparent pixels): IDAT byte-identical.
{
  console.log('\n--- PNG + transparency ---');
  const source = await buildTransparencyPng();
  const before = await sharp(source).raw().toBuffer();
  const { out } = await verifyStrip('transparency PNG', source);
  const after = await sharp(out).raw().toBuffer();
  check('decoded pixels byte-identical (incl. RGB under transparent pixels)', () =>
    assert.strictEqual(Buffer.compare(before, after), 0));
}

// 9. Palette/indexed colour: PLTE survives byte-for-byte.
{
  console.log('\n--- palette PNG ---');
  const source = await buildPalettePng();
  const { out } = await verifyStrip('palette PNG', source, { expectIhdr: { colorType: 3 } });
  check('PLTE preserved byte-for-byte', () =>
    assert.ok(rawChunkBytes(out, 'PLTE')[0].equals(rawChunkBytes(source, 'PLTE')[0])));
}

// 10. 16-bit PNG: bit depth survives.
await verifyStrip('16-bit PNG + eXIf', await build16BitPng(), { expectIhdr: { bitDepth: 16 } });

// 11. PNG without metadata: output equals input byte-for-byte (nothing to strip).
{
  console.log('\n--- plain PNG (no metadata) ---');
  const source = await buildPlainPng();
  const result = stripPngMetadata(new Uint8Array(source));
  check('removedChunks is empty', () => assert.deepStrictEqual(result.removedChunks, []));
  check('output is byte-identical to input', () =>
    assert.strictEqual(Buffer.compare(Buffer.from(result.bytes), source), 0));
}

// Unknown ancillary chunk preserved by default.
{
  console.log('\n--- unknown ancillary chunk ---');
  const source = await buildUnknownChunkPng();
  const { out } = await verifyStrip('unknown chunk PNG', source);
  check('pmTX (unknown ancillary) preserved byte-for-byte', () =>
    assert.ok(rawChunkBytes(out, 'pmTX')[0].equals(rawChunkBytes(source, 'pmTX')[0])));
}

// 12. Malformed PNGs are rejected instead of producing corrupt output.
{
  console.log('\n--- malformed inputs rejected ---');
  for (const [label, buf] of [
    ['truncated chunk', buildMalformedPng()],
    ['garbage after signature', buildGarbagePng()],
    ['not a PNG at all', Buffer.from('RIFF....WEBPVP8 ', 'latin1')],
    ['empty file', Buffer.alloc(0)],
    ['chunk with a bad CRC', await buildBadCrcPng()],
    ['container without IEND', await buildNoIendPng()],
  ]) {
    check(`rejects ${label}`, () => {
      assert.throws(() => stripPngMetadata(new Uint8Array(buf)));
    });
  }
}

// 8b. tRNS (palette transparency) is image data and must survive byte-for-byte.
{
  console.log('\n--- PNG + tRNS (palette transparency) ---');
  const source = await buildTrnsPng();
  assert.ok(findPngChunk(source, 'tRNS'), 'fixture: no tRNS chunk');
  const { out } = await verifyStrip('tRNS palette PNG', source, { expectIhdr: { colorType: 3 } });
  check('tRNS chunk preserved byte-for-byte', () =>
    assert.ok(rawChunkBytes(out, 'tRNS')[0].equals(rawChunkBytes(source, 'tRNS')[0])));
  check('PLTE still present', () => assert.ok(findPngChunk(out, 'PLTE')));
}

// 4-7. Each textual/time chunk type is a removal target on its own.
for (const chunkType of ['tEXt', 'zTXt', 'iTXt', 'tIME']) {
  const source = await buildSingleChunkPng(chunkType);
  assert.strictEqual(pngChunkTypes(source).filter((t) => t === chunkType).length, 1);
  assert.ok(!findPngChunk(source, 'eXIf'), `fixture ${chunkType}: must carry no eXIf`);
  const { out } = await verifyStrip(`PNG + ${chunkType} only`, source);
  check(`${chunkType} removed on its own`, () => assert.ok(!findPngChunk(out, chunkType)));
  check(`${chunkType} fixture: no privacy payload left`, () =>
    assert.deepStrictEqual(leakedPrivacyValues(out), []));
}

// ---------------------------------------------------------------- verifier
// PHASE 4: the same byte-level scanner the UI runs on the generated output.
{
  console.log('\n--- output verifier (verify.ts) ---');
  const cleanPng = Buffer.from(stripPngMetadata(new Uint8Array(await buildRgbExifPng())).bytes);
  const metadataPng = await buildRgbExifPng();
  const plainPng = await buildPlainPng();
  const xmpPng = Buffer.from(stripPngMetadata(new Uint8Array(await buildUnverifiableXmpPng())).bytes);
  const badCrcPng = await buildBadCrcPng();
  const noIendPng = await buildNoIendPng();
  const malformedPng = buildMalformedPng();

  const kinds = (buf) => findPngPrivacyFindings(new Uint8Array(buf)).map((f) => f.kind);
  const dispatch = (buf, mime) =>
    findOutputPrivacyFindings(new Uint8Array(buf), mime).map((f) => f.kind);

  check('real stripped output is reported clean', () => assert.deepStrictEqual(kinds(cleanPng), []));
  check('metadata-free PNG is reported clean', () => assert.deepStrictEqual(kinds(plainPng), []));
  check('a not-yet-stripped PNG still reports its eXIf chunk', () =>
    assert.ok(kinds(metadataPng).includes('png-metadata-chunk')));
  check('XMP payload inside an unknown chunk is caught (payload scan)', () =>
    assert.ok(kinds(xmpPng).includes('png-xmp-payload')));
  check('that XMP payload really is still inside those output bytes', () =>
    assert.ok(xmpPng.includes(Buffer.from(XMP_PAYLOAD_SIGNATURE, 'latin1'))));
  check('bad chunk CRC is caught', () => assert.ok(kinds(badCrcPng).includes('png-chunk-crc')));
  check('missing IEND is caught', () =>
    assert.ok(kinds(noIendPng).includes('png-unverifiable-structure')));
  check('truncated IDAT chunk is caught', () =>
    assert.ok(kinds(malformedPng).includes('png-unverifiable-structure')));
  check('trailing bytes after IEND are caught', () =>
    assert.ok(
      kinds(Buffer.concat([plainPng, Buffer.from('junk-after-iend', 'latin1')])).includes(
        'png-unverifiable-structure',
      ),
    ));
  check('JPEG bytes are not accepted as a PNG', () =>
    assert.deepStrictEqual(
      kinds(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00])),
      ['png-not-a-png'],
    ));
  check('mime dispatch routes image/png to the PNG scanner', () =>
    assert.deepStrictEqual(dispatch(xmpPng, 'image/png'), kinds(xmpPng)));
  check('the output verifier never uses a hardcoded zero count', () =>
    assert.notDeepStrictEqual(dispatch(xmpPng, 'image/png'), []));
}

// ================================================================ SCAN SIDE
// readPngMetadataChunks() + the real classifier: what the upload scan reports
// for each privacy-chunk shape. The merge/dedupe path in the component is
// covered end-to-end by test-png-removal.spec.ts and the classification spec.
console.log('\n--- scan-side chunk detection (readPngMetadataChunks) ---');

const scanPlain = await buildPlainPng();
const scanExif = await buildRgbExifPng();
const scanTextual = await buildTextualPng();
const scanSingle = {};
for (const type of ['tEXt', 'zTXt', 'iTXt', 'tIME']) {
  scanSingle[type] = await buildSingleChunkPng(type);
}
const scanCopyright = rebuildPng(scanPlain, {
  insert: [{ type: 'tEXt', payload: textChunkPayload('Copyright', 'PRIVACY-SCAN-COPYRIGHT') }],
});
const scanTwoText = rebuildPng(scanPlain, {
  insert: [
    { type: 'tEXt', payload: textChunkPayload('Author', 'PRIVACY-SCAN-AUTHOR') },
    { type: 'tEXt', payload: textChunkPayload('Description', 'PRIVACY-SCAN-DESCRIPTION') },
  ],
});
const scanExifText = rebuildPng(scanExif, {
  insert: [{ type: 'tEXt', payload: textChunkPayload('Author', 'PRIVACY-SCAN-AUTHOR') }],
});
const scanExifItxt = rebuildPng(scanExif, {
  insert: [{ type: 'iTXt', payload: itxtChunkPayload('XML:com.adobe.xmp', 'PRIVACY-SCAN-XMP') }],
});
const scanMalformedText = rebuildPng(scanPlain, {
  insert: [{ type: 'tEXt', payload: Buffer.from('NoSeparatorAtAll', 'latin1') }],
});

const shapes = (buf) => readPngMetadataChunks(new Uint8Array(buf)).map((c) => `${c.type}:${c.keyword}`);

check('clean PNG: the scan finds no privacy chunk', () => assert.deepStrictEqual(shapes(scanPlain), []));

for (const [type, keyword] of [['tEXt', 'Author'], ['zTXt', 'Comment'], ['iTXt', 'XML:com.adobe.xmp'], ['tIME', '']]) {
  check(`${type}-only PNG: one ${type} chunk detected (has no eXIf)`, () => {
    assert.ok(!pngChunkTypes(scanSingle[type]).includes('eXIf'));
    assert.deepStrictEqual(shapes(scanSingle[type]), [`${type}:${keyword}`]);
  });
}

check('eXIf chunk is detected as a privacy chunk too', () => assert.ok(shapes(scanExif).includes('eXIf:')));

check('all four textual/time chunks are detected alongside eXIf', () =>
  assert.deepStrictEqual(shapes(scanTextual), [
    // buildTextualPng uses PRIVACY_VALUES[4] as the iTXt keyword.
    'eXIf:', 'tEXt:Author', 'zTXt:Comment', 'iTXt:PRIVACY-PNG-UTC-KEY', 'tIME:',
  ]));

check('eXIf + tEXt: both chunk types detected', () =>
  assert.deepStrictEqual(shapes(scanExifText), ['eXIf:', 'tEXt:Author']));

check('eXIf + iTXt: both chunk types detected', () =>
  assert.deepStrictEqual(shapes(scanExifItxt), ['eXIf:', 'iTXt:XML:com.adobe.xmp']));

check('tEXt payload text is exposed so a duplicate can be recognised', () => {
  const entry = readPngMetadataChunks(new Uint8Array(scanCopyright))[0];
  assert.strictEqual(entry.type, 'tEXt');
  assert.strictEqual(entry.keyword, 'Copyright');
  assert.strictEqual(entry.text, 'PRIVACY-SCAN-COPYRIGHT');
  assert.ok(entry.summary.includes('PRIVACY-SCAN-COPYRIGHT'));
});

check('repeated tEXt chunks are reported separately (never collapsed)', () =>
  assert.deepStrictEqual(shapes(scanTwoText), ['tEXt:Author', 'tEXt:Description']));

check('blank keyword chunks are still detected', () => {
  const payload = Buffer.concat([Buffer.from([0]), Buffer.from('PRIVACY-BLANK-KEYWORD', 'latin1')]);
  const png = rebuildPng(scanPlain, { insert: [{ type: 'tEXt', payload }] });
  assert.deepStrictEqual(shapes(png), ['tEXt:']);
});

check('malformed textual payload (no separator) is detected, not dropped', () => {
  const entries = readPngMetadataChunks(new Uint8Array(scanMalformedText));
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].type, 'tEXt');
  assert.strictEqual(entries[0].keyword, '');
  assert.ok(entries[0].summary.length > 0);
});

check('no returned value keeps a reference into the scanned buffer', () => {
  const bytes = new Uint8Array(scanCopyright);
  const entry = readPngMetadataChunks(bytes)[0];
  for (const value of Object.values(entry)) {
    assert.strictEqual(ArrayBuffer.isView(value), false);
    assert.strictEqual(typeof value, 'string');
  }
  bytes.fill(0);
  assert.ok(entry.text.includes('PRIVACY-SCAN-COPYRIGHT'));
  assert.ok(entry.summary.includes('PRIVACY-SCAN-COPYRIGHT'));
});

check('non-PNG input is rejected without throwing', () => {
  assert.deepStrictEqual(readPngMetadataChunks(new Uint8Array(0)), []);
  assert.deepStrictEqual(readPngMetadataChunks(new Uint8Array(Buffer.from('not a png', 'latin1'))), []);
  assert.deepStrictEqual(
    readPngMetadataChunks(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])),
    [],
  );
});

check('malformed / truncated PNG yields no entries instead of throwing', () => {
  assert.deepStrictEqual(readPngMetadataChunks(new Uint8Array(buildMalformedPng())), []);
  assert.deepStrictEqual(readPngMetadataChunks(new Uint8Array(buildGarbagePng())), []);
  assert.deepStrictEqual(readPngMetadataChunks(new Uint8Array(scanSingle.tEXt.subarray(0, 60))), []);
});

check('a bad chunk CRC does not hide the chunk from the scan', () => {
  const badCrc = Buffer.from(scanCopyright);
  const target = findPngChunk(badCrc, 'tEXt');
  badCrc[target.end - 1] = badCrc[target.end - 1] ^ 0xff;
  // Lenient on purpose: the scan must report the chunk, while the removal path
  // still rejects the untrustworthy file (covered by the verifier section).
  assert.deepStrictEqual(shapes(badCrc), ['tEXt:Copyright']);
});

// ---- the real classifier on the keys the scan produces -------------------
console.log('\n--- scan-side classification (ToolUpload.astro classifier) ---');

check('chunk-scoped PNG keys are classified as privacy metadata', () => {
  const metadata = {
    'PNG tEXt': 'Author: PRIVACY-SCAN-AUTHOR',
    'PNG zTXt': 'Comment (compressed text)',
    'PNG iTXt (2)': 'XML:com.adobe.xmp: PRIVACY-SCAN-XMP',
    'PNG tIME': '2024-01-02 03:04:05 UTC',
    'PNG eXIf': 'EXIF block (200 bytes)',
  };
  assert.strictEqual(countPrivacyFields(metadata), 5);
  assert.deepStrictEqual(filterMetadata(metadata).map((e) => e.privacy), [true, true, true, true, true]);
});

check('technical PNG fields stay technical', () => {
  const metadata = {
    ImageWidth: 120, ImageHeight: 80, BitDepth: 8, ColorType: 'RGB',
    Compression: 'Deflate/Inflate', Filter: 'Adaptive', Interlace: 'Noninterlaced',
  };
  assert.strictEqual(countPrivacyFields(metadata), 0);
});

check('the chunk-scoped vocabulary does not reclassify other formats', () => {
  // tEXt keywords exifr surfaces for a PNG (Author, Description, Comment, ...)
  // must not become privacy fields for metadata from other formats.
  assert.strictEqual(countPrivacyFields({ Author: 'x', Comment: 'x', Description: 'x', Keywords: 'x' }), 0);
  // The pre-existing vocabulary is untouched.
  assert.strictEqual(countPrivacyFields({ Copyright: 'x', Software: 'x' }), 2);
});

check('lookalike keys outside the chunk vocabulary are not privacy', () => {
  assert.strictEqual(countPrivacyFields({ 'PNG tEXt stuff': 'x', 'NG tEXt': 'x', 'PNG xTXt': 'x', 'PNG tEXt(2)': 'x' }), 0);
});

// The transpiled siblings are test artefacts only - never leave them behind.
rmSync('src/lib/png.mjs', { force: true });
rmSync('src/lib/verify.mjs', { force: true });

console.log(failures === 0 ? '\nALL PNG STRIP CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

