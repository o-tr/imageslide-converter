# EIA v1 LZ4 encoding

EIA binary output uses an LZ4 frame compatible with `lz4js` 0.2.0. The
encoder tries a bounded hash-chain search in addition to the original lz4js
compressor. The deeper search considers a one-byte lazy match: it delays a
match if the next position has a meaningfully longer one. Equal-length matches
prefer larger offsets, reducing overlap-copy work without changing their encoded
length. The prior 16-entry search remains a candidate; compact candidates are
selected only if their size does not increase and estimated decode cost falls.

A further candidate leaves matches shorter than six bytes as literals. It is
selected only when its estimated decode cost is at least 10% lower, it is at
most 3% larger than the compact candidate, and it is no larger than the original
lz4js fast frame. The estimate counts sequence dispatches, native copies and
length-extension bytes; it is a heuristic rather than a guarantee for every
input or decoder version. Static frames, GIF pool frames and the nonstandard
`lz4-base64` extension use the same encoder. Each LZ4 frame remains independent
at the EIA item level.

The decode-first stage can search the complete 65,535-byte LZ4 match window
(with early exits),
plus candidates with four- and eight-byte lookahead. It selects the candidate
with the lowest calibrated TypeUdon work estimate within the preceding stage's
size ceiling. It then selectively converts short matches to literals, using
any remaining bytes under that ceiling to reduce sequence dispatch and copy
work. These are ordinary LZ4 frames; no dictionary, decoder modification or
new EIA feature is needed. Estimates can still mispredict on individual inputs.

The encoder uses exact-match hash filtering, retaining byte verification after
hash matches, and reuses immutable compressed payloads within a single EIA
conversion. Neither changes which frame is selected. Deep search still costs
significantly more CPU and memory during conversion.

Small payloads (up to 64 KiB) can also reuse a frame when a different buffer
has identical contents. A sampled fingerprint is only a filter: every reuse
checks all bytes, and at most four fingerprint collisions are compared per
lookup. The cache holds at most 32 entries and 1 MiB of input and frame bytes,
copies input views so large backing buffers are not retained, and is discarded
after the conversion. Identity caching is still used for larger payloads.
The 28 private payloads contained no identical complete inputs, so this is a
workload-dependent optimization. For a repeated synthetic 16 KiB payload,
six warmed alternating Node measurements had median CPU times of 5.38 ms for
recompression and 0.019 ms for content lookup, with identical frame bytes.
In a separate deliberately cheap no-op-encoder test over 1,000 distinct 16 KiB
buffers, the median batch CPU time increased from 1.7 to 9.4 ms due to cache
bookkeeping and input copies. These measurements exclude browser and other
conversion work; the cache may provide no benefit when content does not repeat.

When a cropped slide or animation frame already has a cached compressed
payload, EIA serialization no longer concatenates its source rectangles
again. On a cache miss, a single rectangle is passed directly to the encoder;
multiple rectangles are concatenated as before. Geometry and byte-length
validation still runs before either path, and the manifest records the sum of
the rectangle lengths. Cache-hit and miss archives are tested for byte-for-byte
equality. In an artificial Node benchmark with 25 cached deltas containing two
512×512 RGB rectangles each, eight warmed alternating serialization runs had
median CPU times of 14.60 → 0.30 ms and the new path avoided 37.5 MiB of
temporary rectangle concatenation per run. This isolates serialization, uses
repeated cached data, and is not an end-to-end or browser measurement.
Compressed frames are also retained as Uint8Array views until the final EIA
concatenation, instead of copying every frame into an intermediate Buffer.
Serialization is synchronous and the compressed frames are immutable during
that pass. Tests cover cached slides and animations, unaligned views into
larger arrays, and concatenation with the browser Buffer implementation. In a
synthetic Node serialization test with 16 cached, mostly incompressible
512×512 RGB frames, eight warmed alternating runs had median CPU times of
14.10 → 4.78 ms and identical 12.58 MB archives. The new path avoids one
temporary copy of each compressed frame; this is not a peak-memory or
end-to-end browser measurement.

The animation crop cache calculates its two existing FNV-1a hashes in one
pass over each frame instead of two. Its keys are unchanged, but reuse also
checks frame dimensions, format and every pixel byte; distinct animations
that happen to share a hash are kept separately. Exact verification adds
work for a cache hit. On one synthetic 1920×1080 RGB frame, eight warmed
alternating Node measurements of the dual-hash byte scan had median CPU times
of 10.14 → 5.26 ms. This excludes canvas conversion, equality verification,
cropping, and browser overhead.

Identical slide images can use a one-pixel no-op delta. If a master has a
smaller compressed payload plus metadata than a delta, it is used instead.
The existing keyframe and maximum reference-depth limits still apply. The
existing color-difference threshold is unchanged; a threshold-suppressed but
non-identical image is not replaced by the no-op delta.

