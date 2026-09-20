/**
 * PNG test fixture builder + independent PNG chunk inspector, shared by the
 * Playwright UI spec and any Node harness.
 *
 * sharp writes a real, spec-shaped PNG — including the eXIf chunk that
 * real-world PNG files carry — so the fixtures start from a sharp-generated
 * base and rewrite its chunk list. That makes them structurally identical to
 * what a camera, editor or exporter produces while letting a test choose
 * exactly which metadata chunks (eXIf / tEXt / zTXt / iTXt / tIME) and which
 * preserved chunks (iCCP / pHYs / gAMA / tRNS / unknown ancillary chunks) the
 * input carries.
 *
 * Nothing here imports src/lib/png.ts on purpose: the inspection helpers are
 * a second, independent implementation so the tests cannot "prove" the fix
 * with the very code under test.
 */
import sharp from 'sharp';
import exifr from 'exifr';
import zlib from 'node:zlib';

export const PRIVACY_MARKER = 'PRIVACY-';

/** Planted strings — a byte scan of the download must not find any of them. */
export const PRIVACY_VALUES = [
  'PRIVACY-PNG-MAKE',
  'PRIVACY-PNG-MODEL',
  'PRIVACY-PNG-AUTHOR',
  'PRIVACY-PNG-SOFTWARE',
  'PRIVACY-PNG-UTC-KEY',
];

export const PNG_PRIVACY_CHUNKS = ['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME'];
export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function toBytes(input) {
  if (Buffer.isBuffer(input)) return input;
  return Buffer.from(input.buffer ?? input, input.byteOffset ?? 0, input.byteLength ?? input.length);
}

function readU32be(bytes, offset) {
  return bytes.readUInt32BE(offset);
}

function chunkType(bytes, offset) {
  return bytes.toString('latin1', offset, offset + 4);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function pngCrc(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Serialize one chunk from its type + payload (CRC computed). */
export function buildChunk(type, payload = Buffer.alloc(0)) {
  const out = Buffer.alloc(12 + payload.length);
  out.writeUInt32BE(payload.length, 0);
  out.write(type, 4, 'latin1');
  payload.copy(out, 8);
  out.writeUInt32BE(pngCrc(out.subarray(4, 8 + payload.length)), 8 + payload.length);
  return out;
}

/** Strict PNG walker used by the assertions (independent of the app code). */
export function readPngChunks(input) {
  const bytes = toBytes(input);
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('fixture: missing PNG signature');
  }
  const chunks = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const size = readU32be(bytes, offset);
    const type = chunkType(bytes, offset + 4);
    const end = offset + 12 + size;
    if (end > bytes.length) throw new Error(`fixture: chunk "${type}" is truncated`);
    const storedCrc = readU32be(bytes, offset + 8 + size);
    const actualCrc = pngCrc(bytes.subarray(offset + 4, offset + 8 + size));
    if (storedCrc !== actualCrc) throw new Error(`fixture: chunk "${type}" has a bad CRC`);
    chunks.push({ type, size, payload: Buffer.from(bytes.subarray(offset + 8, offset + 8 + size)), start: offset, end });
    offset = end;
    if (type === 'IEND') break;
  }
  return chunks;
}

export function pngChunkTypes(input) {
  return readPngChunks(input).map((chunk) => chunk.type);
}

export function findPngChunk(input, type) {
  return readPngChunks(input).find((chunk) => chunk.type === type) || null;
}

/** Width/height/bit-depth/colour-type straight from IHDR. */
export function readIhdr(input) {
  const ihdr = findPngChunk(input, 'IHDR');
  if (!ihdr || ihdr.size !== 13) throw new Error('fixture: no valid IHDR');
  return {
    width: ihdr.payload.readUInt32BE(0),
    height: ihdr.payload.readUInt32BE(4),
    bitDepth: ihdr.payload[8],
    colorType: ihdr.payload[9],
  };
}

/** True when any planted privacy payload string appears anywhere in the file. */
export function leakedPrivacyValues(input) {
  const bytes = toBytes(input);
  return PRIVACY_VALUES.filter((value) => bytes.includes(Buffer.from(value, 'utf8')));
}

/** True when the bytes are a PNG (signature + parseable chunk list). */
export function isValidPng(input) {
  try {
    readPngChunks(input);
    return true;
  } catch {
    return false;
  }
}

