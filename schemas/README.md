# Schemas

Two layers. The session stays with the user; only a month's fingerprint goes on-chain.

| File | Where it lives | What it is |
|---|---|---|
| [`workout-completed.json`](workout-completed.json) | off-chain, on the user's device (and their encrypted backup) | one session, a JSON Schema — the **leaf** |
| [`month.sas.json`](month.sas.json) | on-chain, a [SAS](https://attest.solana.com/) schema | the Merkle root of a month of leaves |

## From a session to the chain

1. **Leaf hash.** Remove `signature`, canonicalise the rest with
   [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) (JCS), then
   `leafHash = SHA-256(0x00 ‖ canonical bytes)`.
2. **Signature.** The subject's wallet signs the 32 bytes of `leafHash`
   (Ed25519). The app never holds the key.
3. **Month root.** Sort the month's leaf hashes by `window.start`, then by hash.
   Pair them: `node = SHA-256(0x01 ‖ left ‖ right)`; an odd node is carried up
   unchanged. The last node is `merkleRoot`. The `0x00` / `0x01` prefixes stop
   a node from passing for a leaf.
4. **Attestation.** The issuer writes one `ironchain-month` attestation per
   person per month, with the nonce and expiry given in `month.sas.json`.

## Verifying a leaf by hand

[`verify_leaf.py`](verify_leaf.py) recomputes a leaf's hash from the file
alone — no dependency, no network, nothing borrowed from the app that wrote
it. A first leaf signed on a real phone on 25 September 2026 verifies: the
hash matches, and the Ed25519 signature checks out against the subject's key.

## What the wallet signs

Not the 32 raw bytes of the hash — a printable text that carries it:

```
Iron Chain
Sign this session
proof-of-activity/workout-completed/v1
leaf <64 hex chars>
```

A wallet handed an opaque blob cannot tell its holder what they are signing;
that is the shape of a disguised transaction, and Solflare says so out loud.
The text above is displayed as-is, and no runtime will ever execute it. A
verifier rebuilds it from the leaf — there is nothing to guess.

## Test vectors

[`vectors/workout-completed-v1.json`](vectors/workout-completed-v1.json) holds
three leaves — declared only, with photos and a watch, with a witness — each
with its canonical form and its hash, then the root of the month they make and
a month nonce.

An implementation that reproduces these bytes can be verified by anyone; one
that does not, cannot. They come from the Dart implementation shipped in the
app (`lib/solana/leaf.dart`), where a test fails the day the canonicalisation
moves. A format change is a `/v2`, never a correction.

## Verifying one session

Given a leaf, its inclusion path and the subject's key, anyone can: check the
leaf against `workout-completed.json`, check `signature` against `subject`,
recompute the root from the path, derive the attestation address from the
subject and the month, and compare. No account, no API, no permission.

After expiry the issuer closes the attestation to recover its rent. The account
disappears from current state; the transaction that created it stays in the
ledger, and verification then reads that transaction instead.

## The receipt

Every write leaves a receipt, kept on the user's device and, for a paying
user, in the issuer's database. It is a shortcut, never a requirement: the
proof verifies without it, and without the issuer.

```jsonc
{
  "cluster":   "mainnet-beta",
  "kind":      "month",                  // or "badge"
  "address":   "<attestation or asset>",
  "signature": "<transaction signature>", // finds it in the ledger forever
  "slot":      289441207,
  "blockTime": 1759276800,
  "merkleRoot": "<hex>",                  // month only
  "leaves": [{ "leafHash": "<hex>", "path": ["<hex>", "..."] }]
}
```

`signature` and `slot` are what survive the closing of the account: with them,
any archive node returns the original transaction and its data.

## Open: changing key

A leaf's `subject` **is** the identity, and a month's attestation is derived
from it — `nonce = SHA-256(subject ‖ "ironchain-month" ‖ "YYYY-MM")`. A root
therefore covers exactly one key.

Someone who changes wallet mid-month loses nothing: both sets of leaves stay
valid and verifiable. But they do not add up. That month produces two
attestations, a streak restarts, a record loses its past, and badges already
minted stay frozen on the old key. Nothing links the two, on purpose —
writing "these two addresses are the same person" would publish an identity
claim nobody can check.

**This is not specified yet.** The expected shape is a rotation statement
signed on both sides: the old key declares that its proofs continue under the
new one, the new key countersigns, and each reader decides whether to follow
the chain. Until it is written, an issuer should not offer a migration: a
known limit beats an improvised link.

## Versions

Fields are never edited in place. A change to `workout-completed` is a new
`/v2` and a new `leafVersion`; the on-chain schema does not move. A change to
the on-chain layout is a new SAS schema version; the old one is paused and its
attestations stay readable.