When comparing a delta with a master, a conservative LZ4 expansion bound can
prove that the delta wins before encoding the master: a compressed byte can
account for at most 255 decoded bytes, including the implicit lengths in a
token. The comparison also accounts for the decimal widths of the metadata.
If the bound is inconclusive the master is compressed and compared normally.
Thus the same parent or master is selected without always compressing both.
In 60 synthetic comparisons against the preceding crop implementation, using
lz4js to encode payloads, every selection was identical. For two identical
256×256 random RGB images with the production encoder, seven warmed,
alternating Node runs had median crop-stage CPU times of 103.2 → 1.4 ms.
This measurement excludes later serialization, rendering and the compression
of the first image; the saving depends on the source and parent selection.
When the expansion bound alone is inconclusive, a second conservative bound
counts four-byte prefixes with no matching hash in the preceding 65,535-byte
window. Such positions must be literal bytes, except for at most the final
three bytes of each match, which are covered by that match's token and offset
bytes. Hash collisions can only weaken the bound. The scan stops early once
the bound proves the delta wins, and reuses a bounded (at most 1 MiB) hash
table within a conversion. It also stops when even treating every remaining
prefix as unique could not reach the target. Across the
same 60 synthetic selections, the old implementation encoded 120 payloads
and the two bounds reduced this to 80, without changing any selection. The
bound was also checked against valid frames on 2,500 synthetic inputs and all
28 private payloads. It applies to the converter's frames without an external
dictionary; if inconclusive, normal master compression still runs. For a
synthetic 256×256 random RGB image with a changed 40×40 region, seven warmed
alternating Node runs using the production encoder measured crop-stage CPU
times of 138.6 → 9.8 ms. This excludes later serialization and the first
image's compression; results depend on the images and delta.
The prefix count is combined with the expansion bound: if decoded length is
`N` and the conservative unmatched-prefix count is `U`, frame size is at
least `U + ceil(max(0, 3N - 19U) / 765)`. This follows by accounting for at
least three encoded bytes per match, at most 19 implicit matched bytes per
match, and at most 255 decoded bytes per remaining length-extension byte.
On one 4.95 MB private input, a 35,000-byte proof target was inconclusive
with the prefix count alone (26,693) but reached 35,143 with the combined
bound; seven warmed alternating Node batches of ten scans had median CPU
times of 11.4 → 6.7 ms because the combined scan stopped earlier. The
saved work depends on the target and data distribution.
A prototype also combined three-byte and four-byte uniqueness bounds. It
tightened the bound on 26 of the 28 private payloads, but required another
bounded hash table and scan. In 60 synthetic crop selections it did not prove
any additional delta winner beyond the existing bound, so it was not enabled.
This is a bounded workload observation rather than a proof that it cannot
help other inputs.
The scan checks whether the target is finite once per input, and checks the
remaining-position bound only every 4,096 bytes. Across three 4.95 MB private
inputs with a 300,000-byte target, eight warmed alternating Node batches of
ten scans had median CPU times of 13.5 → 12.3, 14.3 → 12.9 and
15.4 → 13.9 ms per scan. This measures the bound scan alone; whether it
occurs and its contribution to a conversion depend on the input and delta.
Parent selection also stops evaluating candidates once the changed-pixel
count is zero: no later candidate can improve that score, and the existing
tie policy keeps the first. The RGB diff scan now follows row-major buffer
order. A 200-case comparison across differing image dimensions matched the
previous masks byte-for-byte. For a synthetic 1920×1080 pair, seven warmed
alternating Node runs had median diff-stage CPU times of 8.8 → 6.9 ms; this
does not include parent selection, compression, or browser overhead.
Counting changed pixels is now fused into that scan rather than rereading the
mask. In a separate seven-run alternating Node comparison on the same synthetic
dimensions, the row-major diff plus counting took 9.7 → 9.1 ms median CPU
time. These are individual local measurements, not end-to-end timings.
When checking later parent candidates, the scan can also stop as soon as its
changed-pixel count reaches the current best: a tie keeps the existing
parent, and a larger count cannot win. Such a partial mask is discarded.
Across 120 synthetic candidate sets and four top-K values, parent choices and
winning masks matched the complete-scan implementation. With a good first
parent followed by two dissimilar candidates at 1920×1080, seven warmed
alternating Node runs had median parent-selection CPU times of 24.6 → 9.4 ms;
three tied candidates measured 26.8 → 24.3 ms. Real slides and browsers may
behave differently.
When a slide exactly matches its parent and is encoded as a one-pixel no-op,
the resolved parent buffer is reused during conversion instead of copying the
whole image. Conversion treats these buffers as immutable. For two identical
synthetic 1920×1080 RGB slides, eight warmed alternating Node measurements of
the crop stage with lz4js encoding had median CPU times of 21.80 → 20.45 ms;
one 6.22 MB image copy is also avoided. For other deltas with equal, tightly
packed image dimensions, copying the parent is done in one operation rather
than one row at a time. That operation matched the prior output across 160
synthetic dimension and buffer-length combinations. These measurements do not
include canvas capture or browser overhead.
Connected components in the difference mask now keep pending pixels as linear
indices rather than allocating an `[x, y]` pair per pixel. Bounds and component
order matched the preceding implementation on 1,500 synthetic masks and an
independent reference on 400 additional masks. For a solid 1920×1080 mask,
four warmed alternating Node measurements had median CPU times of
212.1 → 28.4 ms. One separate run measured peak RSS of
202,100 → 101,232 KiB; this is not a browser-memory measurement. A mask with
one large rectangular region measured 52.1 → 11.3 ms in the same warmed
comparison. Results depend on mask shape and do not include downstream
rectangle merging or compression.
The overlap-shrinking pass skips comparisons between boxes that both lack a
strict interior. Its edge adjustments only raise lower edges or lower upper
edges, so such a box cannot later acquire an interior; all potentially
relevant pairs are still checked in their original order. Results matched the
previous pass on 3,000 randomized sets, with separate tests for points, lines,
nested and inverted rectangles. For 10,000 synthetic boxes of which 40 had
interiors, four warmed alternating Node measurements had median CPU times of
339.6 → 7.8 ms. This measures overlap shrinking alone; later overlap merging
can still be expensive, and results depend on the rectangles' shapes.
For at least 1,024 valid integer rectangles, overlap merging now uses a
bounded spatial index to find possible candidates. Candidates retain their
original order, and the index is queried again after a merge expands a box;
entries already passed are not revisited. Large, unusual or dense cases fall
back to the original ordered scan to limit index cost. Results matched the
previous implementation on 1,500 randomized sets and 200 larger sets, with
additional tests for expanding chains and fallback cases. Four warmed
alternating Node measurements on 10,000 synthetic points had median overlap
merge times of 367.4 → 10.1 ms. In a separate 1280×720 synthetic sparse mask
with 9,085 components, two warmed comparisons of overlap shrinking, overlap
merging and rectangle limiting together measured 4.20/4.25 seconds before
and 94.9/79.9 ms after, with identical final bounds. These measurements do
not include canvas work or LZ4 compression and do not represent every image.
The overlap-shrinking pass also uses a bounded spatial index when there are
many rectangles with interiors. It checks possible pairs in their original
order; if a box becomes inverted, it continues the remaining ordered scan
because its endpoints may leave the indexed extent. Dense or unsupported
inputs also use that scan. The index has explicit cell and reference limits.
The indexed prototype matched the preceding pass on 3,000 randomized sets,
and the production implementation matched it on 1,000 more; tests also cover
early and late inversion and the fallback paths. Four warmed alternating Node
measurements on 5,000 separated rectangles had median shrinking times of
68.8 → 7.0 ms. One separate run on 20,000 separated rectangles measured
534.7 → 49.4 ms and peak RSS of 87,552 → 102,676 KiB: the additional index
trades memory for time. These are synthetic Node measurements, not browser
or end-to-end conversion results.
The shrinking index stores bounded cell coordinates as exact numeric keys and
uses typed arrays for cell references and ranges, avoiding a separate array
per occupied cell. Coordinates outside the key's safe range fall back to the
ordered scan. The compact and previous indexed implementations matched on
2,000 randomized sets, with separate tests around the coordinate limits. In
one Node run on 20,000 separated rectangles, peak RSS was
101,912 → 90,904 KiB and CPU time was 47.1 → 38.9 ms. This single synthetic
measurement is not a general browser-memory or conversion-time guarantee.
When limiting the number of rectangles, each active rectangle now caches its
best partner. After a merge, only rows affected by the changed or removed
rectangle, plus a newly eligible row, are recalculated. The original search
window of the last 200 rectangles and its first-pair tie order are preserved;
this does not make the rectangle selection globally optimal. Outputs matched
the preceding implementation over 500 randomized sets and additional tests
cover ties, non-finite costs and the 200-entry boundary. On 5,000 synthetic
rectangles, four warmed alternating Node measurements had median CPU times of
2,243 → 39 ms for this limiting step alone. For 1,000 tied rectangles the
medians were 268.7 → 16.4 ms. These do not include earlier overlap handling,
canvas work or compression, and workload shape affects the benefit.
The thumbnail averaging loop also advances a byte offset across each row
instead of recomputing it for every pixel. It produced identical thumbnail
bytes in 300 synthetic dimension/grid combinations. On a synthetic
1920×1080 image, nine warmed alternating Node measurements had median CPU
times of 2.49 → 2.36 ms for thumbnail generation alone.