/** Concatenated IDAT payloads (the image data, compressed). */
export function idatBytes(input) {
  return Buffer.concat(readPngChunks(input).filter((c) => c.type === 'IDAT').map((c) => c.payload));
}

/** Raw chunk bytes (header + payload + CRC) for verbatim-copy assertions. */
export function rawChunkBytes(input, type) {
  const bytes = toBytes(input);
  return readPngChunks(bytes)
    .filter((c) => c.type === type)
    .map((c) => Buffer.from(bytes.subarray(c.start, c.end)));
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function sharpBase(opts = {}) {
  const { width = 120, height = 80, channels = 4, background = { r: 30, g: 140, b: 220, alpha: 1 } } = opts;
  return sharp({ create: { width, height, channels, background } });
}

/** Base PNG carrying an eXIf chunk with planted privacy fields. */
async function sharpBaseWithExif(opts = {}) {
  return sharpBase(opts)
    .png(opts.pngOptions || {})
    .withExifMerge({
      IFD0: {
        Make: PRIVACY_VALUES[0],
        Model: PRIVACY_VALUES[1],
        Software: PRIVACY_VALUES[3],
        Copyright: PRIVACY_MARKER + 'PNG-COPYRIGHT',
      },
    })
    .toBuffer();
}

/**
 * Rebuild the chunk list of a sharp-generated PNG: keep every original chunk,
 * optionally drop some, and insert extra chunks right before IEND.
 */
export function rebuildPng(base, { drop = [], insert = [] } = {}) {
  const chunks = readPngChunks(base);
  const parts = [PNG_SIGNATURE];
  let inserted = false;
  for (const chunk of chunks) {
    // Ancillary insertions go before the first IDAT (required for iCCP and
    // legal for the text/time chunks), or before IEND when there is no IDAT.
    if (!inserted && (chunk.type === 'IDAT' || chunk.type === 'IEND')) {
      for (const extra of insert) parts.push(buildChunk(extra.type, extra.payload));
      inserted = true;
    }
    if (!drop.includes(chunk.type)) {
      parts.push(buildChunk(chunk.type, chunk.payload));
    }
  }
  return Buffer.concat(parts);
}

export function textChunkPayload(keyword, text) {
  return Buffer.concat([Buffer.from(keyword, 'latin1'), Buffer.from([0]), Buffer.from(text, 'latin1')]);
}

export function ztxtChunkPayload(keyword, text) {
  return Buffer.concat([
    Buffer.from(keyword, 'latin1'),
    Buffer.from([0, 0]), // null separator + deflate compression method
    zlib.deflateSync(Buffer.from(text, 'latin1')),
  ]);
}

export function itxtChunkPayload(keyword, text) {
  // keyword \0 compressionFlag(0) compressionMethod(0) languageTag \0 translatedKeyword \0 utf8 text
  return Buffer.concat([
    Buffer.from(keyword, 'latin1'),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from(text, 'utf8'),
  ]);
}

/** Standard RGB PNG + eXIf. */
export async function buildRgbExifPng(opts = {}) {
  return sharpBaseWithExif({ ...opts, channels: 3, background: { r: 200, g: 60, b: 30 } });
}

/** RGBA PNG + eXIf. */
export async function buildRgbaExifPng(opts = {}) {
  return sharpBaseWithExif(opts);
}

/** PNG carrying an embedded ICC profile (iCCP) plus eXIf. */
export async function buildIccPng(opts = {}) {
  const { width = 120, height = 80, channels = 3, background = { r: 30, g: 140, b: 220, alpha: 1 } } = opts;
  return sharp({ create: { width, height, channels, background } })
    .png()
    .withIccProfile('srgb')
    .withExifMerge({
      IFD0: {
        Make: PRIVACY_VALUES[0],
        Model: PRIVACY_VALUES[1],
        Software: PRIVACY_VALUES[3],
      },
    })
    .toBuffer();
}

/** PNG + every textual metadata chunk kind plus tIME. */
export async function buildTextualPng(opts = {}) {
  const base = await sharpBaseWithExif(opts);
  return rebuildPng(base, {
    insert: [
      { type: 'tEXt', payload: textChunkPayload('Author', PRIVACY_VALUES[2]) },
      { type: 'zTXt', payload: ztxtChunkPayload('Comment', PRIVACY_VALUES[3] + ' compressed comment') },
      { type: 'iTXt', payload: itxtChunkPayload(PRIVACY_VALUES[4], 'international text payload') },
      { type: 'tIME', payload: Buffer.from([0x07, 0xe8, 1, 2, 3, 4, 5]) }, // 2024-01-02 03:04:05
    ],
  });
}

/** Palette (indexed-colour) PNG + eXIf — carries PLTE. */
export async function buildPalettePng(opts = {}) {
  const { width = 120, height = 80 } = opts;
  const pixels = Buffer.alloc(width * height);
  for (let i = 0; i < pixels.length; i++) pixels[i] = i % 3;
  return sharp(pixels, { raw: { width, height, channels: 1 } })
    .png({ palette: true })
    .withExifMerge({ IFD0: { Make: PRIVACY_VALUES[0], Model: PRIVACY_VALUES[1] } })
    .toBuffer();
}

/** PNG with real transparency (alpha channel with fully transparent pixels) + eXIf. */
export async function buildTransparencyPng(opts = {}) {
  const { width = 120, height = 80 } = opts;
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4] = 200;
    pixels[i * 4 + 1] = 40;
    pixels[i * 4 + 2] = 90;
    pixels[i * 4 + 3] = i % 2 === 0 ? 0 : 255; // half fully transparent
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } })
    .png()
    .withExifMerge({ IFD0: { Make: PRIVACY_VALUES[0], Model: PRIVACY_VALUES[1] } })
    .toBuffer();
}

