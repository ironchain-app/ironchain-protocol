# Identity binding — `P` (draft)

> **Draft. Not normative. Nothing implements it yet.** It exists so that the
> next conversation starts here instead of rediscovering the gap.

## The gap

The subject of a leaf is a **key**. `B` proves the window was inhabited —
*someone* was there at `start` and at `end`. No signal says that the someone
in the frame is the person enrolled behind the key. A friend can perform the
session, take both captures, and the leaf is still signed by your key.

The question that forced this page (owner, 10 October 2026): *"when we sign
with B, how do we know it is the right person if we have no baseline
referential of their identity?"* The answer is: today, we don't — and the
spec says so out loud rather than letting readers assume otherwise.

## The referential: enrollment

"Same person" means nothing without a baseline to compare against.

- **A dedicated capture.** In-app, camera only, never the gallery — the same
  discipline as `B`, for the same reason: a gallery image has no capture
  time the app can vouch for.
- **Not the progress photos.** Those are optional, may come from the
  gallery, and were collected under a promise of *no other use*. A
  referential needs its own consent and its own ceremony.
- **The enrollment is itself anchored.** An `identity-enrolled` event —
  subject key, digest(s) of the baseline captures, timestamp — enters the
  month's root like any leaf. Without this, the baseline can be swapped
  silently and the whole construction is theatre. Anchored, re-enrollment is
  a visible event, exactly like a key rotation.
- **Rotation.** An enrollment binds to a key. A rotation statement either
  carries the enrollment to the successor key or the subject re-enrolls —
  visibly, in both cases.

## The signal: `P` — Person-matched

The claim: *the person in this session's `B` captures matches the enrolled
baseline of the subject key.* The **grade is recorded in the leaf**, never
implied; a reader decides which grade they require.

| Grade | Produced by | How | Cost to fake |
|---|---|---|---|
| `self` | the app | on-device embedding match, baseline vs `B` captures; boolean + matcher id in the leaf | medium — a modified device can assert anything |
| `attested` | the app + platform | same, plus a platform integrity attestation (Play Integrity, App Attest) covering the app that ran the matcher | high |
| `cosigned` | a verifier | the subject reveals the captures to one verifier, once; the verifier counter-signs as a `cosigner` with role `verifier` | highest |

`self` belongs to the same trust class as `C`: the issuer computed it, the
issuer asserts it. `cosigned` reuses machinery the format already has —
`cosigners` — and the same reveal model as `B`: to a single reader, once,
never published.

## What `P` never proves

- **That the enrolled person is the key's legal owner.** Enroll your twin on
  day one and the technique is blind forever. Only `W` and `N` — humans —
  close that door.
- **Liveness is a matcher concern, not a format concern.** A photograph of a
  photograph defeats a naive matcher; which liveness checks a matcher runs
  is part of the matcher id the leaf records.
- No grade is a verdict. "100 % genuine" does not exist; detection of
  fabricated imagery is probabilistic and adversarial. `P` records who
  vouched and how — like every other signal.

## Biometrics, stated plainly

A face baseline and its embeddings are special-category data (GDPR art. 9,
and the stores' biometric policies). Normative constraints for any future
implementation:

- The baseline and every embedding **never leave the device**.
- Leaves and anchors carry **digests and booleans only**. The chain never
  carries biometric material, under any grade — including `cosigned`, where
  the verifier sees captures transiently and signs a statement, not a
  template.
