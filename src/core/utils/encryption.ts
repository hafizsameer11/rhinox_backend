import crypto from 'crypto';

/**
 * Encryption utilities for private keys and mnemonics
 * Uses AES-256-CBC encryption
 */

/**
 * Encrypt private key or mnemonic using AES-256-CBC
 * @param data - The data to encrypt (mnemonic, private key, or secret)
 * @returns Encrypted string in format: iv:encryptedData
 */
export function encryptPrivateKey(data: string): string {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-key-32-characters-long!!', 'utf8');
  
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 characters');
  }
  
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt private key or mnemonic
 * @param encryptedKey - Encrypted string in format: iv:encryptedData
 * @returns Decrypted string
 */
export function decryptPrivateKey(encryptedKey: string): string {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-key-32-characters-long!!', 'utf8');
  
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 characters');
  }
  
  const parts = encryptedKey.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('Invalid encrypted key format');
  }
  
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  const updateBuffer = decipher.update(encrypted, 'hex');
  const finalBuffer = decipher.final();
  const decrypted = Buffer.concat([
    updateBuffer,
    finalBuffer
  ]).toString('utf8');
  
  return decrypted;
}

