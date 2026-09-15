/**
 * WebP test fixture builder + independent RIFF container inspector, shared by
 * the Playwright UI spec and any Node harness.
 *
 * sharp writes a real, spec-shaped WebP — including the "Exif\0\0"-prefixed
 * EXIF chunk that real-world WebP files carry — so the fixtures start from a
 * sharp-generated base and rewrite its chunk list. That makes them structurally
 * identical to what a camera or editor produces while letting a test choose the
 * EXIF layout (bare TIFF header vs "Exif\0\0" identifier vs big-endian TIFF)
 * instead of guessing what a writer happens to emit.
 *
 * Nothing here imports src/lib/webp.ts on purpose: the inspection helpers are a
 * second, independent implementation so the tests cannot "prove" the fix with
 * the very code under test.
 */
import sharp from 'sharp';
import exifr from 'exifr';

export const PRIVACY_MARKER = 'PRIVACY-';

/** Planted strings — a byte scan of the download must not find any of them. */
export const PRIVACY_VALUES = [
  'PRIVACY-WEBP-MAKE',
  'PRIVACY-WEBP-MODEL',
  'PRIVACY-WEBP-SOFTWARE',
  'PRIVACY-XMP-AUTHOR',
];

const RIFF_FOURCC = 'RIFF';
const WEBP_FOURCC = 'WEBP';
const VP8X_FLAG_ICC = 0x20;
const VP8X_FLAG_ALPHA = 0x10;
const VP8X_FLAG_EXIF = 0x08;
const VP8X_FLAG_XMP = 0x04;
const VP8X_FLAG_ANIM = 0x02;

function toBytes(input) {
  if (Buffer.isBuffer(input)) return input;
  return Buffer.from(input.buffer ?? input, input.byteOffset ?? 0, input.byteLength ?? input.length);
}

