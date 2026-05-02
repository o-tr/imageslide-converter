# EIA (Efficient Image Archive) Version 1 Specification

## Abstract

This document defines the EIA (Efficient Image Archive) Version 1 format, a binary container format designed for efficient storage and transmission of image sequences with cropping optimization. EIA v1 provides significant compression advantages for image sequences with minimal differences between frames through differential encoding and LZ4 compression.

## 1. Introduction

### 1.1 Purpose

The EIA v1 format is designed to efficiently store sequences of images, particularly those with minimal frame-to-frame differences such as slide presentations or UI screenshots. The format achieves compression through:

- Differential encoding of cropped regions
- LZ4 compression of image data
- Optimized binary structure for fast access

### 1.2 Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

### 1.3 Format Identifier

EIA v1 files are identified by:
- Type identifier: `"eia"`
- Version number: `1`
- Compression method: `"lz4"`

## 2. File Structure

### 2.1 Overall Structure

An EIA v1 file consists of:

```
[Header][Manifest][Data Section]
```

Concretely:

```
EIA^{manifest_json}${compressed_block_0}{compressed_block_1}...
```

The header and manifest are UTF-8 text. The compressed data immediately follows the `$` terminator.

### 2.2 Header Format

The file header MUST begin with the literal string `"EIA^"` followed by the JSON-encoded manifest and terminated with `"$"`:

```
EIA^{manifest_json}$
```

Where `{manifest_json}` is a JSON-encoded EIAManifestV1 object.

The magic byte sequence `45 49 41 5E` (`EIA^`) can be checked to identify an EIA file.

### 2.3 Data Section

The data section begins immediately after the `$` terminator. All `s` (start offset) fields are **byte offsets measured from the first byte immediately after `$`, in units of compressed bytes**:

```
...{manifest}$[byte 0][byte 1][byte 2]...
               ↑ this is s=0
```

### 2.4 Manifest Structure

The manifest is a JSON object with the following required fields:

```typescript
type EIAManifestV1 = {
  t: "eia";           // Type identifier (MUST be "eia")
  c: "lz4";           // Compression method (MUST be "lz4")
  v: 1;               // Version number (always 1)
  f: string[];        // Features array
  e: EIAExtension[];  // Extensions array
  i: EIAFileV1[];     // Items array
  m?: EIASignageManifest; // Optional signage manifest
  ac?: EIAAnimationContainer; // Optional animation container
}
```

**Version number:**
- `1`: EIA v1 (the only valid value)

Manifests that include the `ac` field are treated as a v1-compatible extension and do not require bumping `v`.

#### 2.4.1 Features Array

The features array (`f`) MUST contain a `"Format:{format_name}"` string for each texture format used in the archive. When animation features are used, additional identifiers are included:

- `"Format:RGB24"` etc.: Texture formats in use
- `"Feature:animation"`: Archive contains an `ac` field

#### 2.4.2 Extensions Array

The extensions array (`e`) MUST contain all extension keys used in item extension objects. Currently supported extensions:
- `"note"`: Text annotations for individual items
- `"a"`: Animation reference arrays

#### 2.4.3 Items Array

The items array (`i`) MUST contain EIAFileV1 objects describing each image in the archive. All items in `i` MUST have a unique `n` (name/identifier).

## 3. File Types

### 3.1 Master Files

Master files contain complete image data without dependencies:

```typescript
type EIAFileV1Master = {
  t: "m";             // Type (MUST be "m")
  n: string;          // Name/identifier
  f: TTextureFormat;  // Format identifier
  w: number;          // Width in pixels
  h: number;          // Height in pixels
  s: number;          // Start offset of the compressed block in the data section (see §2.3)
  l: number;          // Byte length after LZ4 compression
  u: number;          // Byte length after LZ4 decompression (= w × h × bytes_per_pixel)
  e?: EIAExtensionObject; // Optional extensions
}
```

`s` is a **compressed-byte** offset from the start of the data section. Reading `l` bytes at offset `s` and LZ4-decompressing yields `u` bytes of image data.

### 3.2 Cropped Files

Cropped files contain differential data referencing a base image:

```typescript
type EIAFileV1Cropped = {
  t: "c";             // Type (MUST be "c")
  b: string;          // Base file name (the `n` value of an item in the same archive)
  n: string;          // Name/identifier
  f: TTextureFormat;  // Format identifier
  w: number;          // Original width in pixels
  h: number;          // Original height in pixels
  s: number;          // Start offset of the compressed block in the data section (see §2.3)
  l: number;          // Byte length after LZ4 compression
  u: number;          // Byte length after LZ4 decompression (= sum of all parts' l values)
  e?: EIAExtensionObject; // Optional extensions
  r: EIAFileV1CroppedPart[]; // Rectangle parts array
}
```

`s`, `l`, and `u` have the same meaning as for master files. `u` equals the total byte length of all parts' uncompressed pixel data concatenated. Reference chains via `EIAFileV1Cropped.b` MUST NOT form cycles. Decoders MUST enforce a depth limit when resolving references.

#### 3.2.1 Cropped Parts

Each cropped part describes a rectangular region that differs from the base image:

```typescript
type EIAFileV1CroppedPart = {
  x: number;  // X coordinate in base image (pixels, top-left origin)
  y: number;  // Y coordinate in base image (pixels, top-left origin)
  w: number;  // Width in pixels
  h: number;  // Height in pixels
  s: number;  // Byte offset within this file's decompressed buffer (see §4.3)
  l: number;  // Uncompressed byte length of this part's pixel data (= w × h × bytes_per_pixel)
}
```

> **Important**: `EIAFileV1CroppedPart.s` uses a **different coordinate space** than `EIAFileV1Cropped.s`.
>
> - `EIAFileV1Cropped.s` — offset in **compressed bytes** from the start of the data section
> - `EIAFileV1CroppedPart.s` — offset in **uncompressed bytes** within this file's LZ4-decompressed buffer
>
> The first part always has `s = 0`. Each subsequent part's `s` equals the cumulative sum of all preceding parts' `l` values. Each part MUST satisfy: `x ≥ 0`, `y ≥ 0`, `w > 0`, `h > 0`, `x + w ≤ base.w`, `y + h ≤ base.h`.

## 4. Data Section

### 4.1 Structure

The data section immediately follows the `$` terminator and contains independently LZ4-compressed blocks, one per file item.

When an animation container (`ac`) is present, the frame pool blocks (`ac.pool`) are appended after all slide data blocks (corresponding to the `i` array). Pool blocks are placed consecutively in `pool` array index order (`pool[0]`, `pool[1]`, ...).

```text
[slide data blocks ...][animation pool blocks ...]
```

### 4.2 Compression

- All image data MUST be compressed using LZ4
- Each file's data and each pool frame's data is compressed independently as a single block
- Cropped files concatenate all parts' pixel data before compression

### 4.3 Data Layout

#### Master Files

```
compressed_block:
  └─ LZ4 decompress → complete image data (w × h × bytes_per_pixel bytes)
```

#### Cropped Files

```
compressed_block:
  └─ LZ4 decompress → [part[0] pixels][part[1] pixels]...
                        ↑ s=0          ↑ s=part[0].l

Each part's pixel data:
  - Size = w × h × bytes_per_pixel bytes
  - Row-major order, top to bottom, left to right
```

Steps to decode a cropped file:
1. Read `file.l` bytes starting at offset `file.s` in the data section
2. LZ4-decompress to obtain a buffer of `file.u` bytes
3. For each part `r[i]`, read `r[i].l` bytes at offset `r[i].s` within the decompressed buffer and write them to the base image at `(r[i].x, r[i].y)` covering `r[i].w × r[i].h` pixels

#### Animation Pool Frames

Each frame in the animation pool uses the same data layout as slide master/cropped files. Master frames contain full image data, and cropped frames contain differential part data.

## 5. Supported Formats

### 5.1 Texture Formats

Currently supported texture formats:
- `"RGB24"`: 24-bit RGB (3 bytes per pixel)
- `"RGBA32"`: 32-bit RGBA (4 bytes per pixel)

### 5.2 Format Requirements

- Pixel data MUST be stored in the specified format
- RGB24 format MUST use 8 bits per channel in RGB order
- RGBA32 format MUST use 8 bits per channel in RGBA order

## 6. Extensions

### 6.1 Extension Object

Extensions are stored in an optional `e` field on each item:

```typescript
type EIAExtensionObject = {
  note?: string;  // Optional UTF-8 text annotation
  a?: string;     // Animation reference array (JSON string, see §7.4)
}
```

### 6.2 Note Extension

The `note` extension MAY contain UTF-8 encoded text annotations for the image.

## 7. Animation Extension

The animation extension allows placing GIF-like animations within slides. Animation frame data is aggregated at the manifest top level, and each slide only references placement information.

### 7.1 Animation Container

Animation frames and their playback sequences are aggregated in an animation container (`ac`):

```typescript
type EIAAnimationContainer = {
  pool: EIAAnimFramePoolItem[]; // Pool of unique frames
  anims: EIAAnimation[];        // Animation (GIF) definitions
}
```

When `ac` is present, `manifest.f` MUST include `"Feature:animation"`. When `ac` is present, `pool` and `anims` MUST NOT be empty.

### 7.2 Frame Pool

The frame pool stores unique frame data used by all animations. Encoders SHOULD share a single pool entry when the same frame data appears across multiple animations or within repeated frames of the same animation (e.g., back-and-forth GIFs).

```typescript
type EIAAnimFramePoolItem =
  | EIAAnimFramePoolItemMaster
  | EIAAnimFramePoolItemCropped;

type EIAAnimFramePoolItemMaster = {
  t: "m";            // Type (master)
  f: TTextureFormat; // Texture format
  w: number;         // Frame width in pixels
  h: number;         // Frame height in pixels
  s: number;         // Start offset in the data section (same coordinate space as §2.3)
  l: number;         // Byte length after LZ4 compression
  u: number;         // Byte length after LZ4 decompression (= w × h × bytes_per_pixel)
}

type EIAAnimFramePoolItemCropped = {
  t: "c";            // Type (cropped)
  f: TTextureFormat; // Texture format
  w: number;         // Frame width in pixels
  h: number;         // Frame height in pixels
  b: number;         // Base frame index within the same `pool` array
  s: number;         // Start offset in the data section (same coordinate space as §2.3)
  l: number;         // Byte length after LZ4 compression
  u: number;         // Byte length after LZ4 decompression (= sum of all parts' l values)
  r: EIAFileV1CroppedPart[]; // Changed rectangle parts array
}
```

> **Important**: `EIAAnimFramePoolItemCropped.b` refers to another entry within the same `pool` array by numeric index. This is different from slide-level cropped files (`EIAFileV1Cropped.b`), which use a string name.
>
> Reference chaining (where the base frame is itself `t: "c"`) is allowed, but encoders MUST NOT produce circular references. Decoders MUST enforce a depth limit when resolving references. A recommended maximum depth is 64. `b` MUST be a valid index into `pool`: `0 ≤ b < pool.length`. A frame MUST NOT reference itself. `b` is not required to refer to a lower index; decoders SHOULD resolve dependencies when decoding. For example, when a frame references an undecoded frame, decoders MUST use deferred decoding, memoized recursion, or topological sorting to ensure all dependencies are satisfied before applying crop composition.

The `EIAFileV1CroppedPart.s` values within `r` are **decompressed-buffer offsets** (the first part always has `s = 0`), using the same coordinate space as file-level cropped parts (see §3.2.1). This is a different coordinate space from `EIAAnimFramePoolItemCropped.s` (which is a compressed-space offset). `r` MUST NOT be empty. Each part in `r` MUST satisfy: `x ≥ 0`, `y ≥ 0`, `w > 0`, `h > 0`, `x + w ≤ frame.w`, `y + h ≤ frame.h`.

### 7.3 Animation Definition

An animation definition corresponds to a single GIF and describes its frame sequence and attributes:

```typescript
type EIAAnimation = {
  id: string;   // Unique animation identifier
  fps: number;  // Frame rate
  seq: number[]; // Frame sequence (array of pool indices)
}
```

Each element of `seq` is an index into the `pool` array. By referencing the same frame data multiple times, back-and-forth GIFs and other repeating frame patterns can be represented without data duplication. `seq` MUST NOT be empty. Each element of `seq` MUST be a valid pool index: `0 ≤ seq[i] < pool.length`. `fps` MUST be a finite positive number (`fps > 0`). All animations within `ac.anims` MUST have a unique `id`.

