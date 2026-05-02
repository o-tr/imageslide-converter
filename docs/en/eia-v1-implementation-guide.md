# EIA v1 Implementation Guide

## Overview

This document provides implementation guidance for the EIA v1 format, including encoding strategies, optimization techniques, and common use cases.

## 1. Encoding Strategy

### 1.1 Keyframe Selection

The encoder SHOULD use a keyframe interval to balance compression efficiency and random access:

```typescript
const keyframeInterval = 10; // Every 10th frame is a keyframe
```

Benefits:
- **Compression**: Longer intervals provide better compression
- **Access**: Shorter intervals enable faster random access
- **Error Recovery**: Keyframes limit error propagation

### 1.2 Differential Encoding Process

1. **Base Image Selection**: Use the previous frame as the base image
2. **Difference Detection**: Compare pixel values to identify changed regions
3. **Bounding Box Optimization**: Merge overlapping regions and optimize rectangles
4. **Threshold Decision**: Fall back to keyframe if changes exceed threshold

### 1.3 Optimization Techniques

#### Rectangle Merging
```typescript
// Merge overlapping rectangles to reduce overhead
const mergedBoxes = mergeOverlapBoundingBox(
  shrinkOverlapBoundingBox(diffBox)
);
```

#### Size Threshold
```typescript
// Use keyframe if changes are too extensive
if (mergedBoundingBoxes[0].area === currentImage.rect.width * currentImage.rect.height) {
  // Store as master file instead of cropped
}
```

## 2. Offset Coordinate Spaces

EIA v1 uses a field named `s` in multiple contexts with different coordinate spaces. This is the most common source of implementation bugs.

### 2.1 File-level `s` (Compressed Space)

`EIAFileV1Master.s`, `EIAFileV1Cropped.s`, and `EIAAnimationFrameRef*.s` are all **compressed-byte offsets** measured from the first byte after `$`.

```typescript
// Encoder side: bufferLength accumulates as compressed blocks are appended
let bufferLength = 0;

const compressed = lz4.compress(rawData);
files.push({ s: bufferLength, l: compressed.length, u: rawData.length, ... });
bufferLength += compressed.length; // next file starts compressed.length bytes later
```

### 2.2 Cropped Part `s` (Decompressed Space)

`EIAFileV1CroppedPart.s` is an **uncompressed-byte offset** measured from the start of that file's LZ4-decompressed buffer. The first part always has `s = 0`.

```typescript
// Encoder side: fileBufferLength accumulates as part buffers are concatenated
let fileBufferLength = 0;

for (const rect of rects) {
  parts.push({ s: fileBufferLength, l: rect.buffer.length, ... });
  fileBuffer.push(rect.buffer);
  fileBufferLength += rect.buffer.length; // 0, size0, size0+size1, ...
}

const mergedBuffer = Buffer.concat(fileBuffer);
const compressed = lz4.compress(mergedBuffer);
// file.s = bufferLength (compressed space), file.u = mergedBuffer.length (uncompressed)
// part[i].s is an offset into this mergedBuffer (uncompressed space)
```

### 2.3 Key Rule for Decoders

```
Wrong: rectOffset = rect.s - file.s    // ← subtracts a compressed-space value
Right: rectOffset = rect.s             // ← rect.s is already a decompressed-buffer offset
```

Complete cropped file decode sequence:

```typescript
// 1. Read the compressed block (file.s is a compressed-space offset)
const compressedBlock = dataSection.slice(file.s, file.s + file.l);

// 2. LZ4 decompress
const decompressed = lz4.decompress(compressedBlock, file.u);
// decompressed is file.u bytes; part[i].s is an offset into it

// 3. Apply each part (rect.s is a decompressed-buffer offset)
for (const part of file.r) {
  const partData = decompressed.slice(part.s, part.s + part.l);
  // Write to baseImage at (part.x, part.y) covering part.w × part.h pixels
}
```

## 3. File Size Management

### 3.1 Chunking Strategy

Large datasets are automatically split into multiple files:

```typescript
const FileSizeLimit = 95 * 1024 * 1024; // 95MB per file

// If the compressed size exceeds the limit, retry with more splits
if (compressedPart.length > FileSizeLimit) {
  return compressEIAv1(data, signage, count + 1, stepSize, animationMap);
}
```

### 3.2 Size Estimation

Provide compression ratio estimates for different scenarios:
- **Static content**: 0.1-0.2 ratio (90-80% reduction)
- **Slide presentations**: 0.2-0.4 ratio (80-60% reduction)
- **Video content**: 0.4-0.8 ratio (60-20% reduction)

## 4. Animation Implementation

### 4.1 Encoding

Animation frames are appended to the data section after all slide data. Frame data is aggregated into `ac.pool` at the manifest top level. The slide's extension object (`e.a`) stores the animation reference array (`EIAAnimationRef[]`) **natively without JSON.stringify**.

