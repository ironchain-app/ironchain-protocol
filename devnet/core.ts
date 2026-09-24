// Rail 2 — Metaplex Core, a ready-made NFT factory.
// Same questions as the SAS rail: what a badge costs, whether the holder
// can give it away (must be no), and whether we can revoke it (must be yes).

import {
  burn,
  create,
  createCollection,
  fetchAsset,
  fetchCollection,
  mplCore,
  transfer,
} from "@metaplex-foundation/mpl-core";
import {
  createSignerFromKeypair,
  generateSigner,
  keypairIdentity,
  publicKey,
  type Umi,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { type Address } from "@solana/kit";
import { RPC_URL, measure } from "./common.ts";

export async function benchCore(payerSecret: Uint8Array, userSecret: Uint8Array, opts: {
  metadataUri: string;
  proofAddress: Address;
  phantom?: Address;
}) {
  const umi: Umi = createUmi(RPC_URL, "confirmed").use(mplCore());
  umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(payerSecret)));
  const P = umi.identity.publicKey.toString() as Address;
  const user = createSignerFromKeypair(umi, umi.eddsa.createKeypairFromSecretKey(userSecret));

  // ---------- One-time setup: a collection whose members cannot move ----------
  const collection = generateSigner(umi);
  await measure("Core", "badge collection (once)", P, async () => {
    await createCollection(umi, {
      collection,
      name: "Iron Chain badges (bench)",
      uri: opts.metadataUri,
      plugins: [
        // Frozen for good: nobody, not even us, can thaw it.
        { type: "PermanentFreezeDelegate", frozen: true, authority: { type: "None" } },
        // Revocation for fraud: we can burn any badge of the collection.
        { type: "PermanentBurnDelegate", authority: { type: "UpdateAuthority" } },
      ],
    }).sendAndConfirm(umi);
  }, async () => [{ label: "collection", address: collection.publicKey.toString() as Address }]);

  const coll = await fetchCollection(umi, collection.publicKey);
  const mint = async (owner: string) => {
    const asset = generateSigner(umi);
    await create(umi, {
      asset,
      collection: coll,
      owner: publicKey(owner),
      name: "Iron Chain · 30-day streak",
      uri: opts.metadataUri,
      // The badge points at the proof it was earned on.
      plugins: [{ type: "Attributes", attributeList: [{ key: "proof", value: opts.proofAddress }] }],
    }).sendAndConfirm(umi);
    return asset.publicKey;
  };

  // ---------- A badge ----------
  let badge = "";
  await measure("Core", "badge", P, async () => {
    badge = (await mint(user.publicKey.toString())).toString();
  }, async () => (badge ? [{ label: "asset", address: badge as Address }] : []));

  const stranger = generateSigner(umi);
  await measure("Core", "holder tries to transfer the badge", P, async () => {
    const asset = await fetchAsset(umi, publicKey(badge));
    await transfer(umi, { asset, collection: coll, newOwner: stranger.publicKey, authority: user })
      .sendAndConfirm(umi);
  }, async () => [], true);

  if (opts.phantom) {
    let kept = "";
    await measure("Core", "badge sent to your Phantom (kept)", P, async () => {
      kept = (await mint(opts.phantom!)).toString();
    }, async () => (kept ? [{ label: "asset", address: kept as Address }] : []));
  }

  // ---------- Revocation ----------
  const revoke = await measure("Core", "revoke the badge (burn)", P, async () => {
    const asset = await fetchAsset(umi, publicKey(badge));
    await burn(umi, { asset, collection: coll }).sendAndConfirm(umi);
  }, async () => [{ label: "asset remnant", address: badge as Address }]);
  if (revoke.accounts.length) revoke.note = "a small remnant stays on-chain after the burn";

  return { collection: collection.publicKey.toString() };
}
