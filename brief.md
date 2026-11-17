# Build brief — crypto-lab-lightweight-bench

Written 15 November 2026. Paste this whole file to the coding agent, or save it as `brief.md`
in the new repo. It is self-contained apart from `_MASTER-TEMPLATE.md`, which must be in the
repo root (or readable at `audits/_MASTER-TEMPLATE.md` in the crypto-lab catalog repo).

The five source papers are on the owner's machine at
`~/Downloads/crypto-lab-brief-sources/crypto-lab-lightweight-bench/`. Read them there; do not
search the web for copies, do not copy the PDFs into the repo, do not commit them.

---

## KICKOFF (read this first)

Build a new Crypto Lab browser demo (Vite + TypeScript, static site, no backend) in the
repository **`crypto-lab-lightweight-bench`**.

Read `_MASTER-TEMPLATE.md` in full and treat it as the BINDING spec for build, teaching,
look, accessibility, README and deploy. If `audits/kickoff.md` has been given to you, it
governs how you work inside this repo. This brief supplies only the demo-specific facts and
the acceptance checks. Where the template and this brief disagree on build/teach/look/a11y,
the template wins. Where this brief states cryptographic facts, check them against the cited
primary sources and by computation; if you find one wrong, do not silently deviate: write
"Brief said X; that is wrong because Y (source or computation)" in your report and build the
correct thing.

Build to every standard in the template, in its order: §1 Build, §3 Look, §2 Teach,
§4 Accessibility (including §4.1a setup rules, §4.1b claims suite, §4.1c mutation
discipline run from a script, §4.1d negative claim), §5 README, §6 Deploy with §6.1 and §6.2.

Hard rules (from the template; repeated because they are the ones that get broken):
real computation only, never a canned or simulated verdict; honest scoping in the page and
the README; do NOT weaken a gate to get a green run; if something cannot pass honestly,
leave it failing and say so. Do not touch the shared catalog files. Copy the top bar from an
existing lab. Copy the accessibility gate and `claims.spec.ts` shape from
`crypto-lab-schnorr-forge` and rewrite every lab-specific passage.

When done, report: one-line summary with the test count; the mutation ledger (each mutation,
killed or not); how many of the 37 designers' vectors your tests reproduce; the byte-order
convention you chose for SIMON and SPECK and its source; confirmation that grouping /
auto-merge / PR gate / workflow_dispatch are all present; and the card metadata listed at
the end of this brief.

---

## NEW DEMO BRIEF

- Repo name:         crypto-lab-lightweight-bench
- Short name (H1):   Lightweight Bench
- Subtitle:          SIMON · SPECK · GIFT · SKINNY · PRINCE · three design goals side by side
- One-liner:         Browser-based bench of five lightweight block ciphers — SIMON, SPECK, GIFT, SKINNY and PRINCE each checked against every test vector its designers published, their round functions traced side by side, PRINCE decrypting with its own encryption circuit, and rotational pairs surviving SPECK's rounds only when the key schedule is taken away
- Concept to teach:  "Lightweight" is three different goals (small circuits, small code, low latency) and each cipher's structure shows which one its designers chose; and a property of the round function that looks like a weakness can be removed entirely by constants in the key schedule.
- Primitives/spec:   SIMON and SPECK (Beaulieu, Shors, Smith, Treatman-Clark, Weeks, Wingers; IACR ePrint 2013/404). GIFT (Banik, Pandey, Peyrin, Sasaki, Sim, Todo; ePrint 2017/622). SKINNY (Beierle, Jean, Kölbl, Leander, Moradi, Peyrin, Sasaki, Sasdrich, Sim; ePrint 2016/660). PRINCE (Borghoff et al.; ePrint 2012/529). Rotational analysis: Khovratovich, Nikolić, Pieprzyk, Sokołowski, Steinfeld, "Rotational Cryptanalysis of ARX Revisited" (ePrint 2015/095). Confirm every author list on the title pages.
- Accent (--accent): #7fb7a4   (not used by any of the 203 labs whose accent is recorded in the 12 November 2026 snapshot; confirm against the live catalog and against neighbouring cards)
- Favicon emoji:     🪶
- In scope:          see SCOPE below
- Non-goals:         see SCOPE below

GitHub "About" line: use the one-liner above.

---

## PRE-FLIGHT (verify, do not assume)

1. Confirm the repository name is free under `systemslibrarian` and no catalog card is titled
   "Lightweight Bench".
