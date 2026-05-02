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

Animation frames are appended to the data section after all slide data. The slot definition is stored as a JSON string in the master file's extension object (`e.a`).

```typescript
// Encoding a cropped animation frame
let fileBufferLength = 0;
const fileBuffer: Buffer[] = [];
const parts: EIAFileV1CroppedPart[] = [];

for (const rect of frame.cropped.rects) {
  fileBuffer.push(rect.buffer);
  parts.push({
    s: fileBufferLength,      // decompressed-buffer offset (starts at 0)
    l: rect.buffer.length,    // uncompressed byte length
    x: rect.x, y: rect.y, w: rect.width, h: rect.height,
  });
  fileBufferLength += rect.buffer.length;
}

const mergedBuffer = Buffer.concat(fileBuffer);
const compressed = lz4.compress(mergedBuffer);

frameRefs.push({
  t: "c",
  s: bufferLength,            // compressed-space offset in the data section
  l: compressed.length,
  u: mergedBuffer.length,
  r: parts,                   // parts[i].s are decompressed-buffer offsets
  b: frame.cropped.baseIndex,
});
bufferLength += compressed.length;
```

### 4.2 Decoding

```typescript
// Frame index calculation
const frameIndex = Math.floor((Time.now - startTime) * fps) % frameCount;

// Master frame
if (frame.t === "m") {
  const compressed = dataSection.slice(frame.s, frame.s + frame.l);
  frameData = lz4.decompress(compressed, frame.u);
}

// Cropped (delta) frame
// See `applyRects` in src/lib/slidePreview/decodeEIAv1.ts for the reference implementation.
if (frame.t === "c") {
  const compressed = dataSection.slice(frame.s, frame.s + frame.l);
  const delta = lz4.decompress(compressed, frame.u);
  // Copy baseFrameData and overwrite each part of `frame.r` from the delta buffer.
  // part.s is an offset into the delta buffer (not compressed space).
  frameData = applyRects(baseFrameData, delta, frame.r, fw, format);
}
```

### 4.3 Frame Size Extension

When the stored frame dimensions (`fw`/`fh`) differ from the display slot dimensions (`w`/`h`), the slot metadata MUST include `fw`/`fh` and the manifest's `f` array MUST include `"Feature:animation-frame-size"`. `manifest.v` remains `1`.

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
