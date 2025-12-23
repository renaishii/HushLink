const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesKeyFromAddress(address: string): Promise<CryptoKey> {
  const normalized = address.toLowerCase();
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(normalized));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptMessageWithAddress(message: string, keyAddress: string): Promise<string> {
  const key = await deriveAesKeyFromAddress(keyAddress);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintextBytes = textEncoder.encode(message);

  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintextBytes);
  const ciphertextBytes = new Uint8Array(encrypted);

  return `v1.${bytesToBase64(iv)}.${bytesToBase64(ciphertextBytes)}`;
}

export async function decryptMessageWithAddress(payload: string, keyAddress: string): Promise<string> {
  const [version, ivB64, ciphertextB64] = payload.split('.');
  if (version !== 'v1' || !ivB64 || !ciphertextB64) {
    throw new Error('Invalid ciphertext payload');
  }

  const key = await deriveAesKeyFromAddress(keyAddress);
  const iv = base64ToBytes(ivB64);
  const ciphertext = base64ToBytes(ciphertextB64);

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return textDecoder.decode(decrypted);
}

