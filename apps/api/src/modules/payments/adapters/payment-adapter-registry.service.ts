import { Injectable, NotFoundException } from "@nestjs/common";
import type { PaymentProvider } from "@prisma/client";
import { MockPaymentAdapter } from "./mock-payment.adapter";
import { providerCapabilities } from "./payment-adapter";
import { HttpPaymentAdapter } from "./http-payment.adapter";

@Injectable()
export class PaymentAdapterRegistry {
  constructor(private readonly mock: MockPaymentAdapter, private readonly external: HttpPaymentAdapter) {}

  resolve(provider: PaymentProvider) {
    const adapter = provider.code === this.mock.code ? this.mock : process.env.PAYMENT_PROVIDER_MODE === "external" ? this.external : null;
    if (!adapter) throw new NotFoundException(`Payment adapter ${provider.code} is not installed`);
    return {
      adapter,
      context: { providerId: provider.id, providerCode: provider.code, capabilities: providerCapabilities(provider.capabilities) },
    };
  }
}
