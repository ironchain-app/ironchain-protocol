"""Generate the hours-worked v1 test vectors.

Vectors are only worth something if anyone can regenerate them from the
spec alone. This script imports nothing from the app, nothing from the
TypeScript, and no third-party library: it implements RFC 8785 and the
two hash prefixes straight from spec/leaf.md and spec/anchor.md.

    python make_hours_worked_v1.py > hours-worked-v1.json

The leaves carry no `signature`: a signature is over a hash, and it is the
hash that has to be reproducible. Signing keys would add a dependency and
prove nothing more.
"""

import hashlib
import json

ESCAPED = {
    '"': '\\"', "\\": "\\\\", "\b": "\\b", "\f": "\\f",
    "\n": "\\n", "\r": "\\r", "\t": "\\t",
}


def jcs(v):
    """RFC 8785, for the subset the profiles use: objects, arrays,
    strings, integers, booleans and null."""
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, str):
        out = ['"']
        for c in v:
            if c in ESCAPED:
                out.append(ESCAPED[c])
            elif ord(c) < 0x20:
                out.append("\\u%04x" % ord(c))
            else:
                out.append(c)
        out.append('"')
        return "".join(out)
    if isinstance(v, list):
        return "[" + ",".join(jcs(x) for x in v) + "]"
    if isinstance(v, dict):
        return "{" + ",".join(f"{jcs(k)}:{jcs(v[k])}" for k in sorted(v)) + "}"
    raise TypeError(type(v))


def leaf_hash(leaf):
    return hashlib.sha256(b"\x00" + jcs(leaf).encode()).hexdigest()


def month_root(hashes):
    """Sorted as bytes, paired under 0x01, odd node carried up."""
    level = sorted(bytes.fromhex(h) for h in hashes)
    while len(level) > 1:
        nxt = []
        for i in range(0, len(level), 2):
            if i + 1 == len(level):
                nxt.append(level[i])
                break
            nxt.append(hashlib.sha256(b"\x01" + level[i] + level[i + 1]).digest())
        level = nxt
    return level[0].hex()


SUBJECT = "742Ky5D88EGep7dcy7Yqtz2JRW1T6X9qaC9w8nFKrzuP"
ORG = hashlib.sha256(b"ironchain-vectors/organisation/1").hexdigest()

# Three shifts: declared alone, bracketed and clocked in, countersigned by
# the person who supervises the apprenticeship.
LEAVES = [
    {
        "schema": "proof-of-presence/hours-worked/v1",
        "subject": SUBJECT,
        "window": {"start": 1788300000, "end": 1788328800},
        "category": "volunteering",
        "organisation": ORG,
        "signals": ["D"],
        "payloadHash": hashlib.sha256(b"vector/hours/1").hexdigest(),
    },
    {
        "schema": "proof-of-presence/hours-worked/v1",
        "subject": SUBJECT,
        "window": {"start": 1788386400, "end": 1788415200},
        "category": "apprenticeship",
        "organisation": ORG,
        "supervised": True,
        "signals": ["D", "B", "M"],
        "photoHashes": [
            hashlib.sha256(b"vector/hours/2/t0").hexdigest(),
            hashlib.sha256(b"vector/hours/2/t1").hexdigest(),
        ],
        "device": {"kind": "terminal", "baselineDays": 214},
        "payloadHash": hashlib.sha256(b"vector/hours/2").hexdigest(),
    },
    {
        "schema": "proof-of-presence/hours-worked/v1",
        "subject": SUBJECT,
        "window": {"start": 1788472800, "end": 1788501600},
        "category": "apprenticeship",
        "organisation": ORG,
        "supervised": True,
        "signals": ["D", "N"],
        "cosigners": [
            {
                "key": "8pQ9RLsaCk2uwbmSvhPuTzZUbrq3gkQ1nxvDe5tYwF4h",
                "role": "notarized",
                "signature": "5Kd3NBUAdUnhyzenEwVLy9pBKxSwXvE9FMPyR4UKZvpe6E3AHbrRk"
                             "VqfdBxZPLbeKp1ujV7WLrQvNbEUkhAzHGqV",
            }
        ],
        "payloadHash": hashlib.sha256(b"vector/hours/3").hexdigest(),
    },
]

MONTH = "2026-09"
SUBJECT_KEY_HEX = "07" * 32  # the same placeholder as the workout vectors

entries = []
for leaf in LEAVES:
    entries.append({
        "leaf": leaf,
        "canonical": jcs(leaf),
        "leafHash": leaf_hash(leaf),
    })

hashes = [e["leafHash"] for e in entries]
nonce = hashlib.sha256(
    bytes.fromhex(SUBJECT_KEY_HEX) + b"ironchain-month" + MONTH.encode()
).hexdigest()

print(json.dumps({
    "note": "Vectors for the hours-worked v1 profile. A second domain on the "
            "same base (see spec/profiles.md): the canonicalisation, the "
            "0x00 / 0x01 prefixes, the signals and the monthly root are "
            "identical to workout-completed — only the three domain fields "
            "differ. Regenerate with make_hours_worked_v1.py.",
    "leaves": entries,
    "monthRoot": {"monthKey": MONTH, "leafHashes": hashes, "root": month_root(hashes)},
    "monthNonce": {"subjectKeyHex": SUBJECT_KEY_HEX, "monthKey": MONTH, "nonce": nonce},
}, indent=2, ensure_ascii=False))
