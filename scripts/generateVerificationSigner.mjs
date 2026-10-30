import { Wallet } from "ethers";
import { writeFile } from "node:fs/promises";

// Exclusive creation prevents silently replacing an existing verifier key.
const file = ".env.verification-signer";
const signer = Wallet.createRandom();
await writeFile(file, `VERIFICATION_SIGNER_ADDRESS=${signer.address}\nVERIFICATION_SIGNER_PRIVATE_KEY=${signer.privateKey}\n`, { flag: "wx", mode: 0o600 });
console.log(`Verification signer address: ${signer.address}`);
console.log(`Private key saved to ${file} (gitignored, mode 0600). Keep it private; load it only in the signing backend.`);
