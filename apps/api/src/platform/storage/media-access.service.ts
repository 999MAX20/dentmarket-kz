import { createHmac, timingSafeEqual } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";

const TICKET_TTL_SECONDS = 300;

@Injectable()
export class MediaAccessService {
  private readonly secret = process.env.MEDIA_SIGNING_SECRET ?? process.env.JWT_SECRET ?? "local-media-signing-secret-change-me";

  constructor() {
    if (process.env.NODE_ENV === "production" && this.secret.length < 32) throw new Error("MEDIA_SIGNING_SECRET or JWT_SECRET must be at least 32 characters in production");
  }

  issue(mediaId: string, ttlSeconds = TICKET_TTL_SECONDS) {
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const payload = `${mediaId}.${expiresAt}`;
    const signature = createHmac("sha256", this.secret).update(payload).digest("base64url");
    return { token: `${expiresAt}.${signature}`, expiresInSeconds: ttlSeconds };
  }

  assertValid(mediaId: string, token: string | undefined) {
    if (!token) throw new UnauthorizedException("Media access ticket is required");
    const [expiresValue, signature] = token.split(".");
    const expiresAt = Number(expiresValue);
    if (!Number.isSafeInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000) || !signature) throw new UnauthorizedException("Media access ticket expired");
    const expected = createHmac("sha256", this.secret).update(`${mediaId}.${expiresAt}`).digest("base64url");
    const actualBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expected);
    if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) throw new UnauthorizedException("Invalid media access ticket");
  }
}
