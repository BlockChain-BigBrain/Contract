import { artifacts } from "hardhat";
import { mkdir, writeFile } from "node:fs/promises";
await mkdir("abi", { recursive: true });
for (const name of ["TrackRegistry", "LicenseNFT", "LicenseMarketplace", "RevenueSplitter"]) {
  const artifact = await artifacts.readArtifact(name);
  await writeFile(`abi/${name}.json`, JSON.stringify(artifact.abi, null, 2) + "\n");
  console.log(`abi/${name}.json`);
}
