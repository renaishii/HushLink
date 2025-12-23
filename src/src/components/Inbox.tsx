import { useCallback, useMemo, useState } from 'react';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import type { Address } from 'viem';
import { isAddress } from 'viem';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '../config/contracts';
import { decryptMessageWithAddress } from '../lib/messageCrypto';
import '../styles/Inbox.css';

type DecryptedEntry = {
  keyAddress: string;
  message: string;
};

// const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function isBytes32(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function formatTimestamp(ts: bigint): string {
  const ms = Number(ts) * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return '';
  return new Date(ms).toLocaleString();
}

function shorten(text: string, head = 10, tail = 6): string {
  if (text.length <= head + tail + 3) return text;
  return `${text.slice(0, head)}...${text.slice(-tail)}`;
}

export function Inbox() {
  const { address, isConnected } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading } = useZamaInstance();

  const contractReady =true;

  const enabled = Boolean(isConnected && address && contractReady);

  const { data: inboxCount, refetch: refetchCount } = useReadContract({
    address: CONTRACT_ADDRESS as Address,
    abi: CONTRACT_ABI,
    functionName: 'getInboxCount',
    args: address ? [address as Address] : undefined,
    query: { enabled },
  });

  const messageCalls = useMemo(() => {
    if (!enabled || !address || !inboxCount) return [];

    const count = Number(inboxCount);
    if (!Number.isFinite(count) || count <= 0) return [];

    return Array.from({ length: count }, (_, i) => ({
      address: CONTRACT_ADDRESS as Address,
      abi: CONTRACT_ABI,
      functionName: 'getMessage' as const,
      args: [address as Address, BigInt(i)] as const,
    }));
  }, [enabled, address, inboxCount]);

  const { data: messages, refetch: refetchMessages } = useReadContracts({
    contracts: messageCalls,
    query: { enabled: messageCalls.length > 0 },
  });

  const [decryptingIndex, setDecryptingIndex] = useState<number | null>(null);
  const [decrypted, setDecrypted] = useState<Record<number, DecryptedEntry>>({});
  const [errorText, setErrorText] = useState<string | null>(null);

  const onRefresh = useCallback(async () => {
    setErrorText(null);
    await refetchCount();
    await refetchMessages();
  }, [refetchCount, refetchMessages]);

  const decryptMessage = useCallback(
    async (index: number) => {
      setErrorText(null);

      if (!enabled || !address) {
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

      const entry = messages?.[index];
      if (!entry || entry.status !== 'success' || !entry.result) {
        setErrorText('Message data is not available yet.');
        return;
      }

      const [, , ciphertext, encryptedKeyAddress] = entry.result as unknown as [
        `0x${string}`,
        bigint,
        string,
        `0x${string}`,
      ];

      setDecryptingIndex(index);
      try {
        if (!isBytes32(encryptedKeyAddress)) throw new Error('Invalid encrypted key handle');

        const keypair = instance.generateKeypair();
        const handleContractPairs = [
          {
            handle: encryptedKeyAddress,
            contractAddress: CONTRACT_ADDRESS,
          },
        ];

        const startTimeStamp = Math.floor(Date.now() / 1000).toString();
        const durationDays = '10';
        const contractAddresses = [CONTRACT_ADDRESS];
        const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);

        const signer = await signerPromise;
        const signature = await signer.signTypedData(
          eip712.domain,
          {
            UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
          },
          eip712.message,
        );

        const result = await instance.userDecrypt(
          handleContractPairs,
          keypair.privateKey,
          keypair.publicKey,
          signature.replace('0x', ''),
          contractAddresses,
          address,
          startTimeStamp,
          durationDays,
        );

        const keyAddress = result[encryptedKeyAddress];
        if (typeof keyAddress !== 'string' || !isAddress(keyAddress)) {
          throw new Error('Failed to decrypt key address');
        }

        const plaintext = await decryptMessageWithAddress(ciphertext, keyAddress);

        setDecrypted((prev) => ({
          ...prev,
          [index]: { keyAddress, message: plaintext },
        }));
      } catch (err) {
        console.error(err);
        setErrorText(err instanceof Error ? err.message : 'Failed to decrypt message.');
      } finally {
        setDecryptingIndex(null);
      }
    },
    [address, enabled, instance, messages, signerPromise, zamaLoading],
  );

  if (!contractReady) {
    return (
      <div className="inbox">
        <p className="inbox-empty">Contract is not configured.</p>
      </div>
    );
  }

  if (!isConnected || !address) {
    return (
      <div className="inbox">
        <p className="inbox-empty">Connect your wallet to view your inbox.</p>
      </div>
    );
  }

  const countNumber = inboxCount ? Number(inboxCount) : 0;
  const hasMessages = Number.isFinite(countNumber) && countNumber > 0;

  return (
    <div className="inbox">
      <div className="inbox-header">
        <div>
          <h2 className="inbox-title">Inbox</h2>
          <p className="inbox-subtitle">
            Messages are stored encrypted. Click decrypt to fetch your key address through the Zama relayer and decrypt
            locally.
          </p>
        </div>
        <button type="button" className="inbox-refresh" onClick={onRefresh}>
          Refresh
        </button>
      </div>

      {errorText ? <div className="inbox-error">{errorText}</div> : null}

      {!hasMessages ? <div className="inbox-empty">No messages yet.</div> : null}

      {hasMessages ? (
        <div className="inbox-list">
          {(messages ?? []).map((item, i) => {
            if (!item || item.status !== 'success' || !item.result) {
              return (
                <div className="inbox-item" key={i}>
                  <div className="inbox-item-top">
                    <div className="inbox-item-title">Message #{i}</div>
                  </div>
                  <div className="inbox-item-body">Loading…</div>
                </div>
              );
            }

            const [sender, timestamp, ciphertext, encryptedKeyAddress] = item.result as unknown as [
              `0x${string}`,
              bigint,
              string,
              `0x${string}`,
            ];

            const decryptedEntry = decrypted[i];
            const isDecrypting = decryptingIndex === i;

            return (
              <div className="inbox-item" key={i}>
                <div className="inbox-item-top">
                  <div>
                    <div className="inbox-item-title">Message #{i}</div>
                    <div className="inbox-meta">
                      <span>From: {shorten(sender)}</span>
                      <span>Time: {formatTimestamp(timestamp)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="inbox-decrypt"
                    disabled={isDecrypting || zamaLoading}
                    onClick={() => decryptMessage(i)}
                  >
                    {isDecrypting ? 'Decrypting…' : 'Decrypt'}
                  </button>
                </div>

                <div className="inbox-item-body">
                  <div className="inbox-row">
                    <span className="inbox-label">Ciphertext</span>
                    <code className="inbox-value">{shorten(ciphertext, 20, 12)}</code>
                  </div>
                  <div className="inbox-row">
                    <span className="inbox-label">Encrypted key handle</span>
                    <code className="inbox-value">{shorten(encryptedKeyAddress, 20, 12)}</code>
                  </div>

                  {decryptedEntry ? (
                    <div className="inbox-decrypted">
                      <div className="inbox-row">
                        <span className="inbox-label">Decrypted key address</span>
                        <code className="inbox-value">{decryptedEntry.keyAddress}</code>
                      </div>
                      <div className="inbox-row">
                        <span className="inbox-label">Plaintext</span>
                        <div className="inbox-plaintext">{decryptedEntry.message}</div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
