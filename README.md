# Iron Chain Protocol

**An open standard for proving that something happened, on Solana.**

Not *"it is true"* — **which independent signals corroborate the claim**, and who signed them. The protocol never learns what it is proving: that is the issuer's business.

Apache-2.0 · built on the [Solana Attestation Service](https://attest.solana.com/)

> **The specification is in [`spec/`](spec/)** — the leaf, the six signals,
> the monthly anchor, and how to bring your own domain. Three of those four
> pages do not know what is being proved.
>
> **Status: early.** The format is deployed on devnet and validated end to end.
> Schemas are being deployed on devnet; the TypeScript SDK and a Flutter plugin
> follow. The wallet signing path is validated on real hardware (Phantom and
> Solflare, via Mobile Wallet Adapter, on devnet). Everything in this repository
> is subject to change until the first tagged release — the roadmap lives in
> the issues.

---

## The problem

A blockchain records what you give it. It verifies nothing.

If someone types *"I did 100 push-ups"*, *"I worked eight hours"* or *"I
inspected the site"*, and we write that to Solana, we have permanently recorded
a claim — and given it the appearance of proof. That is worse than recording
nothing at all.

Most projects that put activity on a chain work around this instead of
addressing it: they write self-declared data and call it proof.

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
| `D` | **Declared** — the subject states it and signs with their own key | Authorship and intent. Nothing else. | none |
| `B` | **Bracketed** — a capture at each end of the window, taken in-app | The window was inhabited | low–medium |
| `M` | **Measured** — an instrument produced the numbers, not a keyboard | A sensor was involved | medium |
| `C` | **Coherent** — the numbers hold together, and against this subject's own history | The claim matches the record | **high** |
| `W` | **Witnessed** — a human who was present signed | Someone was there | **high** |
| `N` | **Notarized** — a human whose accreditation the issuer verified signed, and staked it | An identified professional is exposed | **highest** |

A proof carries the signals it actually has. Nothing more. `D B M C` are
machines and arithmetic; `W N` are people — and that line is the one worth
drawing.

`N` is named for the role, never the trade: a coach in a training app, a
physiotherapist in rehabilitation, an inspector on a site, an investigator in
a study. Full definitions in [`spec/signals.md`](spec/signals.md).

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
a notarizing professional is identified and can be struck off — the money makes an
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
- **Not a fitness format.** Training was the first domain, not the shape of
  the thing. See [`spec/profiles.md`](spec/profiles.md).

## Privacy by design

**Proving that something happened never requires us to see it.**

Photos are hashed **on the device**. Only the SHA-256 digest is written. The
photo itself is never uploaded by default — keeping it is the user's choice, not
a condition of the proof.

To verify later, the user shows the photo to whoever asks, and that person
recomputes the hash. We never had to hold it.

No face is required — a piece of equipment, a place, a position is enough.
Less biometric data, less risk, more adoption.

The same reflex applies to anything identifying but comparable: `hours-worked`
carries a *digest* of the organisation, not its name, so a reader can confirm
"the same place as last week" without learning which place.

| ❌ Never on-chain | ✅ On-chain |
|---|---|
| Weight, heart rate, HRV, calories | SHA-256 digest of the off-chain data |
| Photos | SHA-256 digest of the photo |
| Names, e-mails, health conditions | Public keys, timestamps, signal codes |

The chain is permanent; the GDPR requires erasure. Only what can stay forever
goes on-chain — and none of it identifies a person.

## The proof format

**One envelope, any number of domains.** Every leaf — in every trade — is
[`leaf.base.json`](schemas/leaf.base.json):

```jsonc
{
  "schema":      "<family>/<name>/v1",
  "subject":     "<public key>",           // the only identity there is
  "window":      { "start": 1757404800, "end": 1757408400 },
  "signals":     ["D", "B", "M", "C"],
  "payloadHash": "<SHA-256 of the off-chain payload>",
  "photoHashes": ["<SHA-256 t0>", "<SHA-256 t1>"],   // with B
  "device":      { "kind": "watch", "baselineDays": 47 },  // with M or C
  "cosigners":   [{ "key": "…", "role": "witness" | "notarized", "signature": "…" }],
  "meta":        { },
  "signature":   "<the subject's Ed25519 signature>"
}
```

A **profile** adds the two or three fields its trade genuinely needs, and
nothing else. Two exist:

| Profile | Family | What it proves | Fields of its own |
|---|---|---|---|
| [`workout-completed`](schemas/workout-completed-v2.json) | `proof-of-activity` | a finished training session | `activity` |
| [`hours-worked`](schemas/hours-worked.json) | `proof-of-presence` | one shift — apprenticeship, volunteering, community service | `category`, `organisation`, `supervised` |

The second is not a placeholder. It has its own
[test vectors](schemas/vectors/hours-worked-v1.json), it is validated by
[`check_vectors.py`](schemas/vectors/check_vectors.py), and it exists to keep
the first honest: the day something fitness-shaped leaks into the base,
`hours-worked` stops making sense.

**Adding a domain costs a JSON file and a set of vectors.** No program to
write, no audit, no deployment, no governance — because the on-chain schema
never knew about the first two either. `month.sas.json` carries a root, a
count, a period and a version, and would be identical for a gym, a workshop, a
clinic or a laboratory.

Rehabilitation, field inspections, clinical studies: same envelope, same six
signals, same monthly attestation. See
[`spec/profiles.md`](spec/profiles.md) to write one.

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
| Another app, any domain | Define a profile, issue compatible proofs — its users keep them the day they leave |
| A training centre | Count apprenticeship hours without holding the apprentice's data |
| An insurer | Apply its own threshold policy to the signals, and no one else's |
| A DePIN device maker | Attest measurements at the source |
| Anyone at all | Derive an address, read a proof, verify it — no account, no key, no permission |

## Repository layout

```
spec/       the specification: leaf, signals, anchor, profiles
schemas/    the base envelope, the profiles, the on-chain schema, the vectors
devnet/     deployment, anchoring and cost bench, devnet only
sdk/        TypeScript SDK — emit, read, verify                 (coming)
flutter/    Flutter plugin over the same SDK                    (later)
docs/       Integration guide                                   (coming)
```

## License

Apache-2.0. Contributions welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md).
