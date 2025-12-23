import { task } from "hardhat/config";
import fs from "fs";
import path from "path";

task("task:sync-frontend", "Sync ABI and address into the frontend config (uses deployments/sepolia)").setAction(
  async function () {
    const networkName = "sepolia";
    const deploymentPath = path.join(__dirname, "..", "deployments", networkName, "HushLink.json");

    if (!fs.existsSync(deploymentPath)) {
      throw new Error(`Deployment file not found at ${deploymentPath}`);
    }

    const deploymentRaw = fs.readFileSync(deploymentPath, "utf8");
    const deployment = JSON.parse(deploymentRaw) as { address: string; abi: unknown };

    if (!deployment.address || !Array.isArray(deployment.abi)) {
      throw new Error(`Deployment file is missing address or abi`);
    }

    const targetPath = path.join(__dirname, "..", "src", "src", "config", "contracts.ts");
    const output =
      `// Auto-generated from deployments/${networkName}/HushLink.json\n` +
      `export const CONTRACT_ADDRESS = '${deployment.address}';\n\n` +
      `export const CONTRACT_ABI = ${JSON.stringify(deployment.abi, null, 2)} as const;\n`;

    fs.writeFileSync(targetPath, output);
    console.log(`Synced ABI and address to ${targetPath}`);
  },
);
