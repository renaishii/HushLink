import { useState } from 'react';
import { useAccount } from 'wagmi';
import { Contract, Wallet, getAddress, isAddress } from 'ethers';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '../config/contracts';
import { encryptMessageWithAddress } from '../lib/messageCrypto';
import '../styles/SendMessage.css';

// const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export function SendMessage() {
  const { address, isConnected } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');

  const [isSending, setIsSending] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [lastEphemeralAddress, setLastEphemeralAddress] = useState<string | null>(null);

  const contractReady =true;

  async function onSend(e: React.FormEvent) {
    e.preventDefault();

    setErrorText(null);
    setTxHash(null);
    setLastEphemeralAddress(null);

    if (!contractReady) {
      setErrorText('Contract is not configured. Please sync the Sepolia deployment first.');
      return;
    }

    if (!isConnected || !address) {
      setErrorText('Connect your wallet first.');
      return;
    }

    if (!instance || zamaLoading) {
      setErrorText('Encryption service is still initializing.');
      return;
    }

    if (!signerPromise) {
      setErrorText('Wallet signer is not available.');
      return;
    }

    const trimmedMessage = message.trim();
    if (trimmedMessage.length === 0) {
      setErrorText('Message cannot be empty.');
      return;
    }

    if (!isAddress(recipient)) {
      setErrorText('Invalid recipient address.');
      return;
    }

    setIsSending(true);

    try {
      setStatusText('Generating ephemeral key address...');
      const ephemeralAddress = Wallet.createRandom().address;

      setStatusText('Encrypting message locally...');
      const ciphertext = await encryptMessageWithAddress(trimmedMessage, ephemeralAddress);

      setStatusText('Encrypting key address with Zama FHE...');
      const input = instance.createEncryptedInput(CONTRACT_ADDRESS, address);
      input.addAddress(ephemeralAddress);
      const encryptedInput = await input.encrypt();

      setStatusText('Sending transaction...');
      const signer = await signerPromise;
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      const tx = await contract.sendMessage(
        getAddress(recipient),
        ciphertext,
        encryptedInput.handles[0],
        encryptedInput.inputProof,
      );
      setTxHash(tx.hash);

      setStatusText('Waiting for confirmation...');
      await tx.wait();

      setLastEphemeralAddress(ephemeralAddress);
      setStatusText('Message sent.');
      setMessage('');
    } catch (err) {
      console.error(err);
      setErrorText(err instanceof Error ? err.message : 'Failed to send message.');
      setStatusText(null);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="send-message">
      <h2 className="send-title">Send a private message</h2>
      <p className="send-subtitle">
        The message is encrypted locally with a randomly generated address, then that address is encrypted with Zama FHE
        so only the recipient can decrypt it.
      </p>

      {zamaError ? (
        <div className="send-alert">
          <p className="send-alert-title">Encryption service error</p>
          <p className="send-alert-text">{zamaError}</p>
        </div>
      ) : null}

      <form onSubmit={onSend} className="send-form">
        <label className="send-label">
          Recipient
          <input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="send-input"
            placeholder="0x..."
            spellCheck={false}
            autoComplete="off"
            inputMode="text"
          />
        </label>

        <label className="send-label">
          Message
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="send-textarea"
            placeholder="Write something..."
            rows={5}
            spellCheck={false}
          />
        </label>

        {errorText ? <div className="send-error">{errorText}</div> : null}
        {statusText ? <div className="send-status">{statusText}</div> : null}

        <button
          type="submit"
          className="send-button"
          disabled={!contractReady || !isConnected || zamaLoading || isSending}
        >
          {zamaLoading ? 'Initializing...' : isSending ? 'Sending...' : 'Send'}
        </button>
      </form>

      {txHash ? (
        <div className="send-result">
          <div className="send-result-row">
            <span className="send-result-label">Tx</span>
            <code className="send-result-value">{txHash}</code>
          </div>
          {lastEphemeralAddress ? (
            <div className="send-result-row">
              <span className="send-result-label">Ephemeral key address</span>
              <code className="send-result-value">{lastEphemeralAddress}</code>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
