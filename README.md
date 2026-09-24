# Iron Chain Protocol

**An open standard for verifiable proof of physical activity, on Solana.**

Apache-2.0 · built on the [Solana Attestation Service](https://attest.solana.com/)

> **Status: early.** The proof format below is the working specification.
> Schemas are being deployed on devnet; the TypeScript SDK and a Flutter plugin
> follow. The wallet signing path is validated on real hardware (Phantom and
> Solflare, via Mobile Wallet Adapter, on devnet). Everything in this repository
> is subject to change until the first tagged release — the roadmap lives in
> the issues.

---

## The problem

A blockchain records what you give it. It verifies nothing.

If someone types *"I did 100 push-ups"* and we write that to Solana, we have
permanently recorded a claim — and given it the appearance of proof. That is
worse than recording nothing at all.

Every "fitness on blockchain" project we know of works around this problem
instead of addressing it: they write self-declared data and call it proof.

## What this standard does

**It does not claim that an activity was verified.** It records **which
independent signals corroborate the claim**, and lets each consumer decide what
threshold they accept.

An insurer, a gym and a social app do not need the same level of certainty. A
standard that hard-codes a verdict serves none of them. A standard that records
evidence serves all three.

### The six signals

| Code | Signal | What it establishes | Cost to fake |
|---|---|---|---|
| `D` | **Declared** — the user logs the session | Nothing. It is the starting point. | None |
| `B` | **Bracketed** — timestamped photos at start and end, taken in-app | Something happened between t₀ and t₁ | Low to medium |
| `M` | **Measured** — sensor data (heart rate, calories, steps) over t₀→t₁ | A body was under load | Medium |
| `C` | **Coherent** — the heart-rate curve is physiologically consistent with the declared effort: ramp-up, plateau, recovery | The effort matches what is claimed | **High** |
| `W` | **Witnessed** — countersigned by a peer present over video | A human saw the session | **High** |
| `N` | **Notarized** — countersigned by a verified coach | An identified professional stakes their reputation | **Highest** |

A proof carries the signals it actually has. Nothing more.

### On paying witnesses

A witness who is never paid does not show up, and a signal that never exists is
worth exactly as much as a corrupted one: nothing. So witnesses are paid — and
one rule makes that survivable.

**They are paid for being present, not for the verdict.** The fee is the same
whether they certify or decline. Buy a yes and you own a yes; buy attention and
you own attention. Everything else follows from that line:

- **Weight comes from history, not from the fee.** A key that has only ever
  signed for one person counts for almost nothing. Distinct counterparts, key
  age and refusals are what a reader should weigh — a witness who has declined
  is worth more, not less.
- **The reward scales with that history, and is destroyed by a false
  attestation.** The witness is protecting future income, not closing a sale.
- **Capped and held.** Earnings are capped per week and paid in arrears, so a
  proof that is later challenged can still claw them back.

This is why `W` is rated **high** and no longer *very high*: the honest cost of
faking it is the price of a witness, multiplied by the standing they are willing
to lose. That is a real cost, and it is not infinite. `N` sits above it because
a verified coach is identified and can be struck off — the money makes an
identified professional careful, where it could make an anonymous peer
compliant.

### Why signals and not a score

A standard that records *"level 3"* ages badly. The day someone finds a way to
fake one signal, every past attestation collapses with it.

Signals do not collapse. A consumer who stops trusting `B` can still read `M`,
`C` and `W` from the same attestation, including on attestations issued years
earlier.

## What this is not

- **Not a token.** The only tokens issued are non-transferable attestations that
  the user owns. No speculative token, no rewards for moving.
- **Not a health record.** Nothing identifying and nothing medical is ever
  written on-chain.
- **Not a verdict.** The protocol does not decide whether you trained. It records
  what corroborates your claim.
- **Not tied to Iron Chain.** Any app can issue and read these proofs.

## Privacy by design

**Proving that you trained never requires us to see your body.**

Photos are hashed **on the device**. Only the SHA-256 digest is written. The
photo itself is never uploaded by default — keeping it is the user's choice, not
a condition of the proof.

To verify later, the user shows the photo to whoever asks, and that person
recomputes the hash. We never had to hold it.

No face is required. A soaked t-shirt, a position, a piece of equipment is
enough. Less biometric data, less risk, more adoption.

| ❌ Never on-chain | ✅ On-chain |
|---|---|
| Weight, heart rate, HRV, calories | SHA-256 digest of the off-chain data |
| Photos | SHA-256 digest of the photo |
| Names, e-mails, health conditions | Public keys, timestamps, signal codes |

The chain is permanent; the GDPR requires erasure. Only what can stay forever
goes on-chain — and none of it identifies a person.

## The proof format

Six attestation types share one structure.

```jsonc
{
  "schema":      "proof-of-activity/<type>/v1",
  "subject":     "<public key>",
  "window":      { "start": 1757404800, "end": 1757408400 },
  "signals":     ["D", "B", "M", "C"],
  "payloadHash": "<SHA-256 of the off-chain payload>",
  "photoHashes": ["<SHA-256 t0>", "<SHA-256 t1>"],
  "device":      { "kind": "ring" | "watch" | "phone", "baselineDays": 47 },
  "cosigners":   ["<public key>"],
  "meta":        { }
}
```

| Type | Trigger | Signals it targets |
|---|---|---|
| `workout-completed` | end of a session | D, B, M, C |
| `personal-record` | a new personal best | D, M, C |
| `duel-result` | end of a 1-on-1 | D, M, C, **W** |
| `coached-session` | session with a verified coach | D, M, C, **N** |
| `streak` | N sessions in N days | derived from the above |
| `goal-reached` | a stated goal is met | D, B, M |

`coached-session` implies **no payment**. The coach countersigns; that is all.

## Emit a proof

*The SDK is not published yet — package name to be announced. This is the
intended surface.*

```ts
import { emit } from "<package>";

const proof = await emit({
  type:    "workout-completed",
  subject: userPublicKey,
  window:  { start, end },
  signals: ["D", "M", "C"],
  payload,          // hashed locally, never uploaded
});

console.log(proof.explorerUrl);
```

**Live on devnet** (Solana Attestation Service):

| | Address |
|---|---|
| Issuer credential `IRONCHAIN` | [`HXXy1V3Xhq6uqTADqRH82kA2KFNFSpyw1YDfS6UcLktY`](https://explorer.solana.com/address/HXXy1V3Xhq6uqTADqRH82kA2KFNFSpyw1YDfS6UcLktY?cluster=devnet) |
| Schema `ironchain-month` v1 | [`4foH7uRksuSKzWbTyhM3ZdjrRBTQmsmBQewag7VPh5a5`](https://explorer.solana.com/address/4foH7uRksuSKzWbTyhM3ZdjrRBTQmsmBQewag7VPh5a5?cluster=devnet) |

A session stays with the user; one attestation a month carries the Merkle root
of their signed sessions. See [`schemas/`](schemas/).

Anyone can verify it without us, without an account, and without asking
permission. That is the point.

## Why Solana

Three reasons, none of which is transaction cost.

**The Solana Attestation Service.** This standard does not invent its own
infrastructure: it defines SAS schemas. SAS is maintained by the Solana
Foundation under Apache-2.0, and exists nowhere else. We extend a public good
rather than rebuild one.

**Seed Vault.** Hardware-backed signing on the phone is a Solana Mobile
primitive. A countersignature that costs a fingerprint, not a password, has no
equivalent elsewhere. And signing always happens in the user's own wallet —
apps issuing proofs never hold keys. On mobile this goes through the Mobile
Wallet Adapter, on Seeker through Seed Vault.

**Ownership that survives us.** The attestation lives in the user's wallet. If
Iron Chain shuts down tomorrow, the proof remains, and remains verifiable.

## What others can do with it

The honesty test for a public good: what is it worth **without** Iron Chain?

| Who | Use |
|---|---|
| Another fitness app | Issue compatible proofs — its users keep them when they leave |
| A gym | Check a member's attendance without asking for their data |
| A health insurer | Apply its own threshold policy to the signals |
| A DePIN device maker | Attest measurements at the source |

## Repository layout

```
schemas/    the session leaf and the monthly on-chain schema
devnet/     deployment script and cost bench, devnet only
sdk/        TypeScript SDK — emit, read, verify                 (coming)
flutter/    Flutter plugin over the same SDK                    (later)
docs/       Integration guide                                   (coming)
```

## License

Apache-2.0. Contributions welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md).
