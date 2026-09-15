/**
 * WebP metadata handling (RIFF container level).
 *
 * Why this module exists:
 * Every other format in this tool strips metadata structurally — JPEG by
 * removing APPn/COM segments, TIFF by rewriting its IFDs — but WebP used to
 * fall through to the generic "draw to canvas and re-encode" path. That path
 * cannot emit WebP, so a WebP upload was handed back as a JPEG: a silent format
 * change the PRD forbids. The scan path had a matching defect, which is what
 * made WebP hits invisible: a WebP EXIF chunk carries a TIFF/EXIF block that
 * most writers (sharp/libwebp, cameras, editors) introduce with the 6-byte
 * "Exif\0\0" identifier. The raw chunk bytes were passed straight to the TIFF
 * parser, which rejected them, so the UI reported "no metadata" and the file
 * was auto-stripped through the JPEG-producing canvas path.
 *
 * This module fixes both ends at the container level:
 *   - `normalizeWebpExifPayload` skips the optional "Exif\0\0" identifier so
 *     the TIFF/EXIF parser always sees a real TIFF header ("II*\0" / "MM\0*").
 *   - `stripWebpMetadata` rewrites the RIFF chunk list, dropping only the
 *     privacy-bearing metadata chunks ("EXIF", "XMP ") and clearing the
 *     matching VP8X feature flags, while copying the image payload ("VP8 ",
 *     "VP8L"), transparency ("ALPH"), colour profile ("ICCP") and animation
 *     ("ANIM"/"ANMF") chunks byte-for-byte.
 *
 * Consequences: no re-encoding happens, so the download is still a real WebP
 * with the same dimensions, alpha/transparency, ICC profile and pixels.
 */

export interface WebpStripResult {
  bytes: Uint8Array;
  removedChunks: string[];
}

const RIFF_FOURCC = 'RIFF';
const WEBP_FOURCC = 'WEBP';

/**
 * FourCCs of the RIFF chunks that only ever carry metadata the PRD removes.
 * "EXIF" holds EXIF/GPS/thumbnail data, "XMP " holds XMP. The trailing NUL
 * variant is accepted because some writers pad the FourCC differently.
 * "ICCP" is deliberately NOT listed: the colour profile is preserved.
 */
const METADATA_CHUNK_IDS: readonly string[] = ['EXIF', 'XMP ', 'XMP\u0000'];

/** FourCCs that make the file an image; at least one must survive. */
const IMAGE_CHUNK_IDS: readonly string[] = ['VP8 ', 'VP8L'];

/** VP8X feature flags (byte 0 of the VP8X payload). */
const VP8X_FLAG_EXIF = 0x08;
const VP8X_FLAG_XMP = 0x04;

interface WebpChunk {
  id: string;
  /** Offset of the 8-byte chunk header. */
  start: number;
  /** Declared payload size (excludes the header and the pad byte). */
  size: number;
  /** Offset just past the payload, padding byte included. */
  next: number;
}

function readChunkId(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
  );
}

function writeUint32LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function isWebpContainer(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  return readChunkId(bytes, 0) === RIFF_FOURCC && readChunkId(bytes, 8) === WEBP_FOURCC;
}

/**
 * Walk the RIFF chunk list. Throws when a chunk claims more bytes than the file
 * holds, so a truncated/corrupt WebP fails loudly instead of being rewritten.
 */
function readChunks(bytes: Uint8Array): WebpChunk[] {
  const chunks: WebpChunk[] = [];
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const id = readChunkId(bytes, offset);
    const size = readUint32LE(bytes, offset + 4);
    const payloadEnd = offset + 8 + size;

    if (payloadEnd > bytes.length) {
      throw new Error('WebP: chunk "' + id + '" extends past the end of the file');
    }

    const padded = payloadEnd + (size % 2); // RIFF keeps chunks 2-byte aligned
    chunks.push({ id, start: offset, size, next: Math.min(padded, bytes.length) });
    offset = padded;
  }

  return chunks;
}

