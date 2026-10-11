// Ancre un mois de séances : la racine de Merkle des feuilles signées
// part sur la chaîne, en une seule attestation.
//
// C'est le geste que l'émetteur fait une fois par mois et par personne.
// Il lit le fichier de feuilles sorti d'un téléphone, vérifie chacune —
// empreinte recalculée, signature Ed25519 du sujet et de chaque témoin —
// puis écrit l'attestation sur le schéma `ironchain-month` déjà déployé.
// Les doublons sont retirés (leafCount compte des feuilles DISTINCTES) et
// un fichier qui mélange plusieurs profils est refusé (revue de sécurité
// du 11 octobre 2026, R-07).
//
//   npx tsx anchor.ts <fichier.jsonl> [AAAA-MM]
//
// Une feuille qui ne vérifie pas n'entre pas dans la racine : mieux vaut
// ancrer neuf séances honnêtes que dix dont une ment.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

// Le profil d'une feuille décide du mot que le portefeuille a affiché, et
// de la version écrite on-chain (`leafVersion`).
const NOUNS: Record<string, string> = {
  "proof-of-activity/workout-completed": "session",
  "proof-of-presence/hours-worked": "shift",
};
function profileOf(schema: string): { noun: string; version: number } {
  const m = /^(.+)\/v([0-9]+)$/.exec(schema);
  const noun = m ? NOUNS[m[1]] : undefined;
  if (!m || !noun) throw new Error(`profil inconnu : ${schema}`);
  return { noun, version: Number(m[2]) };
}

// ── Les feuilles, telles que l'app les range ───────────────────────────
type Leaf = {
  schema: string;
  subject: string;
  window: { start: number; end: number };
  signals: string[];
  payloadHash: string;
  signature: string;
  leafHash: string;
  cosigners?: { key: string; role: string; signature: string }[];
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
const messageSigne = (f: Leaf, empreinte: string) =>
  `Iron Chain\nSign this ${profileOf(f.schema).noun}\n${f.schema}\nleaf ${empreinte}`;

/** Le texte qu'un témoin a signé : la scène entière (spec/leaf.md). */
const texteTemoin = (f: Leaf, c: { role: string }) =>
  `Iron Chain\nWitness this ${profileOf(f.schema).noun}\n${f.schema}\n` +
  `subject ${f.subject}\nwindow ${f.window.start}-${f.window.end}\n` +
  `role ${c.role}\npayload ${f.payloadHash}`;

function signatureValide(texte: string, cle: string, signature: string): boolean {
  try {
    return verifyEd25519(null, Buffer.from(texte, "utf8"), clePublique(cle),
      Buffer.from(b58.encode(signature as Address)));
  } catch {
    return false;
  }
}

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
// Un seul profil par racine : leafVersion n'en décrit qu'un.
const profils = new Set(feuilles.map((f) => f.schema));
if (profils.size !== 1) {
  throw new Error(`plusieurs profils dans ce fichier : ${[...profils].join(", ")}`);
}
const { version: leafVersion } = profileOf(feuilles[0].schema);

const bonnes: Leaf[] = [];
const vues = new Set<string>();
for (const f of feuilles) {
  const recalc = leafHash(f);
  if (recalc !== f.leafHash) {
    console.log(`✗ ${String(f.leafHash).slice(0, 12)}… empreinte différente (${recalc.slice(0, 12)}…)`);
    continue;
  }
  if (vues.has(recalc)) {
    console.log(`· ${recalc.slice(0, 12)}… en double, comptée une fois`);
    continue;
  }
  if (!(f.window.end > f.window.start)) {
    console.log(`✗ ${recalc.slice(0, 12)}… fenêtre vide ou inversée`);
    continue;
  }
  if (!signatureValide(messageSigne(f, recalc), f.subject, f.signature)) {
    console.log(`✗ ${recalc.slice(0, 12)}… signature du sujet invalide`);
    continue;
  }
  const temoins = f.cosigners ?? [];
  const cles = new Set(temoins.map((c) => c.key));
  if (cles.size !== temoins.length || cles.has(f.subject)) {
    console.log(`✗ ${recalc.slice(0, 12)}… témoin en double ou sujet témoin de lui-même`);
    continue;
  }
  if (!temoins.every((c) => signatureValide(texteTemoin(f, c), c.key, c.signature))) {
    console.log(`✗ ${recalc.slice(0, 12)}… signature de témoin invalide`);
    continue;
  }
  vues.add(recalc);
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
if (!/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(mois)) {
  throw new Error(`mois invalide : ${mois} (attendu AAAA-MM)`);
}
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
// La clé d'autorité ne sert qu'à créer la credential et à changer ses
// signataires : elle reste hors ligne. Pour dériver la credential, son
// adresse publique suffit (spec/anchor.md, « Trust anchor »).
const deployed = JSON.parse(readFileSync(
  fileURLToPath(new URL("./deployed.json", import.meta.url)), "utf8"));
const authorityAddress = deployed.credential.authority as Address;
const payer = await signerFrom(loadOrCreateSecretKey("payer"));
const signer = await signerFrom(loadOrCreateSecretKey("ironchain-signer"));
const [credential] = await findCredentialPda({ authority: authorityAddress, name: "IRONCHAIN" });
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
    leafVersion,
  }),
})]);

console.log(`\nancré : https://explorer.solana.com/address/${attestation}?cluster=devnet`);
console.log(`transaction : https://explorer.solana.com/tx/${signature}?cluster=devnet`);
