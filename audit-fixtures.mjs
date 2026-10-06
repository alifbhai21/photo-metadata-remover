/**
 * Audit fixtures for the metadata-collector audit.
 *
 * Why this file hand-builds the EXIF block instead of using sharp:
 *   sharp's `withExifMerge()` silently DROPS every ExifIFD and GPSIFD tag.
 *   Verified on this repo: a fixture requesting LensModel, FocalLength,
 *   ExposureTime, FNumber, ISO, DateTimeOriginal, DateTimeDigitized,
 *   BodySerialNumber, GPSLatitude, GPSLongitude, GPSAltitude and GPSTimeStamp
 *   came back with ALL of them absent while the IFD0 tags were written.
 *   A fixture that silently lacks the fields it claims to test would make the
 *   audit meaningless, so the TIFF/EXIF structure is written by hand here and
 *   then PROVEN by re-parsing it.
 *
 * Nothing here touches application code: this module only produces and
 * inspects bytes. Every assertion still runs through the real UI.
 */
import sharp from 'sharp';

const T = { BYTE: 1, ASCII: 2, SHORT: 3, LONG: 4, RATIONAL: 5 };
const latin = (s) => Buffer.from(s, 'latin1');

function asciiVal(s) {
  const b = latin(s + '\0');
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.alloc(1)]);
}
function rational(n, d) {
  const b = Buffer.alloc(8);
  b.writeUInt32LE(n >>> 0, 0);
  b.writeUInt32LE(d >>> 0, 4);
  return b;
}
function shortVal(v) { const b = Buffer.alloc(4); b.writeUInt16LE(v, 0); return b; }
function byteVal(v) { const b = Buffer.alloc(4); b.writeUInt8(v, 0); return b; }

/** Serialise one IFD; `heapBase` is where its out-of-line values begin. */
function buildIfd(entries, heapBase) {
  const count = entries.length;
  const body = Buffer.alloc(2 + count * 12 + 4);
  body.writeUInt16LE(count, 0);
  const heap = [];
  let cursor = heapBase;
  entries.forEach(([tag, type, n, val], i) => {
    const at = 2 + i * 12;
    body.writeUInt16LE(tag, at);
    body.writeUInt16LE(type, at + 2);
    body.writeUInt32LE(n, at + 4);
    if (val.length <= 4) { val.copy(body, at + 8); return; }
    body.writeUInt32LE(cursor, at + 8);
    heap.push(val);
    cursor += val.length;
  });
  return { body, heap, heapSize: cursor - heapBase };
}

/**
 * Complete little-endian TIFF/EXIF block: IFD0 + Exif sub-IFD + GPS sub-IFD,
 * with every out-of-line value in a heap placed after all three directories.
 */
export function buildExifBlock() {
  // EXIF ASCII `count` MUST be the string length INCLUDING the NUL terminator.
  // Deriving it from the string keeps the two from drifting apart (a wrong
  // count silently bleeds adjacent heap bytes into the value).
  const A = (tag, str) => [tag, T.ASCII, str.length + 1, asciiVal(str)];
  const ifd0Entries = [
    A(0x010f, 'AUDIT-CAM'),   // Make
    A(0x0110, 'AUDIT-M9'),    // Model
    A(0x0131, 'AUDIT-SW 2.0'),// Software
    A(0x0132, '2024:01:15 12:30:45'), // DateTime
    A(0x013b, 'Jane Auditor'),// Artist
    A(0x8298, 'AUDIT-CR'),    // Copyright
    A(0x010e, 'AUDIT-DESC'),  // ImageDescription
    [0x8769, T.LONG, 1, Buffer.alloc(4)], // Exif IFD pointer, patched below
    [0x8825, T.LONG, 1, Buffer.alloc(4)], // GPS  IFD pointer, patched below
  ];
  const exifEntries = [
    [0x829a, T.RATIONAL, 1, rational(5, 1000)],  // ExposureTime
    [0x829d, T.RATIONAL, 1, rational(28, 10)],   // FNumber
    [0x8827, T.SHORT, 1, shortVal(400)],         // ISO
    A(0x9003, '2024:01:15 12:30:45'), // DateTimeOriginal
    A(0x9004, '2024:01:15 12:31:00'), // DateTimeDigitized
    [0x920a, T.RATIONAL, 1, rational(35, 1)],    // FocalLength
    A(0xa431, 'AUDIT-BODY-777'),   // BodySerialNumber
    A(0xa434, 'AUDIT-LENS 24-70'), // LensModel
  ];
  const gpsEntries = [
    [0x0001, T.ASCII, 2, asciiVal('N')],
    [0x0002, T.RATIONAL, 3, Buffer.concat([rational(48, 1), rational(51, 1), rational(2460, 100)])],
    [0x0003, T.ASCII, 2, asciiVal('E')],
    [0x0004, T.RATIONAL, 3, Buffer.concat([rational(2, 1), rational(17, 1), rational(6730, 100)])],
    [0x0005, T.BYTE, 1, byteVal(0)],
    [0x0006, T.RATIONAL, 1, rational(35, 1)],
    [0x0007, T.RATIONAL, 3, Buffer.concat([rational(10, 1), rational(30, 1), rational(15, 1)])],
  ];

  const sizeOf = (n) => 2 + n * 12 + 4;
  const ifd0Off = 8;
  const exifOff = ifd0Off + sizeOf(ifd0Entries.length);
  const gpsOff = exifOff + sizeOf(exifEntries.length);
  const heapOff = gpsOff + sizeOf(gpsEntries.length);

  const a = buildIfd(ifd0Entries, heapOff);
  const b = buildIfd(exifEntries, heapOff + a.heapSize);
  const c = buildIfd(gpsEntries, heapOff + a.heapSize + b.heapSize);

  a.body.writeUInt32LE(exifOff, 2 + 7 * 12 + 8); // 0x8769
  a.body.writeUInt32LE(gpsOff, 2 + 8 * 12 + 8);  // 0x8825

  const header = Buffer.alloc(8);
  header.write('II', 0, 'latin1');
  header.writeUInt16LE(0x2a, 2);
  header.writeUInt32LE(ifd0Off, 4);

  return Buffer.concat([header, a.body, b.body, c.body, ...a.heap, ...b.heap, ...c.heap]);
}

