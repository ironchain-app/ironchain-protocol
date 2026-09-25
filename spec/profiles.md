# Profiles — bringing your own domain

> Normative for anyone defining a leaf type. This is the door: everything
> below [`leaf.md`](leaf.md) and [`anchor.md`](anchor.md) is shared, and a new
> trade only writes what is genuinely its own.

A **profile** is a leaf type for one kind of fact. It is the only place where
a domain is allowed to appear.

Two exist today, on purpose:

| Profile | Family | What it proves | Fields of its own |
|---|---|---|---|
| [`workout-completed`](../schemas/workout-completed-v2.json) | `proof-of-activity` | a finished training session | `activity` |
| [`hours-worked`](../schemas/hours-worked.json) | `proof-of-presence` | one shift | `category`, `organisation`, `supervised` |

One schema is a format. **Two schemas sharing a base are a protocol** — and
the second one exists mainly to keep the first honest: the day something
fitness-shaped leaks into the base, `hours-worked` stops making sense, and
that is the alarm.

## What you inherit, and must not redefine

- The envelope: `schema`, `subject`, `window`, `signals`, `payloadHash`,
  `signature`.
- The six signals and their meaning ([`signals.md`](signals.md)). You may
  decide which ones your issuer can produce; you may **not** redefine what one
  means. An app whose `M` means something else breaks every reader.
- The evidence fields that hang off the signals: `photoHashes` (`B`),
  `device` (`M`, `C`), `cosigners` (`W`, `N`), and the conditional
  requirements between them.
- Canonicalisation, the hash, the signing message, the Merkle rule, the
  attestation address.

## What you add

Only what a reader of your domain cannot do without, and nothing that
identifies anyone. In practice that is two or three fields.

**Keep enums coarse.** `activity` has six values for the whole of training; it
is not a taxonomy, because the detail belongs in the payload, behind
`payloadHash`, where it stays with the subject. A field on the leaf is a field
every reader sees forever.

**Digest what is sensitive but comparable.** `hours-worked.organisation` is a
salted SHA-256, not a name: where someone volunteers can say a great deal
about them. The digest lets a reader confirm *"the same place as last week"*
without learning which place, and the subject reveals the preimage when they
choose to. Reach for this pattern whenever a field is useful as an identity
but harmful as a fact.

**Never put a verdict on a leaf.** No score, no level, no "verified: true".
The leaf carries signals; the reader concludes. A profile that ships a verdict
has decided for every future reader, including the ones it was not designed
for.

## Writing one

1. Pick `family/name/v1`. The family says what kind of claim it is
   (`proof-of-activity`, `proof-of-presence`, …); lower case, hyphens, and it
   never changes across versions.
2. Copy [`hours-worked.json`](../schemas/hours-worked.json) — it is the
   smallest complete example — and replace its own fields with yours.
3. Choose the noun the wallet will display: *"Sign this shift"*, *"Sign this
   visit"*. Display only; a verifier rebuilds it from `schema`.
4. Publish vectors. See below.
5. Nothing to deploy. **The on-chain schema does not move**, because it never
   knew about your domain: `month.sas.json` carries a root, a count and a
   version. A new profile changes `leafVersion` and nothing else.

That last point is the whole argument. Adding a trade to Iron Chain costs a
JSON file and a set of vectors — no program to write, no audit, no
deployment, no governance.

### The `additionalProperties` trap

Both profiles re-list every base property, and both carry a `$comment` saying
why. It is not redundancy: in JSON Schema, `additionalProperties: false` only
sees properties declared in **the same schema object**, never those reached
through `$ref` or `allOf`. A profile that referenced the base and stopped
there would reject every inherited field.

So: `allOf: [{ "$ref": "leaf.base.json" }]` makes the base normative, and the
re-listing keeps the profile closed. Validators disagree about many things;
they agree about this one.

## Versions

Any change to a published profile is a new `/vN`: a new field, a widened enum,
a narrowed bound. Never an edit.

**`workout-completed` v1 → v2 is the worked example.** The only substantive
change is that the cosigner role `coach` became `notarized`. It would have
been a one-word edit, nobody had signed a `coach` cosigner, and doing it as a
version anyway is the point:

- A leaf's `schema` string is inside the bytes that were signed. Editing v1
  would mean two different formats answering to the same name, and a verifier
  that fetches "v1" could no longer tell which one a given signature covered.
- `coach` was not a typo. It was the product's word leaking into the protocol
  — exactly the confusion a profile layer exists to prevent. Renaming it
  silently would hide the mistake; versioning it records that it was made.

v1 stays in the repository, readable, marked superseded. Leaves signed under
it verify forever.
