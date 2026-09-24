// Rail 1 — the Solana Attestation Service, the Foundation's program.
// Measures: the one-time setup, a monthly proof (plain attestation),
// a badge (tokenized attestation), a transfer attempt, and both closings.

import {
  appendTransactionMessageInstructions,
  createTransactionMessage,
  getAddressEncoder,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import {
  estimateComputeUnitLimitFactory,
  updateOrAppendSetComputeUnitLimitInstruction,
} from "@solana-program/compute-budget";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  TOKEN_2022_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getMintSize,
  getTransferCheckedInstruction,
} from "@solana-program/token-2022";
import {
  SchemaDataType,
  fetchSchema,
  findAttestationMintPda,
  findAttestationPda,
  findCredentialPda,
  findEventAuthorityPda,
  findSasAuthorityPda,
  findSchemaMintPda,
  findSchemaPda,
  getCloseAttestationInstruction,
  getCloseTokenizedAttestationInstructionAsync,
  getCreateAttestationInstruction,
  getCreateCredentialInstruction,
  getCreateSchemaInstruction,
  getCreateTokenizedAttestationInstruction,
  getTokenizeSchemaInstruction,
  serializeAttestationData,
} from "sas-lib";
import { client, measure, newSecretKey, nonceOf, sha256Bytes, signerFrom } from "./common.ts";

const SIX_MONTHS = 183 * 24 * 3600;