For RGB24 EIA export, canvas conversion now extracts RGB and reverses row
order in a single pass. The previous path first made a full flipped RGBA
copy, then filtered out alpha, then copied the RGB bytes into a Buffer. The
new Buffer is a view of the RGB output; canvas acquisition still allocates its
own ImageData. The RGBA converter also uses row views instead of allocating a
temporary slice for each row. RGB results matched the prior implementation on
221 synthetic dimensions and varied alpha values. For one synthetic
1920×1080 image, six warmed alternating Node measurements of conversion
alone (with a preexisting ImageData array) had median CPU times of
232.1 → 5.7 ms. For that size the new EIA path also avoids the 8.29 MB
flipped-RGBA array and 6.22 MB RGB-to-Buffer copy. This does not measure
canvas acquisition, compression, or browser performance.

Animation pool matching counts differing pixels directly and stops when the
existing similarity threshold is exceeded, instead of allocating and scanning
a full-size mask. Exact matches and the first matching pool index retain their
previous behavior, including exact matching for cropped-frame dependencies.
A reference full-mask calculation was compared over 400 synthetic RGB and
RGBA pairs at thresholds around the true count; an archive test also checks
similar frames and crop dependencies. For synthetic 640×360 RGBA frames,
eight warmed alternating Node batches of 100 comparisons had median CPU
times of 0.99 → 0.0038 ms for dissimilar frames and 0.89 → 0.71 ms for a
similar pair requiring a complete scan. This measures similarity comparison
alone, not GIF decoding, compression, or browser performance.

## Measurement (2026-11-01)