function readU32(bytes, offset) {
  return (
    (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
  );
}

function writeU32(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

/** FourCC of a chunk as a string (trailing space preserved: "XMP ", "VP8 "). */
function chunkId(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

/** Strict RIFF walker used by the assertions (independent of the app code). */
export function readChunks(input) {
  const bytes = toBytes(input);
  if (bytes.length < 12) throw new Error('fixture: file is shorter than a RIFF header');
  if (chunkId(bytes, 0) !== RIFF_FOURCC) throw new Error('fixture: missing RIFF magic');
  if (chunkId(bytes, 8) !== WEBP_FOURCC) throw new Error('fixture: missing WEBP magic');

  const chunks = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = chunkId(bytes, offset);
    const size = readU32(bytes, offset + 4);
    const payloadEnd = offset + 8 + size;
    if (payloadEnd > bytes.length) throw new Error(`fixture: chunk "${id}" is truncated`);
    chunks.push({ id, size, payload: Buffer.from(bytes.subarray(offset + 8, payloadEnd)) });
    offset = payloadEnd + (size % 2);
  }
  return chunks;
}

export function chunkIds(input) {
  return readChunks(input).map((chunk) => chunk.id);
}

export function findChunk(input, id) {
  return readChunks(input).find((chunk) => chunk.id === id) || null;
}

/** Decode the VP8X feature flags + canvas size, or null when absent. */
export function readVp8x(input) {
  const chunk = findChunk(input, 'VP8X');
  if (!chunk || chunk.size < 10) return null;
  const f = chunk.payload[0];
  return {
    raw: f,
    icc: (f & VP8X_FLAG_ICC) !== 0,
    alpha: (f & VP8X_FLAG_ALPHA) !== 0,
    exif: (f & VP8X_FLAG_EXIF) !== 0,
    xmp: (f & VP8X_FLAG_XMP) !== 0,
    anim: (f & VP8X_FLAG_ANIM) !== 0,
    width: 1 + (chunk.payload[4] | (chunk.payload[5] << 8) | (chunk.payload[6] << 16)),
    height: 1 + (chunk.payload[7] | (chunk.payload[8] << 8) | (chunk.payload[9] << 16)),
  };
}

/** True when the bytes are a JPEG (i.e. the WebP silently changed format). */
export function looksLikeJpeg(input) {
  const bytes = toBytes(input);
  if (bytes.length < 3) return false;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  const head = bytes.subarray(0, Math.min(bytes.length, 4096)).toString('latin1');
  return head.includes('JFIF');
}

/** Which planted privacy strings still appear in the raw bytes. */
export function leakedPrivacyValues(input) {
  const raw = toBytes(input).toString('latin1');
  return PRIVACY_VALUES.filter((value) => raw.includes(value));
}

function chunkBytes(id, payload) {
  const header = Buffer.alloc(8);
  header.write(id, 0, 'latin1');
  writeU32(header, 4, payload.length);
  const pad = payload.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([header, payload, pad]);
}

/** ASCII TIFF field value, NUL-terminated and even-padded. */
function tiffAscii(text) {
  const out = Buffer.alloc(text.length + 1);
  out.write(text, 0, 'latin1');
  return out.length % 2 ? Buffer.concat([out, Buffer.alloc(1)]) : out;
}

/**
 * Minimal but valid big-endian ("MM\0*") TIFF/EXIF block. sharp only writes
 * little-endian EXIF, so big-endian is built by hand to prove the WebP reader
 * handles both byte orders.
 */
export function buildBigEndianTiffExif(fields) {
  const entries = [
    { tag: 0x010f, value: tiffAscii(fields.make) }, // Make
    { tag: 0x0110, value: tiffAscii(fields.model) }, // Model
    { tag: 0x0131, value: tiffAscii(fields.software) }, // Software
  ];

  let cursor = 8 + 2 + entries.length * 12 + 4;
  const entryBytes = [];
  const dataBytes = [];
  for (const entry of entries) {
    const row = Buffer.alloc(12);
    row.writeUInt16BE(entry.tag, 0);
    row.writeUInt16BE(2, 2); // ASCII
    row.writeUInt32BE(entry.value.length, 4);
    row.writeUInt32BE(cursor, 8);
    entryBytes.push(row);
    dataBytes.push(entry.value);
    cursor += entry.value.length;
  }

  const header = Buffer.alloc(8);
  header.writeUInt16BE(0x4d4d, 0); // 'MM'
  header.writeUInt16BE(0x002a, 2); // 42
  header.writeUInt32BE(8, 4); // IFD0 offset

  const count = Buffer.alloc(2);
  count.writeUInt16BE(entries.length, 0);
  const nextIfd = Buffer.alloc(4); // no IFD1 => no embedded thumbnail

  return Buffer.concat([header, count, ...entryBytes, nextIfd, ...dataBytes]);
}

/**
 * sharp-generated lossy WebP carrying the privacy EXIF exactly as sharp writes
 * it: an "EXIF" chunk whose payload starts with "Exif\0\0" + little-endian TIFF.
 */
async function sharpBaseWithExif({ width = 100, height = 100, alpha = false, icc = false } = {}) {
  let pipeline = sharp({
    create: {
      width,
      height,
      channels: alpha ? 4 : 3,
      background: alpha ? { r: 10, g: 10, b: 220, alpha: 0.5 } : { r: 10, g: 10, b: 220 },
    },
  }).webp();

  if (icc) pipeline = pipeline.withMetadata({ icc: 'srgb' });

  return pipeline
    .withExifMerge({
      IFD0: { Make: PRIVACY_VALUES[0], Model: PRIVACY_VALUES[1], Software: PRIVACY_VALUES[2] },
    })
    .toBuffer();
}

/**
 * Rebuild a WebP's RIFF chunk list: metadata chunks are dropped and the given
 * EXIF/XMP payloads are inserted after the image data, with the VP8X feature
 * flags and the RIFF size field recomputed. Every other chunk is copied
 * verbatim, byte for byte.
 */
function rewriteWebp(base, { exifPayload = null, xmpPayload = null, width = 100, height = 100 }) {
  const chunks = readChunks(base);
  const take = (id) => {
    const index = chunks.findIndex((chunk) => chunk.id === id);
    return index < 0 ? null : chunks.splice(index, 1)[0];
  };

  const existingVp8x = take('VP8X');
  let flags = existingVp8x ? existingVp8x.payload[0] : 0;
  if (!existingVp8x) {
    if (chunks.some((chunk) => chunk.id === 'ICCP')) flags |= VP8X_FLAG_ICC;
    if (chunks.some((chunk) => chunk.id === 'ALPH')) flags |= VP8X_FLAG_ALPHA;
    if (chunks.some((chunk) => chunk.id === 'ANIM')) flags |= VP8X_FLAG_ANIM;
  }
  flags &= ~(VP8X_FLAG_EXIF | VP8X_FLAG_XMP);
  if (exifPayload) flags |= VP8X_FLAG_EXIF;
  if (xmpPayload) flags |= VP8X_FLAG_XMP;

  // VP8X payload layout: flags(1) + reserved(3) + width-1(3, LE) + height-1(3, LE)
  const vp8x = Buffer.alloc(10);
  vp8x[0] = flags;
  vp8x[4] = (width - 1) & 0xff;
  vp8x[5] = ((width - 1) >>> 8) & 0xff;
  vp8x[6] = ((width - 1) >>> 16) & 0xff;
  vp8x[7] = (height - 1) & 0xff;
  vp8x[8] = ((height - 1) >>> 8) & 0xff;
  vp8x[9] = ((height - 1) >>> 16) & 0xff;

  const body = [chunkBytes('VP8X', vp8x)];
  for (const id of ['ICCP', 'ANIM', 'ANMF', 'ALPH', 'VP8 ', 'VP8L']) {
    let chunk;
    while ((chunk = take(id))) body.push(chunkBytes(id, chunk.payload));
  }
  if (exifPayload) body.push(chunkBytes('EXIF', exifPayload));
  if (xmpPayload) body.push(chunkBytes('XMP ', xmpPayload));
  for (const leftover of chunks) {
    if (leftover.id === 'EXIF' || leftover.id === 'XMP ') continue; // base metadata is dropped
    body.push(chunkBytes(leftover.id, leftover.payload));
  }

  const payload = Buffer.concat(body);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  writeU32(header, 4, payload.length + 4);
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, payload]);
}

