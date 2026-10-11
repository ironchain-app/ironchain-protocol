"""Verify signed leaves, without reusing a line of the app's code.

This is the test that matters: a third party has the file and the spec,
nothing else. Run it on a month file straight out of a phone:

    python verify_leaf.py 2026-09.jsonl

Every line is checked with the four steps of spec/leaf.md:

1. the leaf validates against its profile schema;
2. leafHash is recomputed (JCS, then SHA-256 of 0x00 + bytes) and must
   equal the one the leaf announces -- the announced value is never trusted
   on its own;
3. the subject's Ed25519 signature is checked over the printable text the
   wallet displayed;
4. each cosigner's Ed25519 signature is checked over their own text.

Exit code 0 only if every leaf passes. Needs `cryptography` and
`jsonschema` (pip install cryptography jsonschema).
"""
import datetime
import hashlib
import json
import sys
from pathlib import Path

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

sys.stdout.reconfigure(encoding="utf-8")

HERE = Path(__file__).resolve().parent

# The profile a leaf claims decides its schema and the word the wallet shows.
PROFILES = {
    "proof-of-activity/workout-completed/v1": ("workout-completed.json", "session"),
    "proof-of-activity/workout-completed/v2": ("workout-completed-v2.json", "session"),
    "proof-of-presence/hours-worked/v1": ("hours-worked.json", "shift"),
}

ESCAPES = {
    '"': '\\"',
    "\\": "\\\\",
    "\b": "\\b",
    "\f": "\\f",
    "\n": "\\n",
    "\r": "\\r",
    "\t": "\\t",
}

B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def jcs(v):
    """RFC 8785, for the subset leaves use (no floats)."""
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
            if 0xD800 <= ord(c) <= 0xDFFF:
                raise ValueError("lone surrogate: not valid UTF-8, refused")
            if c in ESCAPES:
                out.append(ESCAPES[c])
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
    raise TypeError(f"{type(v).__name__} has no canonical form here")


def b58decode(s):
    n = 0
    for c in s:
        n = n * 58 + B58.index(c)
    raw = n.to_bytes((n.bit_length() + 7) // 8, "big")
    return b"\0" * (len(s) - len(s.lstrip("1"))) + raw


def leaf_hash(leaf):
    body = {k: v for k, v in leaf.items() if k not in ("signature", "leafHash")}
    return hashlib.sha256(b"\x00" + jcs(body).encode("utf-8")).hexdigest()


def subject_text(leaf, lh, noun):
    return f"Iron Chain\nSign this {noun}\n{leaf['schema']}\nleaf {lh}"


def witness_text(leaf, noun):
    return f"Iron Chain\nWitness this {noun}\n{leaf['schema']}\npayload {leaf['payloadHash']}"


def ed25519_ok(key_b58, sig_b58, text):
    try:
        key = Ed25519PublicKey.from_public_bytes(b58decode(key_b58))
        key.verify(b58decode(sig_b58), text.encode("utf-8"))
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False


REGISTRY = Registry().with_resources([
    (p.name, Resource.from_contents(json.loads(p.read_text(encoding="utf-8"))))
    for p in HERE.glob("*.json")
    if p.name != "month.sas.json"  # an on-chain layout, not a JSON Schema
])


def verify(leaf):
    """The four steps of spec/leaf.md. Returns (computed leafHash, failures)."""
    failures = []
    profile = PROFILES.get(leaf.get("schema"))
    if profile is None:
        return None, [f"unknown profile {leaf.get('schema')!r}"]
    schema_file, noun = profile

    # 1. Schema. `leafHash` is not part of the leaf: the phone stores it
    # beside the leaf in the month file, and it is checked in step 2.
    schema = json.loads((HERE / schema_file).read_text(encoding="utf-8"))
    body = {k: v for k, v in leaf.items() if k != "leafHash"}
    for e in Draft202012Validator(schema, registry=REGISTRY).iter_errors(body):
        failures.append(f"schema: {e.message}")
    w = leaf.get("window") or {}
    if isinstance(w.get("start"), int) and isinstance(w.get("end"), int) \
            and w["end"] <= w["start"]:
        failures.append("window: end is not after start")

    # 2. Hash, recomputed -- never taken from the leaf.
    try:
        lh = leaf_hash(leaf)
    except (TypeError, ValueError) as e:
        return None, failures + [f"canonical form: {e}"]
    if "leafHash" in leaf and lh != leaf["leafHash"]:
        failures.append("leafHash: announced value does not match the leaf")

    # 3. The subject's signature, over the text the wallet displayed.
    if not ed25519_ok(leaf.get("subject", ""), leaf.get("signature", ""),
                      subject_text(leaf, lh, noun)):
        failures.append("signature: not a valid Ed25519 signature by subject")

    # 4. Each cosigner's signature, over their own text.
    seen = set()
    for c in leaf.get("cosigners", []):
        k = c.get("key", "")
        if k == leaf.get("subject"):
            failures.append("cosigner: the subject cannot witness themselves")
        if k in seen:
            failures.append(f"cosigner {k[:8]}: listed twice")
        seen.add(k)
        if not ed25519_ok(k, c.get("signature", ""), witness_text(leaf, noun)):
            failures.append(f"cosigner {k[:8]}: invalid signature")

    return lh, failures


def main(path):
    lines = [l for l in Path(path).read_text(encoding="utf-8").splitlines() if l.strip()]
    bad = 0
    for n, line in enumerate(lines, 1):
        leaf = json.loads(line)
        lh, failures = verify(leaf)
        verdict = "VALID" if not failures else "INVALID"
        print(f"[{n}] {verdict}  {leaf.get('schema')}")
        print("    leafHash :", lh)
        w = leaf.get("window") or {}
        if isinstance(w.get("start"), int):
            print("    window   :",
                  datetime.datetime.fromtimestamp(w["start"], datetime.UTC).isoformat(),
                  "+", (w.get("end") or w["start"]) - w["start"], "s")
        print("    signals  :", leaf.get("signals"))
        print("    subject  :", leaf.get("subject"))
        for f in failures:
            print("    ✗", f)
        if not failures:
            noun = PROFILES[leaf["schema"]][1]
            print("    signed text, as the wallet showed it:")
            for t in subject_text(leaf, lh, noun).splitlines():
                print("      " + t)
        else:
            bad += 1
        print()
    print(f"{len(lines) - bad}/{len(lines)} leaves valid")
    return 1 if bad else 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python verify_leaf.py <month>.jsonl")
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
