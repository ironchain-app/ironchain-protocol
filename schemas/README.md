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

## Versions

Fields are never edited in place. A change to `workout-completed` is a new
`/v2` and a new `leafVersion`; the on-chain schema does not move. A change to
the on-chain layout is a new SAS schema version; the old one is paused and its
attestations stay readable.