/**
 * WebP EXIF chunks come in two shapes, and both must be understood:
 *   A) the payload starts with a TIFF header — "II*\0" or "MM\0*"
 *   B) the payload starts with the 6-byte "Exif\0\0" identifier, followed by
 *      the same TIFF header (this is what sharp/libwebp and most cameras write)
 *
 * The TIFF/EXIF parser must not see the identifier, so it is skipped here and
 * the remaining bytes are handed on untouched. Payloads without the identifier
 * are returned as-is, so layout A keeps working.
 */
export function normalizeWebpExifPayload(bytes: Uint8Array): Uint8Array {
  if (bytes.length <= 6) return bytes;

  const hasIdentifier =
    bytes[0] === 0x45 && // 'E'
    bytes[1] === 0x78 && // 'x'
    bytes[2] === 0x69 && // 'i'
    bytes[3] === 0x66 && // 'f'
    bytes[4] === 0x00 &&
    bytes[5] === 0x00;

  return hasIdentifier ? bytes.subarray(6) : bytes;
}

/**
 * Remove the privacy-bearing metadata chunks from a WebP and return a new,
 * structurally valid RIFF/WEBP container.
 *
 * Kept byte-for-byte: image payload, alpha, ICC profile, animation and every
 * unrecognised chunk. It is the caller's job to decide what to do with a file
 * that is not a WebP; this function only ever throws, never re-encodes.
 */
export function stripWebpMetadata(bytes: Uint8Array): WebpStripResult {
  if (!isWebpContainer(bytes)) {
    throw new Error('WebP: input is not a RIFF/WEBP container');
  }

  const chunks = readChunks(bytes);
  const removedChunks: string[] = [];
  const kept: WebpChunk[] = [];
  let keptSize = 0;
  let hasImagePayload = false;

  for (const chunk of chunks) {
    if (METADATA_CHUNK_IDS.includes(chunk.id)) {
      removedChunks.push(chunk.id);
      continue;
    }
    if (IMAGE_CHUNK_IDS.includes(chunk.id)) hasImagePayload = true;
    kept.push(chunk);
    keptSize += chunk.next - chunk.start;
  }

  // Never hand the user a download without its pixels.
  if (!hasImagePayload) {
    throw new Error('WebP: stripping would remove the image payload');
  }

  const output = new Uint8Array(12 + keptSize);
  output.set(bytes.subarray(0, 12), 0); // 'RIFF' + size (rewritten below) + 'WEBP'

  let offset = 12;
  for (const chunk of kept) {
    output.set(bytes.subarray(chunk.start, chunk.next), offset);
    // The EXIF/XMP chunks are gone, so the VP8X feature flags that advertise
    // them must go too — otherwise readers look for chunks that are not there.
    if (chunk.id === 'VP8X' && chunk.size >= 1) {
      output[offset + 8] = output[offset + 8] & ~(VP8X_FLAG_EXIF | VP8X_FLAG_XMP);
    }
    offset += chunk.next - chunk.start;
  }

  // RIFF size = everything after the first 8 bytes ('RIFF' + size field).
  writeUint32LE(output, 4, output.length - 8);

  // Verify the rewritten container before handing it to the user.
  if (output.length !== readUint32LE(output, 4) + 8) {
    throw new Error('WebP: rewritten RIFF size is inconsistent');
  }
  for (const chunk of readChunks(output)) {
    if (METADATA_CHUNK_IDS.includes(chunk.id)) {
      throw new Error('WebP: metadata chunk "' + chunk.id + '" survived stripping');
    }
    if (
      chunk.id === 'VP8X' &&
      chunk.size >= 1 &&
      (output[chunk.start + 8] & (VP8X_FLAG_EXIF | VP8X_FLAG_XMP)) !== 0
    ) {
      throw new Error('WebP: VP8X still advertises removed metadata');
    }
  }

  return { bytes: output, removedChunks };
}