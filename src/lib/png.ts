/**
 * PNG metadata handling (chunk level).
 *
 * Why this module exists:
 * Every other format in this tool strips metadata structurally — JPEG by
 * removing APPn/COM segments, WebP by rewriting the RIFF chunk list, TIFF by
 * rewriting its IFDs — but PNG used to fall through to the generic
 * "draw to canvas and re-encode" path. That path is lossy in exactly the ways
 * a privacy tool must not be: the ICC profile (iCCP) is dropped, the physical
 * pixel size (pHYs), gamma (gAMA), chromaticities (cHRM), sRGB intent, sBIT
 * and background (bKGD) are dropped, palette/transparency chunks (PLTE/tRNS)
 * may be re-derived, RGB values under fully transparent pixels are rewritten
 * by the canvas compositing model, and the decoder/encoder pair is free to
 * change the bit depth or colour type. Nothing about the output is guaranteed
 * to be the same image.
 *
 * This module strips a PNG structurally instead: the chunk list is parsed,
 * the privacy-bearing chunks (eXIf, tEXt, zTXt, iTXt, tIME) are dropped and
 * every other chunk — IHDR, PLTE, IDAT, tRNS, iCCP, pHYs, gAMA, cHRM, sRGB,
 * sBIT, bKGD, APNG chunks and any unknown chunk — is copied byte-for-byte,
 * CRC included. No decoding, no canvas, no re-encoding: the pixels are the
 * exact IDAT bytes of the input.
 */

export interface PngStripResult {
  bytes: Uint8Array;
  removedChunks: string[];
}

const PNG_SIGNATURE: readonly number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

interface PngChunk {
  type: string;
  /** Offset of the 8-byte chunk header (length + type). */
  start: number;
  /** Declared payload size (excludes header and CRC). */
  size: number;
  /** Offset just past the CRC. */
  end: number;
}

function readChunkType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] * 0x1000000 + ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])) >>> 0
  );
}

function isPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

/** Table-driven CRC-32 (IEEE 802.3, reflected) as used by PNG. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 of type+data, exactly what a PNG chunk CRC field must contain. */
function pngChunkCrc(bytes: Uint8Array, typeOffset: number, dataLength: number): number {
  let crc = 0xffffffff;
  const end = typeOffset + 4 + dataLength;
  for (let i = typeOffset; i < end; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Chunk types that only ever carry the privacy metadata this tool removes:
 *   eXIf — EXIF/GPS block
 *   tEXt / zTXt / iTXt — textual metadata (author, software, comments, XMP
 *                        payloads stored as text, ...)
 *   tIME — last-modification timestamp
 * iCCP is deliberately NOT listed: the colour profile is preserved.
 */
const METADATA_CHUNK_TYPES: readonly string[] = ['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME'];


/**
 * Walk the PNG chunk list. Throws on any structural defect so a malformed
 * input is rejected instead of silently producing a corrupt download.
 * `verifyCrc` additionally validates every chunk's stored CRC.
 */
function readChunks(bytes: Uint8Array, verifyCrc: boolean): PngChunk[] {
  const chunks: PngChunk[] = [];
  let offset = PNG_SIGNATURE.length;
  let sawIend = false;

  while (offset + 12 <= bytes.length) {
    const size = readUint32BE(bytes, offset);
    const type = readChunkType(bytes, offset + 4);
    const dataEnd = offset + 8 + size;
    const end = dataEnd + 4;
    if (end > bytes.length) {
      throw new Error('PNG: chunk "' + type + '" exceeds the file');
    }
    if (verifyCrc) {
      const stored = readUint32BE(bytes, dataEnd);
      if (stored !== pngChunkCrc(bytes, offset + 4, size)) {
        throw new Error('PNG: chunk "' + type + '" has an invalid CRC');
      }
    }
    chunks.push({ type, start: offset, size, end });
    if (type === 'IEND') {
      sawIend = true;
      offset = end;
      break;
    }
    offset = end;
  }

  if (!sawIend) {
    throw new Error('PNG: missing IEND chunk (truncated or malformed file)');
  }
  if (offset !== bytes.length) {
    throw new Error('PNG: unexpected trailing bytes after IEND');
  }
  return chunks;
}

/** UTF-8 decoding for the uncompressed iTXt text field. */
function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    let text = '';
    for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
    return text;
  }
}

/** Display cap: the scanner only shows a preview of a textual payload. */
const MAX_SUMMARY_TEXT = 160;

/**
 * Keyword field of tEXt/zTXt/iTXt: 1-79 bytes terminated by NUL. Returns the
 * keyword and the offset of the NUL (or -1 when the payload is malformed).
 */
