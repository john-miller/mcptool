// Client-side JWT decoding. Nothing here verifies signatures: that needs the issuer's key.

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: unknown;
  signature: string;
  parts: [string, string, string];
}

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Accepts a raw token or a pasted "Bearer …" / "Authorization: Bearer …" value. */
export function cleanToken(input: string): string {
  return input
    .trim()
    .replace(/^authorization:\s*/i, '')
    .replace(/^bearer\s+/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

export function decodeJwt(input: string): DecodedJwt {
  const token = cleanToken(input);
  const parts = token.split('.');
  if (parts.length === 5) throw new Error('This looks like an encrypted JWT (JWE); its payload cannot be read without the key.');
  if (parts.length !== 3) throw new Error(`Not a JWT: expected 3 dot-separated parts, found ${parts.length}. It may be an opaque token.`);
  let header: Record<string, unknown>;
  try {
    header = JSON.parse(base64UrlDecode(parts[0]));
  } catch {
    throw new Error('The header is not valid base64url-encoded JSON.');
  }
  let payload: unknown;
  const rawPayload = (() => {
    try {
      return base64UrlDecode(parts[1]);
    } catch {
      throw new Error('The payload is not valid base64url.');
    }
  })();
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    payload = rawPayload; // Unusual but legal: a non-JSON payload.
  }
  return { header, payload, signature: parts[2], parts: parts as [string, string, string] };
}

export const CLAIM_DESCRIPTIONS: Record<string, string> = {
  iss: 'Issuer: who created and signed the token',
  sub: 'Subject: who the token is about (usually the user id)',
  aud: 'Audience: who the token is intended for',
  exp: 'Expires at',
  nbf: 'Not valid before',
  iat: 'Issued at',
  jti: 'Token id (unique, used to prevent replay)',
  scope: 'Granted OAuth scopes',
  scp: 'Granted OAuth scopes',
  client_id: 'OAuth client the token was issued to',
  azp: 'Authorized party (client the token was issued to)',
  sid: 'Session id',
  name: 'Full name',
  email: 'Email address',
  email_verified: 'Whether the email address is verified',
  roles: 'Roles',
  groups: 'Groups',
  tid: 'Tenant id',
  auth_time: 'When the user authenticated',
  nonce: 'Nonce from the authorization request',
  acr: 'Authentication context class',
  amr: 'Authentication methods used',
};

export const HEADER_DESCRIPTIONS: Record<string, string> = {
  alg: 'Signing algorithm',
  typ: 'Token type',
  kid: 'Key id: which of the issuer’s keys signed it',
  cty: 'Content type',
  jku: 'URL of the signing key set',
  x5t: 'Certificate thumbprint',
};

export const TIME_CLAIMS = new Set(['exp', 'nbf', 'iat', 'auth_time']);

export function relativeTime(ms: number, now = Date.now()): string {
  const diff = ms - now;
  const abs = Math.abs(diff);
  const units: [number, string][] = [
    [86_400_000, 'day'],
    [3_600_000, 'hour'],
    [60_000, 'minute'],
    [1000, 'second'],
  ];
  for (const [size, unit] of units) {
    if (abs >= size || unit === 'second') {
      const n = Math.round(abs / size);
      const label = `${n} ${unit}${n === 1 ? '' : 's'}`;
      return diff >= 0 ? `in ${label}` : `${label} ago`;
    }
  }
  return '';
}

export type TokenStatus = { state: 'valid' | 'expired' | 'not-yet-valid' | 'no-expiry'; message: string };

export function tokenStatus(payload: unknown, now = Date.now()): TokenStatus {
  const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const exp = typeof p.exp === 'number' ? p.exp * 1000 : undefined;
  const nbf = typeof p.nbf === 'number' ? p.nbf * 1000 : undefined;
  if (nbf !== undefined && nbf > now) return { state: 'not-yet-valid', message: `Not valid until ${relativeTime(nbf, now)}` };
  if (exp === undefined) return { state: 'no-expiry', message: 'No expiry (exp) claim' };
  if (exp <= now) return { state: 'expired', message: `Expired ${relativeTime(exp, now)}` };
  return { state: 'valid', message: `Expires ${relativeTime(exp, now)}` };
}
