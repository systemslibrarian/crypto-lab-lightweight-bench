# Lightweight Bench

**SIMON · SPECK · GIFT · SKINNY · PRINCE · three design goals side by side**

Browser-based bench of five lightweight block ciphers — SIMON, SPECK, GIFT, SKINNY and PRINCE
each checked against every test vector its designers published, their round functions traced side
by side, PRINCE decrypting with its own encryption circuit, and rotational pairs surviving SPECK's
rounds only when the key schedule is taken away.

---

## What It Is

Encryption normally assumes a computer. Lightweight cryptography assumes the opposite: a chip with
a few thousand logic gates, a microcontroller with two kilobytes of program space, or a car
component that must answer inside one clock cycle. No single cipher is small enough for all three,
because **"small" means three different and partly conflicting things** — a small circuit, a small
program, or a short delay. This page runs five ciphers that each chose one of those three, and
shows where the choice is visible in the round function.

Five families, 29 versions, all implemented from their design papers:

| Family | Versions on the bench | Published vectors | Where the vectors come from |
|---|---|---|---|
| **SIMON** | 32/64, 48/72, 48/96, 64/96, 64/128, 96/96, 96/144, 128/128, 128/192, 128/256 | **10** | ePrint 2013/404, Appendix B |
| **SPECK** | the same ten sizes | **10** | ePrint 2013/404, Appendix C |
| **GIFT** | GIFT-64, GIFT-128 (both 128-bit key) | **6** | the designers' repository — the paper prints none |
| **SKINNY** | 64-64, 64-128, 64-192, 128-128, 128-256, 128-384 | **6** | ePrint 2016/660, Appendix B.1 |
| **PRINCE** | 64-bit block, 128-bit key | **5** | ePrint 2012/529, Appendix A |

**37 published vectors, and all 37 reproduce in the browser** — encryption and decryption both.
Decryption is implemented for every size and round-trips on random blocks.

Two properties are demonstrated rather than asserted:

1. **PRINCE's α-reflection.** Decryption is the *encryption* circuit with the two whitening keys
   swapped and the constant α added to the core key. The page runs both routes and compares them,
   then runs the same thing with one bit of α flipped as a negative control.
2. **Rotational pairs through SPECK.** A property of the round function that looks like a
   weakness, and that the key schedule's round counter removes entirely.

**Not production crypto — a teaching demo.** None of these implementations is constant-time, none
is side-channel hardened, and none should encrypt anything you care about. The page says so, and
says what else it is not: it makes no hardware measurements of its own, mounts no attack, and
ranks nothing.

## Exhibits

1. **Five ciphers, one bench.** Pick a family and a size, encrypt, decrypt, and compare against
   the designers' vectors — each comparison computed in the page, expected beside computed, with
   the source named. A version whose published vectors do not reproduce at load is **withheld from
   the menu** and named as withheld (invariant 1).
2. **Round functions side by side.** All five families have a 64-bit block version, so one block
   goes through all five first rounds, step by step: SPECK's add-rotate-XOR, SIMON's
   AND-rotate-XOR, GIFT's S-box and bit permutation, SKINNY's S-box, constants, tweakey, row shift
   and column mix, and PRINCE's S-box and M′.
3. **Three goals.** What each paper says it optimised for, in its own words, plus the papers' own
   comparison tables — kept apart by cell library and circuit style, because figures from
   different papers are not comparable.
4. **PRINCE runs backwards with the same circuit.** The reflection property, the round-constant
   pairs that make it work, 1,000 random blocks, and the one-bit-wrong α control.
5. **Rotational pairs.** One modular addition counted **exhaustively** at 16 bits (all 2³² pairs);
   chained additions counted exhaustively at 8 bits against the folklore estimate; then SPECK32/64
   for one to six rounds in two key models, sampled, with the sample size printed beside every
   figure.
6. **SKINNY takes a tweak.** Same key, same plaintext, two tweaks, unrelated ciphertext — with the
   Hamming distance computed rather than described.

## When to Use It

Reach for this when you want to see *why* there is more than one lightweight cipher, when you are
implementing one of these five and want a reference whose conventions are spelled out, or when you
want to watch the difference between a round-function property and a property of a cipher.

**Do NOT read exhibit 5 as an attack on SPECK.** It is not one, and the exhibit shows you why not:
the same pairs that sail through the round function do not survive two rounds of the real cipher.
Anyone quoting the 0.375-per-round figure as a weakness in SPECK has read the first column and
stopped.

**Do NOT read exhibit 3 as measurements made by this page.** Every gate count, delay and byte
count there was published by the cited design paper. A browser cannot measure hardware area, and
this one does not try.

And do not use any of this to protect anything. It is a teaching demo.

## Live Demo

**https://systemslibrarian.github.io/crypto-lab-lightweight-bench/**

