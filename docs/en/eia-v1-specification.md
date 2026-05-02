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
}
```

**Version number:**
- `1`: EIA v1 (the only valid value)

Animation slots that include `fw`/`fh` fields are treated as a v1-compatible extension and do not require bumping `v`.

#### 2.4.1 Features Array

The features array (`f`) MUST contain a `"Format:{format_name}"` string for each texture format used in the archive. When animation features are used, additional identifiers are included:

- `"Format:RGB24"` etc.: Texture formats in use
- `"Feature:animation"`: Archive contains animation slots
- `"Feature:animation-crop"`: Archive contains delta (cropped) animation frames
- `"Feature:animation-frame-size"`: Animation slots use `fw`/`fh` fields

#### 2.4.2 Extensions Array

The extensions array (`e`) MUST contain all extension keys used in item extension objects. Currently supported extensions:
- `"note"`: Text annotations for individual items
- `"a"`: Animation slot definitions

#### 2.4.3 Items Array

The items array (`i`) MUST contain EIAFileV1 objects describing each image in the archive.

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

`s`, `l`, and `u` have the same meaning as for master files. `u` equals the total byte length of all parts' uncompressed pixel data concatenated.

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
> The first part always has `s = 0`. Each subsequent part's `s` equals the cumulative sum of all preceding parts' `l` values.

## 4. Data Section

### 4.1 Structure

The data section immediately follows the `$` terminator and contains independently LZ4-compressed blocks, one per file item.

### 4.2 Compression

- All image data MUST be compressed using LZ4
- Each file's data is compressed independently as a single block
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
  a?: string;     // Animation slot definitions (JSON string, see §7)
}
```

### 6.2 Note Extension

The `note` extension MAY contain UTF-8 encoded text annotations for the image.

## 7. Animation Extension

The animation extension allows defining animation slots (animated regions such as GIFs) associated with a master file.

### 7.1 Animation Slot Definition

Animation slots are stored in the master file's extension object (`e.a`). The value is a JSON-stringified array of `EIAAnimationMeta` objects:

```typescript
// file.e.a is JSON.stringify() of the following:
type EIAAnimationMeta = {
  x: number;    // X coordinate of the animation display area in the base image
  y: number;    // Y coordinate of the animation display area in the base image
  w: number;    // Display width in pixels
  h: number;    // Display height in pixels
  fw?: number;  // Stored frame width (defaults to w if omitted)
  fh?: number;  // Stored frame height (defaults to h if omitted)
  fps: number;  // Frame rate
  f: TTextureFormat; // Texture format of the frames
  frames: EIAAnimationFrameRef[]; // Frame reference array
}
```

When `fw`/`fh` are used, `manifest.f` MUST include `"Feature:animation-frame-size"`. `manifest.v` remains `1`.

### 7.2 Animation Frame References

Frames come in two types: master (full frame) and cropped (delta frame). All frame data is appended to the archive's data section after all slide data.

#### Master Frame (Full Frame)

```typescript
type EIAAnimationFrameRefMaster = {
  t: "m";    // Type (master)
  s: number; // Start offset in the data section (same coordinate space as §2.3)
  l: number; // Byte length after LZ4 compression
  u: number; // Byte length after LZ4 decompression (= fw × fh × bytes_per_pixel)
}
```

#### Cropped Frame (Delta Frame)

```typescript
type EIAAnimationFrameRefCropped = {
  t: "c";    // Type (cropped)
  b: number; // Index of the base frame within this animation's frames array
  s: number; // Start offset in the data section (same coordinate space as §2.3)
  l: number; // Byte length after LZ4 compression
  u: number; // Byte length after LZ4 decompression (= sum of all parts' l values)
  r: EIAFileV1CroppedPart[]; // Changed rectangle parts array
}
```

The `EIAFileV1CroppedPart.s` values within `r` are **decompressed-buffer offsets** (the first part always has `s = 0`), using the same coordinate space as file-level cropped parts (see §3.2.1). This is a different coordinate space from `EIAAnimationFrameRefCropped.s` (which is a compressed-space offset).

### 7.3 Animation Decoding Steps

1. Master frames are used directly as complete frame images
2. Cropped frames: copy the image data of the base frame indicated by `b`, then apply each part in `r`
3. Compute the current frame index: `floor((Time.now - startTime) * fps) % frameCount`
4. Render the composed frame image within the display slot `(x, y, w, h)` on the base slide

## 8. Processing Guidelines

### 8.1 Encoding

Encoders SHOULD:
- Use differential encoding for sequences with minimal changes
- Set keyframe intervals to balance compression and random access
- Optimize rectangle placement to minimize redundant data

### 8.2 Decoding

Decoders MUST:
- Validate the header format (`EIA^` magic) before processing
- Check version compatibility
- Decompress data using LZ4
- Reconstruct images by applying cropped parts to base images
- Distinguish between `EIAFileV1Cropped.s` (compressed-space offset) and `EIAFileV1CroppedPart.s` (decompressed-buffer offset) when processing

### 8.3 Error Handling

Implementations MUST handle:
- Invalid header formats
- Unsupported versions
- Compression errors
- Missing base file references

## 9. Security Considerations

### 9.1 Input Validation

Implementations MUST validate:
- Header format and length
- JSON manifest structure
- Offset and length values to prevent buffer overflows
- Compression ratios to detect compression bombs

### 9.2 Resource Limits

Implementations SHOULD enforce reasonable limits on:
- Manifest size
- Number of files
- Image dimensions
- Uncompressed data sizes

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
| `EIAAnimationFrameRefMaster.s` | compressed bytes | first byte after `$` | large value |
| `EIAAnimationFrameRefCropped.s` | compressed bytes | first byte after `$` | large value |
| `EIAAnimationFrameRefCropped.r[i].s` | uncompressed bytes | start of that frame's decompressed buffer | 0, … |