function readChunkKeyword(bytes: Uint8Array, start: number, end: number): { keyword: string; separator: number } {
  let cursor = start;
  while (cursor < end && bytes[cursor] !== 0) cursor++;
  if (cursor >= end) return { keyword: '', separator: -1 };
  const length = Math.min(cursor - start, 79);
  let keyword = '';
  for (let i = start; i < start + length; i++) keyword += String.fromCharCode(bytes[i]);
  return { keyword, separator: cursor };
}

/** Latin-1 payload text (tEXt), capped. Never a view into the source bytes. */
function readLatin1Text(bytes: Uint8Array, start: number, end: number): string {
  const limit = Math.min(end, start + MAX_SUMMARY_TEXT);
  let text = '';
  for (let i = start; i < limit; i++) text += String.fromCharCode(bytes[i]);
  return text;
}

/**
 * Text of an UNCOMPRESSED iTXt chunk: language tag, translated keyword and the
 * UTF-8 text, each bounded by the payload end. '' when the payload is unusable.
 */
function readItxtText(bytes: Uint8Array, start: number, end: number): string {
  let cursor = start;
  for (let field = 0; field < 2; field++) {
    const fieldStart = cursor;
    while (cursor < end && bytes[cursor] !== 0) cursor++;
    if (cursor >= end) {
      // No separator for this field. Writers that omit the translated-keyword
      // terminator put the text straight after the language tag, so show the
      // remaining bytes rather than dropping the payload entirely.
      if (field === 1 && cursor > fieldStart) {
        return decodeUtf8(bytes.subarray(fieldStart, Math.min(end, fieldStart + MAX_SUMMARY_TEXT)));
      }
      return '';
    }
    cursor++;
  }
  if (cursor >= end) return '';
  return decodeUtf8(bytes.subarray(cursor, Math.min(end, cursor + MAX_SUMMARY_TEXT)));
}

/** tIME payload: year(2) month day hour minute second, all big-endian fields. */
function formatPngTime(bytes: Uint8Array, start: number, end: number): string {
  if (end - start < 7) return '';
  const year = (bytes[start] << 8) | bytes[start + 1];
  const month = bytes[start + 2];
  const day = bytes[start + 3];
  const hour = bytes[start + 4];
  const minute = bytes[start + 5];
  const second = bytes[start + 6];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 60) return '';
  const pad = (value: number, width = 2): string => String(value).padStart(width, '0');
  return `${pad(year, 4)}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)} UTC`;
}

/** One privacy-bearing PNG chunk as the SCAN sees it (plain data, no views). */
export interface PngMetadataChunk {
  /** Chunk type: 'eXIf', 'tEXt', 'zTXt', 'iTXt' or 'tIME'. */
  type: string;
  /** Keyword field of tEXt/zTXt/iTXt; '' when absent or malformed. */
  keyword: string;
  /** Plain readable payload text; '' when compressed or not textual. */
  text: string;
  /** Always non-empty: the line the scanner shows for this chunk. */
  summary: string;
}

function describeMetadataChunk(
  type: string,
  bytes: Uint8Array,
  start: number,
  end: number,
  size: number,
): PngMetadataChunk {
  if (type === 'eXIf') {
    return { type, keyword: '', text: '', summary: `EXIF block (${size} bytes)` };
  }
  if (type === 'tIME') {
    const time = formatPngTime(bytes, start, end);
    return { type, keyword: '', text: time, summary: time || 'modification time' };
  }

  const { keyword, separator } = readChunkKeyword(bytes, start, end);
  const named = keyword || '(no keyword)';

  if (type === 'tEXt') {
    const text = separator >= 0 ? readLatin1Text(bytes, separator + 1, end) : '';
    return { type, keyword, text, summary: text ? `${named}: ${text}` : `${named} (empty)` };
  }

  if (type === 'zTXt') {
    // Compressed text is NOT inflated: detection only needs the chunk and its
    // keyword, and inflating an untrusted payload is not worth the risk.
    return { type, keyword, text: '', summary: `${named} (compressed text)` };
  }

  // iTXt: keyword NUL, compression flag, compression method, language tag NUL,
  // translated keyword NUL, text. The flag is the byte right after the keyword,
  // the text fields start after flag + method.
  if (separator < 0) {
    // No keyword terminator: the payload cannot be located safely.
    return { type, keyword: '', text: '', summary: '(no keyword) (payload not readable)' };
  }
  const flag = separator + 1 < end ? bytes[separator + 1] : 1;
  const text = flag === 0 ? readItxtText(bytes, separator + 3, end) : '';
  const summary = text ? `${named}: ${text}` : `${named} (${flag === 0 ? 'uncompressed' : 'compressed'} text)`;
  return { type, keyword, text, summary };
}

