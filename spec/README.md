# The specification

Four pages. Three of them do not know what is being proved; the fourth is
where a trade is allowed to appear.

| | |
|---|---|
| [**leaf.md**](leaf.md) | One fact, signed by the key it belongs to. The envelope, RFC 8785 canonicalisation, the hash, what the wallet displays, how to verify. |
| [**signals.md**](signals.md) | `D B M C W N` — what each one establishes, and what it costs to fake. Defined without a trade. |
| [**anchor.md**](anchor.md) | A month of leaves becomes one attestation. The Merkle rule, the address anyone can derive, expiry, and what survives it. |
| [**profiles.md**](profiles.md) | How to bring your own domain. What you inherit, what you add, and what you must never put on a leaf. |

## The shape of it

```
   a fact  ─────►  leaf ────────────────────────────►  stays with the subject
                    │
                    │  SHA-256(0x00 ‖ JCS(leaf))
                    ▼
                 leafHash ──┐
                            │   sorted, paired under 0x01
                 leafHash ──┼──────────────►  merkleRoot
                            │
                 leafHash ──┘                      │
                                                   ▼
                                      one attestation, once a month
                                      at an address anyone can derive
```

**Two layers, and the split is the whole design.** Everything that describes a
domain stays off-chain, with the person. What goes on-chain is a root, a
count, a period and a version — five fields that would be identical for a
gym, a workshop, a clinic or a laboratory.

Twelve writes a year per subject, not one per fact. A design that writes every
fact is affordable in a demo and impossible in production.

## What the protocol never does

- **It never says a claim is true.** It records which independent signals
  corroborate it, and the reader decides what they require. There is no score
  and no level.
- **It never learns who someone is.** A leaf carries a public key. The link
  between that key and a person lives in the issuer's app, under consent, and
  is never written.
- **It never needs us.** Deriving an address and verifying a proof takes a
  key, a month and this specification. No account, no API key, nobody to ask.

## Conformance

[`../schemas/vectors/`](../schemas/vectors/) holds canonical bytes, leaf
hashes and monthly roots for both profiles, and
[`check_vectors.py`](../schemas/vectors/check_vectors.py) runs them — plus ten
cases that must be **refused**, because a schema that only says yes is
decoration.

```
cd schemas/vectors && python check_vectors.py
```

An implementation that reproduces these bytes can be verified by anyone; one
that does not, cannot.
