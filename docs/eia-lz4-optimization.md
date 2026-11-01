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

Payloads can also reuse a frame when a different buffer has identical
contents. A sampled fingerprint is only a filter: every reuse checks all
bytes, and at most four fingerprint collisions are compared per lookup. The
cache holds at most 32 entries and 1 MiB of strongly retained input and frame
bytes. Inputs up to 64 KiB are copied; larger inputs are referenced weakly,
so their backing buffers are not retained by this cache. Without WeakRef,
larger inputs fall back to identity caching. The cache is discarded after the
conversion.
The 28 private payloads contained no identical complete inputs, so this is a
workload-dependent optimization. For a repeated synthetic 16 KiB payload,
six warmed alternating Node measurements had median CPU times of 5.38 ms for
recompression and 0.019 ms for content lookup, with identical frame bytes.
In a separate deliberately cheap no-op-encoder test over 1,000 distinct 16 KiB
buffers, the median batch CPU time increased from 1.7 to 9.4 ms due to cache
bookkeeping and input copies. These measurements exclude browser and other
conversion work; the cache may provide no benefit when content does not repeat.

EIA serialization reuses cached compressed rectangles; on a cache miss,
a single rectangle is passed directly, while multiple are concatenated.
Geometry and byte lengths are checked. Crop selection uses one buffer.
In headless Chrome, 20 batches of five synthetic extractions gave medians of
0.06 → 0.06 ms (one 192×192 rectangle), 0.14 → 0.08 ms (two), and
0.60 → 0.38 ms (eight). Sixteen synthetic decks with 218 rectangles produced
identical lz4js EIA archives; five decks with 75 rectangles also matched using
the production encoder. A copy-only test measured 0.02 / 0.24 / 0.93 ms for
64 KiB / 1 MiB / 4 MiB; reuse took <0.01 ms (20 batches of ten). Full-width
crops now copy contiguous rows once: Chrome medians for width 1,920 were
0.12 → 0.04 ms at height 540 and 0.22 → 0.10 ms at height 1,080 (20 batches
of five). Applying a 1,920×540 stripe to a 1,920×1,080 image took
1.8 → 1.7 ms in Chrome (16 samples); outputs matched. Short buffers use the
row-wise path. These are not end-to-end timings. For 25 cached two-rectangle
deltas, Node serialization medians were 14.60 → 0.30 ms, avoiding 37.5 MiB
of concatenation per run (eight samples; synthetic repeated cached data).

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

Identical images can use a one-pixel delta subject to size and depth limits.
Crops reuse the input only without suppressed differences and when rectangles
cover every component. Five production and 1,500 lz4js decks matched; the
last 1,000 had 4,000 deltas and 1,866 reuses. Chrome
crop medians were 12.75 → 11.15 ms (exact) and 13.10 → 12.80 ms (suppressed),
eight samples, encoder stubbed. Local flag tracking gave Chrome scan medians
2.60 → 2.65 ms (equal), 3.90 → 3.50 ms (small), 4.00 → 3.70 ms (mixed);
16 samples, 3,000 matching masks and stats. Not end-to-end measurements.

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

Pool order and crop dependencies remain; 400 RGB/RGBA pairs matched a full-mask reference. For 640×360 RGBA, eight Node batches of 100 had
medians of 0.99 → 0.0038 ms dissimilar and 0.89 → 0.71 ms similar. Word
checks skip equal pixels/groups. For 1920×1080, nine-sample RGBA medians were
4.81 → 3.18 ms identical and 3.01 → 1.81 ms sparse aligned; unaligned were
4.86 → 3.50 and 3.00 → 1.59 ms. RGB medians were 4.37 → 1.23 and 2.51 →
1.54 ms. Pool matching avoids redundant and browser Buffer-copy checks; Node
retains native equality. Headless Chrome on 1280×720 RGBA gave medians (10
samples) of 3.6 → 0.4 ms identical and 2.8 → 0.9 ms sparse for non-exact
matching, and 3.5 → 0.4 ms exact. These are matching-only timings. The bundle
passed in a VM without process or global Buffer.

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

A remapping pass found no improvement in 37,703 overlapping matches of at
most 64 bytes across 28 outputs, searching up to 256 earlier hash candidates.
For five current private outputs, 23 matches exceeded 65,535 bytes. Of those,
ten had non-unit offsets below 32,768; checking larger multiples of their
existing offset found no copy-count reduction. Other candidate offsets and
inputs remain untested; no remapping pass is enabled.

Preferring the shorter frame on equal estimated cost changed no output on
500 synthetic inputs. It was not adopted without representative benefits.

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

For indexed overlap shrinking, pairs of boxes that both lacked an interior
when the index was built are skipped. Such boxes cannot satisfy any of the
strict-containment checks while edges contract; inversion still falls back to
the ordered scan. On two synthetic 10,000-box workloads with 2% rectangles
and 98% points, eight warmed alternating Node measurements had median times
of 13.09 → 6.84 ms and 14.09 → 11.16 ms, with identical results. A dense
all-rectangle workload measured 186.36 → 187.08 ms. These samples are not
browser measurements or a guarantee for other image distributions.

Animation similarity comparison now unrolls the RGB and RGBA channel loops
and skips absolute-value calculations for equal pixels. For 640×360 synthetic
frames, twelve warmed alternating Node samples measured median per-comparison
times of 0.744 → 0.454 ms (identical RGB), 0.784 → 0.283 ms (sparse RGB
changes), 0.908 → 0.459 ms (identical RGBA), and 0.758 → 0.315 ms (sparse
RGBA changes). The existing early exit remains for dissimilar frames. These
are Node microbenchmarks, not browser or end-to-end guarantees.

The animation cache key now hashes complete four-byte words instead of hashing
each byte separately, including any trailing bytes and unaligned buffer views.
The key is internal and only filters candidates: dimensions, format, and all
frame bytes are still checked on a hit, so collisions cannot reuse the wrong
animation. On one synthetic 1920×1080 RGB frame, ten warmed alternating Node
measurements had median key-generation times of 73.64 → 19.03 ms. This is a
microbenchmark, not a browser or end-to-end measurement; cache verification
still scans the frame on a hit.

For equally sized, complete RGB images, difference-mask generation now scans
tightly packed pixels directly and skips absolute-value work on exact matches.
Different dimensions and incomplete buffers retain the general path. Eight
warmed alternating Node measurements on synthetic 1920×1080 frames had median
times of 9.62 → 5.81 ms (identical), 9.35 → 3.12 ms (sparse changes), and
8.02 → 5.24 ms (different). These are per-scan microbenchmarks, not browser
or end-to-end timings; the threshold and early-stop mask are unchanged.

An independently searched block now allocates its compressed-output buffer
only when it emits its first match. A no-match candidate still becomes the
same raw block. Full encoded frames matched the preceding implementation for
150 short synthetic inputs and 128 KiB noise and run-pattern inputs. Six
warmed alternating Node measurements had median encoder times of 21.14 →
21.10 ms for noise and 4.21 → 4.19 ms for runs, showing no material CPU
change in these samples. In one separate 4 MiB noise run per version, peak
Node RSS was 128,700 → 124,852 KiB, with identical frame bytes; this is not
a browser-memory or general peak-memory guarantee.

