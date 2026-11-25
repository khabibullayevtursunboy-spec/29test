import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export type UserRole = 'admin' | 'teacher' | 'student';

export interface SessionPayload {
  userId?: number;
  teacherId?: number;
  studentId?: number;
  classId?: number;
  role: UserRole;
  fullName: string;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  auth?: SessionPayload;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  try {
    const keyBuffer = Buffer.from(keyHex, 'hex');
    const derived = crypto.scryptSync(password, salt, 64);
    if (keyBuffer.length !== derived.length) return false;
    return crypto.timingSafeEqual(keyBuffer, derived);
  } catch {
    return false;
  }
}

export function verifyPlainSecret(input: string, expected: string): boolean {
  const inputDigest = crypto.createHash('sha256').update(input).digest();
  const expectedDigest = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(inputDigest, expectedDigest);
}

export function signSessionToken(payload: Omit<SessionPayload, 'exp'>): string {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      return null;
    }
    if (!['admin', 'teacher', 'student'].includes(parsed.role)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function requireAuth(roles?: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Avtorizatsiya talab qilinadi.' });
      return;
    }
    const token = header.slice('Bearer '.length).trim();
    const payload = verifySessionToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Sessiya muddati tugagan yoki yaroqsiz token.' });
      return;
    }
    if (roles && !roles.includes(payload.role)) {
      res.status(403).json({ error: 'Bu bo‘limga kirish huquqingiz yo‘q.' });
      return;
    }
    req.auth = payload;
    next();
  };
}