export async function send(payer: KeyPairSigner, instructions: Instruction[]): Promise<string> {
  const { value: blockhash } = await client.rpc.getLatestBlockhash().send();
  const base = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const units = await estimateComputeUnitLimitFactory({ rpc: client.rpc })(base);
  const message = updateOrAppendSetComputeUnitLimitInstruction(Math.ceil(units * 1.2), base);
  const signed = await signTransactionMessageWithSigners(message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await sendAndConfirmTransactionFactory(client)(signed as any, { commitment: "confirmed" });
  return getSignatureFromTransaction(signed);
}

export async function benchSas(payer: KeyPairSigner, user: KeyPairSigner, opts: {
  runTag: string;
  metadataUri: string;
  phantom?: Address;
}) {
  const P = payer.address;
  // The master key and the server key. On mainnet these two never share a machine.
  const authority = await signerFrom(newSecretKey());
  const signer = await signerFrom(newSecretKey());

  // ---------- One-time setup ----------
  const [credential] = await findCredentialPda({ authority: authority.address, name: `BENCH-${opts.runTag}` });
  await measure("SAS", "credential (once)", P, () =>
    send(payer, [getCreateCredentialInstruction({
      payer, credential, authority, name: `BENCH-${opts.runTag}`, signers: [signer.address],
    })]).then(() => {}),
    async () => [{ label: "credential", address: credential }],
  );

  const [monthSchema] = await findSchemaPda({ credential, name: "month", version: 1 });
  await measure("SAS", "monthly schema (once)", P, () =>
    send(payer, [getCreateSchemaInstruction({
      payer, authority, credential, schema: monthSchema, name: "month",
      description: "One month of sessions: the Merkle root of the signed leaves.",
      layout: [SchemaDataType.U8, SchemaDataType.I64, SchemaDataType.VecU8, SchemaDataType.U16, SchemaDataType.U8],
      fieldNames: ["schemaVersion", "periodStart", "merkleRoot", "leafCount", "leafVersion"],
    })]).then(() => {}),
    async () => [{ label: "schema", address: monthSchema }],
  );

  const [badgeSchema] = await findSchemaPda({ credential, name: "badge", version: 1 });
  await measure("SAS", "badge schema (once)", P, () =>
    send(payer, [getCreateSchemaInstruction({
      payer, authority, credential, schema: badgeSchema, name: "badge",
      description: "A milestone, pointing at the proof it was earned on.",
      layout: [SchemaDataType.U8, SchemaDataType.U8, SchemaDataType.I64, SchemaDataType.VecU8],
      fieldNames: ["schemaVersion", "badgeKind", "earnedAt", "proof"],
    })]).then(() => {}),
    async () => [{ label: "schema", address: badgeSchema }],
  );

  const [schemaMint] = await findSchemaMintPda({ schema: badgeSchema });
  const [sasPda] = await findSasAuthorityPda();
  await measure("SAS", "tokenize badge schema (once)", P, () =>
    send(payer, [getTokenizeSchemaInstruction({
      payer, authority, credential, schema: badgeSchema, mint: schemaMint, sasPda,
      maxSize: getMintSize([{ __kind: "GroupPointer", authority: sasPda, groupAddress: schemaMint }]),
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    })]).then(() => {}),
    async () => [{ label: "schema mint", address: schemaMint }],
  );

  // ---------- A monthly proof ----------
  const period = "2026-09";
  const monthNonce = nonceOf(user.address, period);
  const [monthProof] = await findAttestationPda({ credential, schema: monthSchema, nonce: monthNonce });
  const month = await fetchSchema(client.rpc, monthSchema);
  await measure("SAS", "monthly proof", P, () =>
    send(payer, [getCreateAttestationInstruction({
      payer, authority: signer, credential, schema: monthSchema, attestation: monthProof,
      nonce: monthNonce,
      expiry: Math.floor(Date.now() / 1000) + SIX_MONTHS,
      data: serializeAttestationData(month.data, {
        schemaVersion: 1,
        periodStart: BigInt(Date.UTC(2026, 8, 1) / 1000),
        merkleRoot: sha256Bytes(`bench-root-${opts.runTag}`),
        leafCount: 12,
        leafVersion: 1,
      }),
    })]).then(() => {}),
    async () => [{ label: "attestation", address: monthProof }],
  );

  // ---------- A badge ----------
  const badge = await fetchSchema(client.rpc, badgeSchema);
  const mintBadge = async (to: Address, tag: string) => {
    const nonce = nonceOf(to, "badge", tag);
    const [attestation] = await findAttestationPda({ credential, schema: badgeSchema, nonce });
    const [mint] = await findAttestationMintPda({ attestation });
    const [ata] = await findAssociatedTokenPda({ mint, owner: to, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS });
    const name = "Iron Chain · 30-day streak";
    const symbol = "IRON";
    const ix = await getCreateTokenizedAttestationInstruction({
      payer, authority: signer, credential, schema: badgeSchema, attestation, schemaMint,
      attestationMint: mint, sasPda, recipient: to, nonce,
      expiry: 0, // a badge does not expire
      data: serializeAttestationData(badge.data, {
        schemaVersion: 1,
        badgeKind: 3,
        earnedAt: BigInt(Math.floor(Date.now() / 1000)),
        proof: Array.from(getAddressEncoder().encode(monthProof)),
      }),
      name, uri: opts.metadataUri, symbol,
      mintAccountSpace: getMintSize([
        { __kind: "GroupMemberPointer", authority: sasPda, memberAddress: mint },
        { __kind: "NonTransferable" },
        { __kind: "MetadataPointer", authority: sasPda, metadataAddress: mint },
        { __kind: "PermanentDelegate", delegate: sasPda },
        { __kind: "MintCloseAuthority", closeAuthority: sasPda },
        {
          __kind: "TokenMetadata", updateAuthority: sasPda, mint, name, symbol, uri: opts.metadataUri,
          additionalMetadata: new Map([["attestation", attestation], ["schema", badgeSchema]]),
        },
        { __kind: "TokenGroupMember", group: schemaMint, mint, memberNumber: 1 },
      ]),
      recipientTokenAccount: ata,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    });
    return { attestation, mint, ata, ix };
  };

  const b = await mintBadge(user.address, opts.runTag);
  await measure("SAS", "badge", P, () => send(payer, [b.ix]).then(() => {}), async () => [
    { label: "attestation", address: b.attestation },
    { label: "mint", address: b.mint },
    { label: "user token account", address: b.ata },
  ]);

  // The holder tries to give it away. It must be refused.
  const stranger = await signerFrom(newSecretKey());
  const [strangerAta] = await findAssociatedTokenPda({ mint: b.mint, owner: stranger.address, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS });
  await measure("SAS", "holder tries to transfer the badge", P, async () => {
    await send(payer, [
      await getCreateAssociatedTokenIdempotentInstructionAsync({ payer, owner: stranger.address, mint: b.mint, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS }),
      getTransferCheckedInstruction({
        source: b.ata, mint: b.mint, destination: strangerAta, authority: user, amount: 1n, decimals: 0,
      }, { programAddress: TOKEN_2022_PROGRAM_ADDRESS }),
    ]);
  }, async () => [], true);

  if (opts.phantom) {
    const p = await mintBadge(opts.phantom, `${opts.runTag}-phantom`);
    await measure("SAS", "badge sent to your Phantom (kept)", P, () => send(payer, [p.ix]).then(() => {}), async () => [
      { label: "mint", address: p.mint },
    ]);
  }

  // ---------- Getting the rent back ----------
  const [eventAuthority] = await findEventAuthorityPda();
  await measure("SAS", "close the monthly proof (rent back)", P, () =>
    send(payer, [getCloseAttestationInstruction({
      payer, authority: signer, credential, attestation: monthProof, eventAuthority,
    })]).then(() => {}),
  );

  const revoke = await measure("SAS", "revoke the badge (burn + close)", P, async () => {
    await send(payer, [await getCloseTokenizedAttestationInstructionAsync({
      payer, authority: signer, credential, attestation: b.attestation,
      attestationTokenAccount: b.ata, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    })]);
  }, async () => [{ label: "user token account, left behind", address: b.ata }]);
  if (revoke.accounts.length) revoke.note = "the holder's empty token account keeps its rent — only the holder can close it";

  return { credential, monthSchema, badgeSchema, monthProof };
}
