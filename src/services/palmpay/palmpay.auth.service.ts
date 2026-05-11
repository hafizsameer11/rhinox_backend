import crypto from 'crypto';
import { getPalmPayConfig } from './palmpay.config.js';

type SignableValue = string | number | boolean | null | undefined;

export class PalmPayAuthService {
  private normalizePrivateKey(privateKey: string): string {
    const trimmed = privateKey.replace(/\\n/g, '\n').trim();
    if (trimmed.includes('-----BEGIN')) {
      return trimmed;
    }

    const lines = trimmed.match(/.{1,64}/g)?.join('\n') || trimmed;
    return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`;
  }

  private normalizePublicKey(publicKey: string): string {
    const trimmed = publicKey.replace(/\\n/g, '\n').trim();
    if (trimmed.includes('-----BEGIN')) {
      return trimmed;
    }

    const lines = trimmed.match(/.{1,64}/g)?.join('\n') || trimmed;
    return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`;
  }

  private buildSignString(params: Record<string, SignableValue>): string {
    return Object.entries(params)
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
  }

  sign(params: Record<string, SignableValue>): string {
    const config = getPalmPayConfig();
    const signString = this.buildSignString(params);
    const digest = crypto.createHash('md5').update(signString, 'utf8').digest('hex').toUpperCase();
    const signer = crypto.createSign('RSA-SHA1');
    signer.update(digest);
    signer.end();
    return signer.sign(this.normalizePrivateKey(config.privateKey), 'base64');
  }

  verifyWebhookSignature(payload: Record<string, any>, signature?: string): boolean {
    const config = getPalmPayConfig();
    if (!config.publicKey || !signature) {
      return false;
    }

    const { sign, ...payloadWithoutSign } = payload;
    const signString = this.buildSignString(payloadWithoutSign);
    const digest = crypto.createHash('md5').update(signString, 'utf8').digest('hex').toUpperCase();
    const verifier = crypto.createVerify('RSA-SHA1');
    verifier.update(digest);
    verifier.end();
    return verifier.verify(this.normalizePublicKey(config.publicKey), signature, 'base64');
  }
}
