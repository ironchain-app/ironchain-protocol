# The anchor

> Normative. Nothing on this page knows what is being proved — this is the
> layer that is already a protocol.

A month of leaves becomes **one** attestation on Solana. Not one write per
fact: twelve writes a year, per subject, whatever the subject did.

That ratio is the reason the protocol exists. A design that writes every fact
is affordable in a demo and impossible in production; at one write per
fact, a serious user costs more in rent than they will ever pay.

## The Merkle root

Take the leaf hashes of one subject, for one month:

1. **Sort them as bytes**, ascending. Plain byte order over the 32 bytes —
   not by time, not by insertion.
2. Pair them left to right: `node = SHA-256(0x01 ‖ left ‖ right)`.
3. An odd node at the end of a level is carried up unchanged.
4. Repeat until one node remains. That is `merkleRoot`.

Sorting by hash, and not by time, is what makes the tree a function of the
set: two implementations that received the same leaves in a different order
must produce the same root, or an inclusion path proves nothing.

> **Correction, 25 September 2026.** Earlier prose in `schemas/README.md` said
> "sort by `window.start`, then by hash". No implementation ever did that —
> the Dart in the app, the TypeScript in `devnet/anchor.ts` and the published
> vectors all sort by hash alone, and they agree on the root
> `40782346…18a0`. The prose was the outlier and is corrected here. This is
> exactly what test vectors are for.

`0x01` for nodes against `0x00` for leaves ([`leaf.md`](leaf.md)): without
distinct prefixes, a crafted leaf could be presented as an interior node.

## One root, one subject

A root covers **exactly one key**. Never two, never a group.

An attestation is *one proof per person per month*; folding two subjects into
one tree would produce something neither of them could use, because the
address is derived from the subject. `devnet/anchor.ts` refuses a file
carrying more than one subject rather than pick.

## The attestation

Written on the [Solana Attestation Service](https://attest.solana.com/) with
the schema [`month.sas.json`](../schemas/month.sas.json) — five fields, none
of which knows a trade:

| Field | | |
|---|---|---|
| `schemaVersion` | `U8` | 1 |
| `periodStart` | `I64` | first second of the month, UTC |
| `merkleRoot` | `VecU8` | 32 bytes |
| `leafCount` | `U16` | leaves in the tree |
| `leafVersion` | `U8` | which profile version the leaves follow |

### The address

```
nonce = SHA-256(subject public key bytes ‖ "ironchain-month" ‖ "YYYY-MM")
```

and the attestation address is the SAS PDA over `(credential, schema, nonce)`.

**This is the part with no API in it.** Anyone who knows a key and a month can
derive the address and read it. No account, no key, no permission, nobody to
ask — including us. A proof that needed us to be reachable would not be a
proof, it would be a service.

## Verifying one fact

Given a leaf, its inclusion path and the subject's key:

1. Verify the leaf ([`leaf.md`](leaf.md)).
2. Recompute the root from `leafHash` and the path.
3. Derive the attestation address from `subject` and the month.
4. Read it, and compare the root.

Four steps, no dependency on the issuer.

## Expiry, and what survives

An attestation expires at `periodStart + 6 months`. The issuer then closes it
and recovers the rent — the account disappears from current state.

**The proof does not.** The transaction that created it stays in the ledger
forever. Verification then reads that transaction instead of the account, and
the receipt below is what finds it.

This is why the write is cheap rather than free: rent is a deposit, returned.
Measured on devnet on 24 September 2026, a monthly attestation immobilises
1 772 920 lamports — about **$0.20** at the time — of which roughly $0.002 in
fees is actually spent. **The cost is absorbed, never cancelled**: a relayer
who pays on a subject's behalf *advances* the money. Any implementation that
describes a chain write as "free" or "sponsored" is describing something else.

## The receipt

Every write leaves a receipt, kept on the subject's device and, for a paying
user, in the issuer's database. It is a shortcut, never a requirement: the
proof verifies without it, and without the issuer.

```jsonc
{
  "cluster":   "mainnet-beta",
  "kind":      "month",                   // or "badge"
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

A change to the on-chain layout is a new SAS schema version. The old one is
paused, and its attestations stay readable — a schema that stopped resolving
would retroactively destroy proofs that were valid when they were written.

## Open: changing key

`subject` **is** the identity, and the address is derived from it. A root
therefore covers one key and cannot be made to cover two.

Someone who changes wallet loses nothing: both sets of leaves stay valid and
verifiable. But they do not add up. That month produces two attestations, a
streak restarts, and badges already minted stay on the old key. Nothing links
the two, on purpose — writing *"these two addresses are the same person"*
would publish an identity claim nobody can check.

**This is not specified yet.** The expected shape is a rotation statement
signed on both sides: the old key declares that its proofs continue under the
new one, the new key countersigns, and each reader decides whether to follow
the chain. Until it is written, an issuer should not offer a migration — a
known limit beats an improvised link.
