/**
 * TIFF test fixture builder (shared by the Node verification harness and the
 * Playwright UI spec).
 *
 * Builds a real, structurally valid classic TIFF whose IFD0 carries the
 * privacy metadata the tool must remove (EXIF camera/author/date fields, an
 * ExifIFD with lens/serial/comment, a GPS IFD with coordinates, XMP, IPTC,
 * XP* strings, GeoTIFF keys, an unknown private tag) plus a reduced-resolution
 * thumbnail IFD. Every privacy value contains the "PRIVACY-" marker so a
 * byte-level scan can prove the payload bytes are gone and not merely
 * unreferenced.
 *
 * sharp/libvips cannot write EXIF into a TIFF output, so the fixture is
 * written by hand here.
 */

export const PRIVACY_MARKER = 'PRIVACY-';

export const PRIVACY_VALUES = [
  'PRIVACY-DESCRIPTION',
  'PRIVACY-TEST-CAMERA',
  'PMR-TIFF-MODEL-9000',
  'PRIVACY-SOFTWARE',
  '2026:09:15 10:11:12',
  'PRIVACY-AUTHOR-NAME',
  'PRIVACY-HOST-COMPUTER',
  'PRIVACY-COPYRIGHT-OWNER',
  'PRIVACY-XMP-AUTHOR',
  'PRIVACY-IPTC-CAPTION',
  'PRIVACY-USER-COMMENT',
  'PRIVACY-LENS-24-70',
  'PRIVACY-SERIAL-123456',
  'PRIVACY-XP-TITLE',
  'PRIVACY-PRIVATE-TAG',
  'PRIVACY-GEOTIFF-KEYS',
  'PRIVACY-THUMBNAIL-DESC',
];

// ICC: callers pass real profile bytes via the `icc` option (libvips rejects fakes).

/** Deterministic RGB gradient so pixel comparison is meaningful. */
export function rgbPixels(width, height) {
  const out = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      out[i] = (x * 7 + y * 3) & 0xff;
      out[i + 1] = (y * 5 + 40) & 0xff;
      out[i + 2] = ((x + y) * 2) & 0xff;
    }
  }
  return out;
}