A four-pixel RGB precheck gave Node medians 2.47 → 0.59 ms (equal),
1.38 → 0.83 ms (sparse), 2.49 → 3.08 ms (dissimilar), 1.61 → 2.10 ms
(small changes), eight samples at 1280×720. A sample-gated prototype gave
Chrome scan medians 2.5 → 0.9 ms (equal), 2.7 → 1.3 ms (sparse), 3.5 →
3.3 ms (small), 3.7 → 4.1 ms (mixed), 16 samples at 1920×1080. Chrome crop
medians were 11.10 → 10.95 ms (exact), 12.55 → 12.60 ms (suppressed), eight
samples with encoder stubbed. Neither variant was adopted.

A prototype combined candidate-size and decoder-work scans in the literal
post-pass. On a synthetic 512 KiB mixed input, six warmed alternating Node
measurements with four spare-byte budgets had median post-pass times of
14.80 → 14.92, 14.41 → 13.96, 15.55 → 15.07, and 16.27 → 16.31 ms.
The prototype also evaluates work for candidates that exceed the size limit.
The results did not establish a useful improvement, so the existing separate
scans remain. These measurements cover only one synthetic input and do not
rule out other approaches.

The animation cache word hash now feeds alternating words into two independent
32-bit lanes, reducing dependent arithmetic. This changes only internal cache
keys. Since changes confined to one lane have only a 32-bit filter, collisions
may be more likely for some inputs; matching dimensions, format and every byte
are still verified, including in a test with a deliberately constructed
collision. For one synthetic 1920×1080 RGB frame, twelve warmed alternating
Node measurements had median key-generation times of 19.73 → 9.26 ms. This
is a microbenchmark and does not include collision checks, canvas conversion
or cropping; it is not a browser or general end-to-end measurement.

Both words in each pair are now mixed into both accumulators. The previous
single-lane collision constructed by the cache test no longer collides, while
byte-by-byte verification remains mandatory for all hash matches. Twelve
warmed alternating Node measurements on one synthetic 1920×1080 RGB frame
had median key-generation times of 8.81 → 9.13 ms. A simpler rotation-and-add
mix was rejected after 256 solid-gray test frames produced only 201 keys.
This small sample does not establish collision resistance or browser
performance; the hash is not a security boundary.

A match that already reaches the last legal match byte cannot be beaten by a
later start. The search therefore skips lazy lookahead in that case. Frames
matched the preceding search on 1,000 synthetic inputs and the complete encoder
on 100 of those inputs, plus 512 KiB uniform, periodic and noise inputs. Six
warmed alternating Node measurements of the complete encoder had medians of
4.86 → 3.51 ms (uniform), 3.86 → 3.04 ms (periodic), and 90.04 → 92.07 ms
(noise). These samples are noisy and do not establish browser performance or
a general speedup; no format or selected bytes changed in the comparisons.

A dynamically growing compressed-block output buffer was tested to reduce
allocation for highly compressible data. Its complete frames matched the
preceding encoder on 500 short synthetic searches, 60 complete short
encodings and four 512 KiB workloads. Six warmed alternating Node measurements
had median complete-encoder times of 136.01 → 142.03 ms for a mixed pattern
and 91.49 → 96.65 ms for noise; a periodic pattern measured 2.40 → 2.63 ms.
In one separate 4 MiB periodic-data run per version, peak Node RSS measured
102,348 → 101,584 KiB. Because the measured CPU regressions outweighed the
small observed RSS reduction, the growing-buffer prototype was not adopted.
The numbers are limited samples, not browser or general memory measurements.

A candidate-match prefilter comparing the last four bytes before the existing
rolling-hash check was tested. It preserved search output on 500 short
synthetic inputs and complete encoder output on 50 of them, four 256 KiB
workloads and one private slide. Six warmed alternating Node measurements of
the complete encoder had median times of 44.59 → 46.11 ms for a mixed pattern
and 44.97 → 45.81 ms for noise. A single reverse-order private-slide CPU
comparison measured 20.30 → 21.49 seconds with identical output. These limited
measurements did not justify the extra check, so it was not adopted.

An audit of the fitted decoder-work model found two reversed candidate rankings
among 40 pairs derived from the original four-input fitting data. A least-
squares refit to those pairs eliminated both reversals on that same data;
on 57 other previously measured pairs, both models agreed with 51 measured
rankings and tied on six. This is not independent proof of either model's
accuracy: several inputs and candidate-generation methods overlap with earlier
experiments, and native extern work is excluded. Re-encoding the four private
inputs using the refitted weights produced byte-identical frames to the current
weights, so it provided no measured improvement on those inputs. The current
weights remain in use; further representative VM measurements are needed to
justify changing candidate selection.

Bounding-box selection now skips merge limits that are at least the current
box count: those iterations clone and rescore the same boxes without merging
or improving the score. Results matched the previous implementation for 300
synthetic inputs, with a separate reference test retained. Eight warmed
alternating Node measurements of batches of 200 calls had median times of
2.27 → 0.46 ms for one box and 2.94 → 1.01 ms for two boxes; eight-box batches
were about 6.60 ms for both. These microbenchmarks do not include the rest of
image cropping, compression, or browser overhead.

When a match or literal length needs at least four LZ4 extension bytes of
255, the encoder writes them as one fill instead of a byte-at-a-time loop.
The same bytes are emitted. Searches matched on 500 short synthetic inputs,
and complete frames matched on 50 of them and four larger workloads; tests
also cover extension boundaries and a long literal. Eight warmed alternating
Node measurements had median full-encoder times of 18.81 → 17.29 ms for a
4 MiB uniform input and 45.06 → 45.09 ms for a 256 KiB mixed input. Noise
measured 44.87 → 45.26 ms. These limited microbenchmarks are not browser or
end-to-end measurements.

When a match hash has no candidate in the current window, the encoder now
returns before reading the target word. Search frames matched the preceding
implementation on 500 short synthetic inputs, as did complete frames on 50 of
them, four 256 KiB synthetic inputs and one private slide. Eight warmed
alternating Node measurements of the complete encoder had median times of
45.96 → 44.84 ms for a mixed input and 45.97 → 44.82 ms for noise. A periodic
input measured 1.62 → 1.90 ms; those short measurements varied substantially.
One reverse-order private-slide CPU comparison measured 20.75 → 20.15 seconds
with identical output. These are limited measurements, not browser or general
performance guarantees.

The decode-first search now retains the shortest candidate tied on estimated
work and runs the literal post-pass on it as well as the original choice. It
selects the lower-work final frame, preferring fewer bytes if final work ties;
both remain within the existing size ceiling. The additional pass runs only
when such a shorter tie exists and can increase encoder CPU and retained memory.
Among 3,000 deterministic synthetic inputs, one final frame changed; none had
a higher final work estimate or, on equal estimated work, a larger frame. In
that case the frame remained 469 bytes, while its estimate fell from 756 to
718 and the TypeUdon/udon-rs probe reported 32,738 → 31,429 VM instructions.
Both frames decoded correctly in the probe and liblz4; the new frame also
round-tripped through lz4js. This is one synthetic example and does not prove
a speedup for other slides, browsers, or decoder implementations.

A separate prototype also retained a same-size, equal-work candidate when its
encoded bytes differed, and compared both post-processed outputs. None of
3,000 deterministic synthetic inputs changed the final frame. One private
slide also remained byte-identical; single sequential Node CPU measurements
were 20.04 seconds for each version. The prototype adds candidate comparison
and can run another post-pass, so it was not adopted without evidence of a
benefit. This bounded experiment does not rule out useful cases elsewhere.