### 7.4 Animation References from Slides

Slides store an animation reference array in their extension object (`e.a`) to specify which animations to place on that slide:

```typescript
// file.e.a is JSON.stringify() of the following array:
type EIAAnimationRef = {
  id: string;  // Animation identifier within ac.anims
  x: number;   // X coordinate of the display area in the base image (REQUIRED)
  y: number;   // Y coordinate of the display area in the base image (REQUIRED)
  w: number;   // Display width in pixels (REQUIRED)
  h: number;   // Display height in pixels (REQUIRED)
}
```

When a slide references an animation, the animation is rendered at position (`x`, `y`) on that slide. Multiple slides MAY reference the same `id`. `id` MUST exist within `ac.anims`. Each reference MUST satisfy: `x ≥ 0`, `y ≥ 0`, `w > 0`, `h > 0`. If `x + w` or `y + h` exceeds the slide dimensions, the decoder MUST clip to the slide boundary.

### 7.5 Animation Decoding Steps

1. If `manifest.ac` is present, decode each frame in `pool` by resolving dependencies:
   - `t: "m"` is used directly as a complete frame image
   - `t: "c"` **copies** the image data from `pool[b]`, then applies each part in `r`. The base frame buffer MUST NOT be modified in-place.
2. Follow `seq` to assemble the frame sequence from the decoded pool frames
3. Compute the current frame index: `floor((Time.now - startTime) * fps) % seq.length`
4. Render the selected frame image within the display slot (`EIAAnimationRef.x`, `EIAAnimationRef.y`, `EIAAnimationRef.w`, `EIAAnimationRef.h`). If the frame pixel size (`pool[seq[i]].w`, `pool[seq[i]].h`) differs from the display size (`EIAAnimationRef.w`, `EIAAnimationRef.h`), the decoder MUST scale the frame to the display size

## 8. Processing Guidelines

### 8.1 Encoding

Encoders SHOULD:
- Use differential encoding for sequences with minimal changes
- Set keyframe intervals to balance compression and random access
- Optimize rectangle placement to minimize redundant data
- Share identical frame data across multiple animations via the pool
- Clip animations that extend beyond the slide boundaries so they fit within the slide area

### 8.2 Decoding

Decoders MUST:
- Validate the header format (`EIA^` magic) before processing
- Check version compatibility
- Decompress data using LZ4
- Reconstruct images by applying cropped parts to base images
- Distinguish between `EIAFileV1Cropped.s` (compressed-space offset) and `EIAFileV1CroppedPart.s` (decompressed-buffer offset) when processing
- Decode the frame pool correctly when `manifest.ac` is present
- Detect and prevent circular references in animation frame chains

### 8.3 Error Handling

Implementations MUST handle:
- Invalid header formats
- Unsupported versions
- Compression errors
- Missing base file references
- Invalid pool reference indices
- Animation reference to unknown animation identifier
- Circular references in animation frame chains
- Circular references in cropped file references
- Out-of-bounds offset references (`s + l` exceeding data section length)

## 9. Security Considerations

### 9.1 Input Validation

Implementations MUST validate:
- Header format and length
- JSON manifest structure
- Offset and length values to prevent buffer overflows
- Compression ratios to detect compression bombs
- Pool index ranges (to prevent out-of-bounds access)
- Cropped frame reference chain depth (to prevent infinite loops)

### 9.2 Resource Limits

Implementations SHOULD enforce reasonable limits on:
- Manifest size
- Number of files
- Image dimensions
- Uncompressed data sizes
- Frame pool size
- Number of animations

## 10. Examples

### 10.1 Minimal Master File

```json
{
  "t": "eia",
  "c": "lz4",
  "v": 1,
  "f": ["Format:RGB24"],
  "e": ["note"],
  "i": [{
    "t": "m",
    "n": "0",
    "f": "RGB24",
    "w": 1920,
    "h": 1080,
    "s": 0,
    "l": 256000,
    "u": 6220800
  }]
}
```

Data section: 256000 bytes of LZ4-compressed data immediately after `$`. Decompresses to 6220800 bytes (= 1920×1080×3) of image data.

### 10.2 Master and Cropped File

