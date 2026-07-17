import { Body, Controller, Headers, HttpCode, Param, Post, RawBody } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IntegrationWebhooksService } from "./integration-webhooks.service";

@ApiTags("integration-webhooks")
@Controller("integrations/webhooks")
export class IntegrationWebhooksController {
  constructor(private readonly webhooks: IntegrationWebhooksService) {}

  @Post(":endpointId")
  @HttpCode(202)
  ingest(@Param("endpointId") endpointId: string, @Body() body: unknown, @RawBody() rawBody: Buffer | undefined, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.webhooks.ingest(endpointId, body, rawBody, headers);
  }
}