Connected-component extraction can consume an exclusively owned mask; its
default API preserves input. Bounds and order matched 500 randomized masks.
Six Node samples at 1280×720 gave medians 12.65 → 12.52 ms (solid),
1.70 → 1.06 ms (sparse), 3.57 → 3.30 ms (rectangle).

Horizontal-run traversal matched 3,000 randomized masks. Six Node samples
at 1280×720 gave 12.44 → 3.66 ms (solid), 3.33 → 1.60 ms (rectangle),
28.28 → 25.46 ms (checkerboard), 7.33 → 7.04 ms (sparse). One 1920×1080
solid run had peak RSS 100,496 → 68,660 KiB.

For complete binary masks, the crop path skips zeros using indexOf. Ten
thousand randomized masks matched previous bounds and consumed bytes; 1,000
synthetic lz4js decks produced identical archives. Twelve Chrome samples at
1920×1080 had medians 0.85 → 0.40 ms (empty), 1.30 → 0.55 ms (sparse),
6.20 → 4.30 ms (solid), 2.30 → 0.65 ms (rectangle). Eight crop samples gave
11.20 → 9.50 ms (exact) and 13.10 → 11.50 ms (suppressed pixel), encoder
stubbed. These measurements are not end-to-end.

Parent selection now reuses a discarded difference mask for later candidates,
while retaining the current winner separately. A reused workspace is cleared
first, including the unvisited tail of an early-stopped scan. With at least
three evaluated parents this bounds concurrently needed masks to two rather
than allocating one per candidate; 120 randomized candidate sets and four
search limits matched the previous selections and masks. Eight warmed
alternating Node measurements on a synthetic 1280×720 image with eight parent
candidates had median selection times of 10.59 → 9.56 ms. This excludes
thumbnail generation, compression, browser overhead and other workloads.

The RGB diff scan now returns a zero mask immediately when both complete,
equally sized images are exactly the same view of the same storage. Different
views, copied images and dimensions continue through the normal comparison.
Eight warmed alternating Node measurements on a synthetic 1920×1080 frame
had median diff times of 5.50 → 0.020 ms for the same buffer and 5.48 →
0.020 ms for a distinct view of the same bytes. Equal copied buffers measured
5.55 ms in both versions, and a changed buffer about 3.16 ms in both. This
helps only when the input storage is shared; it is not a general browser or
end-to-end measurement.

Large identical inputs now participate in the content cache through weak
references, without keeping their backing buffers alive solely for reuse.
A collected reference or an unavailable WeakRef simply causes a cache miss;
compressed data remains subject to the existing 1 MiB and 32-entry limits.
The inputs must remain immutable during conversion, as already required by
the cache. Tests cover large-input hash collisions, collection, WeakRef absence
and the retention limit. Eight warmed alternating Node measurements of a
repeated synthetic 256 KiB noise payload had median compression-lookup times
of 42.37 → 0.115 ms, excluding creation of the copied input. Conversely, a
deliberately collision-heavy batch of 20 distinct 256 KiB inputs with a
no-op encoder measured 0.008 → 7.37 ms due to full-byte checks. Real benefit
depends on repetition, collisions, garbage collection and browser behavior.

Content-cache equality checks now inspect the first and last 16 bytes before
the middle, but still verify all bytes before reuse. In eight warmed alternating
Node measurements of 20 distinct synthetic 256 KiB inputs with matching
sampled fingerprints and differences near the end, median batch time with a
no-op encoder fell from 7.79 to 0.034 ms. Identical inputs measured 2.17 →
2.11 ms; differences near the start measured 0.027 → 0.049 ms. These are
artificial worst- and best-case microbenchmarks, not conversion or browser
performance guarantees.

For inputs of at least 1 KiB, the cache verifies the middle of matching
fingerprints in four-byte words, then checks any remaining bytes individually.
Unaligned views and differing backing offsets are supported. Eight warmed
alternating Node measurements of equal synthetic buffers had median lookup
times of 0.108 → 0.066 ms at 256 KiB and 2.59 → 1.58 ms at 6.22 MB; a
difference near the middle of the larger buffer measured 1.32 → 0.79 ms.
These timings include cache lookup but not compression or copying input and
do not establish browser performance.

A prototype shifted one matched byte into literals at an LZ4 extension-byte
boundary, then doubled the match offset when the bytes allowed it and the
frame did not grow. For a constructed two-match frame with offset 519, the
TypeUdon/udon-rs probe reported 7,103 → 6,867 instructions at the same size;
lz4js decoded both frames. However, changing an offset-one match to offset two
in another constructed case increased instructions from 5,961 to 6,041,
because that decoder has an offset-one specialization. After excluding that
case, the prototype changed none of 5,000 synthetic search frames or 28
private candidate frames. It was not adopted without evidence of benefit on
frames actually produced by the encoder. These bounded experiments do not
rule out useful cases in other workloads or decoders.

### Offset-one specialization: cross-decoder comparison

An offset-one rewrite prototype retained frame size and reduced TypeUdon/udon-rs
instructions on 28 private candidate frames, from 1,168,388,651 to
1,168,293,339 in total. It also constrained the older UdonSharp decoder's
Array.Copy count not to increase. Further measurement showed this constraint
was insufficient: running an exported UdonSharp UdonLZ4 assembly on udon-rs for
16 synthetic before/after pairs produced exact bytes but increased instruction
counts in all 16, from 1,296,833 to 1,298,472 in total. A separate matrix of
match lengths 4 through 1,024 and offsets 1, 2, 3, 4, 8, 16, 32 and 64 found
offset one was consistently more expensive in that artifact. These results
measure the exported assembly on udon-rs, not VRChat client wall time; the
source of the measured assembly was UdonLZ4 revision
`2127e192fae3d32459093b24314c7f4d9260b3c5`. Its match-copy code agrees with
the checked-in UdonSharp source, although the complete source files differ.

Because the TypeUdon and UdonSharp decoders favor different offsets, the
prototype was removed rather than silently trading one decoder's instructions
for the other's. A direct Unity Editor A/B run could not be completed: no X
display was available, and `unity run -nographics` exited before the existing
play-mode probe ran. No claim is made about Unity wall time. The remaining
encoder preserves standard LZ4 compatibility and its earlier selection policy.

A further prototype replaced an offset-one match with an offset of 8–64 only
when the same byte was already available in the current block, preserving the
frame size. One of 28 private frames from an earlier encoder stage changed:
TypeUdon/udon-rs instructions fell from 87,709,555 to 87,709,283, and the
exported UdonSharp assembly on udon-rs fell from 21,438,626 to 21,438,269;
both decoded exactly. However, the frame generated by the current complete
encoder for that same slide did not change, nor did four other current frames
or 10,000 synthetic search frames. Scanning five private frames in warmed Node
runs took median times of about 0.04–0.84 ms per frame. The prototype was not
adopted without a demonstrated benefit on current output. These observations
are bounded and do not rule out useful cases elsewhere.

Thumbnail averaging now derives each cell's pixel count from its bounds
instead of incrementing a counter for every pixel. It matched the preceding
implementation for 500 synthetic image/grid combinations, including empty
cells. Twelve warmed alternating Node measurements had median thumbnail times
of 3.56 → 3.46 ms at 1920×1080 and 0.134 → 0.123 ms at 256×256. These are
small local measurements and do not establish browser or end-to-end speedups.