/**
 * Privacy-bearing chunks a PNG carries, as plain data for the upload scan.
 *
 * Why this exists:
 * the scan used to rely on exifr alone, and exifr's PNG reader only surfaces
 * eXIf, IHDR and a few tEXt keywords. zTXt is never inflated, an XMP iTXt only
 * produces an internal error entry and tIME is ignored completely, so a PNG
 * whose only privacy metadata is textual looked like a metadata-free file and
 * the classifier reported "No privacy metadata found" - even though the removal
 * path (stripPngMetadata) removes exactly these chunks.
 *
 * Detection is deliberate about what it does NOT do: no decompression, no CRC
 * verification, no pixel decoding, and no returned value keeps a reference into
 * `bytes`. A structurally broken container yields [] instead of throwing, so a
 * malformed file can never break the scan.
 */
export function readPngMetadataChunks(bytes: Uint8Array): PngMetadataChunk[] {
  const found: PngMetadataChunk[] = [];
  if (!isPngSignature(bytes)) return found;

  let chunks: PngChunk[];
  try {
    // CRC verification stays off here: the scan only needs to know which
    // privacy chunks exist. Removal keeps verifying CRCs, so an untrustworthy
    // file still fails loudly there instead of being reported as clean.
    chunks = readChunks(bytes, false);
  } catch {
    return found;
  }

  for (const chunk of chunks) {
    if (!METADATA_CHUNK_TYPES.includes(chunk.type)) continue;
    const start = chunk.start + 8;
    found.push(describeMetadataChunk(chunk.type, bytes, start, start + chunk.size, chunk.size));
  }
  return found;
}

/**
 * Remove the privacy-bearing metadata chunks from a PNG and return a new,
 * structurally valid PNG.
 *
 * Kept byte-for-byte: signature, IHDR, PLTE, IDAT, tRNS, iCCP, pHYs, gAMA,
 * cHRM, sRGB, sBIT, bKGD, APNG chunks and every unrecognised chunk. It is the
 * caller's job to decide what to do with a file that is not a PNG; this
 * function only ever throws, never re-encodes.
 */
export function stripPngMetadata(bytes: Uint8Array): PngStripResult {
  if (!isPngSignature(bytes)) {
    throw new Error('PNG: input is not a PNG (missing signature)');
  }

  const chunks = readChunks(bytes, true);
  if (chunks.length === 0 || chunks[0].type !== 'IHDR' || chunks[0].size !== 13) {
    throw new Error('PNG: the first chunk is not a valid IHDR');
  }

  const removedChunks: string[] = [];
  const kept: PngChunk[] = [];
  let keptSize = PNG_SIGNATURE.length;
  let hasIdat = false;

  for (const chunk of chunks) {
    if (METADATA_CHUNK_TYPES.includes(chunk.type)) {
      removedChunks.push(chunk.type);
      continue;
    }
    if (chunk.type === 'IDAT') hasIdat = true;
    kept.push(chunk);
    keptSize += chunk.end - chunk.start;
  }

  // Never hand the user a download without its pixels.
  if (!hasIdat) {
    throw new Error('PNG: stripping would remove the image data');
  }

  const output = new Uint8Array(keptSize);
  output.set(bytes.subarray(0, PNG_SIGNATURE.length), 0);
  let offset = PNG_SIGNATURE.length;
  for (const chunk of kept) {
    output.set(bytes.subarray(chunk.start, chunk.end), offset);
    offset += chunk.end - chunk.start;
  }

  // Verify the rewritten container before handing it to the user: the output
  // must parse with valid CRCs, must keep the required structural chunks and
  // must not contain a single removed chunk.
  const rebuilt = readChunks(output, true);
  if (rebuilt[0].type !== 'IHDR' || rebuilt[0].size !== 13) {
    throw new Error('PNG: rebuilt output does not start with a valid IHDR');
  }
  if (rebuilt[rebuilt.length - 1].type !== 'IEND') {
    throw new Error('PNG: rebuilt output does not end with IEND');
  }
  for (const chunk of rebuilt) {
    if (chunk.type === 'IHDR' && chunk !== rebuilt[0]) {
      throw new Error('PNG: rebuilt output has more than one IHDR');
    }
    if (METADATA_CHUNK_TYPES.includes(chunk.type)) {
      throw new Error('PNG: metadata chunk "' + chunk.type + '" survived stripping');
    }
  }

  return { bytes: output, removedChunks };
}
