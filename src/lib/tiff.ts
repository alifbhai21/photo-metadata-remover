/**
 * TIFF metadata stripping (container-level rewrite).
 *
 * Why this module exists:
 * Chromium cannot decode TIFF through `<img>` or `createImageBitmap`, so the
 * generic "draw to canvas and re-encode" removal path can never produce an
 * output for a TIFF. Instead of decoding the pixels we rewrite the TIFF
 * container, exactly like the JPEG path removes APPn/COM segments:
 *
 *   - privacy-bearing IFD tags (EXIF, GPS, XMP, IPTC, author/creator, camera,
 *     lens, serial numbers, comments, dates, GeoTIFF/GDAL geo tags) are dropped
 *   - reduced-resolution (EXIF thumbnail) and metadata-only directories are dropped
 *   - the compressed pixel strips/tiles are copied byte-for-byte
 *   - the ICC profile (tag 34675) and every tag required for rendering are kept
 *
 * Consequences: no re-encoding happens, so dimensions, bit depth, colour
 * profile and transparency (ExtraSamples/SamplesPerPixel) are preserved
 * exactly, and the downloaded output is still a real TIFF.
 */

export interface TiffStripResult {
  bytes: Uint8Array;
  width: number;
  height: number;
  compression: number;
  removedTags: number;
}

/** Byte size of each TIFF field type. */
const TYPE_SIZES: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  6: 1, // SBYTE
  7: 1, // UNDEFINED
  8: 2, // SSHORT
  9: 4, // SLONG
  10: 8, // SRATIONAL
  11: 4, // FLOAT
  12: 8, // DOUBLE
  13: 4, // IFD
  16: 8, // LONG8
  17: 8, // SLONG8
  18: 8, // IFD8
};

const TAG_SUBFILE_TYPE = 254;
const TAG_IMAGE_WIDTH = 256;
const TAG_IMAGE_LENGTH = 257;
const TAG_BITS_PER_SAMPLE = 258;
const TAG_COMPRESSION = 259;
const TAG_STRIP_OFFSETS = 273;
const TAG_SAMPLES_PER_PIXEL = 277;
const TAG_ROWS_PER_STRIP = 278;
const TAG_STRIP_BYTE_COUNTS = 279;
const TAG_PLANAR_CONFIGURATION = 284;
const TAG_TILE_OFFSETS = 324;
const TAG_TILE_BYTE_COUNTS = 325;

/**
 * Tags kept in the output: everything needed to decode/display the image plus
 * the ICC profile. Anything not listed here is treated as removable metadata
 * (EXIF/GPS/XMP/IPTC pointers, Make/Model/Software/Artist/Copyright/DateTime,
 * ImageDescription, XP* strings, GeoTIFF/GDAL geo tags, camera maker notes,
 * unknown private tags, …).
 */
const KEPT_TAGS: ReadonlySet<number> = new Set<number>([
  254, 255, 256, 257, 258, 259, 262, 263, 264, 265, 266, 273, 274, 277, 278, 279,
  280, 281, 282, 283, 284, 286, 287, 288, 289, 290, 291, 292, 293, 296, 297, 301,
  317, 318, 319, 320, 321, 322, 323, 324, 325, 326, 327, 328, 332, 333, 334, 336,
  338, 339, 340, 341, 342, 343, 344, 345, 347, 512, 513, 514, 515, 517, 518, 519,
  520, 521, 529, 530, 531, 532, 33421, 33422, 34675,
]);

interface TiffEntry {
  tag: number;
  type: number;
  count: number;
  data: Uint8Array;
}

interface TiffIfd {
  entries: TiffEntry[];
  next: number;
}

interface PixelBlock {
  sourceOffset: number;
  byteCount: number;
  newOffset: number;
}

interface PixelPlan {
  blocks: PixelBlock[];
  offsetTag: number;
  countTag: number;
}

