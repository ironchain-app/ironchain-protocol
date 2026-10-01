# The anchor

> Normative. Nothing on this page knows what is being proved — this is the
> layer that is already a protocol.

A month of leaves becomes **one** attestation on Solana. Not one write per
fact: twelve writes a year, per subject, whatever the subject did.

> **Draft, 1 October 2026.** The month of an attestation becomes the month it
> is *written*, not the month the sessions took place, and the leaves inside it
> stay grouped by session month. See [The anchoring month](#the-anchoring-month-draft).
> Everything else on this page still holds; the implementations in
> `devnet/anchor.ts` and in the app still build the one-level tree below.

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

## The anchoring month (draft)

> Written on 1 October 2026 by Joris, while Léo is ill, from a decision taken
> the same day. To be reviewed by Léo. Nothing below is implemented yet: the
> attestations written so far use `schemaVersion` 1 and the one-level tree.

**A leaf is anchored in the month it reaches the issuer, never in an earlier
one.** A session signed offline on the 31st and sent on the 3rd goes into the
3rd's month. A subject whose issuer anchors nothing for a year — a free plan,
say — keeps signing leaves; the first anchor written for them carries all of
them at once. No month is ever rewritten after it is anchored, and nothing is
lost waiting: the leaves stay on the subject's device, and in their encrypted
backup if they keep one.

The address and the expiry follow the anchoring month: the nonce uses its
`YYYY-MM`, `periodStart` is its first second, and the attestation expires six
months later. An anchor written in October may therefore prove a session from
March. The leaf's own `window` still says when the session happened; the
anchoring month only says when it was written.

### Grouped by session month

Inside one anchor, the leaves stay **separated by the month their session took
place** (`window.start`, UTC). That is what lets a subject, on their own device,
match their decrypted data month by month against what was anchored — the
issuer never needs to see that data, and never does.

1. For each session month `m` present, build the tree of its leaves exactly as
   in [The Merkle root](#the-merkle-root). Its top is the sub-root `R(m)`.
2. Turn each into a month node: `SHA-256(0x02 ‖ "YYYY-MM" ‖ R(m))`. The prefix
   `0x02` keeps a month node from being mistaken for a leaf (`0x00`) or an
   inner node (`0x01`).
3. **Sort the month nodes by their `YYYY-MM`**, ascending, and pair them with
   the same rule as above (`0x01`, odd node carried up). The top is
   `merkleRoot`.

The on-chain layout does not change: `merkleRoot` is still 32 bytes and
`leafCount` counts every leaf in the anchor. `schemaVersion` says which tree was
built — 1 for the one-level tree, **2** for the tree grouped by session month.

### Verifying a leaf under version 2

1. Verify the leaf ([`leaf.md`](leaf.md)).
2. Recompute `R(m)` from `leafHash` and its path, then the month node.
3. Recompute the root from the month node and its path.
4. Derive the address from `subject` and the **anchoring** month, and compare.

The anchoring month comes from the receipt. Without one, a verifier tries the
session's month, then each following month: the addresses cost nothing to
derive, and a subject has at most one anchor per month.

The receipt gains what step 2 and step 4 need:

```jsonc
{
  "anchorMonth": "2026-10",
  "months": [{ "month": "2026-03", "subRoot": "<hex>", "leafCount": 12 }],
  "leaves": [{ "leafHash": "<hex>", "month": "2026-03",
               "path": ["<hex>", "..."], "monthPath": ["<hex>", "..."] }]
}
```

What the issuer receives to write an anchor is the leaves' hashes and
signatures, so that it can refuse an invalid one — never the payload, and
never the decrypted data the subject matches against it.

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
