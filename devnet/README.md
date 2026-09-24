# Devnet bench — what a proof and a badge really cost

Measures on devnet, with disposable keys:

| Rail | What it creates |
|---|---|
| **SAS** (Solana Attestation Service) | credential, two schemas, the badge schema's group mint, a monthly proof, a badge (tokenized attestation) |
| **Metaplex Core** | a frozen collection, a badge (soulbound asset) |

For each badge it also checks that the holder **cannot** transfer it and that
the issuer **can** revoke it, then reports what the rent costs and what comes back.

```bash
npm install
npm run deploy                                # the IRONCHAIN credential + ironchain-month schema (rerunnable)
npm run bench                                 # measure
PHANTOM=<devnet address> npm run bench        # also send one badge of each kind to look at
METADATA_URI=<json url> npm run bench         # the badge's name/image file
```

The payer key is created in `.keys/` (git-ignored) and reused between runs.
Fund it once at <https://faucet.solana.com> (network: devnet). The script
refuses to run against anything but devnet or a local validator.

Results land in `results/<date>-<run>.json`.
