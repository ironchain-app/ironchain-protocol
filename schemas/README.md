# Schemas

**The specification lives in [`../spec/`](../spec/).** This page is the index
of files; the rules they encode — canonicalisation, the hash, the signing
message, the Merkle rule, the attestation address — are written once, in the
spec, without a trade in them.

## The base, and the two profiles

| File | Where it lives | What it is |
|---|---|---|
| [`leaf.base.json`](leaf.base.json) | — | The envelope every leaf shares, in every domain. Normative for profiles. |
| [`workout-completed-v2.json`](workout-completed-v2.json) | off-chain, on the subject's device | **Profile** · one finished training session |
| [`hours-worked.json`](hours-worked.json) | off-chain, on the subject's device | **Profile** · one shift — apprenticeship, volunteering, community service |
| [`month.sas.json`](month.sas.json) | on-chain, a [SAS](https://attest.solana.com/) schema | The Merkle root of a month of leaves. Knows nothing of either profile. |
| [`workout-completed.json`](workout-completed.json) | — | **Superseded.** v1, kept unchanged so leaves signed under it keep verifying. |

Two profiles is not decoration. One schema is a format; two schemas sharing a
base are a protocol — and the second keeps the first honest, because the day
something fitness-shaped leaks into the base, `hours-worked` stops making
sense. Adding a third costs a JSON file and a set of vectors: nothing on-chain
moves, because `month.sas.json` never knew about the first two.

See [`../spec/profiles.md`](../spec/profiles.md) to write one.

## Tools

| | |
|---|---|
| [`verify_leaf.py`](verify_leaf.py) | Verifies a leaf straight out of a phone, in 78 lines, without importing a line of the app that wrote it: `python verify_leaf.py 2026-09.jsonl` |
| [`vectors/check_vectors.py`](vectors/check_vectors.py) | Runs every vector against its profile, recomputes the canonical bytes, the hashes and the monthly roots, and checks ten cases that must be **refused**. |
| [`vectors/make_hours_worked_v1.py`](vectors/make_hours_worked_v1.py) | Regenerates the `hours-worked` vectors from the spec alone — no app code, no library. |

```
cd vectors && python check_vectors.py
```

A first leaf signed on a real phone on 25 September 2026 verifies: the hash
matches, and the Ed25519 signature checks out against the subject's key.

## Vectors

[`vectors/`](vectors/) holds, for each profile, three leaves — declared alone,
with captures and an instrument, with a human cosigner — each with its
canonical form and its hash, then the root of the month they make and a month
nonce.

An implementation that reproduces these bytes can be verified by anyone; one
that does not, cannot. A format change is a new `/vN`, never a correction.