When more than 16 parent candidates are available, thumbnail ranking keeps
only the first top-K available parents in stable score order. Since each
channel difference is non-negative, scoring a later candidate can stop once
it cannot beat the current worst retained score; ties continue to favor the
earlier candidate. Thumbnail lengths are still validated for every candidate.
Selections and masks matched the previous implementation over 500 randomized
sets, including missing buffers, ties and non-integer limits. Ten warmed
alternating Node measurements of batches of ten selections with 120 synthetic
candidates had median times of 3.29 → 0.45 ms when most scores diverged early,
and 3.30 → 3.25 ms when each later candidate ranked better. These are local
microbenchmarks, not browser or whole-export measurements.

The match finder now returns the hash it already computed for the current
position, so inserting that position does not calculate it again. Other
insertions and match choices are unchanged. Search frames matched on 500 short
and 100 larger synthetic inputs, including unaligned views and offsets across
the 64 KiB window; 55 complete synthetic encodings and one private frame also
matched. Ten warmed alternating Node measurements of the complete encoder on
256 KiB inputs had median times of 43.57 → 39.83 ms for mixed data and
43.23 → 39.24 ms for noise. Uniform data measured 1.65 → 2.31 ms with high
variation at that short duration. One reverse-order private-slide CPU
comparison was 20.09 → 20.03 seconds. These are limited Node measurements,
not browser or end-to-end guarantees.

After the current-position hash reuse, reading the four-byte match word once
for both hashing and comparison was re-tested. Ten warmed alternating Node
measurements of 256 KiB inputs showed mixed/noise medians of 39.87 → 35.11 ms
and 39.66 → 35.67 ms, but one reverse-order private-slide CPU comparison was
19.97 → 22.74 seconds with identical output. A conditional variant limited to
near-incompressible inputs also regressed those synthetic mixed/noise medians
to 48.54 and 49.36 ms in a separate run. Neither variant was adopted; the
samples are not browser or universal performance measurements.

If lz4js emits only raw blocks, the encoder now returns that frame immediately.
Each raw block requires one copy and no sequence dispatch; all search profiles
use the same 4 MiB partition, and under the existing scoring and tie rules no
compressed block can lower the work estimate. The later literal pass also has
no matches to rewrite. This preserves the existing choice, including cases
where a deeper search could produce fewer bytes but the existing policy favors
the raw frame's lower estimated decode work.

Complete frames matched the preceding encoder on 1,000 synthetic inputs,
including unaligned views, and on all-raw and mixed raw/compressed multi-block
inputs. Eight warmed alternating Node measurements of the complete encoder on
256 KiB synthetic noise had median times of 40.86 → 0.203 ms; a mixed but
all-raw input measured 42.68 → 0.215 ms. A compressed uniform input measured
1.79 → 1.65 ms with substantial variation. In one separate 4 MiB noise run per
version, CPU time was 751 → 10 ms and peak RSS 124,716 → 91,328 KiB, with
identical output. These Node samples exclude browser and end-to-end overhead.

For near-incompressible multi-block frames, each block now records when an
exhaustive search emitted no matches. With the same lookahead, a subsequent
search at least as deep and with an equal or higher minimum match length must
also emit none, so that block's search can be skipped. The proof is not used
if the search budget was exhausted; block statistics are otherwise combined
in the same order as before.

Frames matched the previous encoder on mixed raw/compressed multi-block
inputs, including three unaligned synthetic inputs and one 4.95 MB private
slide; a deterministic mixed-block fixture remains in the tests. Four warmed
alternating Node CPU measurements for a 4 MiB noise block followed by a
complex 64 KiB block had median total times of 2,728 → 1,719 ms. A different
short-match tail measured 1,032 → 822 ms. One reverse-order private-slide
comparison measured 25.54 → 24.81 seconds with identical output; the proof
path was not enabled for that compressible input. These are limited Node
measurements and do not establish browser or general performance.

The empty-block proof applies across lookaheads: a postponed match requires a
longer future match, so an exhaustive empty search proves all widths empty.
Three full-size frames and 1,000 randomized small-block comparisons matched and
round-tripped. Four alternating Node samples gave middle CPU pairs of
1,763/1,763 → 1,585/1,598 ms (dense tail) and 733/737 → 531/539 ms (short).
In headless Chrome with the normal clock, the current encoder and commit
c1e7bb6 produced identical frames: 256 KiB mixed took 64.7 → 63.6 ms (six
samples, medians), and 4 MiB noise plus an 8 KiB tail took 818 → 578 ms (one
sample). On a 4.95 MB private slide, two runs each in alternating order took
26.08–26.41 → 23.32–23.43 seconds; the 58,479-byte frames matched and
round-tripped. These encoding-only timings are not end-to-end measurements.

Empty-block proofs are retained separately from the two-entry match-context
cache. This prevents eviction from repeating the same searches when a frame
contains three or more blocks, while keeping the larger prefix tables bounded.
Three- and four-block random inputs with a compressible tail produced the
same bytes as the preceding encoder and round-tripped with lz4js. In one Node
CPU comparison each, the three-block case took 6,595 → 2,754 ms and the
four-block case 8,170 → 3,318 ms. These are single synthetic measurements,
not browser or general performance guarantees.

Lazy lookahead is now skipped when the current match is shorter than the
profile's minimum: postponing or rejecting that match both advance one byte.
The current-position search still records exhausted budgets, which is what
matters for deciding whether a deeper search can change an accepted match.
The resulting frames matched the preceding encoder on 1,000 varied inputs,
1,000 reduced-block multi-block inputs, three full-size mixed-block inputs,
and one private slide. Four warmed alternating Node CPU samples for the dense
tail input had middle values 1,525/1,538 → 1,432/1,437 ms; the short-match
tail measured 543/545 → 537/546 ms. One reverse-order private slide sample
measured 26.16 → 25.85 seconds. These measurements are limited and do not
establish browser or general performance.

Candidates over the established size limit still search every block to retain
complete profile statistics, but no longer allocate and copy the final frame.
The earlier speed candidate also skips decoding its work estimate when its
size alone makes it ineligible. Three 4 MiB mixed-block inputs matched the
preceding encoder; each avoided nine approximately 4.2 MB frame copies. A
further 1,000 randomized reduced-block comparisons matched and round-tripped.
Four alternating Node CPU measurements showed middle pairs of 1,446/1,470 →
1,441/1,455 ms for the dense tail and 557/559 → 551/552 ms for the short-match
tail. One reverse-order private slide sample was 24.33 → 24.55 seconds with
identical output. These limited measurements do not establish a browser or
general speed improvement.

When a rolling-hash table has not yet been constructed and a candidate needs
at most eight matching bytes, the already-verified first word plus one final
word cover the entire range. This avoids building a prefix table for blocks
whose matches never require a longer comparison. On one mixed frame with a
64 KiB random 16-value tail, instrumentation showed that this avoided both
the prefix and power arrays (about 512 KiB). Four warmed Node CPU samples had
middle pairs of 529/531 → 516/529 ms; these are too close to establish a
speedup. The full-size frame and 1,000 randomized reduced-block cases were
byte-identical to the previous encoder and round-tripped with lz4js.

A broader variant applied the direct comparison even when a hash table was
already available. Four warmed Node samples improved the dense-tail case from
1,432/1,443 to 1,312/1,312 ms but regressed the short-match case from 522/538
to 547/556 ms. One private slide measured 24.55 → 24.92 seconds with identical
bytes. That broader variant was not adopted; these samples do not establish
browser performance.