/** Wrap a payload in a JPEG marker segment (2-byte big-endian length). */
export function jpegSegment(marker, payload) {
  const len = Buffer.alloc(2);
  len.writeUInt16BE(payload.length + 2, 0);
  return Buffer.concat([Buffer.from([0xff, marker]), len, payload]);
}

/** Insert segments directly after the SOI of a base JPEG. */
function injectAfterSoi(base, segments) {
  return Buffer.concat([base.subarray(0, 2), ...segments, base.subarray(2)]);
}

/** A JFIF APP0 header - purely technical, carries no privacy metadata. */
export const APP0_JFIF = jpegSegment(0xe0, Buffer.concat([
  latin('JFIF\0'), Buffer.from([0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]),
]));

/**
 * A real XMP packet. The application only reports the CONTAINER's presence
 * (one "JPEG XMP" row) and never parses XMP content - see
 * `addJpegSegmentMetadata` in ToolUpload.astro - so the individual XMP
 * properties below exist to make the packet legitimate, not to be asserted.
 */
export const XMP_PACKET =
  '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF ' +
  'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description ' +
  'xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
  'xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmp:CreatorTool="AUDIT-CREATOR-TOOL">' +
  '<dc:creator><rdf:Seq><rdf:li>AUDIT-XMP-CREATOR</rdf:li></rdf:Seq></dc:creator>' +
  '<dc:title><rdf:Alt><rdf:li xml:lang="x-default">AUDIT-XMP-TITLE</rdf:li></rdf:Alt></dc:title>' +
  '<dc:description><rdf:Alt><rdf:li xml:lang="x-default">AUDIT-XMP-DESC</rdf:li></rdf:Alt></dc:description>' +
  '<xmp:CreateDate>2024-01-15T12:30:45</xmp:CreateDate>' +
  '</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';

export function xmpApp1Segment() {
  return jpegSegment(0xe1, Buffer.concat([
    latin('http://ns.adobe.com/xap/1.0/\0'), latin(XMP_PACKET),
  ]));
}

/**
 * APP13 "Photoshop 3.0" payload holding a real 8BIM resource (0x0404 = IPTC-NAA)
 * with genuine IPTC datasets (by-line, title, keywords). As with XMP, the app
 * reports only the container's presence, so these bytes make the block
 * legitimate rather than being asserted individually.
 */