Four frames from an existing private EIA archive were independently decoded
with liblz4 and recompressed. The private images and generated cases are not
stored in this repository. Byte-for-byte equality was verified with liblz4,
lz4js, the TypeUdon probe and Unity Udon VM. Original and searched frames
used the same TypeUdon decoder artifact and VM configuration.

| Item | lz4js bytes | Search bytes | udon-rs instructions before | after |
| --- | ---: | ---: | ---: | ---: |
| 2 | 58,814 | 52,855 | 14,314,572 | 12,576,844 |
| 17 | 222,224 | 202,604 | 43,761,744 | 39,621,154 |
| 13 | 324,180 | 292,693 | 53,153,402 | 46,212,810 |
| 12 | 109,645 | 98,965 | 26,108,235 | 23,305,368 |

In two sequential Unity 2022.3.22f1 / Worlds SDK 3.6.1 Editor runs of the existing
UdonSharp-compatible TypeUdon adapter, all four inputs passed. The baseline
used 143 frames in both runs (975.8 and 1057.6 ms); searched output used 132
frames in both runs (929.6 and 914.5 ms). These are not controlled alternating
tests or VRChat client measurements. Native work inside externs is not counted by the
udon-rs instruction counters. This measures LZ4 decoding, not full EIA parent
resolution or image rendering.

The same private archive's complete 28-frame corpus decreased from 8,080,513
to 7,540,438 compressed payload bytes (6.7%). In two runs per variant the
Unity adapter decoded all 28 frames correctly: the baseline used 1,348 frames
in 10.1 and 14.5 seconds; the new encoder used 1,282 frames in 16.1 and 9.2
seconds. Runs were sequential in baseline/new/new/baseline order. Wall time
varied substantially, so these samples do not establish a wall-time speedup.

### Deeper, lazy search

The same 28 frames were recompressed with the 64-entry lazy search, retaining
the previous search as a fallback. The candidate output was byte-identical to
the lazy-search-only experiment for these inputs. Total compressed payload
size decreased from 7,540,438 to 7,238,698 bytes (4.0%). In two Unity Editor
runs, all 28 outputs matched and the adapter used 1,195 frames (7.7 and 8.3
seconds), compared with 1,282 frames in each of the two preceding runs. These sequential
runs are not a controlled wall-time benchmark.

On the four inputs above, the udon-rs probe reported 12,576,844 → 11,531,916;
39,621,154 → 37,116,729; 46,212,810 → 42,472,066; and 23,305,368 → 21,249,612
instructions respectively. All 28 search outputs also decoded byte-for-byte
with liblz4. Increasing the search bound and evaluating both searches adds
compression work; the tradeoff was chosen for smaller output and lower decode
work, not faster conversion. On the four input payloads above, seven warmed,
alternating Node 24 runs on this machine had median encoder times of 69.1 ms
before and 245.9 ms after for the batch. These times exclude image cropping,
browser worker overhead and the rest of EIA export; they are not browser or
end-to-end conversion benchmarks.

The Unity decoder artifact SHA-256 was
`45507b4f05f6c4d28e3d584a37b7c2b1a7fbaee2b974cee64611e1772e07003a`;
the udon-rs probe artifact SHA-256 was
`08d183b759bb9399d58de44eec12cb5968787ebd00482aff017a54906391e658`. The measurements do
not imply the two artifacts produce identical instruction counts. Re-run both
sides with the same artifacts, VM version and slice budget when comparing a
change. Use representative slide archives, photo-heavy inputs, large frames and
GIFs in addition to these samples.

To prepare pairs from cases extracted with TypeUdon's `eia-lz4-probe`:

```sh
node scripts/benchmark-eia-lz4.mjs /path/to/private-cases.json /tmp/eia-pairs.json
python3 /path/to/typeudon/rust/tools/eia-lz4-probe/run-corpus.py \
  /path/to/typeudon-rust-eia-probe /path/to/probe.tasm \
  /tmp/eia-pairs.json /tmp/eia-results.json
```

Both JSON files contain slide bytes and must remain outside the repository.

### Prioritizing decoder work

For the same 28-frame corpus, choosing equivalent matches with larger offsets
retained the 7,238,698-byte total and reduced the Unity adapter from 1,195 to
1,177 frames in one run. A candidate that also omits short matches was chosen
for nine frames under the size and estimated-cost limits above: the total became
7,324,138 bytes (1.18% larger), and the Unity adapter used 1,084 frames in two
runs (7.7 and 7.8 seconds). Each decoded payload matched its reference bytes. These runs measure LZ4
decoding only; separate Editor processes and frame scheduling mean their
elapsed times are not conclusive performance evidence.

For four representative payloads, using larger offsets without a size change
reduced udon-rs VM instructions from 112,370,323 to 111,086,257 in total.
With the bounded short-match candidate enabled, the same four payloads used
102,306,381 instructions, an 8.96% reduction from 112,370,323.
Searching multiple candidates increases encoding time, which is separate from
the VM decode work and depends on the source image. On those four payloads,
seven warmed alternating Node runs had median encoding times of 252.7 ms for
the larger-offset encoder and 431.7 ms after adding the short-match candidate.
This excludes cropping and browser-worker overhead.

### Wider search and selective literal merging

The decoder-cost estimate for the deeper-search stage was fitted to measured
TypeUdon instruction counts. The fit used the 28-frame archive as well as
alternative encodings of four of its frames; it is not independent validation
and does not include native work inside extern calls. Each new candidate is
subject to the previous encoder's per-frame size ceiling.

