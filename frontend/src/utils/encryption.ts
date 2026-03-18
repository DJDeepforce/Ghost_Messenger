import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';

export interface EncryptedMessage {
  nonce: string;
  ciphertext: string;
}

/**
 * Encrypt a message using NaCl box (asymmetric encryption)
 * @param message - The plaintext message to encrypt
 * @param recipientPublicKey - Base64 encoded public key of recipient
 * @param senderSecretKey - Base64 encoded secret key of sender
 * @returns Encrypted message with nonce
 */
export function encryptMessage(
  message: string,
  recipientPublicKey: string,
  senderSecretKey: string
): EncryptedMessage {
  const messageBytes = naclUtil.decodeUTF8(message);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const recipientPubKeyBytes = naclUtil.decodeBase64(recipientPublicKey);
  const senderSecKeyBytes = naclUtil.decodeBase64(senderSecretKey);

  const ciphertext = nacl.box(
    messageBytes,
    nonce,
    recipientPubKeyBytes,
    senderSecKeyBytes
  );

  return {
    nonce: naclUtil.encodeBase64(nonce),
    ciphertext: naclUtil.encodeBase64(ciphertext),
  };
}

/**
 * Decrypt a message using NaCl box (asymmetric decryption)
 * @param encrypted - The encrypted message with nonce
 * @param senderPublicKey - Base64 encoded public key of sender
 * @param recipientSecretKey - Base64 encoded secret key of recipient
 * @returns Decrypted plaintext message or null if decryption fails
 */
export function decryptMessage(
  encrypted: EncryptedMessage,
  senderPublicKey: string,
  recipientSecretKey: string
): string | null {
  try {
    const nonceBytes = naclUtil.decodeBase64(encrypted.nonce);
    const ciphertextBytes = naclUtil.decodeBase64(encrypted.ciphertext);
    const senderPubKeyBytes = naclUtil.decodeBase64(senderPublicKey);
    const recipientSecKeyBytes = naclUtil.decodeBase64(recipientSecretKey);

    const decrypted = nacl.box.open(
      ciphertextBytes,
      nonceBytes,
      senderPubKeyBytes,
      recipientSecKeyBytes
    );

    if (!decrypted) {
      return null;
    }

    return naclUtil.encodeUTF8(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
}

/**
 * Encrypt image data (base64) for transmission
 */
export function encryptImage(
  base64Image: string,
  recipientPublicKey: string,
  senderSecretKey: string
): EncryptedMessage {
  return encryptMessage(base64Image, recipientPublicKey, senderSecretKey);
}

/**
 * Decrypt image data
 */
export function decryptImage(
  encrypted: EncryptedMessage,
  senderPublicKey: string,
  recipientSecretKey: string
): string | null {
  return decryptMessage(encrypted, senderPublicKey, recipientSecretKey);
}