An independent synthetic audit compared the selected frame with the plain
64-depth search frame on 1,000 generated inputs. The frames differed on 582;
all 1,164 frames in those pairs decoded correctly in the TypeUdon/udon-rs
probe. At equal size (87 pairs), the selected frame used fewer VM instructions
in 70 and tied in 17. When the search frame was smaller (141 pairs), the
selected frame used fewer instructions in all 141. When the selected frame
was smaller (354 pairs), it also used fewer instructions in all 354. These are
synthetic inputs, not measurements of Unity frame time or native extern cost.

The same comparison on three private slides gave selected/search frame bytes
50,811/50,826, 1,006,300/977,953 and 179,898/179,974. TypeUdon/udon-rs
instruction counts were 7,889,496/11,319,315, 130,949,323/174,080,394 and
23,227,655/34,343,404. All six frames decoded exactly. In the second case,
the selected frame is larger but requires fewer VM instructions; this is a
size/decode-work tradeoff, not a claim about Unity wall time or extern cost.

Fallback search now stores empty-block proofs outside the bounded context
cache so later profiles can reuse them after eviction. Three thousand
synthetic cases matched the previous encoder. On a constructed 12 MiB-plus
input with three match-free blocks and a nonconforming fast-frame tail, one
instrumented Node pair recorded proof constructions 11 → 5 and proof hits
19 → 25. Eight alternating Chrome samples gave median complete-encoder times
1,303.8 → 669.0 ms; 12,584,511-byte outputs matched and decoded. A regression
test checks the proofs and output after context eviction. This is a synthetic
case and does not establish ordinary slide performance.

For crop comparisons, an image already encoded by the per-conversion cache
now uses its exact cached frame size instead of scanning the input to prove a
lower bound. The comparison is against this encoder's output, so an exact
cached size preserves the master-versus-delta decision. A crop test checks
the same decision with and without the cache hit. In five warmed alternating
Node batches of five lookups for a cached synthetic 4 MiB image, median CPU
time fell from 67.00 ms to 0.005 ms; the benchmark supplies a stub compressed
result and measures only the bound comparison, not end-to-end conversion.

After emitting a match, the search index now inserts only positions within
65,535 bytes of the next search position. Earlier positions can never again
be referenced by LZ4, even when the match spans a much longer run. Search
frames matched the previous implementation for 120 runs crossing the window
boundary; 12 complete encodings and one private slide also matched. A
regression fixture covers a 200,000-byte run and following mixed data. On a
synthetic 1 MiB run followed by 64 KiB of noise, six warmed alternating Node
CPU measurements of the complete encoder had medians of 110.90 → 65.84 ms.
One reverse-order private-slide measurement was 24.44 → 24.63 seconds. These
samples do not establish browser or general performance.

For a match at offset one, every fully contained four-byte word consists of
the same byte and has the same hash. Index insertion reuses that hash, while
the final three positions still calculate their own hashes because they may
cross the match boundary. A local head variable avoids repeated hash-table
access during the run. The prior search and the final variant matched on 120
window-crossing runs and 12 complete encodings; the existing long-run fixture
also checks the transition into different bytes. On a synthetic 3 MiB input
with repeated long uniform runs, five warmed alternating Node measurements
of the first variant had median complete-encoder CPU times of 72.02 → 47.60
ms. One private slide comparison of that variant measured 26.41 → 24.44
seconds with identical bytes. A separate five-sample comparison after keeping
the head locally measured 55.89 → 51.10 ms. These inputs and limited samples
do not establish browser or general performance.

The same insertion shortcut now covers offset-two through offset-four matches
when at least 1,024 bytes remain to index. Their fully contained words repeat
with the match's period, so only two to four hashes need to be computed;
the last three positions still use ordinary hashing. Regression fixtures
cover each period, a match longer than the LZ4 window and the transition into
mixed data. On a synthetic 3 MiB input of long four-byte-period runs, five
warmed alternating Node samples of the complete encoder had median CPU times
of 63.76 → 50.81 ms. A single reverse-order private-slide comparison was
24.08 → 24.19 seconds with identical bytes. These measurements are limited
and do not establish browser or general performance.

A per-block cache for repeated searches at the same depth and lookahead was
also tested. It reused a small compressed block when raising the match
threshold could not remove any of that block's emitted matches. Although
1,000 randomized reduced-block frames matched, the measured benefit did not
justify retaining up to 256 KiB per cached context: four warmed alternating
Node samples gave middle pairs of 1,407/1,426 → 1,429/1,433 ms on a dense
tail, 522/533 → 520/532 ms on a short-match tail, and 498/501 → 486/493 ms
on a uniform tail. The cache was not adopted. These samples do not establish
browser or general performance.

When two four-byte words differ during match extension, the first differing
byte is now derived from the least significant set bit of their XOR. This
keeps the exact match length while avoiding a separate byte-by-byte scan of
the already-read word. A regression test covers all four byte positions;
120 long-run search frames, 12 complete long-run encodings, 500 varied short
encodings and one private slide matched the prior encoder. Four warmed
alternating Node measurements of a depth-2,048 search had middle CPU values
of 597.10/615.91 → 580.14/582.10, 908.92/911.84 → 874.82/879.21, and
1,164.43/1,174.21 → 1,112.11/1,128.57 ms on three private inputs. One
reverse-order complete-encoder comparison was 22.61 → 21.48 seconds. These
limited Node samples do not establish browser or general performance.

Match-length scans now compute the remaining legal length once per search
position instead of recomputing the block-end expression for each comparison.
The search frames matched on 120 varied long-run cases; 12 complete encodings,
500 shorter complete encodings and one private slide also matched. Four warmed
alternating Node samples of a depth-2,048 search had middle CPU values of
638.34/652.97 → 575.18/614.43, 977.48/984.72 → 918.33/921.91 and
1,210.92/1,232.00 → 1,159.82/1,160.78 ms on three private inputs. One
reverse-order complete-encoder comparison, run without concurrent tests,
measured 24.21 → 23.05 seconds. These limited samples do not establish
browser or general performance.

An 18-bit hash table was tested for the exhaustive 65,535-depth search only.
That search can still visit the entire offset window, so removing hash
collisions preserves the order of actual matching words. Three private search
frames matched, but two warmed alternating Node samples had CPU times of
1,144/1,211 → 1,230/1,528, 1,939/1,952 → 2,126/2,196, and 2,496/2,615 →
2,482/2,530 ms. The larger table was not adopted. This small sample does not
establish a general regression or browser behavior.

The pre-existing speed/size tradeoff was rechecked on two private payloads
whose current frames were larger than an earlier encoder stage. The current
frames were 1,006,300 versus 977,953 bytes and 622,866 versus 609,877 bytes;
TypeUdon/udon-rs reported 130,949,323 versus 174,080,394 instructions and
56,790,109 versus 81,491,204 instructions, respectively, with exact decoded
bytes. The first current size also matched the immediately preceding commit.
The exported UdonSharp assembly also returned exact bytes on both pairs,
with 42,168,159 → 32,358,643 and 20,482,635 → 14,518,488 instructions.
These two cases and emulator counts do not guarantee improvements for other
inputs or Unity wall time.

