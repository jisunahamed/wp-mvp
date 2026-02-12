import crypto from 'crypto';
import bcrypt from 'bcrypt';

export function generateApiKey(): string {
    return `sk_${crypto.randomBytes(32).toString('hex')}`;
}

export async function hashApiKey(apiKey: string): Promise<string> {
    return bcrypt.hash(apiKey, 10);
}

export async function validateApiKeyHash(apiKey: string, hash: string): Promise<boolean> {
    return bcrypt.compare(apiKey, hash);
}