/**
 * 16-bit RGB PNG + eXIf (bit depth 16 must survive untouched). Built by hand
 * because sharp only emits 8-bit PNGs from 8-bit inputs: IHDR (bit depth 16,
 * colour type 2) + one IDAT of deflated 16-bit scanlines, with the eXIf
 * payload borrowed from a real sharp-written PNG.
 */
export async function build16BitPng(opts = {}) {
  const { width = 16, height = 16 } = opts;
  const exifSource = await sharpBaseWithExif(opts);
  const exifPayload = findPngChunk(exifSource, 'eXIf').payload;

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 16; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  // ihdr[10..12] = 0: deflate, adaptive filtering, no interlace

  const stride = width * 3 * 2;
  const raw = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + stride);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width * 3; x++) {
      raw[row + 1 + x * 2] = (x * 7 + y) & 0xff; // high byte
      raw[row + 1 + x * 2 + 1] = (x * 13 + y * 3) & 0xff; // low byte
    }
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    buildChunk('IHDR', ihdr),
    buildChunk('eXIf', exifPayload),
    buildChunk('IDAT', zlib.deflateSync(raw)),
    buildChunk('IEND'),
  ]);
}

/** PNG with no metadata at all. */
export async function buildPlainPng(opts = {}) {
  return sharpBase(opts).png().toBuffer();
}

/** Truncated/corrupt PNG: a chunk's declared size runs past the file end. */
export function buildMalformedPng() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(120, 0);
  ihdr.writeUInt32BE(80, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  // An IDAT header claiming ~300 KB of payload that is not there.
  const truncated = Buffer.alloc(8);
  truncated.writeUInt32BE(300000, 0);
  truncated.write('IDAT', 4, 'latin1');
  return Buffer.concat([PNG_SIGNATURE, buildChunk('IHDR', ihdr), truncated, Buffer.alloc(16)]);
}

/** Valid PNG signature but garbage after it (no IHDR/IEND). */
export function buildGarbagePng() {
  return Buffer.concat([PNG_SIGNATURE, Buffer.from('not-a-real-chunk-stream', 'latin1')]);
}

/** PNG + eXIf + a made-up unknown ancillary chunk that must be preserved. */
export async function buildUnknownChunkPng(opts = {}) {
  const base = await sharpBaseWithExif(opts);
  return rebuildPng(base, {
    insert: [{ type: 'pmTX', payload: Buffer.from('unknown-ancillary-must-survive', 'latin1') }],
  });
}

/** Planted XMP document used by the unverifiable-output fixture. */
export const XMP_PRIVACY_TEXT = 'PRIVACY-PNG-XMP';
export const XMP_PAYLOAD_SIGNATURE = 'http://ns.adobe.com/xap/1.0/';

/**
 * Palette PNG carrying an explicit tRNS alpha table (palette transparency).
 * Transparency is image data, not metadata: it must survive byte-for-byte.
 * sharp does not emit tRNS for indexed output, so it is spliced in after PLTE.
 */