interface OutputEntry {
  tag: number;
  type: number;
  count: number;
  data: Uint8Array;
  blocks?: PixelBlock[];
}

interface OutputIfd {
  entries: OutputEntry[];
  blocks: PixelBlock[];
  tableOffset: number;
  tableSize: number;
  externalOffset: number;
  externalSize: number;
}
function readU16(view: DataView, offset: number, little: boolean): number {
  return view.getUint16(offset, little);
}

function readU32(view: DataView, offset: number, little: boolean): number {
  return view.getUint32(offset, little);
}

function numericValues(entry: TiffEntry | undefined, little: boolean): number[] | null {
  if (!entry) return null;
  const values: number[] = [];
  if (entry.type === 1 || entry.type === 6 || entry.type === 7) {
    for (let i = 0; i < entry.data.length; i++) values.push(entry.data[i]);
    return values;
  }
  const view = new DataView(entry.data.buffer, entry.data.byteOffset, entry.data.byteLength);
  if (entry.type === 3 || entry.type === 8) {
    if (entry.data.length < entry.count * 2) return null;
    for (let i = 0; i < entry.count; i++) values.push(readU16(view, i * 2, little));
    return values;
  }
  if (entry.type === 4 || entry.type === 9 || entry.type === 13) {
    if (entry.data.length < entry.count * 4) return null;
    for (let i = 0; i < entry.count; i++) values.push(readU32(view, i * 4, little));
    return values;
  }
  return null;
}

function findEntry(ifd: TiffIfd, tag: number): TiffEntry | undefined {
  for (const entry of ifd.entries) {
    if (entry.tag === tag) return entry;
  }
  return undefined;
}

function parseIfd(source: Uint8Array, view: DataView, offset: number, little: boolean): TiffIfd {
  if (offset + 2 > source.length) throw new Error('TIFF: image directory offset is out of bounds');
  const count = readU16(view, offset, little);
  const tableEnd = offset + 2 + count * 12;
  if (tableEnd + 4 > source.length) throw new Error('TIFF: truncated image directory');

  const entries: TiffEntry[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < count; i++) {
    const p = offset + 2 + i * 12;
    const tag = readU16(view, p, little);
    const type = readU16(view, p + 2, little);
    const valueCount = readU32(view, p + 4, little);
    const typeSize = TYPE_SIZES[type];
    // Unknown field types and duplicate tags are treated as removable.
    if (!typeSize || seen.has(tag)) continue;
    const byteLength = typeSize * valueCount;
    if (!Number.isSafeInteger(byteLength)) continue;

    let data: Uint8Array;
    if (byteLength <= 4) {
      data = source.subarray(p + 8, p + 8 + byteLength);
    } else {
      const dataOffset = readU32(view, p + 8, little);
      if (dataOffset + byteLength > source.length) continue; // unreadable payload: drop
      data = source.subarray(dataOffset, dataOffset + byteLength);
    }
    seen.add(tag);
    entries.push({ tag, type, count: valueCount, data });
  }

  const next = readU32(view, tableEnd, little);
  return { entries, next: next >= 8 && next + 2 <= source.length ? next : 0 };
}

function readIfdChain(source: Uint8Array, view: DataView, little: boolean, first: number): TiffIfd[] {
  const ifds: TiffIfd[] = [];
  const visited = new Set<number>();
  let offset = first;
  while (offset > 0 && ifds.length < 64) {
    if (visited.has(offset)) break;
    visited.add(offset);
    const ifd = parseIfd(source, view, offset, little);
    ifds.push(ifd);
    offset = ifd.next;
  }
  if (ifds.length === 0) throw new Error('TIFF: no image directory found');
  return ifds;
}
/**
 * Reconstruct byte counts for uncompressed strips when a TIFF omits
 * StripByteCounts (allowed by the spec and produced by some older writers).
 */
