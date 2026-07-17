import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Res, StreamableFile, UseGuards } from "@nestjs/common";
import { completeDocumentSignatureSchema, createDocumentTemplateSchema, createDocumentVersionSchema, createGeneratedDocumentSchema, createSignatureSessionSchema, documentQuerySchema, uploadDocumentSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { DocumentsService } from "./documents.service";

@ApiTags("documents")
@UseGuards(PermissionsGuard)
@Controller("documents")
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}
  private context(actorId: string, organizationId: string) { return { actorId, organizationId }; }

  @Get("capabilities")
  @RequirePermissions("document.view")
  capabilities() { return this.documents.capabilities(); }

  @Get("templates")
  @RequirePermissions("document.view")
  templates() { return this.documents.templates(); }

  @Post("templates")
  @RequirePermissions("document.template.manage")
  createTemplate(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createDocumentTemplateSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.documents.createTemplate(parsed.data, this.context(actorId, organizationId));
  }

  @Get()
  @RequirePermissions("document.view")
  list(@Query() query: Record<string, unknown>, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = documentQuerySchema.safeParse(query); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.documents.list(parsed.data, this.context(actorId, organizationId));
  }

  @Get(":documentId")
  @RequirePermissions("document.view")
  get(@Param("documentId") documentId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.documents.get(documentId, this.context(actorId, organizationId));
  }

  @Post("generate")
  @RequirePermissions("document.manage")
  generate(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createGeneratedDocumentSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.documents.generate(parsed.data, this.context(actorId, organizationId));
  }

  @Post("upload")
  @RequirePermissions("document.manage")
  upload(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = uploadDocumentSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.documents.upload(parsed.data, this.context(actorId, organizationId));
  }

  @Post(":documentId/versions")
  @RequirePermissions("document.manage")
  version(@Param("documentId") documentId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createDocumentVersionSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.documents.createVersion(documentId, parsed.data, this.context(actorId, organizationId));
  }

  @Post(":documentId/signature-sessions")
  @RequirePermissions("document.sign")
  signatureSession(@Param("documentId") documentId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createSignatureSessionSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.documents.createSignatureSession(documentId, parsed.data, this.context(actorId, organizationId));
  }

  @Post("signatures/:signatureId/complete")
  @RequirePermissions("document.sign")
  completeSignature(@Param("signatureId") signatureId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = completeDocumentSignatureSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.documents.completeSignature(signatureId, parsed.data, this.context(actorId, organizationId));
  }

  @Post(":documentId/archive")
  @RequirePermissions("document.manage")
  archive(@Param("documentId") documentId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.documents.archive(documentId, this.context(actorId, organizationId));
  }

  @Get(":documentId/download")
  @RequirePermissions("document.view")
  async download(@Param("documentId") documentId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string, @Res({ passthrough: true }) response: Response) {
    const result = await this.documents.download(documentId, this.context(actorId, organizationId));
    if (result.signedUrl) return { url: result.signedUrl, expiresInSeconds: 300 };
    response.setHeader("Content-Type", result.document.contentType!);
    response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(result.document.fileName!)}`);
    response.setHeader("ETag", result.document.checksumSha256!);
    return new StreamableFile(result.body!);
  }
}
