import { Controller, Get, Headers, Param, Query, Res, StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { MediaAccessService } from "../../platform/storage/media-access.service";
import { ObjectStorageService } from "../../platform/storage/object-storage.service";

@Controller("catalog/media")
export class CatalogMediaController {
  constructor(private readonly prisma: PrismaService, private readonly mediaAccess: MediaAccessService, private readonly storage: ObjectStorageService) {}

  @Get(":mediaId")
  async get(@Param("mediaId") mediaId: string, @Query("ticket") ticket: string | undefined, @Headers("if-none-match") ifNoneMatch: string | undefined, @Res({ passthrough: true }) response: Response) {
    this.mediaAccess.assertValid(mediaId, ticket);
    const media = await this.prisma.productMedia.findFirst({ where: { id: mediaId, status: "READY" }, select: { normalizedStorageKey: true, checksumSha256: true, mimeType: true, width: true, height: true } });
    if (!media?.normalizedStorageKey) return response.status(404).json({ message: "Media is not available in private storage" });
    const etag = media.checksumSha256 ? `"${media.checksumSha256}"` : undefined;
    if (etag && ifNoneMatch === etag) return response.status(304).end();
    response.setHeader("Content-Type", media.mimeType ?? "image/webp");
    response.setHeader("Content-Disposition", "inline");
    response.setHeader("Cache-Control", "private, max-age=300, stale-while-revalidate=60");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (etag) response.setHeader("ETag", etag);
    const signedUrl = await this.storage.signedDownloadUrl(media.normalizedStorageKey, 300);
    if (signedUrl) return response.redirect(302, signedUrl);
    return new StreamableFile(await this.storage.get(media.normalizedStorageKey));
  }
}