```typescript
// Frame deduplication and pool construction
const pool: EIAAnimFramePoolItem[] = [];
const poolDecodedBuffers: Buffer[] = [];
const anims: EIAAnimation[] = [];

for (const anim of animations) {
  const seq: number[] = [];
  const resolvedBuffers = new Map<number, Buffer>();
  const framePoolIndices: number[] = [];
  const newPoolFrames: RawImageObjV1Cropped[] = [];
  const newDecodedBuffers: Buffer[] = [];

  // Pass 1: decode all frames and assign pool indices (with dedup)
  for (let fi = 0; fi < anim.frames.length; fi++) {
    const frame = anim.frames[fi];
    const decoded = decodeAnimationFrame(frame, resolvedBuffers);
    resolvedBuffers.set(fi, decoded);

    const existing = findMatchingPoolIndex(decoded, poolDecodedBuffers, frameW, frameH);
    if (existing >= 0) {
      framePoolIndices.push(existing);
    } else {
      const localExisting = findMatchingPoolIndex(decoded, newDecodedBuffers, frameW, frameH);
      if (localExisting >= 0) {
        framePoolIndices.push(pool.length + localExisting);
      } else {
        framePoolIndices.push(pool.length + newDecodedBuffers.length);
        newDecodedBuffers.push(decoded);
        newPoolFrames.push(frame);
      }
    }
  }

  poolDecodedBuffers.push(...newDecodedBuffers);

  // Pass 2: compress new pool entries
  for (const frame of newPoolFrames) {
    if (!frame.cropped) {
      const compressed = lz4.compress(frame.buffer);
      pool.push({ t: "m", f: format, w: frameW, h: frameH, s: bufferLength, l: compressed.length, u: frame.buffer.length });
      bufferLength += compressed.length;
    } else {
      const basePoolIndex = framePoolIndices[frame.cropped.baseIndex];
      const parts = buildParts(frame.cropped.rects);
      const merged = Buffer.concat(frame.cropped.rects.map(r => r.buffer));
      const compressed = lz4.compress(merged);
      pool.push({ t: "c", f: format, w: frameW, h: frameH, b: basePoolIndex, s: bufferLength, l: compressed.length, u: merged.length, r: parts });
      bufferLength += compressed.length;
    }
  }

  anims.push({ id: animId, fps: anim.fps, seq: framePoolIndices });
  slideRefs.push({ id: animId, x: anim.x, y: anim.y, w: anim.w, h: anim.h });
}

// Store refs natively in e.a (do not JSON.stringify)
file.e = { ...file.e, a: slideRefs };
manifest.ac = { pool, anims };
manifest.f.push("Feature:animation");
```

### 4.2 Decoding

Animation data is decoded from `manifest.ac`. Pool frames are decoded recursively while resolving dependencies.

> **Implementation note (`manifest.c === "lz4-base64"`)**  
> In the current `decodeEIAv1` runtime, when `manifest.c` is `"lz4-base64"` there is no binary section, so the code path that would call `decodePoolFrame` and run `lz4.decompress` for `manifest.ac.pool` is intentionally skipped. As a result, pooled animation frames in `manifest.ac` are not decoded at runtime under `lz4-base64`, even though the spec text describes decoding from `manifest.ac`.

```typescript
// Pool frame decoding (memoization + depth limit)
const decodePoolFrame = (pool, binarySection, index, depth, memo) => {
  if (depth > 64) throw new Error("Pool reference depth exceeded");
  if (memo.has(index)) return memo.get(index);

  const item = pool[index];
  const compressed = binarySection.slice(item.s, item.s + item.l);
  const decompressed = lz4.decompress(compressed, item.u);

  let result;
  if (item.t === "m") {
    result = decompressed;
  } else {
    const base = decodePoolFrame(pool, binarySection, item.b, depth + 1, memo);
    const copied = new Uint8Array(base); // copy base (MUST NOT modify in place)
    result = applyRects(copied, decompressed, item.r, item.w, item.f);
  }
  memo.set(index, result);
  return result;
};

// Pre-decode all pool frames
const poolDecoded = new Map();
for (let i = 0; i < manifest.ac.pool.length; i++) {
  decodePoolFrame(manifest.ac.pool, binarySection, i, 0, poolDecoded);
}

// Frame index calculation (Unix epoch anchor for synchronized playback)
const frameIndex = Math.floor((Date.now() / 1000) * fps) % seq.length;
const poolIdx = anim.seq[frameIndex];
const frameData = poolDecoded.get(poolIdx);

// Render into display slot (scale if frame size differs from display size)
ctx.drawImage(frameImage, ref.x, ref.y, ref.w, ref.h);
```

## 5. Format Compatibility

