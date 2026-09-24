// Shared plumbing for the devnet bench: RPC, keys, balances, prices.
// Nothing here is meant for mainnet — every key is disposable.

import fs from "node:fs";
import path from "node:path";
import { createHash, generateKeyPairSync } from "node:crypto";
import {
  address,
  airdropFactory,
  createKeyPairSignerFromBytes,
  createDefaultRpcTransport,
  createSolanaRpcFromTransport,
  createSolanaRpcSubscriptions,
  getAddressDecoder,
  lamports,
  type Address,
  type KeyPairSigner,
} from "@solana/kit";

export const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
export const WS_URL = RPC_URL.replace(/^http/, "ws");
// The public devnet RPC answers 429 as soon as you breathe: back off and retry.
const baseTransport = createDefaultRpcTransport({ url: RPC_URL });
const patientTransport = (async (...args: Parameters<typeof baseTransport>) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await baseTransport(...args);
    } catch (e) {
      const status = (e as { context?: { statusCode?: number } })?.context?.statusCode;
      if (status !== 429 || attempt >= 7) throw e;
      await sleep(800 * 2 ** attempt);
    }
  }
}) as typeof baseTransport;
export const rpc = createSolanaRpcFromTransport(patientTransport);
export const rpcSubscriptions = createSolanaRpcSubscriptions(WS_URL);
export const client = { rpc, rpcSubscriptions };

export const LAMPORTS_PER_SOL = 1_000_000_000n;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const KEYS_DIR = path.join(import.meta.dirname, ".keys");

/** A fresh ed25519 key as the 64 bytes Solana tools expect (seed ‖ public). */
export function newSecretKey(): Uint8Array {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const seed = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32);
  const pub = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  return Uint8Array.from([...seed, ...pub]);
}

/** Kept on disk so the airdropped SOL survives between runs. Git-ignored. */
export function loadOrCreateSecretKey(name: string): Uint8Array {
  const file = path.join(KEYS_DIR, `${name}-keypair.json`);
  if (fs.existsSync(file)) return Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8")));
  const key = newSecretKey();
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(Array.from(key)));
  return key;
}

export const signerFrom = (secret: Uint8Array): Promise<KeyPairSigner> =>
  createKeyPairSignerFromBytes(secret);

export async function balance(who: Address): Promise<bigint> {
  return (await rpc.getBalance(who, { commitment: "confirmed" }).send()).value;
}

/** Lamports and size of an account, or null once it is closed. */
export async function account(who: Address): Promise<{ lamports: bigint; size: number } | null> {
  const { value } = await rpc
    .getAccountInfo(who, { encoding: "base64", commitment: "confirmed" })
    .send();
  if (!value) return null;
  return { lamports: value.lamports, size: Buffer.from(value.data[0], "base64").length };
}

export async function ensureFunds(who: Address, minSol = 0.3): Promise<void> {
  const min = BigInt(Math.round(minSol * 1e9));
  if ((await balance(who)) >= min) return;
  try {
    await airdropFactory(client)({
      commitment: "confirmed",
      lamports: lamports(LAMPORTS_PER_SOL),
      recipientAddress: who,
    });
  } catch {
    throw new Error(
      `Devnet airdrop refused (rate limit). Fund this address by hand, then rerun:\n` +
        `  ${who}\n  https://faucet.solana.com (network: devnet)`,
    );
  }
}

/** A 32-byte nonce derived from its parts, used as an address seed. */
export function nonceOf(...parts: string[]): Address {
  const digest = createHash("sha256").update(parts.join("|")).digest();
  return getAddressDecoder().decode(digest);
}

export const sha256Bytes = (s: string): number[] => [...createHash("sha256").update(s).digest()];

/** Live SOL price, or the 104 $ the budget docs assume. */
export async function solPriceUsd(): Promise<{ usd: number; live: boolean }> {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
    const usd = (await r.json())?.solana?.usd;
    if (typeof usd === "number") return { usd, live: true };
  } catch {}
  return { usd: 104, live: false };
}

// ---------- The ledger every step writes into ----------

export type Line = {
  rail: "SAS" | "Core";
  step: string;
  /** What the payer lost (fees + rent). Negative when rent came back. */
  paidLamports: bigint;
  /** Rent locked in the accounts this step created, by account. */
  accounts: { label: string; address: string; size: number; rent: bigint }[];
  outcome: "ok" | "refused" | "failed";
  note?: string;
};

export const ledger: Line[] = [];

/** Runs one step, measures what the payer paid, and records it. */
export async function measure(
  rail: Line["rail"],
  step: string,
  payer: Address,
  run: () => Promise<void>,
  created: () => Promise<{ label: string; address: Address }[]> = async () => [],
  expectRefusal = false,
): Promise<Line> {
  await sleep(1500);
  const before = await balance(payer);
  let outcome: Line["outcome"] = "ok";
  let note: string | undefined;
  try {
    await run();
    if (expectRefusal) {
      outcome = "failed";
      note = "went through — it should have been refused";
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    outcome = expectRefusal ? "refused" : "failed";
    note = msg.split("\n")[0].slice(0, 160);
  }
  const after = await balance(payer);
  const accounts = [];
  for (const c of await created()) {
    const a = await account(c.address);
    if (a) accounts.push({ label: c.label, address: c.address, size: a.size, rent: a.lamports });
  }
  const line: Line = { rail, step, paidLamports: before - after, accounts, outcome, note };
  ledger.push(line);
  const sol = Number(line.paidLamports) / 1e9;
  console.log(`  ${outcome === "ok" ? "✓" : outcome === "refused" ? "⊘" : "✗"} ${step} — ${sol.toFixed(6)} SOL${note ? ` · ${note}` : ""}`);
  return line;
}

export { address };
