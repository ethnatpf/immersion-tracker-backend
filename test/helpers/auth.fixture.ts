import { generateKeyPairSync, sign } from "node:crypto";
import type { AuthOptions, JWTPayload } from "express-oauth2-jwt-bearer";

export function createAuthFixture() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const issuer = "https://issuer.test/";
  const audience = "https://api.test";
  const userId = "auth0|test-user";
  const authorization: AuthOptions = {
    issuer,
    audience,
    publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
    tokenSigningAlg: "RS256",
  };

  function createToken(claims: Partial<JWTPayload> = {}): string {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: "RS256", typ: "JWT" }),
    ).toString("base64url");
    // An undefined override omits a claim when JSON.stringify serializes it.
    const payload = Buffer.from(
      JSON.stringify({
        iss: issuer,
        aud: audience,
        sub: userId,
        iat: now,
        exp: now + 300,
        ...claims,
      }),
    ).toString("base64url");
    const input = `${header}.${payload}`;
    const signature = sign(
      "RSA-SHA256",
      Buffer.from(input),
      privateKey,
    ).toString("base64url");
    return `${input}.${signature}`;
  }

  return { authorization, userId, createToken };
}
