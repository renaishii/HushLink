import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { HushLink, HushLink__factory } from "../types";
import { Wallet } from "ethers";
import { createDecipheriv, createHash, randomBytes, createCipheriv } from "crypto";

type Signers = {
  deployer: HardhatEthersSigner;
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
  const parts = payload.split(".");
  expect(parts.length).to.eq(3);
  expect(parts[0]).to.eq("v1");

  const iv = Buffer.from(parts[1], "base64");
  const combined = Buffer.from(parts[2], "base64");
  expect(combined.length).to.be.greaterThan(16);

  const ciphertext = combined.subarray(0, combined.length - 16);
  const tag = combined.subarray(combined.length - 16);

  const key = createHash("sha256").update(address.toLowerCase()).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  return plaintext;
}

async function deployFixture() {
  const factory = (await ethers.getContractFactory("HushLink")) as HushLink__factory;
  const contract = (await factory.deploy()) as HushLink;
  const address = await contract.getAddress();
  return { contract, address };
}

describe("HushLink", function () {
  let signers: Signers;
  let contract: HushLink;
  let contractAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ contract, address: contractAddress } = await deployFixture());
  });

  it("inbox should be empty after deployment", async function () {
    const count = await contract.getInboxCount(signers.bob.address);
    expect(count).to.eq(0);
  });

  it("alice can send a message to bob and bob can decrypt it", async function () {
    const plaintext = "hello hushlink";

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
    expect(count).to.eq(1);

    const message = await contract.getMessage(signers.bob.address, 0);
    expect(message.sender).to.eq(signers.alice.address);
    expect(message.ciphertext).to.eq(ciphertext);
    expect(message.timestamp).to.be.greaterThan(0);

    // Decrypt the encrypted key address as Bob, then decrypt the message locally.
    const decryptedKey = await fhevm.userDecryptEaddress(message.encryptedKeyAddress, contractAddress, signers.bob);
    expect(decryptedKey).to.eq(ephemeralAddress);

    const decryptedMessage = decryptMessageWithAddress(ciphertext, decryptedKey);
    expect(decryptedMessage).to.eq(plaintext);
  });

  it("reverts on invalid index", async function () {
    await expect(contract.getMessage(signers.alice.address, 0)).to.be.revertedWithCustomError(contract, "InvalidIndex");
  });
});