export function buildIptcApp13Payload() {
  const header = latin('Photoshop 3.0\0');
  const b = latin('8BIM');
  const resourceId = Buffer.from([0x04, 0x04]);
  const emptyName = Buffer.from([0x00, 0x00]);
  const datasets = Buffer.concat([
    Buffer.from([0x1c, 0x02, 0x05, 0x00, 0x03, 0x41, 0x55, 0x44, 0x49, 0x54]),
    Buffer.from([0x1c, 0x02, 0x00, 0x05, 0x00, 0x0a,
      0x41, 0x55, 0x44, 0x49, 0x54, 0x2d, 0x54, 0x49, 0x54, 0x4c, 0x45]),
    Buffer.from([0x1c, 0x02, 0x19, 0x00, 0x03, 0x41, 0x55, 0x44]),
  ]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(datasets.length, 0);
  const padded = datasets.length % 2 === 0 ? datasets : Buffer.concat([datasets, Buffer.alloc(1)]);
  return Buffer.concat([header, b, resourceId, emptyName, size, padded]);
}

export function iptcApp13Segment() {
  return jpegSegment(0xed, buildIptcApp13Payload());
}

export function comSegment(text = 'AUDIT-JPEG-COMMENT') {
  return jpegSegment(0xfe, latin(text));
}

export function exifApp1Segment() {
  return jpegSegment(0xe1, Buffer.concat([latin('Exif\0\0'), buildExifBlock()]));
}

async function baseJpeg() {
  return sharp({
    create: { width: 160, height: 120, channels: 3, background: { r: 210, g: 130, b: 45 } },
  }).jpeg({ quality: 90 }).toBuffer();
}

/** Full-coverage JPEG: EXIF + GPS + XMP + IPTC + COM. */
export async function buildComprehensiveJpeg() {
  const base = await baseJpeg();
  return injectAfterSoi(base, [
    APP0_JFIF, exifApp1Segment(), xmpApp1Segment(), iptcApp13Segment(), comSegment(),
  ]);
}

/** EXIF (incl. GPS) only - no XMP/IPTC/COM. */
export async function buildGpsJpeg() {
  const base = await baseJpeg();
  return injectAfterSoi(base, [APP0_JFIF, exifApp1Segment()]);
}

/**
 * EXIF carrying LensSerialNumber (0xA435) — the one lens tag buildExifBlock()
 * above deliberately does not plant. exifr surfaces 0xA435 under the key
 * `LensSerialNumber`, and the privacy classifier lists that key, so the field
 * must be collected, flagged privacy and removed with the EXIF block. Built as
 * a separate fixture so the comprehensive fixture's bytes (and every test
 * pinned to them) stay untouched.
 */
export async function buildLensSerialJpeg() {
  const A = (tag, str) => [tag, T.ASCII, str.length + 1, asciiVal(str)];
  const ifd0Entries = [
    A(0x010f, 'AUDIT-CAM'),   // Make
    A(0x0110, 'AUDIT-M9'),    // Model
    [0x8769, T.LONG, 1, Buffer.alloc(4)], // Exif IFD pointer, patched below
  ];
  const exifEntries = [
    A(0xa434, 'AUDIT-LENS 24-70'),    // LensModel
    A(0xa435, 'AUDIT-LENS-SN-00921'), // LensSerialNumber
  ];

  const sizeOf = (n) => 2 + n * 12 + 4;
  const ifd0Off = 8;
  const exifOff = ifd0Off + sizeOf(ifd0Entries.length);
  const heapOff = exifOff + sizeOf(exifEntries.length);

  const a = buildIfd(ifd0Entries, heapOff);
  const b = buildIfd(exifEntries, heapOff + a.heapSize);

  a.body.writeUInt32LE(exifOff, 2 + 2 * 12 + 8); // 0x8769

  const header = Buffer.alloc(8);
  header.write('II', 0, 'latin1');
  header.writeUInt16LE(0x2a, 2);
  header.writeUInt32LE(ifd0Off, 4);

  const tiff = Buffer.concat([header, a.body, b.body, ...a.heap, ...b.heap]);
  const base = await baseJpeg();
  return injectAfterSoi(base, [
    APP0_JFIF,
    jpegSegment(0xe1, Buffer.concat([latin('Exif\0\0'), tiff])),
  ]);
}

/** XMP container only. */
export async function buildXmpJpeg() {
  const base = await baseJpeg();
  return injectAfterSoi(base, [APP0_JFIF, xmpApp1Segment()]);
}

/** IPTC container only. */
export async function buildIptcJpeg() {
  const base = await baseJpeg();
  return injectAfterSoi(base, [APP0_JFIF, iptcApp13Segment()]);
}

/** COM comment only. */
export async function buildComJpeg() {
  const base = await baseJpeg();
  return injectAfterSoi(base, [APP0_JFIF, comSegment()]);
}

/** Technical-only JPEG: a JFIF APP0 and nothing else. */
export async function buildTechnicalOnlyJpeg() {
  const base = await baseJpeg();
  return injectAfterSoi(base, [APP0_JFIF]);
}

/** No metadata at all. */
export async function buildPlainJpeg() {
  return baseJpeg();
}

/* ------------------------------------------------------------------ *
 * Independent byte-level inspectors.
 *
 * These re-derive the truth from the RAW BYTES of a file, deliberately without
 * importing anything from src/. A scan result is never accepted as proof that
 * removal worked - only these container walks are.
 * ------------------------------------------------------------------ */

/** Enumerate the JPEG segment markers present before the first SOS. */
export function listJpegSegments(buf) {
  const b = Buffer.from(buf);
  const out = [];
  let pos = 2;
  while (pos + 1 < b.length) {
    if (b[pos] !== 0xff) { pos++; continue; }
    const marker = b[pos + 1];
    if (marker === 0xda) break;
    if (marker === 0xd9) break;
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { pos += 2; continue; }
    if (pos + 3 >= b.length) break;
    const len = (b[pos + 2] << 8) | b[pos + 3];
    const payload = b.subarray(pos + 4, pos + 2 + len);
    out.push({
      marker,
      name: 'APP' + (marker - 0xe0) + (marker >= 0xe0 && marker <= 0xef ? '' : ''),
      size: len,
      head: payload.subarray(0, 16).toString('latin1'),
      payload,
    });
    pos += 2 + len;
  }
  return out;
}

/** True when the JPEG physically carries an APP1 "Exif\0\0" payload. */
export function hasJpegExifSegment(buf) {
  return listJpegSegments(buf).some(
    (s) => s.marker === 0xe1 && s.payload.subarray(0, 6).toString('latin1') === 'Exif\0\0',
  );
}

/** True when the JPEG physically carries an XMP APP1 payload. */
export function hasJpegXmpSegment(buf) {
  return listJpegSegments(buf).some(
    (s) => s.marker === 0xe1 && s.payload.subarray(0, 29).toString('latin1').startsWith('http://'),
  );
}

/** True when the JPEG physically carries an APP13 "Photoshop 3.0" IPTC block. */
export function hasJpegIptcSegment(buf) {
  return listJpegSegments(buf).some(
    (s) => s.marker === 0xed && s.payload.subarray(0, 13).toString('latin1').startsWith('Photoshop 3.0'),
  );
}

/** True when the JPEG physically carries a COM comment segment. */
export function hasJpegComSegment(buf) {
  return listJpegSegments(buf).some((s) => s.marker === 0xfe);
}

/** Raw greppable privacy strings planted in the fixtures. */
export const PLANTED_STRINGS = [
  'AUDIT-CAM', 'AUDIT-M9', 'AUDIT-SW 2.0', 'Jane Auditor', 'AUDIT-CR',
  'AUDIT-DESC', 'AUDIT-LENS 24-70', 'AUDIT-BODY-777',
  'AUDIT-JPEG-COMMENT', 'AUDIT-XMP-CREATOR', 'AUDIT-XMP-TITLE',
  'AUDIT-XMP-DESC', 'AUDIT-CREATOR-TOOL',
];

/** Any planted privacy string still physically present in the bytes? */
export function findPlantedStrings(buf) {
  const text = Buffer.from(buf).toString('latin1');
  return PLANTED_STRINGS.filter((needle) => text.includes(needle));
}

/* ------------------------------------------------------------------ *
 * PNG / WebP / TIFF fixtures + inspectors.
 * ------------------------------------------------------------------ */

const PNG_METADATA_CHUNKS = ['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME'];

/** PNG with real eXIf + tEXt + iTXt + tIME metadata chunks. */
export async function buildMetadataPng() {
  const base = await sharp({
    create: { width: 120, height: 90, channels: 4, background: { r: 30, g: 160, b: 90, alpha: 0.5 } },
  }).png().withExifMerge({
    IFD0: {
      Make: 'AUDIT-PNG-CAM', Model: 'AUDIT-PNG-M9', Software: 'AUDIT-PNG-SW',
      Artist: 'Jane Auditor', Copyright: 'AUDIT-PNG-CR',
    },
  }).toBuffer();

  const chunks = [];
  for (const [type, text] of [
    ['tEXt', 'AUDIT-PNG-TEXT\x00AUDIT-PNG-TEXTUAL'],
    ['iTXt', 'Comment\x00\x00\x00\x00\x00AUDIT-PNG-ITXT'],
  ]) {
    chunks.push(mkChunk(type, Buffer.from(text, 'latin1')));
  }
  chunks.push(mkChunk('tIME', Buffer.from([0x07, 0xe6, 1, 15, 12, 30, 45])));

  // Insert straight after the IHDR chunk itself (signature + len/type/data/crc).
  // NB: sharp also emits a pHYs chunk after IHDR, so the insertion point has to
  // be derived by walking the real chunk list rather than assuming a fixed
  // offset - assuming 8+12+13+4 lands inside pHYs and corrupts the file.
  let off = 8;
  while (off + 12 <= base.length) {
    const len = base.readUInt32BE(off);
    const type = base.subarray(off + 4, off + 8).toString('latin1');
    off += 12 + len;
    if (type === 'IHDR') break;
  }
  return Buffer.concat([base.subarray(0, off), ...chunks, base.subarray(off)]);
}

/** PNG with no metadata chunks at all. */
export async function buildPlainPng() {
  return sharp({
    create: { width: 120, height: 90, channels: 4, background: { r: 30, g: 160, b: 90, alpha: 0.5 } },
  }).png().toBuffer();
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function mkChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** List the chunk types present in a PNG, in file order. */
export function listPngChunks(buf) {
  const b = Buffer.from(buf);
  const out = [];
  let off = 8;
  while (off + 8 <= b.length) {
    const len = b.readUInt32BE(off);
    const type = b.subarray(off + 4, off + 8).toString('latin1');
    out.push(type);
    if (type === 'IEND') break;
    off += 12 + len;
  }
  return out;
}

export function pngHasMetadataChunks(buf) {
  return listPngChunks(buf).filter((t) => PNG_METADATA_CHUNKS.includes(t));
}

export const PNG_CLEAN_MUST_KEEP = ['IHDR', 'IDAT', 'IEND'];

/** Every chunk CRC still valid, IHDR first, IEND last? */
export function pngIsStructurallyValid(buf) {
  const b = Buffer.from(buf);
  if (b.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return false;
  const chunks = [];
  let off = 8;
  while (off + 12 <= b.length) {
    const len = b.readUInt32BE(off);
    const type = b.subarray(off + 4, off + 8).toString('latin1');
    const data = b.subarray(off + 8, off + 8 + len);
    const crc = b.readUInt32BE(off + 8 + len);
    if (crc !== crc32(Buffer.concat([Buffer.from(type, 'latin1'), data]))) return false;
    chunks.push(type);
    if (type === 'IEND') break;
    off += 12 + len;
  }
  return chunks[0] === 'IHDR' && chunks[chunks.length - 1] === 'IEND' && chunks.includes('IDAT');
}

/** WebP carrying a real EXIF chunk. */
export async function buildMetadataWebp() {
  return sharp({
    create: { width: 100, height: 80, channels: 4, background: { r: 90, g: 40, b: 200, alpha: 0.6 } },
  }).webp().withExifMerge({
    IFD0: { Make: 'AUDIT-WEBP-CAM', Model: 'AUDIT-WEBP-M9', Software: 'AUDIT-WEBP-SW' },
  }).toBuffer();
}

/**
 * WebP carrying BOTH an EXIF chunk and an XMP chunk.
 *
 * sharp writes the EXIF chunk but cannot emit an XMP chunk, so the XMP chunk
 * is spliced into the RIFF container directly and the RIFF size field is
 * rewritten. Inserting it right after the 12-byte RIFF/WEBP header also means a
 * VP8X feature-flag byte has to be added (RIFF requires VP8X to advertise
 * metadata chunks), otherwise decoders ignore the XMP entirely.
 */
export async function buildMetadataWebpWithXmp() {
  const base = await buildMetadataWebp();
  const b = Buffer.from(base);
  const chunks = listWebpChunks(b);
  const hasVp8x = chunks.includes('VP8X');
  // VP8X chunk total size = 8-byte header + 10-byte payload.
  const vp8xEnd = hasVp8x ? 12 + 18 : 12;

  // Clone everything up to (and including) VP8X, adding the XMP feature flag
  // (byte 0 of the VP8X payload, bit 0x04) so decoders honour the new chunk.
  const prefix = Buffer.from(b.subarray(0, vp8xEnd));
  if (hasVp8x) prefix.writeUInt8(prefix.readUInt8(20) | 0x04, 20);

  const payload = latin(XMP_PACKET);
  const sizeBuf = Buffer.alloc(4);
  sizeBuf.writeUInt32LE(payload.length, 0);
  const xmpChunk = Buffer.concat([
    latin('XMP '), sizeBuf, payload,
    payload.length % 2 === 0 ? Buffer.alloc(0) : Buffer.alloc(1),
  ]);

  const out = Buffer.concat([prefix, xmpChunk, b.subarray(vp8xEnd)]);
  out.writeUInt32LE(out.length - 8, 4); // rewrite the RIFF size field
  return out;
}

/** Plain WebP, no metadata chunks. */
export async function buildPlainWebp() {
  return sharp({
    create: { width: 100, height: 80, channels: 4, background: { r: 90, g: 40, b: 200, alpha: 0.6 } },
  }).webp().toBuffer();
}

/** List RIFF chunk ids of a WebP. */
export function listWebpChunks(buf) {
  const b = Buffer.from(buf);
  const out = [];
  let off = 12;
  while (off + 8 <= b.length) {
    const id = b.subarray(off, off + 4).toString('latin1');
    const size = b.readUInt32LE(off + 4);
    out.push(id);
    off += 8 + size + (size % 2);
  }
  return out;
}

export function webpHasChunk(buf, id) {
  return listWebpChunks(buf).includes(id);
}

/** Raw payload of a named RIFF chunk, or null. */
export function webpXmpPayload(buf, id) {
  const b = Buffer.from(buf);
  let off = 12;
  while (off + 8 <= b.length) {
    const cid = b.subarray(off, off + 4).toString('latin1');
    const size = b.readUInt32LE(off + 4);
    if (cid === id) return b.subarray(off + 8, off + 8 + size).toString('latin1');
    off += 8 + size + (size % 2);
  }
  return null;
}

/** The EXIF chunk payload of a WebP (what the app feeds to exifr). */
export function webpExifChunkPayload(buf) {
  const b = Buffer.from(buf);
  let off = 12;
  while (off + 8 <= b.length) {
    const id = b.subarray(off, off + 4).toString('latin1');
    const size = b.readUInt32LE(off + 4);
    if (id === 'EXIF') return b.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size % 2);
  }
  return null;
}

/** Is this still a structurally sound RIFF/WEBP container? */
export function webpIsStructurallyValid(buf) {
  const b = Buffer.from(buf);
  if (b.length < 12) return false;
  if (b.subarray(0, 4).toString('latin1') !== 'RIFF') return false;
  if (b.subarray(8, 12).toString('latin1') !== 'WEBP') return false;
  if (b.readUInt32LE(4) + 8 !== b.length) return false;
  return listWebpChunks(b).some((id) => id === 'VP8 ' || id === 'VP8L');
}

/**
 * TIFF carrying real EXIF metadata tags.
 *
 * sharp's `.tiff().withExifMerge()` does NOT reach the EXIFIFD the way it does
 * for JPEG: the resulting file parses back with only structural tags
 * (ImageWidth/StripOffsets/...) and no Make/Model at all. Writing the tags into
 * IFD0 and letting libvips serialise them does not survive the TIFF writer, so
 * the EXIF IFD is injected directly into the TIFF's own tag structure instead.
 * `tiffWithExifTags` below builds a minimal single-IFD TIFF that genuinely
 * contains Make/Model/Software/Artist/ImageDescription, verified byte-wise.
 */
export async function buildMetadataTiff() {
  return tiffWithExifTags({
    0x010f: 'AUDIT-TIFF-CAM',   // Make
    0x0110: 'AUDIT-TIFF-M9',    // Model
    0x0131: 'AUDIT-TIFF-SW',    // Software
    0x013b: 'Jane Auditor',     // Artist
    0x010e: 'AUDIT-TIFF-DESC',  // ImageDescription
  }, 140, 100);
}

/**
 * Minimal uncompressed RGB TIFF with a real IFD0. Entries are sorted by tag as
 * the TIFF spec requires. Used because sharp cannot round-trip EXIF into TIFF.
 */
export function tiffWithExifTags(tags, width, height) {
  const A = (tag, str) => [tag, T.ASCII, str.length + 1, asciiVal(str)];
  const S = (tag, v) => [tag, T.SHORT, 1, shortVal(v)];
  const L = (tag, v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v, 0); return [tag, T.LONG, 1, b]; };

  const entries = [
    S(0x0100, width),            // ImageWidth
    S(0x0101, height),           // ImageLength
    ...Object.entries(tags).map(([tag, str]) => A(Number(tag), str)),
    S(0x0102, 8),                // BitsPerSample (single value; planar)
    S(0x0103, 1),                // Compression = none
    S(0x0106, 2),                // PhotometricInterpretation = RGB
    L(0x0111, 0),                // StripOffsets - patched after layout
    S(0x0115, 3),                // SamplesPerPixel
    S(0x0116, height),           // RowsPerStrip
    L(0x0117, width * height * 3), // StripByteCounts
    S(0x011c, 1),                // PlanarConfiguration = chunky
  ].sort((a, b) => a[0] - b[0]);

  const ifdSize = 2 + entries.length * 12 + 4;
  const heapStart = 8 + ifdSize;
  const built = buildIfd(entries, heapStart);

  const stripOffset = heapStart + built.heapSize;
  // Patch StripOffsets (0x0111) to point at the pixel data.
  const idx = entries.findIndex((e) => e[0] === 0x0111);
  built.body.writeUInt32LE(stripOffset, 2 + idx * 12 + 8);

  const header = Buffer.alloc(8);
  header.write('II', 0, 'latin1');
  header.writeUInt16LE(0x2a, 2);
  header.writeUInt32LE(8, 4);

  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = (i * 7) % 256;
    pixels[i + 1] = (i * 13) % 256;
    pixels[i + 2] = (i * 29) % 256;
  }

  return Buffer.concat([header, built.body, ...built.heap, pixels]);
}

