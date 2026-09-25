"""Verify a signed leaf, without reusing a line of the app's code.

This is the test that matters: a third party has the file and the spec,
nothing else. If it cannot recompute the same hash, the proof is worth
nothing. Run it on a leaf straight out of a phone:

    python verify_leaf.py 2026-09.jsonl

It recomputes leafHash from the leaf (JCS, then SHA-256 of 0x00 + bytes)
and prints the message the wallet displayed.
"""
import datetime
import hashlib
import json
import sys

sys.stdout.reconfigure(encoding="utf-8")

ECHAPPES = {
    '"': '\\"',
    "\\": "\\\\",
    "\b": "\\b",
    "\f": "\\f",
    "\n": "\\n",
    "\r": "\\r",
    "\t": "\\t",
}


def jcs(v):
    """RFC 8785, pour le sous-ensemble utilise ici."""
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
            if c in ECHAPPES:
                out.append(ECHAPPES[c])
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


ligne = open(sys.argv[1], encoding="utf-8").read().strip().splitlines()[0]
f = json.loads(ligne)
corps = {k: v for k, v in f.items() if k not in ("signature", "leafHash")}
canon = jcs(corps)
recalc = hashlib.sha256(b"\x00" + canon.encode()).hexdigest()

print("empreinte annoncée   :", f["leafHash"])
print("empreinte recalculée :", recalc)
print("→", "IDENTIQUES" if recalc == f["leafHash"] else "DIFFÉRENTES")
w = f["window"]
print("séance :", datetime.datetime.fromtimestamp(w["start"], datetime.UTC).isoformat(),
      "·", w["end"] - w["start"], "s ·", f["activity"])
print("signaux :", f["signals"])
print("sujet :", f["subject"])
print("signature :", f["signature"][:24] + "…", f"({len(f['signature'])} car.)")
print()
print("message signé, tel que le portefeuille l'a montré :")
print("  Iron Chain")
print("  Sign this session")
print(" ", f["schema"])
print("  leaf", f["leafHash"])