Encrypt a block under any of 29 cipher versions and decrypt it again; click through to the
designers' vectors and watch each comparison run; trace one round of all five families on the same
input; make PRINCE decrypt with its encryption circuit and then break α by one bit; count all 2³²
rotational pairs at 16 bits and watch the number arrive; sample SPECK's two key models and read the
difference the key schedule makes; and change a SKINNY tweak to get an unrelated ciphertext under
the same key.

## What Can Go Wrong

Every item below is a way to implement one of these ciphers so that it is **perfectly
self-consistent, decrypts its own ciphertext, and agrees with nobody**. That is what makes them
dangerous: nothing short of a published vector catches them. Each is a concrete patch in
`scripts/mutations.mjs`, and each is killed by a named test.

- **SIMON and SPECK: the printed key is `(k[m−1], …, k[0])`.** The *rightmost* printed word is
  `k[0]`, the first round key. ePrint 2013/404 §3.2 says it in as many words — "loaded into the
  shift registers with k0 on the right". Reading the words left to right gives a working cipher
  that matches no vector. SPECK's schedule, confusingly, wants the printed order as printed; SIMON's
  wants it reversed.
- **SIMON's constant sequence index.** Round key `i + m` takes bit `i` of the sequence, read left
  to right from the printed string. Reading from the other end is a different cipher.
- **SPECK's rotation amounts.** `(α, β) = (7, 2)` only when the word is 16 bits, and `(8, 3)`
  everywhere else. Hardcoding `(7, 2)` leaves SPECK32/64 passing, so a suite that tests only the
  smallest size cannot see it.
- **The word size needs more than 32 bits.** 48-bit and 64-bit words need BigInt or split words;
  every SIMON and SPECK operation here is BigInt so one code path serves all ten sizes.
- **GIFT's round-key positions.** GIFT-64 adds the round key at bit positions `4i` and `4i+1`;
  GIFT-128 at `4i+1` and `4i+2`. There is no initial key addition at all. **The all-zero vector
  cannot detect either mistake** — an all-zero round key XORs to nothing wherever you put it — and
  the mutation ledger measures that blindness rather than asserting it.
- **GIFT's bit permutation is a SCATTER map** (`b_{P(i)} ← b_i`), while SKINNY's and PRINCE's cell
  permutations are GATHER maps (`new[i] = old[P[i]]`). Mixing the two up inverts the permutation.
- **SKINNY loads its state ROW BY ROW**, not column by column as in the AES. The paper says so
  explicitly. Anyone arriving from AES gets this wrong and everything still works.
- **SKINNY's tweakey is XORed in BEFORE it is updated**, and its rows shift to the *right*.
- **PRINCE's nibbles and M′ bits are most-significant-first**, SR is a gather map, and `M = SR ∘ M′`.
- **Reading the SKINNY paper from extracted text loses an overline.** The bit-level description of
  the 4-bit S-box reads `x0 ⊕ (x3 ∨ x2)` once the overline is gone, when the figure shows a NOR.
  With OR, `S4[0]` computes to 0 instead of 0xc. Use the printed tables.
- **A rotation of 0, or of the full word size, is not a rotation.** It is the identity, every pair
  would trivially "survive", and the exhibit refuses it.

## Real-World Usage

Only what was verified from the standards bodies' own catalogue entries. Where there is nothing to
report, nothing is reported.

- **SIMON** is standardised as an RFID air-interface crypto suite: **ISO/IEC 29167-21:2018**
  (published October 2018), withdrawn 6 March 2026 and replaced by **ISO/IEC 29167-21:2026**.
- **SPECK** likewise: **ISO/IEC 29167-22:2018** (published 6 November 2018), withdrawn 6 March
  2026 and replaced by **ISO/IEC 29167-22:2026**.
- **SIMON and SPECK were REJECTED from ISO/IEC 29192-2.** Proposed in 2015, and after about three
  and a half years of deliberation in ISO/IEC JTC 1 they were turned down in **April 2018**.
- **ISO/IEC 29192-2:2019** — the lightweight block cipher standard — specifies **PRESENT, CLEFIA
  and LEA**. None of the five ciphers on this bench is in it.
- **NIST's Lightweight Cryptography process** named ten finalists in **March 2021**, among them
  **GIFT-COFB** and **Romulus**. NIST selected **Ascon** on **7 February 2023** (NIST IR 8454, June
  2023), published as **NIST SP 800-232** in **August 2025**. Neither GIFT-COFB nor Romulus was
  selected.
- **PRINCE, SKINNY and GIFT**: no standard including them was found. Nothing further is claimed
  about deployment of any of the five, because nothing further was verified.

## How to Run Locally

```bash
npm install
npm run dev          # serves the demo
```