An archive containing a master file (slide 0) and a cropped file (slide 1):

```json
{
  "t": "eia",
  "c": "lz4",
  "v": 1,
  "f": ["Format:RGB24"],
  "e": ["note"],
  "i": [
    {
      "t": "m",
      "n": "0",
      "f": "RGB24",
      "w": 1920,
      "h": 1080,
      "s": 0,
      "l": 256000,
      "u": 6220800
    },
    {
      "t": "c",
      "b": "0",
      "n": "1",
      "f": "RGB24",
      "w": 1920,
      "h": 1080,
      "s": 256000,
      "l": 5000,
      "u": 15000,
      "r": [
        {
          "x": 100,
          "y": 200,
          "w": 50,
          "h": 100,
          "s": 0,
          "l": 15000
        }
      ]
    }
  ]
}
```

Data section layout:
- Bytes 0–255999: slide 0 compressed data (`s=0, l=256000`)
- Bytes 256000–260999: slide 1 compressed data (`s=256000, l=5000`)
  - LZ4-decompresses to 15000 bytes (= 50×100×3)
  - The part's `s=0` points to the start of this decompressed buffer

Decode result: copy slide 0's image, overwrite the region `(100, 200, 50×100)` with the decompressed data → slide 1.

### 10.3 Animation Container Example

An example placing an animation (`id: "intro"`) on slide 0:

```json
{
  "t": "eia",
  "c": "lz4",
  "v": 1,
  "f": [
    "Format:RGB24",
    "Feature:animation"
  ],
  "e": ["a"],
  "i": [
    {
      "t": "m",
      "n": "0",
      "f": "RGB24",
      "w": 1920,
      "h": 1080,
      "s": 0,
      "l": 256000,
      "u": 6220800,
      "e": {
        "a": "[{\"id\":\"intro\",\"x\":100,\"y\":200,\"w\":400,\"h\":300}]"
      }
    }
  ],
  "ac": {
    "pool": [
      {
        "t": "m",
        "f": "RGB24",
        "w": 400,
        "h": 300,
        "s": 256000,
        "l": 15000,
        "u": 360000
      },
      {
        "t": "c",
        "f": "RGB24",
        "w": 400,
        "h": 300,
        "b": 0,
        "s": 271000,
        "l": 2000,
        "u": 120000,
        "r": [
          {
            "x": 50,
            "y": 50,
            "w": 200,
            "h": 200,
            "s": 0,
            "l": 120000
          }
        ]
      }
    ],
    "anims": [
      {
        "id": "intro",
        "fps": 30,
        "seq": [0, 1, 0]
      }
    ]
  }
}
```

In this example:
- Slide 0's extension `e.a` stores an animation reference array
- `ac.pool[0]` is frame 0 (master), `ac.pool[1]` is frame 1 (cropped from frame 0)
- `ac.anims[0].seq = [0, 1, 0]` describes a back-and-forth animation: frame 0 → frame 1 → frame 0
- Frame 0 is referenced twice, but pool data is stored only once

## 11. References

- RFC 2119: Key words for use in RFCs to Indicate Requirement Levels
- LZ4 Compression Algorithm

## Appendix A: Type Definitions

See the complete TypeScript type definitions in the source code:
- `src/_types/eia/v1.ts`: Core EIA v1 types
- `src/_types/text-zip/formats.ts`: Texture format definitions

## Appendix B: Summary of `s` Field Coordinate Spaces

EIA v1 uses a field named `s` in multiple contexts with different coordinate spaces. Take care not to confuse them.

| Field | Unit | Origin | Example values |
|---|---|---|---|
| `EIAFileV1Master.s` | compressed bytes | first byte after `$` | 0, 256000, … |
| `EIAFileV1Cropped.s` | compressed bytes | first byte after `$` | 256000, … |
| `EIAFileV1CroppedPart.s` | uncompressed bytes | start of that file's decompressed buffer | 0, 15000, … |
| `EIAAnimFramePoolItemMaster.s` | compressed bytes | first byte after `$` | large value |
| `EIAAnimFramePoolItemCropped.s` | compressed bytes | first byte after `$` | large value |
| `EIAAnimFramePoolItemCropped.r[i].s` | uncompressed bytes | start of that frame's decompressed buffer | 0, … |