function computeByteCounts(
  ifd: TiffIfd,
  little: boolean,
  blockCount: number,
  fallbackWidth: number,
  fallbackHeight: number,
  usingStrips: boolean,
): number[] | null {
  if (!usingStrips) return null;
  const compression = numericValues(findEntry(ifd, TAG_COMPRESSION), little)?.[0] ?? 1;
  if (compression !== 1) return null;
  const width = numericValues(findEntry(ifd, TAG_IMAGE_WIDTH), little)?.[0] ?? fallbackWidth;
  const height = numericValues(findEntry(ifd, TAG_IMAGE_LENGTH), little)?.[0] ?? fallbackHeight;
  const samples = numericValues(findEntry(ifd, TAG_SAMPLES_PER_PIXEL), little)?.[0] ?? 1;
  const bits = numericValues(findEntry(ifd, TAG_BITS_PER_SAMPLE), little);
  const planar = numericValues(findEntry(ifd, TAG_PLANAR_CONFIGURATION), little)?.[0] ?? 1;
  const bitsTotal = bits && bits.length > 0
    ? (planar === 2 ? bits[0] : bits.reduce((a, b) => a + b, 0))
    : 8 * samples;
  if (!width || !height || !bitsTotal) return null;

  const rowsPerStrip = Math.max(
    1,
    Math.min(numericValues(findEntry(ifd, TAG_ROWS_PER_STRIP), little)?.[0] ?? height, height),
  );
  const bytesPerRow = Math.ceil((width * bitsTotal) / 8);
  const stripsPerPlane = Math.ceil(height / rowsPerStrip);
  const planes = planar === 2 ? samples : 1;

  const counts: number[] = [];
  for (let i = 0; i < blockCount; i++) {
    const planeIndex = Math.floor(i / stripsPerPlane);
    if (planeIndex >= planes) {
      counts.push(bytesPerRow);
      continue;
    }
    const firstRow = (i % stripsPerPlane) * rowsPerStrip;
    const rows = Math.max(0, Math.min(rowsPerStrip, height - firstRow));
    counts.push(bytesPerRow * rows);
  }
  return counts;
}
function collectPixelPlan(
  source: Uint8Array,
  ifd: TiffIfd,
  little: boolean,
  fallbackWidth: number,
  fallbackHeight: number,
): PixelPlan | null {
  const stripOffsets = numericValues(findEntry(ifd, TAG_STRIP_OFFSETS), little);
  const tileOffsets = numericValues(findEntry(ifd, TAG_TILE_OFFSETS), little);
  const usingStrips = Boolean(stripOffsets && stripOffsets.length > 0);
  const offsets = usingStrips ? stripOffsets : tileOffsets;
  if (!offsets || offsets.length === 0) return null;

  const offsetTag = usingStrips ? TAG_STRIP_OFFSETS : TAG_TILE_OFFSETS;
  const countTag = usingStrips ? TAG_STRIP_BYTE_COUNTS : TAG_TILE_BYTE_COUNTS;
  const storedCounts = numericValues(findEntry(ifd, countTag), little);
  const counts = storedCounts && storedCounts.length === offsets.length
    ? storedCounts
    : computeByteCounts(ifd, little, offsets.length, fallbackWidth, fallbackHeight, usingStrips);
  if (!counts || counts.length !== offsets.length) {
    throw new Error('TIFF: pixel data byte counts are missing or inconsistent');
  }

  const blocks: PixelBlock[] = [];
  for (let i = 0; i < offsets.length; i++) {
    const sourceOffset = offsets[i];
    const byteCount = counts[i];
    if (!Number.isFinite(sourceOffset) || !Number.isFinite(byteCount) || byteCount < 0) {
      throw new Error('TIFF: invalid pixel data offsets');
    }
    if (sourceOffset + byteCount > source.length) {
      throw new Error('TIFF: pixel data is out of bounds');
    }
    blocks.push({ sourceOffset, byteCount, newOffset: 0 });
  }
  return { blocks, offsetTag, countTag };
}