The short-match post-pass retains the same literal and match bytes after LZ4
decompression. It ranks short matches by estimated saved decoder work per
additional byte, tries candidates near the size budget, and keeps a candidate
only if its estimated cost decreases. Its budget search is heuristic, not a
proof of a globally optimal LZ4 parse.

On four representative frames, searching the maximum offset window and
four-byte lookahead, then merging short matches, reduced the udon-rs instruction
count from 102,306,381 to 77,730,819 (24.0%) without exceeding the previous
per-frame sizes. On one frame, expanding the match search from 8,192 to 65,535
reduced its estimated decoder cost by about 1.1%, with much more encoding work.
A 16-byte lookahead was also examined on four frames; its candidates exceeded
the existing size ceilings. These observations are not a global optimum proof.

The synthetic fixture generator can be used without private slide contents:

```sh
node scripts/generate-eia-lz4-fixtures.mjs /tmp/eia-synthetic.json
node scripts/benchmark-eia-lz4.mjs /tmp/eia-synthetic.json /tmp/eia-synthetic-pairs.json
```

Against the pre-deep-search encoder, the udon-rs probe reported no change for
uniform, gradient and random-noise payloads; the synthetic text-like and sparse
payloads used 48.4% and 36.7% fewer instructions respectively. Real images,
GIFs and the Unity VM may behave differently.

For the complete private 28-frame corpus, the final search and literal merging
used 846,604,261 udon-rs VM instructions versus 1,064,653,151 previously
(20.48% fewer). Every frame matched the reference bytes; none had more VM
instructions or a larger compressed payload. Total payload sizes were
7,324,094 versus 7,324,138 bytes. The final payloads were also independently
decoded by liblz4. These are observations for this corpus, not guarantees for
other inputs or decoder implementations.

Unity 2022.3.22f1 / Worlds SDK 3.6.1 ran the same 28 outputs using the same
TypeUdon adapter and decoder artifact in baseline/new/new/baseline order. Both
baseline runs completed correctly in 1,084 frames (7.12 and 9.44 seconds);
both new runs completed correctly in 892 frames (6.04 and 5.68 seconds). Frame
count includes coroutine scheduling and the elapsed times include Editor frame
pacing; two sequential processes per variant do not establish a universal
wall-time speedup. The browser workflow was also checked from image selection
through DeckCraft and EIA conversion; the subsequent upload API response was
intercepted with a test error, so the check did not upload a file.

The search was examined beyond the current selection policy. On one input,
increasing a one-byte-lookahead search bound from 8,192 to the full 65,535
candidate window improved the estimated cost by about 1.1%, at considerably
higher encoding cost. Four-byte and eight-byte lookahead sometimes produced
better candidates than deeper one-byte lookahead. A 16-byte lookahead on four
inputs did not fit the per-frame size budget. Tie-order experiments for the
literal merger changed estimated costs by less than 0.2% on those inputs.
Those experiments establish diminishing returns for these samples, not a
mathematical optimum. Conversion can take substantially longer because the
decoder is prioritized over encoder time.

### Considering raw blocks within the existing budget

When a whole compressed block can be stored raw within the existing frame
size ceiling, the encoder considers that alternative alongside the usual
literal-merge path. It runs both post-processing paths and selects the one
with lower estimated decoder work, breaking ties by size. In the common case
where no raw block fits, it does not build an alternative frame. When a raw
candidate does fit, the additional comparison costs encoding time and memory;
the estimated work remains a heuristic and is not a per-input VM guarantee.

For one constructed two-block input combining a near-incompressible 4 MiB
block and a private slide payload, the actual complete encoder changed from
4,244,046 to 4,244,043 bytes. With the same historical udon-rs decoder and
configuration, the two frames decoded exactly and required 8,280,493 and
8,096,649 VM instructions respectively (2.22% fewer). liblz4 also decoded
both exactly. This is a targeted synthetic scenario, not a representative
slide benchmark, and excludes work inside native externs. Among 1,200 small
synthetic comparisons with varied size budgets, six changed and all respected
the budget, round-tripped through lz4js and did not increase the modelled cost.
In a separate synthetic study with deliberately varied budgets, all 11 changed
single-block comparisons and all 30 changed two-block comparisons used fewer
udon-rs instructions; liblz4 recovered all 82 before/after payloads exactly.
For the two-block cases, total instructions fell from 249,890 to 120,660 while
total compressed size rose from 237,932 to 243,087 bytes (2.17%). These are
selected changed cases with artificial budgets, not a measurement of default
end-to-end conversion or a guarantee for other inputs.
Both frames were also decoded byte-for-byte in Unity 2022.3.22f1 using the
original UdonSharp decoder source; the test adapts only its callback receiver
and uses equivalent queue-array helpers. This validates these two frames, not
all possible frames. For four private payloads where no raw block fit, six
warmed alternating Node batches of ten post-passes produced identical output;
their median CPU times were 2.35 → 2.11, 8.38 → 9.13, 7.80 → 7.70, and
3.57 → 3.49 ms. The variation and small sample do not establish the overhead
on other inputs or in browsers.

### Zero-byte match elimination

