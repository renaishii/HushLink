import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { deployments, ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { HushLink } from "../types";
import { Wallet } from "ethers";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

type Signers = {
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

function encryptMessageWithAddress(message: string, address: string): string {
  const key = createHash("sha256").update(address.toLowerCase()).digest();
  const iv = randomBytes(12);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(message, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();

  const combined = Buffer.concat([ciphertext, tag]);
  return `v1.${iv.toString("base64")}.${combined.toString("base64")}`;
}

function decryptMessageWithAddress(payload: string, address: string): string {
  const [version, ivB64, combinedB64] = payload.split(".");
  expect(version).to.eq("v1");

  const iv = Buffer.from(ivB64, "base64");
  const combined = Buffer.from(combinedB64, "base64");
  const ciphertext = combined.subarray(0, combined.length - 16);
  const tag = combined.subarray(combined.length - 16);

  const key = createHash("sha256").update(address.toLowerCase()).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

describe("HushLinkSepolia", function () {
  let signers: Signers;
  let contract: HushLink;
  let contractAddress: string;

  before(async function () {
    if (fhevm.isMock) {
      console.warn(`This hardhat test suite can only run on Sepolia Testnet`);
      this.skip();
    }

    try {
      const deployment = await deployments.get("HushLink");
      contractAddress = deployment.address;
      contract = await ethers.getContractAt("HushLink", deployment.address);
    } catch (e) {
      (e as Error).message += ". Call 'npx hardhat deploy --network sepolia'";
      throw e;
    }

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { alice: ethSigners[0], bob: ethSigners[1] };
  });

  it("alice can send a message to bob and bob can decrypt it", async function () {
    this.timeout(4 * 40000);

    const plaintext = "hello sepolia hushlink";

    const ephemeralAddress = Wallet.createRandom().address;
    const ciphertext = encryptMessageWithAddress(plaintext, ephemeralAddress);

    const encryptedInput = await fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .addAddress(ephemeralAddress)
      .encrypt();

    const tx = await contract
      .connect(signers.alice)
      .sendMessage(signers.bob.address, ciphertext, encryptedInput.handles[0], encryptedInput.inputProof);
    await tx.wait();

    const count = await contract.getInboxCount(signers.bob.address);
    expect(count).to.be.greaterThan(0);

    const index = count - 1n;
    const message = await contract.getMessage(signers.bob.address, index);

    const decryptedKey = await fhevm.userDecryptEaddress(message.encryptedKeyAddress, contractAddress, signers.bob);
    expect(decryptedKey).to.eq(ephemeralAddress);

    const decryptedMessage = decryptMessageWithAddress(message.ciphertext, decryptedKey);
    expect(decryptedMessage).to.eq(plaintext);
  });
});

