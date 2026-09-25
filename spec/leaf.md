# The leaf

> Normative. Everything here is domain-neutral: nothing on this page knows
> what is being proved.

A **leaf** is one fact, signed by the key it belongs to. It stays off-chain,
on the subject's device. Only its hash ever reaches Solana, folded into the
month's root ([`anchor.md`](anchor.md)).

A leaf is a JSON object matching [`leaf.base.json`](../schemas/leaf.base.json),
plus whatever fields its profile adds ([`profiles.md`](profiles.md)).

## The envelope

| Field | | What it is |
|---|---|---|
| `schema` | required | The profile and its version, `family/name/vN` |
| `subject` | required | The key the fact belongs to, and the key that signs |
| `window` | required | `start` and `end`, UTC seconds |
| `signals` | required | Which of `D B M C W N` this leaf really has |
| `payloadHash` | required | SHA-256 of the detail, which stays with the subject |
| `signature` | required | The subject's Ed25519 signature |
| `photoHashes` | with `B` | The capture at each end of the window |
| `device` | with `M` or `C` | The instrument, and how long it has known this subject |
| `cosigners` | with `W` or `N` | The humans who signed, and their role |
| `meta` | optional | Free, per issuer. Never identifying |

**`subject` is the only identity the protocol has.** A key, and the signals it
signed. The link between that key and a person lives in the issuer's app,
under consent, and is never written on-chain.

## The hash

1. Remove `signature`. Remove any local bookkeeping the issuer added outside
   the schema (a receipt field, a cached `leafHash`).
2. Canonicalise the rest with [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785)
   (JCS): keys sorted by UTF-16 code unit, no insignificant whitespace,
   shortest round-tripping form for numbers.
3. `leafHash = SHA-256(0x00 ‖ canonical UTF-8 bytes)`.

The `0x00` prefix is not decoration. Merkle nodes are hashed under `0x01`
([`anchor.md`](anchor.md)), and without distinct prefixes a crafted leaf could
be presented as an interior node — the second-preimage attack every Merkle
design has to answer.

**Why canonicalisation at all.** Two libraries serialising the same object
disagree about key order, spacing and how to write `1.0`. A signature over
"the JSON" would then verify on one machine and fail on another. JCS makes the
bytes a function of the value, so the hash is reproducible by anyone who has
the spec and nothing else.

### Numbers

The profiles in this repository use integers only, and an implementation is
free to reject a non-integer. If a profile admits fractional numbers, JCS
requires the ECMAScript `Number::toString` form; values outside
`1e-6 ≤ |x| < 1e21`, as well as `NaN` and the infinities, have no
canonical form and must be refused rather than approximated.

## What the wallet signs

Not the 32 raw bytes of the hash. A printable text that carries it:

```
Iron Chain
Sign this <noun>
<schema>
leaf <64 hex chars>
```

`<noun>` is the profile's word for what is being signed — `session` for
`workout-completed`, `shift` for `hours-worked`. It is display only: a
verifier rebuilds the whole text from the leaf, so there is nothing to guess
and nothing to trust.

A wallet handed an opaque blob cannot tell its holder what they are signing —
that is the shape of a disguised transaction, and Solflare refuses it out
loud. This was not a design preference; it was found on a real phone on
24 September 2026.

The signature is Ed25519 over the UTF-8 bytes of that text, by `subject`.

## Verifying a leaf

With the leaf file alone, and no network:

1. Validate it against its profile schema.
2. Recompute `leafHash` (steps above).
3. Rebuild the signing message and verify `signature` against `subject`.
4. If `cosigners` is present, verify each signature over the 32 raw bytes of
   `payloadHash`.

That is the whole test, and it needs neither the issuer nor us.
[`../schemas/verify_leaf.py`](../schemas/verify_leaf.py) does it in 78 lines
without importing a line of the app that wrote the leaf.

**Cosigners sign `payloadHash`, not `leafHash`.** A witness signs what
happened, not the record of it — otherwise their signature would have to be
folded back into the leaf that contains it, and no order of operations
resolves that. It also means a cosigner never sees `signals`, so they cannot
be made to endorse a claim about their own signal.

## Versions

Fields are never edited in place. Any change to a profile — a new field, a
widened enum, a narrowed bound — is a new `/vN` and a new `leafVersion`
on-chain. The old profile stays in the repository, readable, so leaves signed
under it keep verifying forever.

Test vectors are the enforcement, not the prose:
[`../schemas/vectors/`](../schemas/vectors/) holds canonical bytes and hashes
that any implementation must reproduce exactly.
