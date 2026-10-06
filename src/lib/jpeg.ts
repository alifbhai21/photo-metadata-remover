/**
 * JPEG metadata detection (segment level).
 *
 * Why this module exists:
 * The scan side runs on `exifr`, which only reports the TIFF/EXIF block. It has
 * no XMP or IPTC parser (its `xmp`/`iptc` segments are disabled by default and
 * absent from the default build), and it never reports the COM comment segment.
 * The removal side already deletes all three — `stripJpegPrivacySegments()` in
 * ToolUpload drops every APP1/APP13/COM, and `findOutputPrivacyFindings()` in
 * verify.ts scans the generated output for exactly these payload signatures.
 *
 * So a JPEG carrying ONLY an XMP packet, an IPTC/Photoshop block or a COM
 * comment was reported as "No privacy metadata found" while the removal path
 * quietly deleted those very bytes. The user was told the file was clean when
 * it was not. This module closes that gap on the scan side, and only on the
 * scan side: it reports the presence of each privacy-bearing container. It does
 * not parse XMP/IPTC content, because the existing parser cannot.
 *
 * This is the JPEG twin of `readPngMetadataChunks()` in png.ts and follows the
 * same conventions: chunk-scoped vocabulary ("JPEG XMP"), repeated entries are
 * numbered, nothing throws, and the returned `text` is a plain string. No
 * subarray views escape this module, so nothing keeps the input buffer alive.
 */

export interface JpegPrivacySegment {
  /**
   * 'exif' | 'xmp' | 'iptc' | 'comment' — the privacy-bearing container family
   * this segment belongs to. Deliberately closed: every member corresponds to a
   * segment `stripJpegPrivacySegments()` actually deletes.
   */
  kind: 'exif' | 'xmp' | 'iptc' | 'comment';
  /** Short human-readable summary shown in the metadata viewer. */
  summary: string;
}

const JPEG_SOI = 0xd8;
const JPEG_SOS = 0xda;
const JPEG_EOI = 0xd9;

/**
 * APP1 / APP13 payload identifiers.
 *
 * `EXIF_ID` and `PHOTOSHOP_ID` match the stripper byte for byte. For XMP the
 * stripper (`isJpegApp1Privacy`) accepts any payload starting with the seven
 * bytes "http://", so detection uses the same rule: it catches the standard
 * `xap/1.0/` packet, the extended-XMP packet and any future namespace, instead
 * of silently ignoring an XMP block the removal path would still delete.
 */
const EXIF_ID = ascii('Exif\u0000\u0000');
const XMP_HTTP_PREFIX = ascii('http://');
const PHOTOSHOP_ID = ascii('Photoshop 3.0\u0000');

/** Longest payload preview rendered in the viewer. */
const TEXT_PREVIEW_LIMIT = 100;

function ascii(text: string): number[] {
  return Array.from(text, (char) => char.charCodeAt(0) & 0xff);
}

function startsWith(bytes: Uint8Array, offset: number, signature: readonly number[]): boolean {
  if (offset + signature.length > bytes.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}
/**
 * Decode a payload as text when it is short and printable, otherwise return
 * undefined. Used only for previews — never for classification.
 */
function previewText(bytes: Uint8Array): string | undefined {
  if (bytes.length === 0 || bytes.length > TEXT_PREVIEW_LIMIT * 2) return undefined;
  let text = '';
  for (let i = 0; i < bytes.length; i++) {
    const code = bytes[i];
    // Anything outside printable ASCII (or a line break) means binary payload.
    if (code !== 0x09 && code !== 0x0a && code !== 0x0d && (code < 0x20 || code > 0x7e)) return undefined;
    text += String.fromCharCode(code);
  }
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

interface JpegMarker {
  /** The marker byte, e.g. 0xE1 for APP1. */
  marker: number;
  /** Offset just past the marker's 2-byte length field. */
  payloadStart: number;
  /** Declared payload size (excludes the 2-byte length field). */
  size: number;
}

/**
 * Walk the JPEG marker chain, yielding every APPn / COM segment before the first
 * scan. Standalone markers (RSTn, TEM) carry no length field and are skipped.
 * Stops at SOS: everything after it is entropy-coded image data and can never
 * contain a metadata segment.
 */
function walkSegments(bytes: Uint8Array): JpegMarker[] {
  const segments: JpegMarker[] = [];
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== JPEG_SOI) return segments;

  let offset = 2;
  while (offset + 1 < bytes.length) {
    // Segments are byte-aligned with 0xFF padding between them.
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];
    // Padding fill byte, or a standalone marker with no payload.
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === JPEG_SOS || marker === JPEG_EOI) break;
    // Every remaining marker carries a 2-byte big-endian length.
    if (offset + 4 > bytes.length) break;
    const size = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (size < 2 || offset + 2 + size > bytes.length) break;
    segments.push({ marker, payloadStart: offset + 4, size: size - 2 });
    offset += 2 + size;
  }
  return segments;
}
/**
 * Report every privacy-bearing metadata container present in a JPEG.
 *
 * The set reported here is exactly the set `stripJpegPrivacySegments()` deletes:
 * APP1 carrying an "Exif\0\0" identifier, APP1 carrying an "http://" (XMP)
 * payload, APP13 carrying a "Photoshop 3.0" (IPTC) block, and COM. Every other
 * segment — APP0/JFIF, APP2/ICC, APP14/Adobe, any unrecognised APPn — is
 * deliberately NOT reported: removal copies those bytes through, so calling them
 * privacy metadata would claim a removal that does not happen.
 *
 * Mirrors `readPngMetadataChunks()`: never throws, allocates no copies, and
 * returns only what the raw segment chain proves is present. A structurally
 * broken container simply yields fewer findings — the removal path is where a
 * broken file is rejected loudly, not here.
 */
export function readJpegPrivacySegments(bytes: Uint8Array): JpegPrivacySegment[] {
  const found: JpegPrivacySegment[] = [];

  for (const segment of walkSegments(bytes)) {
    const payload = bytes.subarray(segment.payloadStart, segment.payloadStart + segment.size);

    if (segment.marker === 0xfe) {
      // COM — a free-text comment segment.
      const text = previewText(payload);
      found.push({
        kind: 'comment',
        summary: text ? `JPEG comment: ${text}` : `JPEG comment (${payload.length} bytes)`,
      });
      continue;
    }

    if (segment.marker === 0xe1) {
      if (startsWith(payload, 0, EXIF_ID)) {
        found.push({ kind: 'exif', summary: 'EXIF/GPS block' });
        continue;
      }
      if (startsWith(payload, 0, XMP_HTTP_PREFIX)) {
        found.push({ kind: 'xmp', summary: `XMP packet (${payload.length} bytes)` });
        continue;
      }
    }

    if (segment.marker === 0xed && startsWith(payload, 0, PHOTOSHOP_ID)) {
      found.push({ kind: 'iptc', summary: `IPTC/Photoshop block (${payload.length} bytes)` });
    }
  }

  // Number repeated families so none is silently collapsed.
  const seen: Record<string, number> = {};
  return found.map((segment) => {
    const count = (seen[segment.kind] || 0) + 1;
    seen[segment.kind] = count;
    return count === 1 ? segment : { ...segment, summary: `${segment.summary} (${count})` };
  });
}