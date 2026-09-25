// Envoie du SOL de devnet à une adresse — pour qu'un téléphone d'essai
// puisse payer les frais d'une écriture.
//
// Le faucet public répond « Internal error » à peu près toujours ; la clé
// du banc, elle, est déjà financée et ne sert qu'ici. Rien de ce qui est
// envoyé n'a de valeur : c'est du devnet.
//
//   npx tsx fund.ts <adresse> [SOL]

import {
  appendTransactionMessageInstruction,
  createTransactionMessage,
  getSignatureFromTransaction,
  lamports,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { balance, loadOrCreateSecretKey, rpc, rpcSubscriptions, signerFrom } from "./common.ts";

const cible = process.argv[2] as Address;
const montant = Number(process.argv[3] ?? "1");
if (!cible) throw new Error("usage : npx tsx fund.ts <adresse> [SOL]");

const payer = await signerFrom(loadOrCreateSecretKey("payer"));
console.log(`payeur ${payer.address} — ${Number(await balance(payer.address)) / 1e9} SOL`);

const { value: blockhash } = await rpc.getLatestBlockhash().send();
const message = pipe(
  createTransactionMessage({ version: 0 }),
  (m) => setTransactionMessageFeePayerSigner(payer, m),
  (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
  (m) =>
    appendTransactionMessageInstruction(
      getTransferSolInstruction({
        source: payer,
        destination: cible,
        amount: lamports(BigInt(Math.round(montant * 1e9))),
      }),
      m,
    ),
);

const signed = await signTransactionMessageWithSigners(message);
await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signed, {
  commitment: "confirmed",
});
console.log(`${montant} SOL → ${cible}`);
console.log(
  `https://explorer.solana.com/tx/${getSignatureFromTransaction(signed)}?cluster=devnet`,
);
console.log(`solde de la cible : ${Number(await balance(cible)) / 1e9} SOL`);
