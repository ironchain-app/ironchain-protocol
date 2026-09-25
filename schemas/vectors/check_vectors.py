"""Check every vector file against its profile, and against the spec.

Three things, for each vector file:

  1. every leaf validates against its profile schema;
  2. the canonical form and the leaf hash recompute from the leaf alone;
  3. the month root recomputes from the hashes.

Run it from this directory:

    python check_vectors.py

It exits non-zero on the first disagreement. A vector nobody runs is a
comment.
"""

import hashlib
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

sys.stdout.reconfigure(encoding="utf-8")

SCHEMAS = Path(__file__).resolve().parent.parent
HERE = Path(__file__).resolve().parent

FILES = {
    "workout-completed-v1.json": "workout-completed.json",
    "hours-worked-v1.json": "hours-worked.json",
}

ESCAPED = {
    '"': '\\"', "\\": "\\\\", "\b": "\\b", "\f": "\\f",
    "\n": "\\n", "\r": "\\r", "\t": "\\t",
}

# 88 base58 characters, the shape of an Ed25519 signature. Stands in for a
# real one during validation only — see the comment at the call site.
PLACEHOLDER_SIGNATURE = (
    "5Kd3NBUAdUnhyzenEwVLy9pBKxSwXvE9FMPyR4UKZvpe6E3AHbrRk"
    "VqfdBxZPLbeKp1ujV7WLrQvNbEUkhAzHGqV"
)


def jcs(v):
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


def month_root(hashes):
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


# Profiles reach the base by relative name, so the registry is keyed the
# same way a reader with the directory on disk would resolve it.
registry = Registry().with_resources([
    (p.name, Resource.from_contents(json.loads(p.read_text(encoding="utf-8"))))
    for p in SCHEMAS.glob("*.json")
    if p.name != "month.sas.json"
])

problems = 0
for vector_name, schema_name in FILES.items():
    schema = json.loads((SCHEMAS / schema_name).read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema, registry=registry)
    data = json.loads((HERE / vector_name).read_text(encoding="utf-8"))

    print(f"\n{vector_name}  →  {schema_name}")
    for i, entry in enumerate(data["leaves"], 1):
        leaf = entry["leaf"]
        # A vector is the leaf *body*: the signature is what gets added at
        # signing time, and it is removed again before hashing. So validate
        # a copy carrying a well-formed placeholder, and hash the original.
        errors = sorted(
            validator.iter_errors({**leaf, "signature": PLACEHOLDER_SIGNATURE}),
            key=lambda e: e.path,
        )
        canon = jcs(leaf)
        digest = hashlib.sha256(b"\x00" + canon.encode()).hexdigest()

        ok = not errors and canon == entry["canonical"] and digest == entry["leafHash"]
        print(f"  leaf {i}  {'ok' if ok else 'FAIL'}  {'·'.join(leaf['signals'])}")
        for e in errors:
            print(f"      schema: {list(e.path)}: {e.message}")
            problems += 1
        if canon != entry["canonical"]:
            print("      canonical form differs")
            problems += 1
        if digest != entry["leafHash"]:
            print(f"      hash differs: {digest}")
            problems += 1

    root = month_root(data["monthRoot"]["leafHashes"])
    ok = root == data["monthRoot"]["root"]
    print(f"  root    {'ok' if ok else 'FAIL'}  {root[:16]}…")
    if not ok:
        problems += 1


# ── What must be refused ───────────────────────────────────────────────
# A schema that only ever says yes is decoration. Each case below is a
# rule from spec/leaf.md or spec/signals.md, and it has to bite.
def case(name, schema_name, change):
    leaf = {
        "schema": "proof-of-presence/hours-worked/v1",
        "subject": "742Ky5D88EGep7dcy7Yqtz2JRW1T6X9qaC9w8nFKrzuP",
        "window": {"start": 1788300000, "end": 1788328800},
        "category": "volunteering",
        "signals": ["D"],
        "payloadHash": "00" * 32,
        "signature": PLACEHOLDER_SIGNATURE,
    }
    change(leaf)
    return name, schema_name, leaf


def drop(k):
    return lambda leaf: leaf.pop(k, None)


def put(**kw):
    return lambda leaf: leaf.update(kw)


REFUSALS = [
    case("B without the two captures", "hours-worked.json", put(signals=["D", "B"])),
    case("M without a device", "hours-worked.json", put(signals=["D", "M"])),
    case("W without a cosigner", "hours-worked.json", put(signals=["D", "W"])),
    case("signals without D", "hours-worked.json", put(signals=["M"])),
    case("a signal nobody defined", "hours-worked.json", put(signals=["D", "X"])),
    case("a field the profile never declared", "hours-worked.json", put(steps=4200)),
    case("no payload digest", "hours-worked.json", drop("payloadHash")),
    case("a subject that is not base58", "hours-worked.json", put(subject="0OIl" * 9)),
    case("the cosigner role `coach`, gone in v2", "hours-worked.json",
         put(signals=["D", "N"], cosigners=[{
             "key": "8pQ9RLsaCk2uwbmSvhPuTzZUbrq3gkQ1nxvDe5tYwF4h",
             "role": "coach",
             "signature": PLACEHOLDER_SIGNATURE,
         }])),
    case("another profile's schema string", "hours-worked.json",
         put(schema="proof-of-activity/workout-completed/v2")),
]

print("\nce qui doit être refusé")
for name, schema_name, leaf in REFUSALS:
    schema = json.loads((SCHEMAS / schema_name).read_text(encoding="utf-8"))
    refused = bool(list(Draft202012Validator(schema, registry=registry).iter_errors(leaf)))
    print(f"  {'ok  ' if refused else 'FAIL'}  {name}")
    if not refused:
        problems += 1

print(f"\n{'tout concorde' if not problems else str(problems) + ' désaccord(s)'}")
sys.exit(1 if problems else 0)
