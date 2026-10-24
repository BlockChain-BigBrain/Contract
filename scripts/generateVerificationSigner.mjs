import { Wallet } from "ethers";
import fs from "fs";
import path from "path";

const args = process.argv.slice(2);
const shouldWrite = args.includes("--write");
const force = args.includes("--force");

const envPath = path.join(process.cwd(), ".env");

const wallet = Wallet.createRandom();

const generatedAddress = wallet.address;
const generatedPrivateKey = wallet.privateKey;

function parseEnv(content) {
  const result = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalIndex = trimmed.indexOf("=");

    if (equalIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalIndex).trim();
    const value = trimmed.slice(equalIndex + 1).trim();

    result[key] = value;
  }

  return result;
}

function upsertEnvValue(content, key, value) {
  const lines = content.split(/\r?\n/);
  const index = lines.findIndex((line) => line.trim().startsWith(`${key}=`));

  if (index >= 0) {
    lines[index] = `${key}=${value}`;
    return lines.join("\n");
  }

  if (content.length > 0 && !content.endsWith("\n")) {
    content += "\n";
  }

  return `${content}${key}=${value}\n`;
}

function ensureBlankKey(content, key) {
  const exists = content
    .split(/\r?\n/)
    .some((line) => line.trim().startsWith(`${key}=`));

  if (exists) {
    return content;
  }

  if (content.length > 0 && !content.endsWith("\n")) {
    content += "\n";
  }

  return `${content}${key}=\n`;
}

console.log("");
console.log("로컬 테스트용 EIP-712 signer 지갑 생성 완료");
console.log("=".repeat(70));
console.log(`VERIFICATION_SIGNER_ADDRESS=${generatedAddress}`);
console.log(`VERIFICATION_SIGNER_PRIVATE_KEY=${generatedPrivateKey}`);
console.log("=".repeat(70));
console.log("");

if (!shouldWrite) {
  console.log("현재는 출력만 했습니다.");
  console.log(".env에 자동 저장하려면 아래 명령어를 실행하세요.");
  console.log("");
  console.log("node scripts/generateVerificationSigner.mjs --write");
  console.log("");
  process.exit(0);
}

let envContent = "";

if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, "utf8");
}

const parsedEnv = parseEnv(envContent);

const hasExistingAddress = Boolean(parsedEnv.VERIFICATION_SIGNER_ADDRESS);
const hasExistingPrivateKey = Boolean(parsedEnv.VERIFICATION_SIGNER_PRIVATE_KEY);

if ((hasExistingAddress || hasExistingPrivateKey) && !force) {
  console.log(".env에 이미 VERIFICATION_SIGNER 값이 있습니다.");
  console.log("기존 값을 덮어쓰지 않았습니다.");
  console.log("");
  console.log("정말 새로 만들고 덮어쓰려면 아래 명령어를 실행하세요.");
  console.log("");
  console.log("node scripts/generateVerificationSigner.mjs --write --force");
  console.log("");
  process.exit(0);
}

envContent = ensureBlankKey(envContent, "VERIFICATION_SIGNER_ADDRESS");
envContent = ensureBlankKey(envContent, "VERIFICATION_SIGNER_PRIVATE_KEY");
envContent = ensureBlankKey(envContent, "TRACK_REGISTRY_ADDRESS");
envContent = ensureBlankKey(envContent, "LICENSE_NFT_ADDRESS");
envContent = ensureBlankKey(envContent, "LICENSE_MARKETPLACE_ADDRESS");
envContent = ensureBlankKey(envContent, "REVENUE_SPLITTER_ADDRESS");

envContent = upsertEnvValue(
  envContent,
  "VERIFICATION_SIGNER_ADDRESS",
  generatedAddress
);

envContent = upsertEnvValue(
  envContent,
  "VERIFICATION_SIGNER_PRIVATE_KEY",
  generatedPrivateKey
);

fs.writeFileSync(envPath, envContent, "utf8");

console.log(".env 파일에 저장 완료");
console.log("");
console.log("저장된 값:");
console.log(`VERIFICATION_SIGNER_ADDRESS=${generatedAddress}`);
console.log("VERIFICATION_SIGNER_PRIVATE_KEY=저장됨");
console.log("");
console.log("주의: .env는 GitHub에 올리면 안 됩니다.");
console.log("");
