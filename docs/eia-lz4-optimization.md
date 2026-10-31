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

Identical slide images can use a one-pixel no-op delta. If a master has a
smaller compressed payload plus metadata than a delta, it is used instead.
The existing keyframe and maximum reference-depth limits still apply. The
existing color-difference threshold is unchanged; a threshold-suppressed but
non-identical image is not replaced by the no-op delta.

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