2. In the catalog repo, search `CATALOG.md` (the "Implemented by" lines, not mentions) and
   the lab READMEs for `SIMON`, `SPECK`, `GIFT`, `SKINNY`, `PRINCE`, `MANTIS`, `rotational`.
   What the brief author found (12 November 2026 snapshot): these ciphers are mentioned in
   several labs and PRESENT is implemented in one, but none of the five is implemented as a
   cipher with its designers' vectors. If one is, STOP for that cipher and report; build the
   rest. Link the PRESENT lab, the AES internals lab, the Feistel lab, the differential and
   linear cryptanalysis labs and the tweakable-encryption lab you actually find.
3. Check the status of each cipher in standards before describing it (ISO/IEC 29192 parts,
   NIST's lightweight process and its outcome). The brief author did not check any of this.
4. Playwright port: ask the catalog tool (`node tools/port-sync.js` in the catalog repo). If you
   cannot reach the catalog repo, stop and ask the owner for a port. Never 4173.

---

## SOURCES AND WHAT EACH IS FOR

A helper implemented all five ciphers from these papers and reproduced every vector below,
with decryption checked; the brief author read the papers' introductions and the helper's
results and recognised the vectors, but did not re-implement the ciphers.

- **ePrint 2013/404**: SIMON section 3 and SPECK section 4; vectors in Appendices B and C.
- **ePrint 2017/622**: GIFT section 2. The paper prints NO test vectors. The six below come
  from the designers' repository, `github.com/giftcipher/gift`, commit `f43c6b3e`, folder
  `implementations/test vectors/`. Fetch them there and cite the commit.
- **ePrint 2016/660**: SKINNY section 2; vectors in Appendix B.1. In machine-extracted text
  the bit-level S-box formula loses its overline (it needs NOR, not OR); use the S-box
  tables.
- **ePrint 2012/529**: PRINCE section 2 and 3.3; vectors in Appendix A.
- **ePrint 2015/095**: Lemma 1 (one modular addition) and Lemma 2 (chained additions).

---

## FACTS (write tests from these, not from your code)

1. **Conventions that decide whether vectors match** (each settled by the helper against
   the printed vectors):
   - SIMON, SPECK: the printed key is (k[m−1], …, k[0]): the RIGHTMOST word is the first
     round key. The printed text is (x, y), left word x. Words are numbers; the 2013 paper
     fixes no byte order (say which you chose and why). 48-bit and 64-bit words need BigInt
     or split words. SIMON's constant-sequence bit index is (i − m) mod 62 reading the
     sequence left to right; SPECK's round counter starts at 0.
   - GIFT: key and text are big-endian numbers. GIFT-64 adds key bits at state positions 4i
     and 4i + 1; GIFT-128 at 4i + 1 and 4i + 2. There is no initial key addition. The
     all-zero vector cannot detect a key-word-order bug; the other two can.
   - SKINNY: cells are loaded row by row (not column by column as in AES). The tweakey is
     TK1 ‖ TK2 ‖ TK3 and is XORed in before it is updated. Both cell permutations are
     "gather" maps (new[i] = old[P[i]]). Rows shift to the right.
   - PRINCE: most-significant-first for nibbles and for bits inside M′. The nibble
     permutation SR is a gather map. M is M′ followed by SR.
2. **PRINCE's reflection.** Decryption is the SAME encryption routine with the two whitening
   keys swapped and the constant α added to the core key (round constants satisfy
   RC_i ⊕ RC_(11−i) = α). The helper confirmed it on 20,000 random blocks, with a negative
   control (α with one bit flipped: 0 of 2,000).
3. **Rotational pairs** (ePrint 2015/095, Lemma 1). For n-bit words and rotation by r, a
   pair (x, y) and its rotation pass through one modular addition with probability
   (1 + 2^(r−n) + 2^(−r) + 2^(−n)) / 4. For n = 16, r = 1 that is 0.375011, and exhaustively
   exactly 1,610,661,888 of the 2^32 pairs.
4. **Chained additions are not independent** (Lemma 2). Multiplying per-addition
   probabilities overestimates the chained probability: by a factor of 1.67 for two chained
   additions and 3.96 for three, by exhaustive count at 8-bit words (16-bit chains are 2^48
   work; do not attempt them).
5. **SPECK32/64, measured by the helper** (2^28 random pairs per point). With round keys
   that are themselves rotated copies (the related-key model), the fraction of rotational
   pairs surviving r rounds was 0.3750, 0.1407, 0.0528, 0.0198, 0.00744, 0.00279 for
   r = 1 … 6, within 0.3% of 0.375011^r. With the real key schedule and one key, the
   fraction is about 2^−16 after one round and nothing was seen after two (in 2^28).

---

## SCOPE

In scope, as exhibits in this order:

1. **Five ciphers, one bench.** Pick a cipher and size; encrypt and decrypt; the designers'
   vectors one click away, each compared live.
2. **Round functions side by side.** One round of each traced on the same input: SPECK's
   add-rotate-XOR, SIMON's AND-rotate-XOR, GIFT's S-box and bit permutation, SKINNY's
   S-box, constants, tweakey, row shift and column mix, PRINCE's S-box and M′.
3. **Three goals.** A table built from the papers' own figures (rounds, block and key
   sizes, the designers' stated target: area, code size or latency), each cell with its
   source. Read the papers' comparison tables before filling it; do not fill it from
   memory.
4. **PRINCE runs backwards with the same circuit.** The reflection property, with the
   one-bit-wrong α control.
5. **Rotational pairs.** One addition (exhaustive at 16 bits), chained additions (exhaustive
   at 8 bits) against the naive product, then SPECK32/64 for 1 to 6 rounds with rotated
   round keys and with the real schedule.
6. **Tweak.** SKINNY with a tweak: same key and plaintext, different tweak, unrelated
   ciphertext. One panel, linked to the site's tweakable-encryption lab.

Non-goals (say so on the page and in the README): MANTIS and PRINCEv2; hardware area or
latency measurements (the page shows the papers' figures as theirs, not its own); any
attack beyond exhibit 5; any ranking of the ciphers' security; modes of operation.

---

## SECURITY / CORRECTNESS INVARIANTS

1. A cipher is offered in the UI only if every one of its designers' vectors passes in the
   test suite.
2. Decryption is implemented and checked for every size (round trip on random inputs).
3. Rotational statistics are counted from runs with the sample size shown; exhaustive
   results are labelled exhaustive.
4. Figures in exhibit 3 carry their source (paper, table number) in the page.
5. Random inputs come from `crypto.getRandomValues`.

---

## ARCHITECTURE

One pure module per cipher (`simon.ts`, `speck.ts`, `gift.ts`, `skinny.ts`, `prince.ts`),
each exporting encrypt, decrypt, a round tracer and its vectors as data; `rotational.ts`
with a Web Worker for the sampling; `vectors/` holding each vector with its source noted.
Shared helpers for word rotation at 16, 24, 32, 48 and 64 bits.

---

## UI AND VISUAL SEMANTICS

Follow §3. State as a grid of nibbles or words with row and column headers appropriate to
each cipher (label SKINNY's row-wise order explicitly). Vector comparison shows expected
and computed values in text with a word verdict. Charts in exhibit 5 have a table
alternative.

---

## EDGE CASES (each fails closed and teaches via its message)

- Key or block of the wrong length for the chosen size: refused, with the expected length.
- Non-hex input: refused.
- A SKINNY tweak longer than the tweakey leaves room for: refused.
- Rotation amount 0 or equal to the word size in exhibit 5: refused (not a rotation).
- Sample size above the worker's budget: capped, and the cap stated.

---

## EXTENSION SEAMS (shape now, do not build)

A `Cipher` interface so MANTIS, PRINCEv2 or other lightweight ciphers could be added with
their vectors; an `Analysis` seam for automated trail search. Name both as "not built here".

---

## ACCEPTANCE CHECKS — the designers' vectors (each reproduced by a helper's independent implementation)

Take each vector from its source as well; these are here so a mismatch is caught at once.
Notation as printed in the sources.

**A. SIMON** (key; plaintext; ciphertext):
32/64: `1918 1110 0908 0100`; `6565 6877`; `c69b e9bb`.
48/72: `121110 0a0908 020100`; `612067 6e696c`; `dae5ac 292cac`.
48/96: `1a1918 121110 0a0908 020100`; `726963 20646e`; `6e06a5 acf156`.
64/96: `13121110 0b0a0908 03020100`; `6f722067 6e696c63`; `5ca2e27f 111a8fc8`.
64/128: `1b1a1918 13121110 0b0a0908 03020100`; `656b696c 20646e75`; `44c8fc20 b9dfa07a`.
96/96: `0d0c0b0a0908 050403020100`; `2072616c6c69 702065687420`; `602807a462b4 69063d8ff082`.
96/144: `151413121110 0d0c0b0a0908 050403020100`; `746168742074 73756420666f`; `ecad1c6c451e 3f59c5db1ae9`.
128/128: `0f0e0d0c0b0a0908 0706050403020100`; `6373656420737265 6c6c657661727420`; `49681b1e1e54fe3f 65aa832af84e0bbc`.
128/192: `1716151413121110 0f0e0d0c0b0a0908 0706050403020100`; `206572656874206e 6568772065626972`; `c4ac61effcdc0d4f 6c9c8d6e2597b85b`.
128/256: `1f1e1d1c1b1a1918 1716151413121110 0f0e0d0c0b0a0908 0706050403020100`; `74206e69206d6f6f 6d69732061207369`; `8d2b5579afc8a3a0 3bf72a87efe7b868`.

**B. SPECK** (same keys as SIMON for each size):
32/64: `6574 694c`; `a868 42f2`.
48/72: `20796c 6c6172`; `c049a5 385adc`.
48/96: `6d2073 696874`; `735e10 b6445d`.
64/96: `74614620 736e6165`; `9f7952ec 4175946c`.
64/128: `3b726574 7475432d`; `8c6fa548 454e028b`.
96/96: `65776f68202c 656761737520`; `9e4d09ab7178 62bdde8f79aa`.
96/144: `656d6974206e 69202c726576`; `2bf31072228a 7ae440252ee6`.
128/128: `6c61766975716520 7469206564616d20`; `a65d985179783265 7860fedf5c570d18`.
128/192: `7261482066656968 43206f7420746e65`; `1be4cf3a13135566 f9bc185de03c1886`.
128/256: `65736f6874206e49 202e72656e6f6f70`; `4109010405c0f53e 4eeeb48d9c188f43`.

**C. GIFT** (from the designers' repository at the commit named above):
GIFT-64: key all zero, plaintext all zero gives `f62bc3ef 34f775ac`;
key `fedcba98 76543210 fedcba98 76543210`, plaintext `fedcba98 76543210` gives `c1b71f66 160ff587`;
key `bd91731e b6bc2713 a1f9f6ff c75044e7`, plaintext `c450c772 7a9b8a7d` gives `e3272885 fa94ba8b`.
GIFT-128: key all zero, plaintext all zero gives `cd0bd738 388ad3f6 68b15a36 ceb6ff92`;
key `fedcba98 76543210 fedcba98 76543210`, plaintext the same 16 bytes gives `8422241a 6dbf5a93 46af4684 09ee0152`;
key `d0f5c59a 7700d3e7 99028fa9 f90ad837`, plaintext `e39c141f a57dba43 f08a85b6 a91f86c1` gives `13ede67c bdcc3dbf 400a62d6 977265ea`.

**D. SKINNY** (tweakey; plaintext; ciphertext):
64-64: `f5269826fc681238`; `06034f957724d19d`; `bb39dfb2429b8ac7`.
64-128: `9eb93640d088da63 76a39d1c8bea71e1`; `cf16cfe8fd0f98aa`; `6ceda1f43de92b9e`.
64-192: `ed00c85b120d6861 8753e24bfd908f60 b2dbb41b422dfcd0`; `530c61d35e8663c3`; `dd2cf1a8f330303c`.
128-128: `4f55cfb0520cac52fd92c15f37073e93`; `f20adb0eb08b648a3b2eeed1f0adda14`; `22ff30d498ea62d7e45b476e33675b74`.
128-256: `009cec81605d4ac1d2ae9e3085d7a1f3 1ac123ebfc00fddcf01046ceeddfcab3`; `3a0c47767a26a68dd382a695e7022e25`; `b731d98a4bde147a7ed4a6f16b9b587f`.
128-384: `df889548cfc7ea52d296339301797449 ab588a34a47f1ab2dfe9c8293fbea9a5 ab1afac2611012cd8cef952618c3ebe8`; `a3994b66ad85a3459f44e92b08f550cb`; `94ecf589e2017c601b38c6346a10dcfa`.

**E. PRINCE** (plaintext; k0; k1; ciphertext):
`0000000000000000`; `0000000000000000`; `0000000000000000`; `818665aa0d02dfda`.
`ffffffffffffffff`; `0000000000000000`; `0000000000000000`; `604ae6ca03c20ada`.
`0000000000000000`; `ffffffffffffffff`; `0000000000000000`; `9fb51935fc3df524`.
`0000000000000000`; `0000000000000000`; `ffffffffffffffff`; `78a54cbe737bb7ef`.
`0123456789abcdef`; `0000000000000000`; `fedcba9876543210`; `ae25ad3ca8fa9ccf`.
Also: reflection decryption equals the step-by-step inverse on 1,000 random inputs, and
fails with α changed in one bit.

**F. Rotational.** One 16-bit addition, rotation 1, exhaustive: exactly 1,610,661,888 of
2^32. Chained additions at 8-bit words, exhaustive: equal to Lemma 2's value, and the naive
product is larger by a factor between 1.6 and 1.75 (two additions) and between 3.8 and 4.1
(three). SPECK32/64 with rotated round keys, at least 2^22 samples per point: within 3% of
0.375011^r for r = 1, 2, 3. With the real key schedule, at least 2^22 samples: zero
survivors at r = 2 (allow at most 2).

**G. Mutations that must be killed (§4.1c, run from a script, each a concrete patch).**
(1) SIMON/SPECK key words used left to right; (2) SPECK rotation amounts for the 32-bit
block size (7 and 2) used at every size; (3) SIMON constant sequence read from the wrong
end; (4) GIFT-64 key bits added at positions 4i + 1 and 4i + 2 (the all-zero vector still
passes: the test must use the other two); (5) GIFT key state rotation skipped; (6) SKINNY
state loaded column-wise; (7) SKINNY tweakey updated before it is XORed in; (8) PRINCE SR
applied as a scatter instead of a gather; (9) PRINCE reflection without adding α;
(10) rotational survival counted on one output word instead of both; (11) a cipher shown
as "vectors pass" from a stored flag instead of a live comparison. A surviving mutation is
reported, not explained away.

**H. Fail-closed paths, each a NAMED test:** every item under EDGE CASES; invariant 1 (a
deliberately broken cipher module disappears from the UI's choices).

**I. Claims suite (§4.1b).** At minimum: each "matches the designers' vector" verdict is
backed by a comparison the test repeats from the rendered key, plaintext and ciphertext
against its own fixture; decrypting the ciphertext on screen returns the plaintext on
screen; the survival fraction shown equals survivors over samples as rendered; exhibit 3's
cells each carry a source reference; stale verdicts are retired when the cipher, size or
input changes; the no-op guard; the `[hidden]` probe.

---

## NEGATIVE CLAIM (§4.1d)

Claim, scoped to the run on the page: **"Rotational pairs pass through SPECK's round
function with high probability. That says nothing about SPECK as specified: with its real
key schedule the same pairs do not survive two rounds."**

Evidence fixture: exhibit 5 after both runs. The related-key column shows survival near
0.375^r for six rounds, the real-schedule column shows none after two rounds, and the
verdict reads `ROUND FUNCTION PRESERVES ROTATION — AND THE REAL CIPHER DOES NOT`, with the
negative-claim sentence and both sample sizes visible in that state.

Bite fixture for mutation (10) and the verdict logic: a run in which the "real schedule"
column is fed rotated round keys by mistake; survivors appear, and the page must NOT show
the second clause. The three assertions and two bite tests are as §4.1d specifies.

---

## README NOTES

Follow §5. "What It Is" names the five ciphers and sizes, the vector counts (10, 10, 6, 6,
5), the two properties demonstrated, and "not production crypto — a teaching demo; not
constant-time". "When to Use It" must include a "do NOT": do not read exhibit 5 as an
attack on SPECK, and do not read exhibit 3 as measurements made by this page. "What Can Go
Wrong" is the conventions list of FACTS 1: every one is a way to implement a cipher that
looks right and matches no one else. "Real-World Usage": only what you verify from primary
sources (standards that include each cipher, with dates); say nothing about adoption
otherwise. "Build & Verify" states the test count, the 37 vectors with their sources (GIFT's
with the repository commit), and the a11y gate. Credit each paper by title and authors with
its ePrint link; no links to PDF copies elsewhere.

---

## CARD METADATA TO REPORT BACK (for the catalog session; do not edit the catalog yourself)

Title: Lightweight Bench. Subtitle as above. Suggested categories: SYMMETRIC, and ATTACKS only
if the catalog's rules count exhibit 5 (confirm against the catalog's CATEGORIES). Suggested
level: intermediate. Chips: only what the source implements (SIMON, SPECK, GIFT-64,
GIFT-128, SKINNY, PRINCE, rotational pair analysis). Accent #7fb7a4.

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