```bash
npm test             # 162 unit and correctness tests (Vitest)
npm run build        # tsc --noEmit then vite build
npm run test:a11y    # the axe WCAG 2.1 A/AA gate, against the production build
npm run test:claims  # 28 tests on what the page SAYS, incl. the negative claim
npm run mutations    # 16 mutations, each one proving a test bites
```

The Playwright suites build first and serve on port **4246** with `--strictPort`.

## Related Demos

- [Biham Lens](https://systemslibrarian.github.io/crypto-lab-biham-lens/) — differential
  cryptanalysis, and the only other lab in this suite implementing a lightweight cipher (PRESENT,
  which GIFT is a deliberate redesign of).
- [Matsui Line](https://systemslibrarian.github.io/crypto-lab-matsui-line/) — linear
  cryptanalysis, the other attack family these designs quote bounds against.
- [AES Anatomy](https://systemslibrarian.github.io/crypto-lab-aes-anatomy/) — the cipher all five
  of these are trying to be smaller than, step by step.
- [Feistel Forge](https://systemslibrarian.github.io/crypto-lab-feistel-forge/) — the Feistel
  structure SIMON and SPECK use, taken apart with DES.
- [Sector Vault](https://systemslibrarian.github.io/crypto-lab-sector-vault/) — tweakable
  encryption from the other direction: a tweakable *mode* (XTS) built from a cipher with no tweak
  input, where SKINNY has one natively.
- [Format Ward](https://systemslibrarian.github.io/crypto-lab-format-ward/) — tweaks in
  format-preserving encryption.

## Build & Verify

Vite + TypeScript, static, no backend. Everything runs in the browser; random values come from
`crypto.getRandomValues`.

**192 tests, all passing.**

- **162 unit and correctness tests** (`npm test`) covering all **37 published vectors** —
  encryption, decryption, and round-trips on random blocks for every one of the 29 versions:
  - **SIMON, 10 vectors** — ePrint 2013/404 Appendix B (p. 41)
  - **SPECK, 10 vectors** — ePrint 2013/404 Appendix C (p. 42)
  - **GIFT, 6 vectors** — the paper prints none, so these come from the designers' own repository,
    `github.com/giftcipher/gift` at commit **`f43c6b3e214e39c22dc0ae5efcc39297809d9b68`**, in
    `implementations/test vectors/`. Those files also print the state after SubCells, PermBits and
    AddRoundKeys for every round, and the suite checks this implementation's first-round trace
    against the designers' own dump for all three non-zero vectors — a check no pair of
    compensating errors can satisfy.
  - **SKINNY, 6 vectors** — ePrint 2016/660 Appendix B.1 (p. 46)
  - **PRINCE, 5 vectors** — ePrint 2012/529 Appendix A
- Beyond the vectors: PRINCE's M′ is **built from the paper's own 4×4 blocks**, so its involution
  and its three-ones-per-row-and-column property are consequences the suite checks rather than
  assumptions; the round constants are checked to satisfy `RC_i ⊕ RC_{11−i} = α`; reflection is
  checked against the step-by-step inverse on 1,000 random blocks and against a one-bit-wrong α on
  2,000 more (0 agreements); GIFT's and SKINNY's round constants are generated from the LFSR and
  checked against the printed table; and SKINNY's S-box inverses are obtained by table inversion
  so a hand-derived inverse cannot drift.
- **Rotational analysis** — Lemma 1 is checked by an **exhaustive count of all 2³² pairs** at 16
  bits, which comes to exactly **1,610,661,888** and agrees with the formula to the last bit of a
  double; Lemma 2 by **exhaustive counts of every 8-bit tuple** for one, two and three chained
  additions, which match it exactly and show the folklore product overestimating by 1.67× and
  3.96×.
- **2 accessibility tests** (`npm run test:a11y`) — `@axe-core/playwright` scans the **production
  build** for zero WCAG 2.1 A/AA violations at desktop and 380px width, across every driven state
  of all six exhibits. Beyond axe's `violations` array the gate also asserts axe's `incomplete`
  bucket, computes contrast arithmetically (including inside `aria-hidden` subtrees), measures
  non-text contrast and generated content against a ratchet, and checks reflow, scroller
  reachability and focus visibility — the last four have no axe rule at all. The deploy is blocked
  if any of it fails.
- **28 claims tests** (`npm run test:claims`) — whether the page tells the truth, mixing
  cross-checks between two rendered surfaces, independent re-derivations (the published vectors are
  transcribed a second time in the spec; Lemma 1 is recomputed from n and r; the tweak's Hamming
  distance is recomputed by BigInt popcount; the chart's plotted geometry is recomputed from the
  table's numbers), and parts-sum-to-whole checks. Includes the `[hidden]` cascade probe, the
  no-op guard, and the **negative claim** of §4.1d.
- **16 mutations** (`npm run mutations`), each a concrete patch with an anchor that must occur
  exactly once. The script enforces all four kill rules — the owning test passed unmutated in the
  same run, the patch changed the file, the built bundle's hash moved, and a patch that does not
  compile is never a kill — and writes `audits/mutation-ledger.json` itself, so no record exists
  without a run. **All 16 are killed.** Four of them also assert that a *blind* test stays green,
  which is how "GIFT's all-zero vector cannot see this" became a measurement.

### The negative claim

> Rotational pairs pass through SPECK's round function with high probability. That says nothing
> about SPECK as specified: with its real key schedule the same pairs do not survive two rounds.

Its evidence fixture is exhibit 5 after both key models have run. In that state every verdict the
page renders reports success, the round-function column tracks 0.375011^r for six rounds, the
real-schedule column has found nothing past one round, and the verdict reads as a result and a
limit at once: **ROUND FUNCTION PRESERVES ROTATION — AND THE REAL CIPHER DOES NOT**. The whole
difference between the two columns is one term — SPECK's key schedule XORs the round counter in at
every step, and a counter is not rotation-invariant.

### Byte order, which the paper leaves open

ePrint 2013/404 specifies SIMON and SPECK over words that are *numbers* and fixes no serialisation
of those numbers to bytes. This lab takes the printed form as the convention: **big-endian within
each word, words left to right exactly as the appendix prints them**. A flat hex string in this
page is therefore the paper's own hex with the spaces deleted, and no byte-swap stands between what
you type and what Appendix B says. The reference C code's little-endian serialisation would need
one. The page states this wherever it matters.

## Performance

Everything runs on the main thread except exhibit 5, which uses a Web Worker because its
exhaustive counts are billions of iterations. The 16-bit exhaustive count walks all 4,294,967,296
pairs in about eight seconds with a progress readout; the 8-bit chained counts prune on the chain
condition and finish in seconds. The sampled SPECK run defaults to 2²² samples per point (about
two seconds for all twelve jobs) and is capped at 2²⁴ — the cap is stated on the page whenever it
bites, and the control is corrected to it so what is on screen is what ran. The ciphers themselves
use BigInt for uniformity across five word sizes, which costs nothing noticeable on one block and
is not a basis for any performance claim.

## Not Built Here

Marked in the source as extension seams (`// [extension] point`) and deliberately left unbuilt: a
sixth family behind the same `Cipher` interface — MANTIS, PRINCEv2, Midori — would be a module
exporting its variants and its published vectors plus a registry entry; and an `Analysis` seam for
automated differential or rotational **trail search** would sit beside `src/analysis/rotational.ts`
with the same worker protocol. Exhibit 5 counts the rotational property of a given rotation; it
does not search for trails.

## Credits

The five source papers, by title and authors, each at its IACR ePrint record:

- Ray Beaulieu, Douglas Shors, Jason Smith, Stefan Treatman-Clark, Bryan Weeks, Louis Wingers,
  *The SIMON and SPECK Families of Lightweight Block Ciphers* —
  [ePrint 2013/404](https://eprint.iacr.org/2013/404)
- Subhadeep Banik, Sumit Kumar Pandey, Thomas Peyrin, Yu Sasaki, Siang Meng Sim, Yosuke Todo,
  *GIFT: A Small Present — Towards Reaching the Limit of Lightweight Encryption* —
  [ePrint 2017/622](https://eprint.iacr.org/2017/622)
- Christof Beierle, Jérémy Jean, Stefan Kölbl, Gregor Leander, Amir Moradi, Thomas Peyrin,
  Yu Sasaki, Pascal Sasdrich, Siang Meng Sim, *The SKINNY Family of Block Ciphers and its
  Low-Latency Variant MANTIS* — [ePrint 2016/660](https://eprint.iacr.org/2016/660)
- Julia Borghoff, Anne Canteaut, Tim Güneysu, Elif Bilge Kavun, Miroslav Knežević,
  Lars R. Knudsen, Gregor Leander, Ventzislav Nikov, Christof Paar, Christian Rechberger,
  Peter Rombouts, Søren S. Thomsen, Tolga Yalçın, *PRINCE — A Low-latency Block Cipher for
  Pervasive Computing Applications* — [ePrint 2012/529](https://eprint.iacr.org/2012/529)
- Dmitry Khovratovich, Ivica Nikolić, Josef Pieprzyk, Przemysław Sokołowski, Ron Steinfeld,
  *Rotational Cryptanalysis of ARX Revisited* — [ePrint 2015/095](https://eprint.iacr.org/2015/095)

GIFT's test vectors come from the designers' repository, `github.com/giftcipher/gift`, at commit
`f43c6b3e214e39c22dc0ae5efcc39297809d9b68`.

---

*One of the browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