function buildOutputEntries(
  ifd: TiffIfd,
  plan: PixelPlan,
  little: boolean,
  onRemoved: () => void,
): OutputEntry[] {
  const entries: OutputEntry[] = [];

  for (const entry of ifd.entries) {
    if (entry.tag === plan.offsetTag) {
      // Strip/tile offsets are rewritten to point at the copied pixel data.
      entries.push({
        tag: entry.tag,
        type: 4,
        count: plan.blocks.length,
        data: new Uint8Array(plan.blocks.length * 4),
        blocks: plan.blocks,
      });
      continue;
    }
    if (entry.tag === plan.countTag && entry.count === plan.blocks.length) {
      entries.push({ tag: entry.tag, type: entry.type, count: entry.count, data: entry.data });
      continue;
    }
    if (!KEPT_TAGS.has(entry.tag)) {
      onRemoved();
      continue;
    }
    entries.push({ tag: entry.tag, type: entry.type, count: entry.count, data: entry.data });
  }

  // Byte counts were missing or inconsistent: write the resolved values.
  if (!entries.some((entry) => entry.tag === plan.countTag)) {
    const data = new Uint8Array(plan.blocks.length * 4);
    const view = new DataView(data.buffer);
    plan.blocks.forEach((block, index) => view.setUint32(index * 4, block.byteCount, little));
    entries.push({ tag: plan.countTag, type: 4, count: plan.blocks.length, data });
  }

  entries.sort((a, b) => a.tag - b.tag);
  return entries;
}
/**
 * Remove privacy metadata from a TIFF and return a rewritten, clean TIFF.
 * Throws when the input is not a classic TIFF or cannot be rewritten safely.
 */
