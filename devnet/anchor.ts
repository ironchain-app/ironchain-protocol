// Ancre un mois de séances : la racine de Merkle des feuilles signées
// part sur la chaîne, en une seule attestation.
//
// C'est le geste que l'émetteur fait une fois par mois et par personne.
// Il lit le fichier de feuilles sorti d'un téléphone, vérifie chacune —
// empreinte recalculée, signature Ed25519 du sujet — puis écrit
// l'attestation sur le schéma `ironchain-month` déjà déployé.
//
//   npx tsx anchor.ts <fichier.jsonl> [AAAA-MM]
//
// Une feuille qui ne vérifie pas n'entre pas dans la racine : mieux vaut
// ancrer neuf séances honnêtes que dix dont une ment.

import { readFileSync } from "node:fs";
import { createHash, verify as verifyEd25519, createPublicKey } from "node:crypto";
import {
  fetchSchema,
  findAttestationPda,
  findCredentialPda,
  findSchemaPda,
  getCreateAttestationInstruction,
  serializeAttestationData,
} from "sas-lib";
import { getAddressDecoder, getBase58Encoder, type Address } from "@solana/kit";
import { client, loadOrCreateSecretKey, signerFrom } from "./common.ts";
import { send } from "./sas.ts";

const SIX_MONTHS = 183 * 24 * 3600;

// ── Les feuilles, telles que l'app les range ───────────────────────────
type Leaf = {
  schema: string;
  subject: string;
  window: { start: number; end: number };
  signals: string[];
  payloadHash: string;
  signature: string;
  leafHash: string;
  [k: string]: unknown;
};

const fichier = process.argv[2];
if (!fichier) throw new Error("usage : npx tsx anchor.ts <fichier.jsonl> [AAAA-MM]");

const feuilles: Leaf[] = readFileSync(fichier, "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l) as Leaf);
if (!feuilles.length) throw new Error("aucune feuille dans ce fichier");

// ── RFC 8785, pour le sous-ensemble utilisé par la feuille ─────────────
const ECHAPPES: Record<string, string> = {
  '"': '\\"', "\\": "\\\\", "\b": "\\b", "\f": "\\f",
  "\n": "\\n", "\r": "\\r", "\t": "\\t",
};

function jcs(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === "string") {
    let out = '"';
    for (const c of v) {
      out += ECHAPPES[c] ?? (c.charCodeAt(0) < 0x20
        ? "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")
        : c);
    }
    return out + '"';
  }
  if (Array.isArray(v)) return "[" + v.map(jcs).join(",") + "]";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return "{" + Object.keys(o).sort().map((k) => `${jcs(k)}:${jcs(o[k])}`).join(",") + "}";
  }
  throw new Error(`type hors JCS : ${typeof v}`);
}

// Un décodeur base58 générique : une signature fait 64 octets, et le
// codec d'adresse, lui, n'accepte que 32.
const b58 = getBase58Encoder();
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

/** L'empreinte d'une feuille : SHA-256(0x00 ‖ JCS(feuille sans signature)). */
function leafHash(f: Leaf): string {
  const { signature, leafHash: _, ...corps } = f;
  return createHash("sha256")
    .update(Buffer.concat([Buffer.from([0]), Buffer.from(jcs(corps), "utf8")]))
    .digest("hex");
}

/** Le texte que le portefeuille a affiché, reconstruit depuis la feuille. */
const messageSigne = (f: Leaf) =>
  `Iron Chain\nSign this session\n${f.schema}\nleaf ${f.leafHash}`;

/** Une clé Solana brute, habillée en clé publique Ed25519 pour node. */
function clePublique(adresse: string) {
  const brut = Buffer.from(b58.encode(adresse as Address));
  const der = Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"), // en-tête SPKI Ed25519
    brut,
  ]);
  return createPublicKey({ key: der, format: "der", type: "spki" });
}

