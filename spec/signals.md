# The six signals

> Normative. Defined here without any trade: a signal means the same thing in
> a gym, a workshop, a clinic and a laboratory.

A proof does not say *"this is true"*. It says **which independent things
corroborate the claim**, and lets each reader decide what they require.

There is no score and no level. An insurer, a gym and a social app do not need
the same certainty; a standard that hard-codes a verdict serves none of them,
and one that records evidence serves all three.

| Code | Signal | Produced by | What it establishes | Cost to fake |
|---|---|---|---|---|
| `D` | **Declared** | the subject | Authorship and intent. Nothing else. | none |
| `B` | **Bracketed** | the app | The window was inhabited | low–medium |
| `M` | **Measured** | an instrument | The numbers came from a sensor, not a keyboard | medium |
| `C` | **Coherent** | the issuer | The numbers hold together, and against this subject's own history | **high** |
| `W` | **Witnessed** | a human | Someone who was there signed | **high** |
| `N` | **Notarized** | a human | Someone whose accreditation was verified signed, and staked it | **highest** |

`D B M C` are machines and arithmetic. `W N` are people. That line is the one
worth drawing: everything above it can be scaled, and everything below it
costs someone's time and standing.

**Who answers for each signal, in this version.** Only two things in a leaf are
cryptographic: the subject's signature, and each cosigner's. `B`, `M` and `C`
are written by the issuer's app into the leaf the subject signs — a modified
client can write them too. What makes them worth more than `D` is the issuer:
**an issuer that anchors a leaf vouches for its `B`, `M` and `C`, and must not
anchor a leaf whose signals it has not checked.** The "cost to fake" column is
the cost of fooling a careful issuer, not of fooling the format. A reader
weighs these signals by the issuer whose credential anchored them.

---

## `D` — Declared

The subject states the fact and signs it with their own key. Always present:
a leaf without `D` is not a leaf.

It proves nothing about the world, and it is not meant to. What it establishes
is **authorship** — this key said this, at this time, and cannot later deny
it. Every other signal is something added on top.

## `B` — Bracketed

Two captures taken in-app, one at each end of the window, their digests in
`photoHashes`.

**It does not prove what happened between them.** It proves the window was
inhabited: someone was there at `start` and there at `end`, and produced
material the app itself timestamped. Read it as a bound on time, never as
evidence of content.

The images stay with the subject. Only the digests travel, which is what lets
someone reveal one later — to a single reader, once — without ever having
published it.

`B` says *someone*. It does not say *who* — nothing binds the person in the
frame to the key that signs. That gap has a drafted answer (`identity.md`,
the `P` signal); until it ships, readers should assume `B` is anonymous.

## `M` — Measured

The numbers came from an instrument the subject already used, not from a form.
Requires `device`, with its `kind` and its `baselineDays`.

**`baselineDays` is the point of the field.** A device that has known this
subject for a week can produce numbers; it cannot produce numbers that are
hard to fake, because there is nothing to compare them to. A year of history
is what makes the next hour expensive to invent.

## `C` — Coherent

The measurements hold together — internally, and against this subject's own
history on this device.

**`C` is the issuer's judgement, and the issuer answers for it.** It is the
only signal that is a judgement rather than a fact, and it is the reason the
issuer exists at all. In this version it travels inside the leaf the subject
signs, so the only thing that separates a real `C` from a typed one is the
credential that anchors the month (see above). A signature of the issuer's own
over `leafHash` and the signals it attests is planned for the next profile
version; until then, a reader who needs `C` to be more than the issuer's word
asks the issuer for its check. What "coherent" means is the issuer's business and
belongs in their documentation: a heart-rate curve that ramps and recovers, a
badge-in that matches a commute, a sample weight that matches the vessel. The
protocol records that the issuer asserted it, not how.

A reader who does not trust an issuer's arithmetic can ignore `C` and read the
rest. Nothing forces them to accept it.

## `W` — Witnessed

A human who was present signed. No accreditation is asked for and none is
checked: their key is their name.

**A witness is paid for being present, not for the verdict.** The fee is the
same whether they confirm or decline. Buy a yes and you own a yes; buy
attention and you own attention.

What gives a witness weight is their history, not their fee: distinct
counterparts, the age of the key, and refusals. **A witness who has declined
is worth more, not less.** A key that has only ever signed for one person
counts for almost nothing, and a reader should say so.

That history is **an issuer's policy, not something the protocol publishes.**
Leaves stay with their subjects and a refusal leaves no record, so a reader
cannot compute a witness's counterparts from public data alone. Making it
computable — a monthly root per witness key, over the payloads it signed and
refused — is open work.

## `N` — Notarized

A human whose accreditation the **issuer** verified signed, and stakes that
accreditation on it.

**The protocol names the role; the app names the trade.** In a training app
that person is a coach. In rehabilitation, a physiotherapist. On a site, an
inspector. In a clinical study, an investigator. The leaf says `notarized`,
because a protocol that said `coach` would be a fitness format wearing a
protocol's name.

`N` is the strongest signal and the most fragile: it is worth exactly what the
issuer's verification of accreditation is worth. An issuer who rubber-stamps
`N` is not producing a strong proof, they are producing a `D` with extra
steps.

**Accreditation is not yet a protocol object.** `role: notarized` is written
in the leaf by the subject, and any key can sign as a cosigner. The planned
answer is an accreditation attestation — one SAS attestation per accredited
cosigner key, under the issuer's credential, with an expiry, revoked by
closing it. Until it exists, the rule is normative: **a reader reads a
`notarized` cosigner without a valid accreditation attestation, under a
credential the reader accepts, at `window.end`, as `W`.**

---

## Reading a set of signals

A leaf carries the signals it really has. Composition is the reader's job, and
the protocol deliberately offers no formula:

- `D` alone is a diary entry. Useful to its author, worth nothing to a
  stranger.
- `D M C` is a machine's account, believable at scale, with no human in it.
- `D B W` is a human's account with a bounded window and no instrument.
- Everything at once is expensive to produce and expensive to fake, which is
  the whole idea.

An issuer may publish its own thresholds — *"we pay on `M C`, never on `D`
alone"* — and that is a product decision, made in the open, revisable, and
never baked into the format.
