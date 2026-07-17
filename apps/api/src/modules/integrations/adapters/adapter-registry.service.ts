import { BadRequestException, Injectable } from "@nestjs/common";
import type { IntegrationConnection } from "@prisma/client";
import { IntegrationCryptoService } from "../integration-crypto.service";
import { asRecord, type IntegrationAdapterContext } from "./integration-adapter";
import { MockIntegrationAdapter } from "./mock.adapter";
import { MoySkladIntegrationAdapter } from "./moysklad.adapter";
import { CustomApiIntegrationAdapter } from "./custom-api.adapter";

@Injectable()
export class IntegrationAdapterRegistry {
  constructor(
    private readonly crypto: IntegrationCryptoService,
    private readonly mock: MockIntegrationAdapter,
    private readonly moysklad: MoySkladIntegrationAdapter,
    private readonly customApi: CustomApiIntegrationAdapter,
  ) {}

  resolve(connection: IntegrationConnection) {
    const adapter = connection.provider === "MOYSKLAD" ? this.moysklad : connection.provider === "CUSTOM_API" ? this.customApi : connection.provider === "MOCK" ? this.mock : null;
    if (!adapter) throw new BadRequestException(`${connection.provider} is executed by an external connector agent`);
    const context: IntegrationAdapterContext = {
      connectionId: connection.id,
      credentials: connection.encryptedCredentials ? this.crypto.decrypt(connection.encryptedCredentials) : {},
      configuration: { ...asRecord(connection.configuration), ...(connection.encryptedConfiguration ? asRecord(this.crypto.decryptJson(connection.encryptedConfiguration)) : {}) },
    };
    return { adapter, context };
  }
}