After the budgeted literal merge, a second pass checks whether removing a
short match can merge adjacent literals without increasing the LZ4 frame size.
It accounts for token and length-extension bytes and the decoder's sequence,
copy and extension work. A removal can make a neighboring match free, so the
pass revisits that neighbor. The final frame is kept only when its measured
cost decreases and its length does not increase. This adds two temporary
32-bit link arrays per compressed block, proportional to its match count.
Only four-byte matches need examining: combining two literal lengths can
remove at most one extension byte, so replacing a longer match necessarily
increases the encoded size. Narrowing the pass this way preserved output on
the 28-frame corpus and 1,000 synthetic cases. In three private-frame Node
measurements, five warmed alternating batches of ten passes gave median CPU
times of 0.65 → 0.49 ms, 5.07 → 4.58 ms, and 2.75 → 2.53 ms per pass.

For the same 28 private frames, five changed and none grew. The actual
udon-rs instruction count across the corpus fell from 846,604,261 to
843,076,795 (0.42%); the five changed frames individually fell by 0.12% to
3.71%. Their ten before/after frames were also decoded byte-for-byte with
liblz4 and the original UdonSharp decoder in Unity 2022.3.22f1 / Worlds SDK
3.6.1. A further 1,000 synthetic cases round-tripped without increasing the
estimated cost or size. On one changed private frame the additional pass
used a median 10.4 ms of Node CPU time across seven warmed runs. Actual
encoding overhead and decoder improvements depend on input and environment.

