// Devnet bench: what a monthly proof and a badge really cost, SAS vs Metaplex Core.
//
//   npm run bench                              # measure
//   PHANTOM=<your devnet address> npm run bench  # also send one badge of each kind to look at
//   METADATA_URI=<json url> ...                # the badge's name/image file
//
// Every key is disposable. Results land in results/<date>.json.

import fs from "node:fs";
import path from "node:path";
import { address, type Address } from "@solana/kit";
import { benchCore } from "./core.ts";
import {
  RPC_URL,
  ensureFunds,
  ledger,
  loadOrCreateSecretKey,
  newSecretKey,
  signerFrom,
  solPriceUsd,
} from "./common.ts";
import { benchSas } from "./sas.ts";

if (!RPC_URL.includes("devnet") && !RPC_URL.includes("127.0.0.1") && !RPC_URL.includes("localhost")) {
  throw new Error(`Refusing to run against ${RPC_URL}: this bench is devnet only.`);
}

const metadataUri = process.env.METADATA_URI ?? "https://example.com/ironchain-badge.json";
const phantom = process.env.PHANTOM ? (address(process.env.PHANTOM) as Address) : undefined;
const runTag = Date.now().toString(36);

const payerSecret = loadOrCreateSecretKey("payer");
const payer = await signerFrom(payerSecret);
const userSecret = newSecretKey();
const user = await signerFrom(userSecret);

console.log(`Payer ${payer.address} on ${RPC_URL}`);
await ensureFunds(payer.address);

console.log("\nSAS");
const sas = await benchSas(payer, user, { runTag, metadataUri, phantom });

console.log("\nMetaplex Core");
await benchCore(payerSecret, userSecret, { metadataUri, proofAddress: sas.monthProof, phantom });

// ---------- Report ----------
const price = await solPriceUsd();
const usd = (lamports: bigint) => (Number(lamports) / 1e9) * price.usd;
const fmt = (lamports: bigint) =>
  `${(Number(lamports) / 1e9).toFixed(6)} SOL  ${usd(lamports) >= 0 ? " " : ""}${usd(lamports).toFixed(3)} $`;

console.log(`\nAt ${price.usd} $/SOL${price.live ? "" : " (offline: the budget docs' figure)"}\n`);
for (const l of ledger) {
  console.log(`${l.rail.padEnd(5)} ${l.step.padEnd(42)} ${fmt(l.paidLamports)}  ${l.outcome}`);
  for (const a of l.accounts) {
    console.log(`        └ ${a.label.padEnd(34)} ${String(a.size).padStart(5)} bytes  locks ${fmt(a.rent)}`);
  }
  if (l.note) console.log(`        · ${l.note}`);
}

const out = path.join(import.meta.dirname, "results", `${new Date().toISOString().slice(0, 10)}-${runTag}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({
  rpc: RPC_URL, runTag, solUsd: price, metadataUri, phantom: phantom ?? null,
  addresses: sas,
  ledger,
}, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
console.log(`\n→ ${path.relative(process.cwd(), out)}`);