function asciiBytes(text) {
  const out = new Uint8Array(text.length + 1);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

function utf16leBytes(text) {
  const out = new Uint8Array((text.length + 1) * 2);
  for (let i = 0; i < text.length; i++) {
    out[i * 2] = text.charCodeAt(i) & 0xff;
    out[i * 2 + 1] = (text.charCodeAt(i) >> 8) & 0xff;
  }
  return out;
}

function numericBytes(type, values, little) {
  const size = type === 3 ? 2 : 4;
  const data = new Uint8Array(values.length * size);
  const view = new DataView(data.buffer);
  values.forEach((value, index) => {
    if (size === 2) view.setUint16(index * 2, value, little);
    else view.setUint32(index * 4, value, little);
  });
  return data;
}

function rationalBytes(pairs, little) {
  const data = new Uint8Array(pairs.length * 8);
  const view = new DataView(data.buffer);
  pairs.forEach((pair, index) => {
    view.setUint32(index * 8, pair[0], little);
    view.setUint32(index * 8 + 4, pair[1], little);
  });
  return data;
}

const entry = (tag, type, count, data) => ({ tag, type, count, data });
const longEntry = (tag, values, little) => entry(tag, 4, values.length, numericBytes(4, values, little));
const shortEntry = (tag, values, little) => entry(tag, 3, values.length, numericBytes(3, values, little));
const asciiEntry = (tag, text) => {
  const data = asciiBytes(text);
  return entry(tag, 2, data.length, data);
};
const undefinedEntry = (tag, data) => entry(tag, 7, data.length, data);
const xpEntry = (tag, text) => {
  const data = utf16leBytes(text);
  return entry(tag, 1, data.length, data);
};
function ifdSize(entries) {
  let size = 2 + entries.length * 12 + 4;
  for (const e of entries) {
    if (e.data.length > 4) size += e.data.length + (e.data.length % 2);
  }
  return size;
}

function writeIfd(bytes, view, offset, entries, next, little) {
  view.setUint16(offset, entries.length, little);
  let external = offset + 2 + entries.length * 12 + 4;
  entries.forEach((e, index) => {
    const p = offset + 2 + index * 12;
    view.setUint16(p, e.tag, little);
    view.setUint16(p + 2, e.type, little);
    view.setUint32(p + 4, e.count, little);
    if (e.data.length <= 4) {
      bytes.set(e.data, p + 8);
    } else {
      view.setUint32(p + 8, external, little);
      bytes.set(e.data, external);
      external += e.data.length + (e.data.length % 2);
    }
  });
  view.setUint32(offset + 2 + entries.length * 12, next, little);
}

export function buildMetadataRichTiff(options = {}) {
  const {
    width = 96,
    height = 64,
    rowsPerStrip = 32,
    little = true,
    withThumbnail = true,
    omitStripByteCounts = false,
    icc = null,
    trailingJunk = null,
  } = options;

  const pixels = rgbPixels(width, height);
  const stripCount = Math.ceil(height / rowsPerStrip);
  const strips = [];
  for (let s = 0; s < stripCount; s++) {
    const firstRow = s * rowsPerStrip;
    const rows = Math.min(rowsPerStrip, height - firstRow);
    strips.push(pixels.subarray(firstRow * width * 3, (firstRow + rows) * width * 3));
  }

  const thumbWidth = 16;
  const thumbHeight = 16;
  const thumbPixels = rgbPixels(thumbWidth, thumbHeight);

  const makeEntries = (values) => {
    const ifd0 = [
      longEntry(254, [0], little),
      longEntry(256, [width], little),
      longEntry(257, [height], little),
      shortEntry(258, [8, 8, 8], little),
      shortEntry(259, [1], little),
      shortEntry(262, [2], little),
      asciiEntry(270, 'PRIVACY-DESCRIPTION'),
      asciiEntry(271, 'PRIVACY-TEST-CAMERA'),
      asciiEntry(272, 'PMR-TIFF-MODEL-9000'),
      longEntry(273, values.stripOffsets, little),
      shortEntry(274, [1], little),
      shortEntry(277, [3], little),
      longEntry(278, [rowsPerStrip], little),
      entry(282, 5, 1, rationalBytes([[72, 1]], little)),
      entry(283, 5, 1, rationalBytes([[72, 1]], little)),
      shortEntry(284, [1], little),
      shortEntry(296, [2], little),
      asciiEntry(305, 'PRIVACY-SOFTWARE'),
      asciiEntry(306, '2026:09:15 10:11:12'),
      asciiEntry(315, 'PRIVACY-AUTHOR-NAME'),
      asciiEntry(316, 'PRIVACY-HOST-COMPUTER'),
      shortEntry(339, [1, 1, 1], little),
      undefinedEntry(700, asciiBytes('<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta>PRIVACY-XMP-AUTHOR</x:xmpmeta>')),
      undefinedEntry(33723, asciiBytes('PRIVACY-IPTC-CAPTION')),
      asciiEntry(33432, 'PRIVACY-COPYRIGHT-OWNER'),
      longEntry(34665, [values.exifOffset], little),
      shortEntry(34735, [1, 1, 0, 1], little),
      asciiEntry(34737, 'PRIVACY-GEOTIFF-KEYS'),
      longEntry(34853, [values.gpsOffset], little),
      xpEntry(40091, 'PRIVACY-XP-TITLE'),
      undefinedEntry(65000, asciiBytes('PRIVACY-PRIVATE-TAG')),
    ];

    if (icc) ifd0.push(undefinedEntry(34675, new Uint8Array(icc)));
    if (!omitStripByteCounts) ifd0.push(longEntry(279, strips.map((strip) => strip.length), little));
    ifd0.sort((a, b) => a.tag - b.tag);

    const exif = [
      shortEntry(34850, [2], little),
      shortEntry(34855, [400], little),
      asciiEntry(36867, '2026:09:15 10:11:12'),
      undefinedEntry(37510, asciiBytes('PRIVACY-USER-COMMENT')),
      asciiEntry(42033, 'PRIVACY-SERIAL-123456'),
      asciiEntry(42036, 'PRIVACY-LENS-24-70'),
    ].sort((a, b) => a.tag - b.tag);

    const gps = [
      entry(1, 2, 2, asciiBytes('N')),
      entry(2, 5, 3, rationalBytes([[52, 1], [31, 1], [0, 1]], little)),
      entry(3, 2, 2, asciiBytes('E')),
      entry(4, 5, 3, rationalBytes([[13, 1], [24, 1], [0, 1]], little)),
      entry(5, 1, 1, new Uint8Array([0])),
      entry(6, 5, 1, rationalBytes([[34, 1]], little)),
      entry(7, 5, 3, rationalBytes([[10, 1], [11, 1], [12, 1]], little)),
      entry(29, 2, 11, asciiBytes('2026:09:15')),
    ].sort((a, b) => a.tag - b.tag);

    const ifd1 = withThumbnail
      ? [
          longEntry(254, [1], little),
          longEntry(256, [thumbWidth], little),
          longEntry(257, [thumbHeight], little),
          shortEntry(258, [8, 8, 8], little),
          shortEntry(259, [1], little),
          shortEntry(262, [2], little),
          asciiEntry(270, 'PRIVACY-THUMBNAIL-DESC'),
          longEntry(273, [values.thumbStripOffset], little),
          shortEntry(277, [3], little),
          longEntry(278, [thumbHeight], little),
          longEntry(279, [thumbPixels.length], little),
          shortEntry(284, [1], little),
        ].sort((a, b) => a.tag - b.tag)
      : null;

    return { ifd0, exif, gps, ifd1 };
  };
const measured = makeEntries({
    stripOffsets: strips.map(() => 0),
    exifOffset: 0,
    gpsOffset: 0,
    thumbStripOffset: 0,
  });

  let cursor = 8;
  const ifd0Offset = cursor;
  cursor += ifdSize(measured.ifd0);
  const exifOffset = cursor;
  cursor += ifdSize(measured.exif);
  const gpsOffset = cursor;
  cursor += ifdSize(measured.gps);
  const ifd1Offset = withThumbnail ? cursor : 0;
  if (withThumbnail) cursor += ifdSize(measured.ifd1);
  if (cursor % 2 === 1) cursor += 1;

  const stripOffsets = [];
  strips.forEach((strip) => {
    stripOffsets.push(cursor);
    cursor += strip.length;
    if (cursor % 2 === 1) cursor += 1;
  });
  const thumbStripOffset = cursor;
  cursor += thumbPixels.length;
  if (cursor % 2 === 1) cursor += 1;

  const junk = trailingJunk ? asciiBytes(trailingJunk) : null;
  const total = cursor + (junk ? junk.length : 0);

  const entries = makeEntries({ stripOffsets, exifOffset, gpsOffset, thumbStripOffset });
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);

  bytes[0] = little ? 0x49 : 0x4d;
  bytes[1] = little ? 0x49 : 0x4d;
  view.setUint16(2, 42, little);
  view.setUint32(4, ifd0Offset, little);

  writeIfd(bytes, view, ifd0Offset, entries.ifd0, withThumbnail ? ifd1Offset : 0, little);
  writeIfd(bytes, view, exifOffset, entries.exif, 0, little);
  writeIfd(bytes, view, gpsOffset, entries.gps, 0, little);
  if (entries.ifd1) writeIfd(bytes, view, ifd1Offset, entries.ifd1, 0, little);

  strips.forEach((strip, index) => bytes.set(strip, stripOffsets[index]));
  bytes.set(thumbPixels, thumbStripOffset);
  if (junk) bytes.set(junk, cursor);

  return bytes;
}