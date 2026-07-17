import { BadRequestException, Body, Controller, Headers, Post, Req } from "@nestjs/common";
import { signatureGatewayCallbackSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { SignatureCallbacksService } from "./signature-callbacks.service";

@ApiTags("signature-gateway")
@Controller("documents/signatures")
export class SignatureCallbacksController {
  constructor(private readonly callbacks: SignatureCallbacksService) {}

  @Post("callback")
  callback(@Body() body: unknown, @Req() request: RawBodyRequest<Request>, @Headers("x-signature-event-id") eventId: string, @Headers("x-signature-timestamp") timestamp: string, @Headers("x-signature-signature") signature: string) {
    const parsed = signatureGatewayCallbackSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    if (!request.rawBody) throw new BadRequestException("Raw callback body is required");
    return this.callbacks.process(parsed.data, request.rawBody, { eventId, timestamp, signature });
  }
}
