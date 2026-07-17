import { Injectable, NotFoundException } from "@nestjs/common";
import type { UpdateConnectorReadinessInput } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";

type ActorContext = { actorId: string; organizationId: string };

const directions = (overrides: Record<string, string> = {}) => ({
  CATALOG: "NONE", PRICE: "NONE", STOCK: "NONE", LOT: "NONE",
  ORDER: "NONE", RESERVATION: "NONE", SHIPMENT: "NONE", DOCUMENT: "NONE",
  ...overrides,
});

const defaults = [
  {
    providerCode: "MANUAL", displayName: "Ручное управление", readinessStatus: "READY", goLiveStatus: "INTERNAL_READY", environment: "LOCAL",
    directions: directions({ CATALOG: "WRITE", PRICE: "WRITE", STOCK: "WRITE", LOT: "WRITE", ORDER: "READ_WRITE", RESERVATION: "READ_WRITE", SHIPMENT: "WRITE", DOCUMENT: "WRITE" }),
    supportsRead: true, supportsWrite: true, credentialsRequired: false, externalConnectorRequired: false,
    supportedVersions: ["web-current"], limitations: ["Нужны подтверждения свежести цены и остатка", "Пилот на реальном поставщике ещё не зафиксирован"],
    evidence: ["Ручные офферы, остатки и подтверждение заказа реализованы"], runbookPath: "docs/runbooks/manual-supplier.md", owner: "Supplier Operations",
  },
  {
    providerCode: "EXCEL_CSV", displayName: "Excel / CSV", readinessStatus: "PARTIAL", goLiveStatus: "INTERNAL_READY", environment: "LOCAL",
    directions: directions({ CATALOG: "WRITE", PRICE: "WRITE", STOCK: "WRITE", LOT: "WRITE" }), supportsRead: false, supportsWrite: true,
    credentialsRequired: false, externalConnectorRequired: false, supportedVersions: ["xlsx", "csv", "tsv"],
    limitations: ["Не пройден контрольный импорт 1000+ строк", "Режимы replace/merge/partial требуют финальной UX-сертификации"],
    evidence: ["Импорт, preview и pipeline заданий реализованы"], runbookPath: "docs/runbooks/file-import.md", owner: "Catalog Operations",
  },
  {
    providerCode: "MOYSKLAD", displayName: "МойСклад", readinessStatus: "PARTIAL", goLiveStatus: "CONNECTOR_NEEDED", environment: "SANDBOX",
    directions: directions({ CATALOG: "READ", PRICE: "READ", STOCK: "READ", ORDER: "WRITE", RESERVATION: "READ_WRITE" }), supportsRead: true, supportsWrite: true,
    credentialsRequired: true, externalConnectorRequired: false, supportedVersions: ["JSON API 1.2"],
    limitations: ["Нет tenant credentials для реального сквозного прогона", "Webhook replay и shipment требуют внешней проверки"],
    evidence: ["Адаптер, signed webhook, jobs, retry и reconciliation реализованы"], runbookPath: "docs/runbooks/moysklad.md", owner: "Integration Operations",
  },
  {
    providerCode: "ONE_C", displayName: "1С", readinessStatus: "PARTIAL", goLiveStatus: "CONNECTOR_NEEDED", environment: "LOCAL",
    directions: directions({ CATALOG: "READ", PRICE: "READ", STOCK: "READ", LOT: "READ", ORDER: "WRITE", RESERVATION: "READ_WRITE", SHIPMENT: "READ" }), supportsRead: true, supportsWrite: true,
    credentialsRequired: true, externalConnectorRequired: true, supportedVersions: ["Agent protocol 0.1"],
    limitations: ["Нет распространяемого подписанного installer/binary", "Нет smoke-теста на реальной базе 1С", "Auto-update и restore drill не подтверждены"],
    evidence: ["Enrollment, heartbeat, job lease, retry и offline state реализованы на сервере"], runbookPath: "docs/runbooks/one-c-agent.md", owner: "Integration Operations",
  },
  {
    providerCode: "CUSTOM_API", displayName: "Пользовательский API", readinessStatus: "PARTIAL", goLiveStatus: "CONNECTOR_NEEDED", environment: "LOCAL",
    directions: directions({ CATALOG: "READ", PRICE: "READ", STOCK: "READ", ORDER: "WRITE", RESERVATION: "READ_WRITE", SHIPMENT: "READ_WRITE", DOCUMENT: "READ_WRITE" }), supportsRead: true, supportsWrite: true,
    credentialsRequired: true, externalConnectorRequired: true, supportedVersions: ["Contract per tenant"],
    limitations: ["Требуется mapping и smoke-тест для каждого tenant", "Нет реального внешнего endpoint в тестовом контуре"],
    evidence: ["Generic HTTPS adapter, normalization, retries, idempotency and connection registry реализованы"], runbookPath: "docs/runbooks/external-adapters.md", owner: "Integration Operations",
  },
] as const;

@Injectable()
export class ConnectorReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureDefaults() {
    for (const item of defaults) {
      await this.prisma.connectorReadiness.upsert({
        where: { providerCode: item.providerCode }, update: {},
        create: { ...item, directions: item.directions as Prisma.InputJsonValue, supportedVersions: [...item.supportedVersions], limitations: [...item.limitations], evidence: [...item.evidence] },
      });
    }
  }

  async list() {
    await this.ensureDefaults();
    const entries = await this.prisma.connectorReadiness.findMany({ orderBy: { providerCode: "asc" } });
    return {
      entries,
      summary: {
        total: entries.length,
        ready: entries.filter((entry) => entry.readinessStatus === "READY").length,
        externalDependency: entries.filter((entry) => entry.goLiveStatus === "CONNECTOR_NEEDED").length,
        liveVerified: entries.filter((entry) => entry.goLiveStatus === "LIVE_VERIFIED").length,
      },
      rule: "INTERNAL_READY is not production readiness; only LIVE_VERIFIED means a real external contour has passed end-to-end verification.",
    };
  }

  async update(providerCode: string, input: UpdateConnectorReadinessInput, context: ActorContext) {
    await this.ensureDefaults();
    const existing = await this.prisma.connectorReadiness.findUnique({ where: { providerCode } });
    if (!existing) throw new NotFoundException("Connector readiness entry not found");
    const data = {
      ...input,
      directions: input.directions as Prisma.InputJsonValue | undefined,
      supportedVersions: input.supportedVersions as Prisma.InputJsonValue | undefined,
      limitations: input.limitations as Prisma.InputJsonValue | undefined,
      evidence: input.evidence as Prisma.InputJsonValue | undefined,
      lastVerifiedAt: input.lastVerifiedAt === undefined ? undefined : input.lastVerifiedAt === null ? null : new Date(input.lastVerifiedAt),
    };
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.connectorReadiness.update({ where: { providerCode }, data });
      await tx.auditLog.create({ data: { actorId: context.actorId, organizationId: context.organizationId, action: "integration.readiness.updated", entityType: "ConnectorReadiness", entityId: updated.id, before: existing, after: updated } });
      return updated;
    });
  }
}