export async function buildTrnsPng(opts = {}) {
  const base = await buildPalettePng(opts);
  const plte = findPngChunk(base, 'PLTE');
  const entries = plte.payload.length / 3;
  const alpha = Buffer.alloc(entries);
  for (let i = 0; i < entries; i++) alpha[i] = i === 0 ? 0 : 255; // entry 0 fully transparent
  return rebuildPng(base, { insert: [{ type: 'tRNS', payload: alpha }] });
}

/**
 * PNG with no metadata except one single textual/time chunk type — proves each
 * of tEXt / zTXt / iTXt / tIME is a removal target on its own (no eXIf needed
 * to make the file interesting).
 */
export async function buildSingleChunkPng(chunkType, opts = {}) {
  const base = await sharpBase({ ...opts, channels: 3, background: { r: 12, g: 80, b: 160 } })
    .png()
    .toBuffer();

  const payloads = {
    tEXt: () => textChunkPayload('Author', PRIVACY_VALUES[2]),
    zTXt: () => ztxtChunkPayload('Comment', PRIVACY_VALUES[3] + ' compressed comment'),
    iTXt: () => itxtChunkPayload('XML:com.adobe.xmp', XMP_PRIVACY_TEXT),
    tIME: () => Buffer.from([0x07, 0xe8, 1, 2, 3, 4, 5]), // 2024-01-02 03:04:05
  };
  if (!payloads[chunkType]) throw new Error(`fixture: no payload for chunk "${chunkType}"`);

  return rebuildPng(base, { insert: [{ type: chunkType, payload: payloads[chunkType]() }] });
}

/**
 * PNG whose metadata payload hides in a private ancillary chunk type the
 * stripper does not classify as metadata. Unknown chunks are preserved by
 * default, so the payload survives stripping — and the verifier must therefore
 * refuse to call the output verified clean instead of downloading it.
 */
export async function buildUnverifiableXmpPng(opts = {}) {
  const base = await sharpBaseWithExif(opts);
  return rebuildPng(base, {
    insert: [
      {
        type: 'prVt',
        payload: Buffer.concat([
          Buffer.from(XMP_PAYLOAD_SIGNATURE, 'latin1'),
          Buffer.from([0]),
          Buffer.from(`<x:xmpmeta>${XMP_PRIVACY_TEXT}</x:xmpmeta>`, 'latin1'),
        ]),
      },
    ],
  });
}

/**
 * Structurally complete PNG whose container is corrupt: one byte of an
 * ancillary chunk's CRC is flipped, so no decoder can trust the chunk.
 */
export async function buildBadCrcPng(opts = {}) {
  const base = Buffer.from(await sharpBaseWithExif(opts));
  const target = findPngChunk(base, 'eXIf') || findPngChunk(base, 'pHYs');
  const offset = target ? target.end - 1 : base.length - 5; // last CRC byte
  base[offset] = base[offset] ^ 0xff;
  return base;
}

/** PNG with a valid chunk list but no IEND chunk (truncated container). */
export async function buildNoIendPng(opts = {}) {
  const base = await buildRgbExifPng(opts);
  return rebuildPng(base, { drop: ['IEND'] });
}

/**
 * Re-scan a PNG the way a reader does: pull the eXIf chunk payload out and
 * parse it with exifr; collect textual chunk contents as strings. Independent
 * of src/lib/png.ts, and safe on a PNG with no metadata chunks (returns {}).
 */
export async function parsePngMetadata(input, parseOptions = true) {
  const chunks = readPngChunks(input);
  const out = {};
  const exif = chunks.find((chunk) => chunk.type === 'eXIf');
  if (exif) {
    try {
      Object.assign(out, (await exifr.parse(exif.payload, parseOptions)) || {});
    } catch (_err) {
      out.__exifUnparsed = true;
    }
  }
  const texts = chunks
    .filter((chunk) => chunk.type === 'tEXt' || chunk.type === 'iTXt')
    .map((chunk) => chunk.payload.toString('utf8'));
  if (texts.length) out.texts = texts;
  if (chunks.some((chunk) => chunk.type === 'zTXt')) out.ztxt = true;
  if (chunks.some((chunk) => chunk.type === 'tIME')) out.time = true;
  return out;
}