The current encoder was also run across all 28 retained private payloads;
every frame round-tripped through lz4js. Compared with the earlier
`eia-speed-final` stage, 19 frames were smaller and nine larger, totaling
7,322,649 versus 7,238,698 bytes. These are different encoder stages, not an
A/B test of the latest output-preserving changes; the two larger examples
above were chosen for direct decoder measurements. The current 28 frames
have not all been independently measured in Unity or compared byte-for-byte
against the immediately preceding commit.

Keeping the target's last matched byte in a local variable was separately
tested. Search frames matched, but four warmed alternating Node measurements
had middle values 653.29/680.67 → 676.73/690.26, 1,005.94/1,153.22 →
1,049.09/1,057.54, and 1,255.36/1,259.95 → 1,258.99/1,283.81 ms on three
private inputs. The change was not adopted; the measurements do not establish
a general regression or browser behavior.

Caching the split rolling-hash power for repeated match lengths was tested
after sampling a slow private encoding: candidate search and its hash filter
accounted for most of the sampled Node CPU time. One complete encoding had
identical bytes and measured 25.03 → 24.49 seconds in a reverse-order run.
Four warmed alternating measurements of a single depth-2,048 search had
middle values 662.89/684.63 → 675.31/694.11, 1,006.50/1,022.11 →
981.28/1,011.77, and 1,268.60/1,274.53 → 1,218.37/1,256.78 ms on three
private inputs. Since the benefit was small and inconsistent, the cache was
not adopted. The limited Node samples do not establish browser behavior.

Splitting prefix-table initialization according to whether the full power
table needed building and relying on Uint32Array assignment for unsigned
conversion was also tried. Arrays matched exactly, but one synthetic 1 MiB
search measured middle CPU values of 2.93/2.98 → 3.47/3.54 ms across eight
warmed alternating samples, while a single reverse-order private-slide
encoding measured 24.00 → 24.40 seconds with identical output. The change was
not adopted; these limited observations do not establish a general regression.

The periodic index shortcut was extended from offset four to 16. Fixtures
cover periods 5, 8, 16 and the offset-17 fallback. Five warmed Node samples on
3 MiB of eight-byte-period runs gave median encoder CPU time 63.50 → 45.77 ms;
a private slide was 26.44 → 24.26 seconds, byte-identical.

Periodic insertion was extended through offset 4,096 when at least four
periods and 1,024 bytes remain. Frames for periods 17, 64, 512, 4,096 and the
4,097 fallback, 120 varied searches and 12 complete encodings matched. On
3 MiB inputs with 64-, 512- and 2,048-byte patterns, five warmed Node samples
gave medians 88.39 → 63.42, 74.58 → 50.55 and 93.73 → 75.13 ms. A private
slide was 24.27 → 24.11 seconds, byte-identical. Browser performance was not
measured for these changes.

The periodic insertion limit was raised to 16,383 bytes, covering 5,760-byte
RGB, 7,680-byte RGBA and 11,520-byte RGB rows. Five Node samples gave median
encoder CPU times 116.03 → 97.61, 140.53 → 104.90 and 159.57 → 122.79 ms.
A private slide was 24.36 → 24.38 seconds, byte-identical. Periodic bucket
indices now use 16-bit storage, halving the table to at most 32,766 bytes.
Chrome measured 18.56 / 18.28 / 18.44 / 18.35 seconds on one private slide
(before/after/after/before); 50,811-byte frames matched and decoded.
Each match context now reuses and grows its table. Instrumented Node runs on
two private inputs reduced allocations 302 → 9 and 183 → 4. Chrome measured
18.34 / 18.21 / 18.19 / 18.15 seconds (before/after/after/before) on one input,
7.09 → 7.22 seconds on another, and 21.78 → 21.52 seconds on a multi-block
input (one pair each). All frames matched and decoded. A multi-block Node pair
measured 18.82 → 18.82 CPU seconds. At most two tables retain 65,532 bytes.
These limited samples do not demonstrate a consistent speed change.

Extending the limit to 32,767 with a two-period minimum preserved frames but
Chrome medians regressed 14.15 → 15.35 ms for period 23,040 and 14.80 →
16.45 ms for 32,767 (12 samples). Unchanged boundary periods 16,383 and
32,768 measured 15.25 → 15.35 and 14.50 → 14.40 ms. Not adopted; full
conversion was not measured.

Crop comparison can reuse an exact cached size after verifying all bytes.
For a 4.95 MB input, seven Node samples gave median 15.46 → 1.85 ms at a
100,000-byte target; a 20,000-byte scan was 2.27 → 2.28 ms. The encoder was
stubbed; tests cover collisions and different contents.

Cache comparisons reuse identical immutable ranges. Eight Node batches of
five 4 MiB lookups measured 7.86 → 0.018 ms (encoder stubbed); other offsets
still require comparison. Small-target bounds now reuse the same range too.
On one 4.95 MB input at a 20,000-byte target, Node medians were 2.39 → 0.004
ms (same range) and 2.37 → 2.39 ms (different buffer), 12 samples. Headless
Chrome medians were 2.0 → <0.1 ms, 1.7 → 1.7 ms (different buffer), and
1.7 → 1.8 ms (different offset), 15 samples. Encoder was stubbed; these are
lookup-only measurements, not complete conversion.

Split rolling-hash powers below 2,048 use the existing low-power table;
larger exponents retain quotient/remainder calculation. Four warmed Node
samples of depth-2,048 search had middle CPU pairs 674.01/684.91 →
578.81/591.16, 895.17/906.15 → 853.11/857.34 and 1,147.08/1,167.33 →
1,066.50/1,070.32 ms on three private inputs. A full-encoder comparison was
34.14 → 33.00 seconds with identical bytes. Twenty-four unaligned searches
and 10 boundary frames matched and round-tripped; browser performance is
not established.

Two further exact-output search experiments were measured on private inputs.
Extending the unrolled word comparison only after a 64-byte match improved
some depth-2,048 searches, but one reverse-order complete-encoder comparison
measured 21.33 → 21.99 seconds. Removing a redundant monotonic-chain check
measured 21.35 → 21.52 seconds in one complete-encoder comparison. Neither
change was adopted. These limited Node samples do not establish general
regressions or browser behavior.

Unsigned hash-chain arrays were mixed or slower on private searches. One
full Node encoding was 32.68 → 33.11 seconds with identical output. Not adopted.

Cache views use word reads and DataView. On a
4.95 MB input, median Node lookup times were 1.89 → 0.66 ms aligned, 1.87 →
0.64 ms equally misaligned and 1.86 → 0.95 ms for differing offsets (eight
samples); 10,000 comparisons matched. Unrolling by two or four was slower in
these tests and was not adopted. These measure lookup only.

Float-word comparison was slower on a 4 MiB input: Node medians 0.48 →
0.85 ms (15 batches of five); not adopted.

Chrome 4 MiB word comparisons (21 batches of five) measured 0.42 → 0.36 ms
(pattern), 0.48 → 0.82 ms (zero), 0.48 → 1.16 ms (NaNs), 0.48 → 0.44 ms
(random). This isolates the inner loop; float performance depends on input.

Discarding oversized candidate blocks preserves statistics. A 5 MiB Chrome
smoke test matched checksums and statistics. In a 20 MiB Node test with a
1.6 MB ceiling and forced GC, retained buffers previously reached 21,053,952
bytes; the new list cleared at block two, where ArrayBuffer totals were
51.7 → 47.5 MB. This is not browser peak memory. Private-slide full-encoder
Node CPU times were 19.71 / 19.62 / 19.93 / 20.04 seconds
(before/after/after/before); 58,479-byte frames matched. Enabled.

