/**
 * Fixtures + independent byte-level checkers for the post-removal verification
 * spec (test-output-verification.spec.ts).
 *
 * Everything here is deliberately independent of the app source: the spec
 * proves the app's *displayed* verification count by re-deriving that count
 * from the actual image bytes with exifr, a mirror of the component's
 * privacy-key list and raw container parsing.
 */
import sharp from 'sharp';
import exifr from 'exifr';

/**
 * Mirror of the privacy keys in `filterMetadata()` (ToolUpload.astro). Kept in
 * sync by hand on purpose - the spec must not import app internals, because the
 * point is to independently re-derive what the UI claims.
 */
export const PRIVACY_KEYS = [
  'GPSLatitude', 'GPSLongitude', 'GPSAltitude', 'GPSDateStamp',
  'GPSTimeStamp', 'GPSLatitudeRef', 'GPSLongitudeRef', 'GPSAltitudeRef',
  'UserComment', 'ImageDescription', 'XPAuthor', 'XPTitle', 'XPComment',
  'XPKeywords', 'Artist', 'Copyright', 'Make', 'Model', 'Software',
  'DateTimeOriginal', 'DateTimeDigitized', 'DateTime',
];

/** Privacy values written into every fixture, so leaks are greppable. */
export const PRIVACY_VALUES = [
  'VERIFY-MAKE-CAMERA',
  'VERIFY-MODEL-9',
  'VERIFY-SOFTWARE 1.0',
  'Jane Photographer',
  'VERIFY-COPYRIGHT',
];

/** The EXIF block every privacy fixture is built from. */
export function privacyExif() {
  return {
    IFD0: {
      Make: PRIVACY_VALUES[0],
      Model: PRIVACY_VALUES[1],
      Software: PRIVACY_VALUES[2],
      Artist: PRIVACY_VALUES[3],
      Copyright: PRIVACY_VALUES[4],
      ImageDescription: 'VERIFY-DESCRIPTION',
    },
  };
}

const BASE_SIZE = { width: 96, height: 64, channels: 3, background: { r: 40, g: 120, b: 200 } };

/** A normal, recognisable camera JPEG: the scan detects it and removal strips it. */
export async function buildVerifiedCleanJpeg() {
  return sharp({ create: BASE_SIZE }).jpeg({ quality: 88 }).withExifMerge(privacyExif()).toBuffer();
}

/** The same image without metadata (baseline for "genuinely clean"). */
export async function buildPlainJpeg() {
  return sharp({ create: BASE_SIZE }).jpeg({ quality: 88 }).toBuffer();
}

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

/** Extract the first APP1 segment (marker + length + payload) of a JPEG. */
export function firstApp1Segment(buf) {
  const bytes = toBytes(buf);
  let pos = 2;
  while (pos + 1 < bytes.length) {
    if (bytes[pos] !== 0xff) break;
    const marker = bytes[pos + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = (bytes[pos + 2] << 8) | bytes[pos + 3];
    if (marker === 0xe1) return bytes.subarray(pos, pos + 2 + length);
    pos += 2 + length;
  }
  throw new Error('fixture: no APP1 segment found');
}

/**
 * The audit's shape: the file's own APP1 EXIF segment is appended AFTER the EOI
 * marker. The removal step copies everything from EOI onwards verbatim, so the
 * generated "clean" output is byte-identical to the source while still carrying
 * the EXIF block - and no client-side metadata parser reads past the scan data.
 */
export async function buildTrailerExifJpeg() {
  const base = await buildPlainJpeg();
  const exifJpeg = await buildVerifiedCleanJpeg();
  const app1 = firstApp1Segment(exifJpeg);
  const bytes = Buffer.concat([Buffer.from(base), Buffer.from(app1)]);
  return { bytes, app1, base };
}

/** A privacy payload the removal step does not recognise (non-standard prefix). */
export function app1WithUnrecognisedXmpPrefix() {
  const xml =
    '<?xpacket begin="\ufeff"?><x:xmpmeta xmlns:x="adobe:ns:meta/">' +
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    `<rdf:Description Author="${PRIVACY_VALUES[3]}" creator="${PRIVACY_VALUES[3]}"/>` +
    '</rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
  // Standard XMP writes http://ns.adobe.com/xap/1.0/; this writer does not, so
  // the removal step's APP1 detection never matches it.
  const payload = Buffer.concat([
    Buffer.from('http://example.com/xap/1.0/\u0000', 'latin1'),
    Buffer.from(xml, 'utf8'),
  ]);
  const length = payload.length + 2;
  return Buffer.concat([Buffer.from([0xff, 0xe1, length >> 8, length & 0xff]), payload]);
}

/** Plain image + an unrecognised APP1 payload (kept verbatim by the removal). */
export async function buildUnrecognisedApp1Jpeg() {
  const base = await buildPlainJpeg();
  const app1 = app1WithUnrecognisedXmpPrefix();
  return Buffer.concat([Buffer.from(base.subarray(0, 2)), Buffer.from(app1), Buffer.from(base.subarray(2))]);
}

/** Marker bytes of a JPEG's own segment chain (SOI -> SOS/EOI). */
export function jpegChainMarkers(input) {
  const bytes = toBytes(input);
  const markers = [];
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return markers;
  let pos = 2;
  while (pos + 1 < bytes.length) {
    if (bytes[pos] !== 0xff) break;
    const marker = bytes[pos + 1];
    if (marker === 0xda || marker === 0xd9) {
      markers.push(marker);
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { pos += 2; continue; }
    if (pos + 3 >= bytes.length) break;
    const length = (bytes[pos + 2] << 8) | bytes[pos + 3];
    if (length < 2) break;
    markers.push(marker);
    pos += 2 + length;
  }
  return markers;
}

/** True when the raw bytes still contain `needle` (latin1, 1:1 byte mapping). */
export function containsLatin1(input, needle) {
  return Buffer.from(toBytes(input)).toString('latin1').includes(needle);
}

/**
 * Independently re-derive the privacy-field count from raw image bytes, the way
 * the app's classifier would (exifr parse -> privacy key filter). Returns the
 * list of privacy keys found, so a leak is visible in the failure message.
 */
export async function privacyKeysInBytes(input, mimeType = 'image/jpeg') {
  const bytes = toBytes(input);
  let metadata = {};
  if (mimeType === 'image/webp') {
    metadata = await parseWebpBytes(bytes);
  } else {
    try {
      metadata = (await exifr.parse(Buffer.from(bytes), true)) || {};
    } catch (_err) {
      metadata = {};
    }
  }
  return Object.keys(metadata).filter((key) => PRIVACY_KEYS.includes(key));
}

/** Minimal, dependency-free WebP EXIF reader (independent of src/lib/webp.ts). */
export async function parseWebpBytes(bytes) {
  if (bytes.length < 12) return {};
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0) !== 0x52494646 || view.getUint32(8) !== 0x57454250) return {};
  const end = Math.min(view.getUint32(4, true) + 8, bytes.length);
  let offset = 12;
  while (offset + 8 <= end) {
    const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const size = view.getUint32(offset + 4, true);
    if (offset + 8 + size > bytes.length) break;
    if (id === 'EXIF') {
      let payload = bytes.subarray(offset + 8, offset + 8 + size);
      if (payload.length > 6 && payload.subarray(0, 6).toString('latin1') === 'Exif\u0000\u0000') {
        payload = payload.subarray(6);
      }
      try {
        return (await exifr.parse(Buffer.from(payload), true)) || {};
      } catch (_err) {
        return {};
      }
    }
    offset += 8 + size + (size % 2);
  }
  return {};
}