The frame header already sets the LZ4 block-independence flag to zero. In a
later compressed block, if its first literal and its offset-one match repeat
the previous block's last byte, the match can start one byte earlier. The
existing [LZ4 frame specification](https://github.com/lz4/lz4/blob/dev/doc/lz4_Frame_format.md)
permits references to the preceding window for linked blocks. This rewrite is
performed in the same post-pass as zero-byte match elimination and accepted
only when the frame is no larger and the estimated cost decreases. Three
full-HD payloads in the 28-frame corpus each became one byte smaller. liblz4
and the udon-rs probe decoded all six before/after frames exactly, as did the
original UdonSharp decoder in Unity 2022.3.22f1 / Worlds SDK 3.6.1. udon-rs
instruction counts were unchanged, so no decoder speedup is claimed.

### Extending matches into preceding literals

After zero-byte match removal, each retained match can be extended backwards
when the preceding bytes agree at the same offset. Its end remains fixed, so
later matches retain their positions. The pass considers only extensions that
do not increase the encoded size, decoder copy count, or length-extension
byte count; it then checks the complete frame before accepting it. Linked
blocks may use preceding block history, and the usual final literal and match
constraints remain satisfied.

Compared with the zero-byte and boundary passes, all 28 private frames became
smaller: 7,324,091 → 7,322,649 bytes in total. The udon-rs count was
843,076,795 → 843,073,843 instructions, with no individual increase in this
corpus. The original UdonSharp decoder and liblz4 both recovered all 28
payloads exactly. Tests also covered 1,872 constructed combinations around
match, offset and length-extension boundaries. In five warmed alternating
Node batches of ten post-passes on four private inputs, median CPU times were
1.33 → 1.89, 6.26 → 7.21, 6.25 → 7.88 and 2.59 → 3.48 ms per pass. These
measurements exclude the preceding match searches and do not establish
browser or end-to-end performance.

The budgeted merge and the subsequent zero-byte/boundary rewrites share their
parsed match records rather than decoding the frame structure a second time.
The selected frame's block headers are checked because a block may become raw
after the budgeted merge. Combined and separate passes produced identical
output for 32 private frames under four budgets each. On one match-heavy frame
with 5,000 spare bytes, five warmed alternating Node batches of five passes
had median post-pass CPU times of 56.3 → 42.0 ms. Four smaller private inputs
varied by roughly 0–0.5 ms in either direction; these measurements exclude the
preceding candidate searches and are not browser measurements.

### Original UdonSharp decoder

The 28 final frames were also decoded by the original UdonSharp UdonLZ4
implementation in Unity 2022.3.22f1 with Worlds SDK 3.6.1. The test used
the original decoder source and equivalent queue-array helpers; the test
receiver was adapted to its API. Every decoded payload matched its reference
bytes. This checks these inputs, not every valid LZ4 frame.

With automatic output sizing, two runs of the preceding encoder's frames
completed in 462 and 423 frames (2.99 and 2.68 seconds), while two runs of the
current frames completed in 309 and 659 frames (2.06 and 6.80 seconds). The
large variance precludes a reliable timing conclusion for this decoder. Its
5 ms coroutine budget, Editor scheduling, logging and external load affect
these numbers.

### Avoiding duplicate searches

Each candidate records whether any match search stopped at its depth limit
while another candidate remained inside the LZ4 window. If no search reached
that limit, a later candidate with the same match threshold and lookahead but
greater depth necessarily makes the same choices and can be skipped. The
previous candidate was already evaluated against the same size and decoder
cost limits. The polynomial power table is also shared between blocks; two
cached full-size blocks consequently need one such 16 MiB table rather than
two. This excludes other arrays and runtime overhead.

On three 128 KiB synthetic inputs, seven warmed alternating Node measurements
had median encoder CPU times of 105.1 → 65.9 ms for noise, 25.8 → 23.7 ms
for uniform bytes, and 210.4 → 140.5 ms for mixed patterns. Each output was
byte-identical to the previous encoder. Actual savings depend on whether a
search reaches the depth limit, the input and the browser; no universal CPU
or end-to-end conversion speedup is implied. A separate precomputed-index
experiment was not adopted: it required extra memory and its CPU benefit was
not consistent in measurements. The decode-first candidate selection and
size limits remain unchanged. In addition to the regression tests, 250
randomized inputs and a multi-block input produced byte-identical frames to
the previous encoder. All 28 private slide payloads used above also produced
byte-identical frames, preserving the measured decoder behavior for that
corpus.

On one private slide payload, two CPU-time comparisons in opposite order
were 32.1 → 34.6 seconds and 36.9 → 37.3 seconds. This sample did not show
an improvement; the check itself and measurement variation have a cost when
few searches can be skipped. The measurements do not represent all slides.

For match-search blocks larger than 1 MiB, powers of the rolling-hash base are
stored as separate quotient and remainder tables. Their product gives the
same 32-bit power; the hash comparison is rearranged algebraically and still
verifies matching bytes. The tables need about 16 KiB rather than 16 MiB for a
4 MiB block. Smaller blocks keep a full table to favor CPU time. All 4,194,305
possible powers through 4 MiB were checked exactly, as were 500 synthetic
encodings and three private frames. One isolated Node run of the 4.95 MB
input's 64-depth search had peak RSS of 124,948 → 108,568 KiB; this is not a
browser-memory measurement. Single full-encoder CPU comparisons on three
private inputs were 34.1 → 32.1, 41.9 → 41.6 and 43.6 → 43.9 seconds. CPU
time varies with input and runtime, and the last sample was slightly slower.
In reverse-order measurements, two inputs showed 47.3 vs 36.1 and 61.5 vs
42.6 seconds (new vs old), while separate concurrent cold processes for the
first input measured 40.6/41.4 seconds new and 42.2/42.3 seconds old. The
order and environment effects prevent a firm CPU-time conclusion.

### Measuring literal-merge candidates without allocating frames

The literal-merge post-pass now calculates the encoded size of each binary
search candidate without allocating its frame. For the production decoder
cost model, it also counts the candidate's sequence dispatches, copy calls and
extension bytes directly, and encodes only the selected result. The generic
callback path still encodes candidates before calling an arbitrary scorer.
The size and scoring checks preserve the previous search and tie behavior.

For 28 private frames, four size budgets per frame and the production cost
model produced byte-identical output to the preceding implementation. The
size-only path was also checked with 4,200 randomized candidate comparisons,
and the work-counting path with 3,500 randomized comparisons. On three of
those private inputs with 5,000 spare bytes, seven warmed alternating Node
measurements had median post-pass CPU times of 13.1 → 2.2 ms, 8.1 → 2.7 ms,
and 125.4 → 49.2 ms. This measures the post-pass alone with that budget;
complete compression can still take much longer, and device results vary.

The selected frame is written directly into its final buffer using the block
sizes already measured for candidate selection. This avoids allocating a
raw-block-sized temporary buffer for every compressed block and copying the
encoded payload a second time. The frame bytes matched the preceding writer
in 128 comparisons over 32 private frames and four size budgets. In one Node
memory observation on a 2.46 MB input with two frame writes, the increase in
`arrayBuffers` was about 7.0 MB before and 2.0 MB after; this is not a peak
browser-memory measurement. On three private inputs, warmed alternating Node
batches measured post-pass CPU times of 3.20 → 2.30 ms, 1.71 → 1.93 ms, and
49.1 → 52.4 ms. The latter two samples traded some CPU time for less temporary
buffer allocation; whole-conversion results can differ.

An exploratory offset-remapping pass examined all 37,703 overlapping matches
of at most 64 bytes in the same 28 outputs. For each match it searched up to
256 earlier positions in a four-byte hash chain for an equivalent match that
would require fewer doubling-copy calls. It found no improvement in this
corpus. This bounded experiment does not rule out improvements from deeper
searches, other inputs, or longer matches; the pass was not enabled.

A separate tie-break experiment preferred the shorter frame when two deep
search candidates had exactly the same estimated decoder cost. It changed no
output on 500 small synthetic inputs. Because this result does not establish a
benefit on representative slides, and changing the intermediate parse can
affect the later literal-merge choice, the production selection remains
unchanged.

A 16-bit rolling-hash prefilter was also tested. Exact byte comparison still
preserved output, but collisions increased encoder CPU time: two private
inputs took 34.0 → 38.1 and 42.5 → 46.5 seconds, and a crafted collision-heavy
input took 70 → 133 ms. It was not adopted. These are individual Node
measurements rather than a complete browser benchmark.

A forward-extension experiment checked whether an existing match could be
extended into the literals that follow it without increasing either decoder
copies or extension bytes. It found no opportunities in the 28 current
frames, consistent with the encoder already extending matches forwards until
they differ. The extra pass was not enabled; this result does not rule out
opportunities in frames produced by other encoders.

Caching the current match's rolling-hash value was also tried as a way to
reduce hash arithmetic. The prototype preserved the output on 500 short
inputs, but one representative private payload used 46.2 seconds of Node CPU
time versus 34.8 seconds without the cache. The experiment was stopped and
not adopted; the measurement is a single sample, not a browser benchmark.

The four-byte match-prefix comparison now reads each prefix as a single
little-endian word, keeping the current position's word across candidate
checks. The DataView uses the input's byte offset, including for unaligned
subarrays. Byte-for-byte comparisons against the prior encoder covered 500
synthetic search inputs, 20 complete synthetic encodings, and one complete
private slide payload. Four alternating warmed Node measurements of one
2048-depth, four-byte-lookahead search on three private inputs had median
CPU times of 535 → 407, 1,138 → 1,083 and 820 → 769 ms. One complete
private encoding measured 31.7 → 27.2 seconds of CPU time, with identical
frame bytes. These are limited Node measurements, not browser or general
end-to-end guarantees.

Reusing the same word for hash calculation and changing index insertion to
word reads was also tested. Although some measurements improved, the deep
search results varied in both directions, so that additional change was not
adopted. Replacing each match result object with a shared offset variable
likewise showed no consistent improvement in deep-search measurements and
was not adopted.

After a matching four-byte word, the match-length scan now attempts three
more words together before the next loop iteration. A mismatch still falls
back to exact word and byte comparisons; the match choices do not depend on
hash collisions. The previous and new search frames matched on 500 synthetic
inputs, as did 20 complete synthetic encodings and one complete private
payload. Four warmed alternating Node measurements of a depth-2,048,
four-byte-lookahead search on three private inputs had median CPU times of
403 → 342, 909 → 711 and 779 → 694 ms. On a synthetic workload dominated by
short matches, eight alternating measurements had medians of 234.3 → 233.5 ms.
One complete private encoding took 23.6 → 22.1 seconds of CPU time and
produced identical bytes. These are limited Node measurements, not browser
or general end-to-end guarantees.

When an emitted match ends past the last searchable position in its block,
the remaining hash-chain insertions are skipped: that index cannot be read
again. Matches followed by searchable positions retain the same insertions.
Frames matched the previous encoder on 2,000 synthetic inputs, including
multi-block uniform data, and on one 4.95 MB private input. Six warmed
alternating Node measurements for a 4 MiB uniform payload had median complete
encoder CPU times of 112.4 → 40.7 ms. One reverse-order private-input run
measured 33.34 → 26.19 seconds with identical output; this single result does
not establish a general speedup. Actual benefit depends on final-match length
and the proportion of time spent in other searches.

Two hash-chain workspace reuse prototypes were not adopted. Reusing both
tables produced identical frames on 2,000 synthetic inputs but, in one
reverse-order private-input measurement, CPU time was 21.23 → 24.23 seconds.
For 4 MiB of synthetic noise, one Node run measured peak RSS of
121,224 → 124,976 KiB. Reusing only the previous-position table also showed
no consistent CPU benefit and measured peak RSS of 120,768 → 124,516 KiB on
that noise input. These are limited measurements, but did not justify the
additional retained workspace.

For a fixed search depth and lookahead, the encoder also records the shortest
match it actually emits. Raising the minimum match length up to that value
cannot change the emitted matches or index updates: a shorter match that was
postponed advances by one byte under either threshold. Duplicate profiles can
therefore be skipped, while the existing depth-limit check remains conservative.
Across 2,000 synthetic inputs, complete frames matched the preceding encoder
byte-for-byte. One 4.95 MB private input also matched exactly and measured
28.2 → 26.6 seconds of Node CPU time in a single reverse-order comparison.
For synthetic 128 KiB runs and mixed patterns, eight warmed alternating Node
measurements had median CPU times of 10.3 → 3.5 and 64.8 → 29.2 ms. The
measurements are workload-dependent and do not establish browser performance.
An earlier prototype recorded all search positions; on the large input its
reverse-order comparison took 25.9 → 28.6 seconds and it was not adopted.

The initial depth-64 searches now record whether they exhausted the search
budget. If they did not, their frames are also evaluated at the corresponding
depth-2,048 candidate positions, in the original order, instead of searching
the same candidates again. Later depths are skipped under the existing
completion rule. Complete frames matched the preceding encoder on 3,000
synthetic inputs and two private inputs, including a 4.95 MB multi-block
payload. On those private inputs, single reverse-order Node CPU measurements
were 21.8 → 20.4 and 33.9 → 31.7 seconds; timing varies by input and runtime.
For synthetic 128 KiB noise, eight warmed alternating measurements had
median CPU times of 18.09 → 15.21 ms. The early frames are retained until the
first deep profile is evaluated, so additional compressed data can remain
live temporarily. In one separate 4 MiB noise run, peak Node RSS was
140,848 → 138,028 KiB and CPU time was 1,468 → 1,154 ms; this is not a
browser peak-memory or general performance guarantee.

If the initial fast frame is at least 90% of the input size, the encoder now
defers building a block's rolling-hash prefix table until an actual long-match
comparison needs it. More compressible frames still build the table eagerly.
This choice affects only when the same exact hash filter is constructed;
matching bytes are still verified. The threshold is a performance heuristic,
not a compression-format change. Full frames matched on 1,500 synthetic
inputs and on a private slide; a separate near-incompressible input that
subsequently needed the deferred table and a 4.70 MB mixed synthetic/private
multi-block input also matched. In one 4 MiB noise comparison, peak
Node RSS was 136,616 → 126,136 KiB and CPU time was 1,362 → 879 ms, with
identical frame bytes. One reverse-order private-slide measurement was
23.27 → 21.98 seconds. Earlier unconditional deferral prototypes were slower
on that slide (20.17 → 26.37 and 20.55 → 24.54 seconds) and were not adopted.
These are limited Node measurements, not browser or general peak-memory
guarantees; deferral can still add work when a table is ultimately needed.