Four 4 MiB-plus patterned, zero, random and mixed inputs had identical
search statistics and bytes at six ceilings; unlimited frames decoded with
lz4js. Another 160 varied small complete encodings matched and round-tripped.

Statistics-only search matched four synthetic multiblock inputs at six
ceilings. Private-slide Node CPU: 19.66 / 20.65 / 20.62 / 19.50 s
(before/after/after/before), identical frames; not adopted.

Generation stamps slowed Node scans: 1.95 → 2.55, 11.35 → 15.17,
10.90 → 14.55 and 9.26 → 12.33 ms (12 batches of five). Rolling-word reads
also slowed scans: 1.84 → 2.09, 11.67 → 13.15, 11.13 → 12.54 and 9.48 →
10.63 ms (same input, targets and batches); bounds matched. Neither adopted.

Checking every 1,024 instead of 256 hashes gave 1.83 → 1.85, 11.66 → 11.66,
11.17 → 11.21 and 9.45 → 9.46 ms (same setup). Decisions matched; not adopted.
These tests measure scans, not browser or full conversion.

Reusing compressed-block buffers gave private-slide Node CPU times of 20.02 /
19.88 / 19.53 / 19.86 seconds (before/after/after/before), identical frames;
not adopted due to small benefit and extra retained memory.

One slide with 0/1/3/5% extra literal budget produced 58,479 / 59,054 /
60,200 / 61,320 bytes. TypeUdon/udon-rs instructions were 5,136,206 /
5,040,525 / 4,887,426 / 4,769,451; UdonSharp/udon-rs 2,262,443 / 2,235,936 /
2,197,622 / 2,168,634. Both probes, lz4js and liblz4 decoded exactly.

Three further inputs with 1% extra budget: before → after frame bytes /
TypeUdon instructions / UdonSharp instructions:
- 50,811 → 51,307 / 7,889,496 → 7,793,232 / 2,134,687 → 2,112,753
- 1,006,300 → 1,016,263 / 130,949,323 → 126,379,094 / 32,358,643 → 31,202,057
- 179,913 → 181,709 / 23,282,129 → 22,558,976 / 6,910,190 → 6,740,616
Both probes, lz4js and liblz4 decoded exactly. These samples do not measure VRChat wall
time; current policy does not spend extra budget.

Rerunning literal merging changed none of 28 earlier private frames.

A Math.max/mask rewrite showed no full-encoder benefit; not adopted.

Priority changes did not improve 28 frames at the size ceiling. With 1%
extra, one candidate saved five bytes and VM instructions but did not change
the full-encoder output. Not adopted.

A 640×360 Chrome deck gave crop medians 2.60 → 2.15 ms and total
57.95 → 57.35 ms (12 samples); production-encoder archives matched.

Eight-byte lookahead postponed beyond four bytes for all five tested minimum
lengths on two private inputs, preventing that profile-skipping proof.

First-lookahead reuse matched 1,200 frames. Chrome: 19.87 / 19.12 / 19.11 /
19.81 s and 7.40 → 7.23 s. Second-lookahead reuse invalidates on hash
conflicts; 1,200 frames and 14 window-boundary frames and stats matched.
Chrome: 19.81 / 19.02 / 18.91 / 19.56 s and 7.41 → 7.32 s. Frames matched.

Third-lookahead reuse invalidates after conflicting insertions. 1,200 frames,
14 boundary frames and stats matched. Node CPU: 16.50 / 15.97 / 15.86 /
16.40 s and 6.29 / 6.21 / 6.14 / 6.12 s; multi-block timings inconclusive.
Chrome: 18.83 / 17.86 / 18.04 / 19.09 s, 7.27 → 7.21 s and multi-block
22.35 / 22.12 / 22.08 / 22.32 s. Frames matched.

A fourth-position prototype matched 1,200 frames and stats. Two private inputs
at depth 8192/lookahead 8 gave middle Node CPU pairs 1,733.54/1,741.68 →
1,720.10/1,721.63 ms and 579.05/581.99 → 585.64/585.77 ms (four samples).
Mixed results did not justify adoption; full conversion unmeasured.

Frame scoring: two Node inputs, 25/18 calls and two repeats each. Repeats
cost 0.19/1.49 ms of 16.21/7.78 s total. Caching not adopted; browser untested.

Hash-chain array reuse: 1,200 inputs and stats matched. Chrome before/after/after/before: 17.81/18.06/17.66/18.02 s and 7.02/7.00/6.89/7.07 s; frames matched and decoded. Not adopted: up to 1 MiB retained for little observed benefit.

When splitting EIA archives, each cropped slide base is now visited once while
collecting dependencies; the original repeated full scans. A split-chain test
checks that all ancestors remain in each archive. For synthetic chains of 100,
1,000 and 5,000 slides, seven Node samples gave median closure-only times of
0.245 -> 0.005, 4.16 -> 0.050 and 122.15 -> 0.228 ms. These worst-case chain
measurements do not represent whole-conversion or browser performance.

An exploratory post-pass on every size-eligible search candidate, followed by
a final size ceiling no larger than the existing output, changed 16 of 500
synthetic frames. All decoded with lz4js and had no higher estimated work; one
changed 1,032 -> 1,031 bytes and work 3,376 -> 3,191. Two private inputs stayed
byte-identical (single Node runs: 16.14 -> 16.24 and 8.50 -> 8.44 s). This is
a prototype: VM instructions, browser cost and retained memory remain to be
measured before considering adoption.

For five of the changed synthetic frames, the TypeUdon/udon-rs probe verified
exact decoding and instruction counts 136,540 -> 129,641, 99,612 -> 98,113,
43,116 -> 34,614, 16,350 -> 13,254 and 75,254 -> 65,561. A Chrome private
input with identical output took 7.04/7.44/7.37/6.88 s
(before/after/after/before). Restricting post-passes to candidates within 30%
of current estimated work still found all 16 synthetic improvements; Chrome
on that input took 7.00/7.43/7.28/6.85 s. At 10%, only four improvements
remained. These limited tests do not justify adoption yet.

A bounded variant keeps up to four distinct size/work candidates and runs the
post-pass after the main search; it replaces the existing output only if both
size and estimated work do not increase. In 3,000 synthetic cases, 90 outputs
changed, all passed lz4js round-trip and neither measure regressed. All five
VM-verified examples above were rerun with this variant and matched.
Chrome before/after/after/before was 7.04/7.04/7.02/6.88 s and
17.79/17.83/17.94/18.14 s on two private inputs, with identical output. A
small changed input measured about 1.82/1.82 ms per complete encoding (12
warmed Chrome batches of 20). Up to four frame buffers can be retained; these
limited inputs do not prove general browser performance or peak memory.

A 12 MiB-plus synthetic multi-block fixture changed from 12,611,738 to
12,611,725 bytes and estimated work 252,842 to 252,638; both decoded exactly.

Portfolio entries now omit raw block payloads when they total at least 64 KiB
and restore them from the unchanged input when evaluated. In the multi-block fixture,
four candidates each contained 12 MiB of identical raw data. After a forced
Node GC immediately after search, ArrayBuffer retention was 106,492,051 ->
81,382,569 bytes (one run, not peak memory). Chrome complete-encoder times
were 2.87/2.76/2.88/2.85 s (before/after/after/before); frames matched and
decoded. Six mixed-block cases and 3,000 small cases also matched byte-for-byte.