export async function buildPlainTiff() {
  return sharp({
    create: { width: 140, height: 100, channels: 3, background: { r: 120, g: 60, b: 180 } },
  }).tiff().toBuffer();
}

export function isTiff(buf) {
  const b = Buffer.from(buf);
  return b.length > 4 && ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) ||
    (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a));
}

/* ------------------------------------------------------------------ *
 * Fixture self-test: prove the bytes really contain what we claim.
 * Run with:  node audit-fixtures-selftest.mjs
 * ------------------------------------------------------------------ */
export async function fixtureSelfTest() {
  const exifr = (await import('exifr')).default;
  const lines = [];
  const check = (ok, msg) => lines.push((ok ? 'PASS  ' : 'FAIL  ') + msg);

  const jpeg = await buildComprehensiveJpeg();
  const parsed = await exifr.parse(jpeg, true);

  check(hasJpegExifSegment(jpeg), 'comprehensive JPEG carries an APP1 Exif segment');
  check(hasJpegXmpSegment(jpeg), 'comprehensive JPEG carries an XMP APP1 segment');
  check(hasJpegIptcSegment(jpeg), 'comprehensive JPEG carries an APP13 IPTC segment');
  check(hasJpegComSegment(jpeg), 'comprehensive JPEG carries a COM segment');

  const expected = {
    Make: 'AUDIT-CAM', Model: 'AUDIT-M9', Software: 'AUDIT-SW 2.0',
    Artist: 'Jane Auditor', Copyright: 'AUDIT-CR', ImageDescription: 'AUDIT-DESC',
    LensModel: 'AUDIT-LENS 24-70',
    ExposureTime: 0.005, FNumber: 2.8, ISO: 400, FocalLength: 35,
  };
  for (const [k, v] of Object.entries(expected)) {
    const got = parsed[k];
    const ok = String(got) === String(v) || (typeof v === 'number' && Math.abs(Number(got) - v) < 1e-9);
    check(ok, `exifr parsed ${k} = ${JSON.stringify(got)} (expected ${JSON.stringify(v)})`);
  }

  // Dates: exifr converts EXIF "YYYY:MM:DD hh:mm:ss" into a real Date object
  // (NOT a string), so it is checked as a Date, not against a text pattern.
  const asDate = (v) => (v instanceof Date ? v : new Date(v));
  const dTo = asDate(parsed.DateTimeOriginal);
  check(!Number.isNaN(dTo.getTime()) && dTo.getUTCFullYear() === 2024
    && dTo.getUTCMonth() === 0 && dTo.getUTCDate() === 15,
  `DateTimeOriginal is a valid Date for 2024-01-15 (got ${JSON.stringify(parsed.DateTimeOriginal)})`);
  const dMod = asDate(parsed.ModifyDate);
  check(!Number.isNaN(dMod.getTime()) && dMod.getUTCFullYear() === 2024,
    `ModifyDate is a valid Date (got ${JSON.stringify(parsed.ModifyDate)})`);

  // EXIF tag 0xA431 (BodySerialNumber) is surfaced by exifr under the name
  // `SerialNumber`, NOT `BodySerialNumber`. Asserted under its real name.
  check(parsed.SerialNumber === 'AUDIT-BODY-777',
    `exifr surfaces tag 0xA431 as SerialNumber (got ${JSON.stringify(parsed.SerialNumber)})`);
  check(parsed.BodySerialNumber === undefined,
    'BodySerialNumber is not a key exifr produces (device serial uses SerialNumber)');

  // Raw numeric-tag fallback check (the 36867 scenario): with normal options
  // exifr must NOT leak the numeric tag id into the metadata object.
  check(!('36867' in parsed), 'raw numeric tag 36867 does not appear in the parsed metadata');
  check('DateTimeOriginal' in parsed, 'DateTimeOriginal is present under its named key');

  check(parsed.GPSLatitudeRef === 'N', `GPSLatitudeRef = ${JSON.stringify(parsed.GPSLatitudeRef)}`);
  check(parsed.GPSLongitudeRef === 'E', `GPSLongitudeRef = ${JSON.stringify(parsed.GPSLongitudeRef)}`);
  // Raw layer: exifr returns the DMS triple.
  check(Array.isArray(parsed.GPSLatitude) && parsed.GPSLatitude.length === 3,
    `GPSLatitude is a raw DMS triple (got ${JSON.stringify(parsed.GPSLatitude)})`);
  check(Array.isArray(parsed.GPSLongitude) && parsed.GPSLongitude.length === 3,
    `GPSLongitude is a raw DMS triple (got ${JSON.stringify(parsed.GPSLongitude)})`);
  // Normalised layer: exifr additionally derives decimal degrees.
  check(Math.abs(Number(parsed.latitude) - 48.8568) < 0.01,
    `normalised latitude ~ 48.8568 (got ${parsed.latitude})`);
  check(Math.abs(Number(parsed.longitude) - 2.3020) < 0.01,
    `normalised longitude ~ 2.3020 (got ${parsed.longitude})`);
  check(Number(parsed.GPSAltitude) === 35, `GPSAltitude = 35 (got ${parsed.GPSAltitude})`);
  check(parsed.GPSTimeStamp !== undefined, `GPSTimeStamp present (got ${JSON.stringify(parsed.GPSTimeStamp)})`);
  check(parsed.GPSAltitudeRef !== undefined, `GPSAltitudeRef present (got ${JSON.stringify(parsed.GPSAltitudeRef)})`);

  // XMP content really is parseable by exifr (exifr does have an XMP reader).
  // The app only reports the container, but the bytes must be genuine XMP.
  check(parsed.creator === 'AUDIT-XMP-CREATOR',
    `XMP dc:creator parsed from the packet (got ${JSON.stringify(parsed.creator)})`);
  check(parsed.CreatorTool === 'AUDIT-CREATOR-TOOL',
    `XMP CreatorTool parsed (got ${JSON.stringify(parsed.CreatorTool)})`);

  const png = await buildMetadataPng();
  const pngChunks = listPngChunks(png);
  check(pngChunks.includes('eXIf'), `PNG carries an eXIf chunk (chunks: ${pngChunks.join(',')})`);
  check(pngChunks.includes('tEXt'), 'PNG carries a tEXt chunk');
  check(pngChunks.includes('iTXt'), 'PNG carries an iTXt chunk');
  check(pngChunks.includes('tIME'), 'PNG carries a tIME chunk');
  check(pngIsStructurallyValid(png), 'PNG fixture is structurally valid (all CRCs ok)');

  const webp = await buildMetadataWebp();
  check(webpIsStructurallyValid(webp), 'WebP fixture is a valid RIFF/WEBP container');
  check(listWebpChunks(webp).includes('EXIF'), `WebP carries an EXIF chunk (chunks: ${listWebpChunks(webp).join(',')})`);

  // exifr CANNOT parse a whole WebP container ("Unknown file format") - which is
  // precisely why the app has its own `parseWebpMetadata()` RIFF walk that only
  // feeds the EXIF chunk payload to exifr. Validate the fixture the same way.
  const exifPayload = webpExifChunkPayload(webp);
  check(!!exifPayload, 'the WebP EXIF chunk payload can be extracted');
  if (exifPayload) {
    const skip = exifPayload.subarray(0, 6).toString('latin1') === 'Exif\0\0' ? 6 : 0;
    const webpExif = await exifr.parse(exifPayload.subarray(skip), true);
    check(webpExif && webpExif.Make === 'AUDIT-WEBP-CAM',
      `WebP EXIF Make parses from the chunk payload (got ${JSON.stringify(webpExif && webpExif.Make)})`);
  }

  const webpXmp = await buildMetadataWebpWithXmp();
  const webpXmpChunks = listWebpChunks(webpXmp);
  check(webpIsStructurallyValid(webpXmp), 'WebP+XMP fixture is a valid RIFF/WEBP container');
  check(webpXmpChunks.includes('EXIF'), `WebP+XMP keeps the EXIF chunk (chunks: ${webpXmpChunks.join(',')})`);
  check(webpXmpChunks.includes('XMP '), `WebP+XMP carries an XMP chunk (chunks: ${webpXmpChunks.join(',')})`);
  check(webpXmpChunks.some((c) => c === 'VP8 ' || c === 'VP8L'), 'WebP+XMP still carries its image payload');
  check(webpXmpChunks.includes('ALPH'), 'WebP+XMP preserves the ALPH (alpha) chunk');
  // VP8X feature-flag byte (per the WebP container spec):
  //   Rsv Rsv I L E X A R  ->  ICC=0x20, Alpha=0x10, EXIF=0x08, XMP=0x04,
  //                           Animation=0x02. (NOT 0x01/0x02 for ICC/alpha.)
  // sharp's base file sets Alpha|EXIF (0x18); the splice ORs in XMP (0x04).
  const vp8xFlags = webpXmp.readUInt8(20);
  check((vp8xFlags & 0x0c) === 0x0c,
    `WebP+XMP VP8X advertises EXIF(0x08)+XMP(0x04) (flags=0x${vp8xFlags.toString(16)})`);
  check((vp8xFlags & 0x10) === 0x10, 'WebP+XMP VP8X still advertises alpha (0x10)');
  check(webpXmpPayload(webpXmp, 'XMP ') !== null && webpXmpPayload(webpXmp, 'XMP ').includes('AUDIT-XMP-CREATOR'),
    'the WebP XMP chunk payload really contains the XMP packet');

  const tiff = await buildMetadataTiff();
  check(isTiff(tiff), 'TIFF fixture has a valid TIFF header');
  const tiffMeta = await exifr.parse(tiff, true);
  check(tiffMeta && tiffMeta.Make === 'AUDIT-TIFF-CAM', `TIFF carries EXIF Make (got ${JSON.stringify(tiffMeta && tiffMeta.Make)})`);

  const tech = await buildTechnicalOnlyJpeg();
  check(!hasJpegExifSegment(tech) && !hasJpegXmpSegment(tech) && !hasJpegIptcSegment(tech) && !hasJpegComSegment(tech),
    'technical-only JPEG carries no privacy container');
  const techMeta = await exifr.parse(tech, true);
  check(techMeta !== undefined, 'technical-only JPEG still parses');

  return lines;
}