### 5.1 Supported Texture Formats

| Format | Bytes/Pixel | Use Case |
|--------|-------------|----------|
| RGB24  | 3          | Standard images |
| RGBA32 | 4          | Images with alpha |

## 6. Performance Characteristics

### 6.1 Compression Performance

Typical compression results for slide presentations:

```
Input Size: 50 images × 1920×1080 × 3 bytes = ~311MB
EIA v1 Output: ~20-60MB (80-94% reduction)
Processing Time: 2-5 seconds (depends on content complexity)
```

### 6.2 Memory Usage

- **Encoding**: Peak memory ≈ 2× uncompressed size
- **Decoding**: Incremental, ~1 frame buffer needed
- **Random Access**: O(1) for keyframes, O(k) for differential frames

### 6.3 Optimization Guidelines

#### For Encoders:
- Process images in sequence order
- Reuse difference detection buffers
- Batch LZ4 compression operations

#### For Decoders:
- Cache base images for differential reconstruction
- Use streaming decompression for large files
- Implement progressive loading for UI responsiveness

## 7. Error Handling Best Practices

### 7.1 Validation Checklist

```typescript
// Header validation
if (data.slice(0, 4) !== 'EIA^') {
  throw new Error('Invalid EIA header');
}

// Version compatibility
if (manifest.v !== 1) {
  throw new Error(`Unsupported version: ${manifest.v}`);
}

// File-level bounds check (compressed space)
if (file.s + file.l > dataSection.length) {
  throw new Error('File extends beyond data section');
}

// Part-level bounds check (decompressed space)
if (part.s + part.l > file.u) {
  throw new Error('Part extends beyond decompressed buffer');
}
```

### 7.2 Recovery Strategies

- **Corrupted Manifest**: Attempt partial recovery using known structure
- **Missing Base File**: Skip dependent cropped files or use nearest keyframe
- **Compression Errors**: Fall back to raw data if available

## 8. Integration Examples

### 8.1 Web Application

```typescript
// Progressive loading in browser
async function loadEIASequence(url: string) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  
  const decoder = new EIADecoder(buffer);
  const manifest = decoder.getManifest();
  
  // Load images on demand
  for (let i = 0; i < manifest.i.length; i++) {
    const image = await decoder.getImage(i);
    displayImage(image);
  }
}
```

### 8.2 Node.js Processing

```typescript
// Batch conversion
import { compressEIAv1 } from './lib/eia/compressEIAv1';

async function convertSlides(inputFiles: string[]) {
  const selectedFiles = await loadImages(inputFiles);
  const compressed = await selectedFiles2EIAv1RGB24Cropped(selectedFiles);
  
  // Save results
  compressed.forEach((buffer, index) => {
    fs.writeFileSync(`output_${index}.eia`, buffer);
  });
}
```

## 9. Migration Guide

### 9.1 From TextZip v1

EIA v1 provides better compression for image sequences:

| Feature | TextZip v1 | EIA v1 |
|---------|------------|--------|
| Container | ZIP | Binary |
| Compression | Per-file | Differential + LZ4 |
| Random Access | Good | Excellent |
| Size Efficiency | Good | Excellent |

### 9.2 Migration Steps

1. **Assessment**: Analyze existing TextZip files for cropping potential
2. **Conversion**: Use provided migration tools
3. **Validation**: Compare output quality and compression ratios
4. **Deployment**: Update client applications to support EIA v1

## 10. Debugging and Profiling

### 10.1 Diagnostic Tools

```typescript
// Compression analysis
function analyzeCompression(input: RawImageObjV1[], output: Buffer[]) {
  const inputSize = input.reduce((acc, img) => acc + img.buffer.length, 0);
  const outputSize = output.reduce((acc, buf) => acc + buf.length, 0);
  
  console.log(`Compression ratio: ${(outputSize / inputSize * 100).toFixed(1)}%`);
  console.log(`Space saved: ${(inputSize - outputSize) / 1024 / 1024} MB`);
}
```

### 10.2 Performance Monitoring

Track key metrics:
- **Encoding time** per image
- **Compression ratio** by content type
- **Memory usage** peaks
- **Differential efficiency** (ratio of cropped vs. keyframes)

## 11. Future Considerations

### 11.1 Backward Compatibility

Future versions SHOULD maintain compatibility with v1:
- Preserve core structure
- Extend rather than replace features
- Provide clear migration paths

## Appendix: Reference Implementation

The reference implementation is available in the source code:

- **Encoder**: `src/lib/eia/compressEIAv1.ts`
- **Type Definitions**: `src/_types/eia/v1.ts`
- **Integration**: `src/lib/selectedFiles2EIA/selectedFiles2EIAv1RGB24Cropped.ts`
- **Cropping Logic**: `src/lib/crop/cropImages.ts`
