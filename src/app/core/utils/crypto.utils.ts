export interface EncryptedPayload {
  iv: string;
  ciphertext: string;
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes.buffer;
}

export async function decryptJson<T>(payload: EncryptedPayload, keyHex: string): Promise<T> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    hexToBuffer(keyHex),
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBuffer(payload.iv) },
    cryptoKey,
    base64ToBuffer(payload.ciphertext),
  );

  return JSON.parse(new TextDecoder().decode(decrypted));
}
