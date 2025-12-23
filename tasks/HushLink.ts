import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import { Wallet, ethers } from "ethers";
import { createCipheriv, createHash, randomBytes } from "crypto";

function encryptMessageWithAddress(message: string, address: string): string {
  const key = createHash("sha256").update(address.toLowerCase()).digest();
  const iv = randomBytes(12);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(message, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();

  const combined = Buffer.concat([ciphertext, tag]);
  return `v1.${iv.toString("base64")}.${combined.toString("base64")}`;
}

/**
 * Example:
 *   - npx hardhat --network localhost task:hushlink:address
 *   - npx hardhat --network sepolia task:hushlink:address
 */
task("task:hushlink:address", "Prints the HushLink address").setAction(async function (
  _taskArguments: TaskArguments,
  hre,
) {
  const { deployments } = hre;
  const hushLink = await deployments.get("HushLink");
  console.log("HushLink address is " + hushLink.address);
});

/**
 * Example:
 *   - npx hardhat --network localhost task:hushlink:send --to 0x... --message "hello"
 *   - npx hardhat --network sepolia task:hushlink:send --to 0x... --message "hello"
 */
task("task:hushlink:send", "Sends an encrypted message to a recipient")
  .addOptionalParam("address", "Optionally specify the HushLink contract address")
  .addParam("to", "Recipient address")
  .addParam("message", "Plaintext message")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers: hreEthers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("HushLink");
    const sender = (await hreEthers.getSigners())[0];

    const recipient = ethers.getAddress(taskArguments.to);
    const plaintext = String(taskArguments.message);

    const ephemeralAddress = Wallet.createRandom().address;
    const ciphertext = encryptMessageWithAddress(plaintext, ephemeralAddress);

    const encryptedInput = await fhevm
      .createEncryptedInput(deployment.address, sender.address)
      .addAddress(ephemeralAddress)
      .encrypt();

    const contract = await hreEthers.getContractAt("HushLink", deployment.address);

    const tx = await contract
      .connect(sender)
      .sendMessage(recipient, ciphertext, encryptedInput.handles[0], encryptedInput.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();

    console.log(`tx:${tx.hash} status=${receipt?.status}`);
    console.log(`Encrypted message stored for recipient=${recipient}`);
    console.log(`Ephemeral key address (shareable only after FHE decryption): ${ephemeralAddress}`);
  });

