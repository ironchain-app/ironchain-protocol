// Creates Iron Chain's identity (the SAS credential) and the monthly schema on devnet.
// Safe to rerun: what already exists is left alone.
//
//   npm run deploy
//
// Two keys, kept in .keys/ (git-ignored):
//   ironchain-authority — the master key. It owns the credential and can never be
//                         replaced. On mainnet it lives offline, never on a server.
//   ironchain-signer    — the server key that writes proofs. Replaceable by the master.

import fs from "node:fs";
import path from "node:path";
import { fetchSchema, findCredentialPda, findSchemaPda, getCreateCredentialInstruction, getCreateSchemaInstruction, SchemaDataType } from "sas-lib";
import { RPC_URL, account, ensureFunds, loadOrCreateSecretKey, rpc, signerFrom } from "./common.ts";
import { send } from "./sas.ts";

if (!RPC_URL.includes("devnet")) throw new Error(`Devnet only — refusing ${RPC_URL}.`);

const CREDENTIAL_NAME = "IRONCHAIN";
const spec = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, "..", "schemas", "month.sas.json"), "utf8"),
) as { name: string; version: number; description: string; fields: { name: string; type: keyof typeof SchemaDataType }[] };

const payer = await signerFrom(loadOrCreateSecretKey("payer"));
const authority = await signerFrom(loadOrCreateSecretKey("ironchain-authority"));
const signer = await signerFrom(loadOrCreateSecretKey("ironchain-signer"));
await ensureFunds(payer.address, 0.05);

const explorer = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
const rent = async (a: string) => Number((await account(a as never))?.lamports ?? 0n) / 1e9;

// ---------- 1. The identity ----------
const [credential] = await findCredentialPda({ authority: authority.address, name: CREDENTIAL_NAME });
if (await account(credential)) {
  console.log(`Credential already there`);
} else {
  await send(payer, [getCreateCredentialInstruction({
    payer, credential, authority, name: CREDENTIAL_NAME, signers: [signer.address],
  })]);
  console.log(`Credential created`);
}

// ---------- 2. The monthly schema ----------
const [schema] = await findSchemaPda({ credential, name: spec.name, version: spec.version });
if (await account(schema)) {
  const onChain = await fetchSchema(rpc, schema);
  const names = onChain.data.fieldNames;
  const drift = spec.fields.some((f) => !names.includes(f.name));
  console.log(drift
    ? `⚠ Schema v${spec.version} is on-chain with other fields — bump "version" in month.sas.json, never edit`
    : `Schema ${spec.name} v${spec.version} already there`);
} else {
  await send(payer, [getCreateSchemaInstruction({
    payer, authority, credential, schema,
    name: spec.name, description: spec.description,
    layout: spec.fields.map((f) => SchemaDataType[f.type]),
    fieldNames: spec.fields.map((f) => f.name),
  })]);
  console.log(`Schema ${spec.name} v${spec.version} created`);
}

// ---------- 3. What to publish ----------
const out = {
  cluster: "devnet",
  program: "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG",
  credential: { name: CREDENTIAL_NAME, address: credential, authority: authority.address, signers: [signer.address], rentSol: await rent(credential) },
  schemas: { [spec.name]: { version: spec.version, address: schema, rentSol: await rent(schema) } },
};
fs.writeFileSync(path.join(import.meta.dirname, "deployed.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`\nCredential ${credential}\n  ${explorer(credential)}`);
console.log(`Schema     ${schema}\n  ${explorer(schema)}`);
console.log(`\nPublic addresses written to devnet/deployed.json`);