Increasing the portfolio from four to eight distinct size/work pairs changed
no final frames in 3,000 synthetic cases or two private inputs; all decoded.
The two private inputs both filled all eight slots. Chrome on one input took
7.11/7.20/7.15/6.95 s (four/eight/eight/four); a single Node pair on the
other took 16.06/16.13 s. The four-candidate limit remains; these bounded
samples do not rule out improvements for other inputs.

Checking portfolio rank before storing a candidate matched 3,000 synthetic
frames and two private and one mixed-block input. Instrumented storage calls
were 17 -> 15, 10 -> 9 and 4 -> 4; packing calls were 0 -> 0, 0 -> 0 and
4 -> 4. Single Node times were 16.49 -> 16.44, 6.56 -> 6.38 and
2.91 -> 2.89 s. The extra branching was not adopted without clearer benefit;
browser performance was not measured.

An audit of the 90 changed synthetic frames used the TypeUdon/udon-rs probe
and liblz4: all 180 frames decoded with liblz4, and all 90 changed frames
decoded in the VM probe. The previous frames yielded 22 probe status-9 errors;
of the 68 pairs decoded by both, 67 used fewer VM instructions and one used
more (68,645 -> 68,809). Its size was unchanged and estimated work dropped by
only one point because one copy was replaced by one length extension. The
portfolio now requires at least a two-point estimate reduction for equal-size
choices. In 3,000 synthetic cases this changed only that frame back, retaining
its size and 68,645 VM instructions. This guard is empirical and does not
guarantee every model ranking. The 22 earlier status-9 failures need separate
investigation; this test does not identify their cause.

The earlier status-9 failures were not a VM-only discrepancy. All 22 old
frames started their last match fewer than 12 bytes before the block end,
violating the LZ4 block-end condition; liblz4 accepted them permissively.
An audit of 3,000 synthetic inputs found 272 nonconforming lz4js fast frames
and 177 nonconforming final frames in the preceding encoder. The encoder now
checks fast-frame block endings and uses its conforming search encoder as the
baseline when necessary. All 3,000 outputs passed the independent end-condition
check and lz4js round-trip; 199 formerly nonconforming outputs from the earlier
encoder were also decoded exactly by the TypeUdon/udon-rs probe. The compliant
output can be larger than a nonconforming lz4js frame.

For one private slide whose frame remained unchanged, Chrome measured complete
encoding at 7.082/7.100/7.020/7.080 s (before/after/after/before). This
does not measure inputs that require the additional fallback search.

Replacing only the last invalid fast match with literals produced compliant
frames but made 202 of 3,000 synthetic outputs larger than the search fallback
(up to 117 bytes); it was not adopted. Instead, the fallback search frame and
its depth statistics are reused for the later identical profile. All 3,000
synthetic cases, six mixed-block cases, and a 12 MiB multi-block fixture matched
the preceding compliant encoder byte-for-byte and decoded. On a 4 MiB-plus
fixture requiring fallback, Chrome measured 0.730/0.577/0.600/0.691 s
(before/after/after/before); these are limited synthetic measurements.

A prototype combined fast-frame end validation with the decoder-work scan.
All 3,000 synthetic outputs matched. Chrome on a private slide measured
7.310/7.302/7.219/7.176 s (before/after/after/before). On a 4 MiB-plus
synthetic fallback case, 12 warmed alternating samples had medians
580.8 -> 592.4 ms. The combined scanner was not adopted; the limited samples
do not demonstrate a general regression or measure all devices.

Fallback search contexts are now reused by later profiles. Three thousand
synthetic inputs and six mixed-block inputs matched byte-for-byte. On a private
slide with a crafted nonconforming tail, one instrumented Node pair reduced
prefix-table allocations from two to one. Chrome complete-encoder times were
18.71/17.65/17.71/17.47 s (before/after/after/before), identical frames. A
4 MiB-plus mixed synthetic input measured 0.597/0.589/0.585/0.585 s. These
limited timings do not establish a general browser speedup.

A one-line lz4js match-start fix changed 272 of 3,000 fast frames; all 272
round-tripped through the TypeUdon/udon-rs probe. Using those corrected fast
frames directly as the baseline changed 204 final outputs: 202 were larger
(up to 117 bytes), none were smaller, and 202 had lower estimated decoder work. This trades space for work rather than preserving the existing size
ceiling, so the prototype was not adopted. VM speed of those final-frame
tradeoffs was not measured.

When the rejected fast frame is at least 90% of the input size, the fallback
search now defers prefix-table construction just like later sparse searches.
Three thousand synthetic inputs, six mixed-block inputs and a 12 MiB fixture
produced identical frames. On a 4 MiB-plus mixed input, an instrumented Node
pair avoided two prefix allocations of 16,777,220 and 262,148 bytes. Twelve
warmed alternating Chrome samples had median complete-encoder times of
599.4 → 585.1 ms. These measurements do not establish peak memory or general
browser performance.

Cycle validation now memoizes chains proven acyclic within one synchronous EIA
part serialization. A 1,000-graph differential test preserved outputs and
error messages, and a regression test checks that cycles are still rejected.
For a 350-slide chain of 1×1 images with compression stubbed, 12 warmed
alternating Chrome samples gave median serialization times of 2.3 → 0.8 ms;
archives matched byte-for-byte. This does not measure real slide compression.

## Slide parent planning and near-lossless smoothing

These changes alter only which slides reference which and which pixel values
are encoded; EIA v1 and standard LZ4 frames are unchanged.

- Parents and keyframes come from a deck-wide similarity graph
  (`src/lib/crop/planParents.ts`): each slide is either a master or a delta
  against a similar slide anywhere in the deck. Edge cost is the estimated
  LZ4 size, decoded bytes and a per-depth penalty; Prim from a virtual root
  plus a local search picks the forest, with depth at most 6. A parent may
  have any number of children. Source-identical slides become one-pixel
  references.
- `nearLossless` snaps a pixel to its left, then upper, neighbour when every
  channel is within 2 (`IMAGE_NEAR_LOSSLESS_TOLERANCE`; 0 disables it).
- For slides whose plan puts the delta at least 10% below the master, the
  exact master compression used to confirm it is skipped.
- Inputs of 64 KiB or more skip the exhaustive profile sweep in
  `compressLz4Best`.

Measured on five PDF decks rendered at 1280x720 with pdfjs (not DeckCraft
output): archives are 17-37% smaller than with fixed keyframes every 10
slides. On the TypeUdon async decoder (`eia_async`, slice budget 450000), two
decks needed 27-32% fewer VM instructions to decode every item once, and the
sum of per-slide chains (each slide decoded with its parents) fell 23-51%.
Conversion CPU time for three decks fell 28-57%.

Tried and not kept: re-weighting the encoder's decode-cost estimate to a fit
of measured VM instructions (R^2 = 0.9997: about 184 per sequence, 80 per copy,
33 per length-extension byte) changed decoding by +0.2% to +0.6%; snapping
delta pixels to the parent's value made archives 0.4-1.5% larger; allowing
16-32 rectangles or a lower rectangle penalty changed size by about 0.5%.
Dropping the min-6 candidate saves encoder time but raised decode
instructions by 6%.