export function stripTiffMetadata(source: Uint8Array): TiffStripResult {
  if (source.length < 8) throw new Error('TIFF: file is too small to be a TIFF');

  const orderA = source[0];
  const orderB = source[1];
  let little: boolean;
  if (orderA === 0x49 && orderB === 0x49) little = true;
  else if (orderA === 0x4d && orderB === 0x4d) little = false;
  else throw new Error('TIFF: invalid byte-order marker');

  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const version = readU16(view, 2, little);
  if (version === 43) throw new Error('TIFF: BigTIFF files are not supported');
  if (version !== 42) throw new Error('TIFF: unsupported TIFF version');

  const ifds = readIfdChain(source, view, little, readU32(view, 4, little));
  const primary = ifds[0];

  const width = numericValues(findEntry(primary, TAG_IMAGE_WIDTH), little)?.[0] ?? 0;
  const height = numericValues(findEntry(primary, TAG_IMAGE_LENGTH), little)?.[0] ?? 0;
  if (!width || !height) throw new Error('TIFF: image dimensions are missing');
  const compression = numericValues(findEntry(primary, TAG_COMPRESSION), little)?.[0] ?? 1;

  let removedTags = 0;
  const outputIfds: OutputIfd[] = [];

  ifds.forEach((ifd, index) => {
    const subfileType = numericValues(findEntry(ifd, TAG_SUBFILE_TYPE), little)?.[0] ?? 0;
    const plan = collectPixelPlan(source, ifd, little, width, height);

    if (index > 0 && (!plan || (subfileType & 1) === 1)) {
      // Embedded EXIF thumbnails and metadata-only directories are removed.
      removedTags += ifd.entries.length;
      return;
    }
    if (!plan) throw new Error('TIFF: no pixel data found in the main image directory');

    const entries = buildOutputEntries(ifd, plan, little, () => {
      removedTags++;
    });
    outputIfds.push({
      entries,
      blocks: plan.blocks,
      tableOffset: 0,
      tableSize: 0,
      externalOffset: 0,
      externalSize: 0,
    });
  });
  // Layout: header, then every kept directory (table plus its external values),
  // followed by the copied pixel data; all offsets are recomputed for this layout.
  for (const output of outputIfds) {
    output.tableSize = 2 + output.entries.length * 12 + 4;
    output.externalSize = 0;
    for (const entry of output.entries) {
      if (entry.data.length > 4) output.externalSize += entry.data.length + (entry.data.length % 2);
    }
  }

  let cursor = 8;
  for (const output of outputIfds) {
    output.tableOffset = cursor;
    cursor += output.tableSize;
    output.externalOffset = cursor;
    cursor += output.externalSize;
    if (cursor % 2 === 1) cursor += 1;
  }

  let pixelCursor = cursor % 2 === 1 ? cursor + 1 : cursor;
  for (const output of outputIfds) {
    for (const block of output.blocks) {
      block.newOffset = pixelCursor;
      pixelCursor += block.byteCount;
      if (pixelCursor % 2 === 1) pixelCursor += 1;
    }
  }

  const bytes = new Uint8Array(pixelCursor);
  bytes.set(source.subarray(0, 8), 0);
  const outView = new DataView(bytes.buffer);
  outView.setUint32(4, outputIfds[0].tableOffset, little);

  // Fill the rewritten strip/tile offset tables.
  for (const output of outputIfds) {
    for (const entry of output.entries) {
      if (!entry.blocks) continue;
      const entryView = new DataView(entry.data.buffer, entry.data.byteOffset, entry.data.byteLength);
      entry.blocks.forEach((block, index) => entryView.setUint32(index * 4, block.newOffset, little));
      entry.count = entry.blocks.length;
    }
  }

  outputIfds.forEach((output, index) => {
    outView.setUint16(output.tableOffset, output.entries.length, little);
    let external = output.externalOffset;

    output.entries.forEach((entry, entryIndex) => {
      const p = output.tableOffset + 2 + entryIndex * 12;
      outView.setUint16(p, entry.tag, little);
      outView.setUint16(p + 2, entry.type, little);
      outView.setUint32(p + 4, entry.count, little);

      if (entry.data.length <= 4) {
        bytes.set(entry.data, p + 8);
      } else {
        outView.setUint32(p + 8, external, little);
        bytes.set(entry.data, external);
        external += entry.data.length + (entry.data.length % 2);
      }
    });

    const next = index + 1 < outputIfds.length ? outputIfds[index + 1].tableOffset : 0;
    outView.setUint32(output.tableOffset + output.tableSize - 4, next, little);
  });

  // Copy the compressed pixel strips/tiles byte-for-byte (no re-encode).
  for (const output of outputIfds) {
    for (const block of output.blocks) {
      if (block.byteCount > 0) {
        bytes.set(source.subarray(block.sourceOffset, block.sourceOffset + block.byteCount), block.newOffset);
      }
    }
  }

  // ------------------------------------------------------------------
  // Verify the rewritten container before handing it to the user: it must
  // still describe the same image and must not carry a single non-structural
  // (i.e. privacy-bearing) tag.
  // ------------------------------------------------------------------
  const checkView = new DataView(bytes.buffer);
  const check = readIfdChain(bytes, checkView, little, readU32(checkView, 4, little));
  if (check.length !== outputIfds.length) {
    throw new Error('TIFF: stripped output lost image directories');
  }
  const outWidth = numericValues(findEntry(check[0], TAG_IMAGE_WIDTH), little)?.[0] ?? 0;
  const outHeight = numericValues(findEntry(check[0], TAG_IMAGE_LENGTH), little)?.[0] ?? 0;
  if (outWidth !== width || outHeight !== height) {
    throw new Error('TIFF: stripped output changed the image dimensions');
  }
  for (const ifd of check) {
    for (const entry of ifd.entries) {
      if (!KEPT_TAGS.has(entry.tag)) {
        throw new Error('TIFF: metadata tag ' + entry.tag + ' survived stripping');
      }
    }
  }

  return { bytes, width, height, compression, removedTags };
}