/** Layout B: EXIF chunk payload = "Exif\0\0" + little-endian TIFF (real-world). */
export async function buildPrefixedExifWebp(opts = {}) {
  const base = await sharpBaseWithExif(opts);
  const payload = findChunk(base, 'EXIF').payload;
  return rewriteWebp(base, { ...opts, exifPayload: payload });
}

/** Layout A: EXIF chunk payload = bare little-endian TIFF header ("II*\0"). */
export async function buildBareExifWebp(opts = {}) {
  const base = await sharpBaseWithExif(opts);
  const payload = findChunk(base, 'EXIF').payload.subarray(6);
  return rewriteWebp(base, { ...opts, exifPayload: payload });
}

/** Layout B with a big-endian ("MM\0*") TIFF payload. */
export async function buildBigEndianExifWebp(opts = {}) {
  const base = await sharpBaseWithExif(opts);
  const tiff = buildBigEndianTiffExif({
    make: PRIVACY_VALUES[0],
    model: PRIVACY_VALUES[1],
    software: PRIVACY_VALUES[2],
  });
  const payload = Buffer.concat([Buffer.from('Exif\u0000\u0000', 'latin1'), tiff]);
  return rewriteWebp(base, { ...opts, exifPayload: payload });
}

/** EXIF plus an "XMP " chunk, so both metadata chunk kinds are exercised. */
export async function buildExifAndXmpWebp(opts = {}) {
  const base = await sharpBaseWithExif(opts);
  const exifPayload = findChunk(base, 'EXIF').payload;
  const xml =
    '<?xpacket begin="\ufeff"?><x:xmpmeta xmlns:x="adobe:ns:meta/">' +
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    `<dc:creator>${PRIVACY_VALUES[3]}</dc:creator></rdf:RDF>` +
    '</x:xmpmeta><?xpacket end="w"?>';
  return rewriteWebp(base, { ...opts, exifPayload, xmpPayload: Buffer.from(xml, 'utf8') });
}

/** Truncated/corrupt container: the chunk size runs far past the file end. */
export function buildMalformedWebp() {
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  writeU32(header, 4, 4096);
  header.write('WEBP', 8, 'latin1');
  const chunk = Buffer.alloc(8);
  chunk.write('VP8 ', 0, 'latin1');
  writeU32(chunk, 4, 999999); // claims ~1 MB of payload that is not there
  return Buffer.concat([header, chunk, Buffer.alloc(32)]);
}

/**
 * Re-scan a WebP the way a reader does: pull the EXIF/XMP chunk payloads out of
 * the container and parse them. Independent of src/lib/webp.ts, and safe on a
 * WebP that has no metadata chunks at all (returns {}).
 */
export async function parseWebpMetadata(input, parseOptions = true) {
  const chunks = readChunks(input);
  const out = {};

  const exif = chunks.find((chunk) => chunk.id === 'EXIF');
  if (exif) {
    let payload = exif.payload;
    if (payload.length > 6 && payload.subarray(0, 6).toString('latin1') === 'Exif\u0000\u0000') {
      payload = payload.subarray(6); // skip the identifier, keep the TIFF block
    }
    try {
      Object.assign(out, (await exifr.parse(payload, parseOptions)) || {});
    } catch (_err) {
      out.__exifUnparsed = true;
    }
  }

  const xmp = chunks.find((chunk) => chunk.id === 'XMP ');
  if (xmp) out.xmpmeta = xmp.payload.toString('utf8');

  return out;
}