// ── Vérifier avant d'ancrer ────────────────────────────────────────────
const bonnes: Leaf[] = [];
for (const f of feuilles) {
  const recalc = leafHash(f);
  if (recalc !== f.leafHash) {
    console.log(`✗ ${f.leafHash.slice(0, 12)}… empreinte différente (${recalc.slice(0, 12)}…)`);
    continue;
  }
  const ok = verifyEd25519(
    null,
    Buffer.from(messageSigne(f), "utf8"),
    clePublique(f.subject),
    Buffer.from(b58.encode(f.signature as Address)),
  );
  if (!ok) {
    console.log(`✗ ${f.leafHash.slice(0, 12)}… signature invalide`);
    continue;
  }
  bonnes.push(f);
}
if (!bonnes.length) throw new Error("aucune feuille vérifiée — rien à ancrer");

const sujets = new Set(bonnes.map((f) => f.subject));
if (sujets.size !== 1) {
  // Une racine est « une preuve par personne et par mois » : deux sujets
  // dans un même arbre ne seraient vérifiables par personne.
  throw new Error(`plusieurs sujets dans ce fichier : ${[...sujets].join(", ")}`);
}
const subject = bonnes[0].subject as Address;

// ── La racine ──────────────────────────────────────────────────────────
// Triées par empreinte, appariées par SHA-256(0x01 ‖ gauche ‖ droite), un
// nœud impair remonte intact. Même règle que l'app, à l'octet près.
function racine(empreintes: Buffer[]): Buffer {
  let niveau = [...empreintes].sort(Buffer.compare);
  while (niveau.length > 1) {
    const suivant: Buffer[] = [];
    for (let i = 0; i < niveau.length; i += 2) {
      if (i + 1 === niveau.length) { suivant.push(niveau[i]); break; }
      suivant.push(createHash("sha256")
        .update(Buffer.concat([Buffer.from([1]), niveau[i], niveau[i + 1]]))
        .digest());
    }
    niveau = suivant;
  }
  return niveau[0];
}

const mois = process.argv[3]
  ?? new Date(bonnes[0].window.start * 1000).toISOString().slice(0, 7);
const dansLeMois = bonnes.filter(
  (f) => new Date(f.window.start * 1000).toISOString().slice(0, 7) === mois);
if (!dansLeMois.length) throw new Error(`aucune feuille dans ${mois}`);

const root = racine(dansLeMois.map((f) => Buffer.from(f.leafHash, "hex")));
const periodStart = Math.floor(Date.UTC(
  Number(mois.slice(0, 4)), Number(mois.slice(5, 7)) - 1, 1) / 1000);

// Le nonce de la spec : SHA-256(clé en octets ‖ "ironchain-month" ‖ mois).
const nonce = getAddressDecoder().decode(createHash("sha256")
  .update(Buffer.concat([
    Buffer.from(b58.encode(subject)),
    Buffer.from("ironchain-month", "utf8"),
    Buffer.from(mois, "utf8"),
  ]))
  .digest());

// ── Écrire ─────────────────────────────────────────────────────────────
const payer = await signerFrom(loadOrCreateSecretKey("payer"));
const authority = await signerFrom(loadOrCreateSecretKey("ironchain-authority"));
const signer = await signerFrom(loadOrCreateSecretKey("ironchain-signer"));
const [credential] = await findCredentialPda({ authority: authority.address, name: "IRONCHAIN" });
const [monthSchema] = await findSchemaPda({ credential, name: "ironchain-month", version: 1 });
const [attestation] = await findAttestationPda({ credential, schema: monthSchema, nonce });
const schema = await fetchSchema(client.rpc, monthSchema);

console.log(`\n${dansLeMois.length} séance(s) vérifiée(s) pour ${mois}`);
console.log(`sujet   ${subject}`);
console.log(`racine  ${hex(root)}`);
console.log(`nonce   ${nonce}`);

const signature = await send(payer, [getCreateAttestationInstruction({
  payer, authority: signer, credential, schema: monthSchema, attestation,
  nonce,
  expiry: periodStart + SIX_MONTHS,
  data: serializeAttestationData(schema.data, {
    schemaVersion: 1,
    periodStart: BigInt(periodStart),
    merkleRoot: [...root],
    leafCount: dansLeMois.length,
    leafVersion: 1,
  }),
})]);

console.log(`\nancré : https://explorer.solana.com/address/${attestation}?cluster=devnet`);
console.log(`transaction : https://explorer.solana.com/tx/${signature}?cluster=devnet`);
