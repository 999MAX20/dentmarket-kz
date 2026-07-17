import { Controller, Headers, Param, Post, RawBodyRequest, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { PaymentWebhooksService } from "./payment-webhooks.service";

@ApiTags("payment-webhooks")
@Controller("payments/webhooks")
export class PaymentWebhooksController {
  constructor(private readonly webhooks: PaymentWebhooksService) {}

  @Post(":providerCode")
  receive(@Param("providerCode") providerCode: string, @Req() request: RawBodyRequest<Request>, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.webhooks.receive(providerCode, request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {})), headers);
  }
}
