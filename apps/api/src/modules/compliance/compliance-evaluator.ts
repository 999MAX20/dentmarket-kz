export type ComplianceRuleInput = {
  id: string;
  code: string;
  version: number;
  riskLevel: "GREEN" | "YELLOW" | "ORANGE" | "RED";
  decision: "ALLOWED" | "ALLOWED_WITH_DISCLOSURE" | "MANUAL_REVIEW" | "BLOCKED";
  priority: number;
  conditions: Record<string, unknown>;
  requiredCredentialTypes: string[];
  disclosureText?: string | null;
};

export type ComplianceFacts = {
  at: Date;
  sellerCapabilities: string[];
  buyerCapabilities: string[];
  verifiedCredentialTypes: string[];
  warehouseCityId?: string | null;
  offerSourceType?: string | null;
  officialDistributor?: boolean;
  lot?: { status: string; expirationDate?: Date | null; registrationCertificate?: string | null; serialNumber?: string | null; originSource?: string | null } | null;
};

const decisionWeight = { ALLOWED: 0, ALLOWED_WITH_DISCLOSURE: 1, MANUAL_REVIEW: 2, BLOCKED: 3 } as const;
const riskWeight = { GREEN: 0, YELLOW: 1, ORANGE: 2, RED: 3 } as const;

function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function record(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

export function ruleApplies(rule: ComplianceRuleInput, facts: ComplianceFacts) {
  const when = record(rule.conditions.when);
  const sellerAny = strings(when.sellerCapabilitiesAny);
  if (sellerAny.length > 0 && !sellerAny.some((capability) => facts.sellerCapabilities.includes(capability))) return false;
  const buyerAny = strings(when.buyerCapabilitiesAny);
  if (buyerAny.length > 0 && !buyerAny.some((capability) => facts.buyerCapabilities.includes(capability))) return false;
  const cities = strings(when.warehouseCityIds);
  if (cities.length > 0 && (!facts.warehouseCityId || !cities.includes(facts.warehouseCityId))) return false;
  const sources = strings(when.offerSourceTypes);
  if (sources.length > 0 && (!facts.offerSourceType || !sources.includes(facts.offerSourceType))) return false;
  const origins = strings(when.lotOriginSources);
  if (origins.length > 0 && (!facts.lot?.originSource || !origins.includes(facts.lot.originSource))) return false;
  return true;
}

export function evaluateCompliance(rules: ComplianceRuleInput[], facts: ComplianceFacts) {
  const applicable = rules.filter((rule) => ruleApplies(rule, facts)).sort((left, right) => left.priority - right.priority || right.version - left.version);
  let decision: keyof typeof decisionWeight = "ALLOWED";
  let riskLevel: keyof typeof riskWeight = "GREEN";
  const reasons: string[] = [];
  const missingCredentials = new Set<string>();

  if (facts.lot && ["BLOCKED", "RECALLED", "EXPIRED"].includes(facts.lot.status)) {
    decision = "BLOCKED";
    riskLevel = "RED";
    reasons.push(`Партия имеет запрещающий статус ${facts.lot.status}`);
  }
  if (facts.lot?.expirationDate && facts.lot.expirationDate <= facts.at) {
    decision = "BLOCKED";
    riskLevel = "RED";
    reasons.push("Срок годности партии истёк");
  }

  for (const rule of applicable) {
    if (decisionWeight[rule.decision] > decisionWeight[decision]) decision = rule.decision;
    if (riskWeight[rule.riskLevel] > riskWeight[riskLevel]) riskLevel = rule.riskLevel;
    reasons.push(`Применено правило ${rule.code} v${rule.version}`);
    for (const type of rule.requiredCredentialTypes) if (!facts.verifiedCredentialTypes.includes(type)) missingCredentials.add(type);
    const requirements = record(rule.conditions.requirements);
    const credentialGroups = Array.isArray(requirements.requiredCredentialAnyOf) ? requirements.requiredCredentialAnyOf : [];
    for (const group of credentialGroups) {
      const alternatives = strings(group);
      if (alternatives.length > 0 && !alternatives.some((type) => facts.verifiedCredentialTypes.includes(type))) {
        reasons.push(`Требуется один из разрешительных документов: ${alternatives.join(" или ")}`);
      }
    }
    if (requirements.lotRequired === true && !facts.lot) reasons.push("Для товара требуется назначенная партия");
    if (requirements.registrationCertificateRequired === true && !facts.lot?.registrationCertificate) reasons.push("Отсутствует регистрационное удостоверение партии");
    if (requirements.serialNumberRequired === true && !facts.lot?.serialNumber) reasons.push("Отсутствует серийный номер");
    if (requirements.verifiedOriginRequired === true && !facts.lot?.originSource) reasons.push("Не подтверждён источник происхождения");
    if (requirements.officialDistributorRequired === true && !facts.officialDistributor) reasons.push("Не подтверждён статус официального дистрибьютора");
    if (typeof requirements.minimumRemainingShelfLifeDays === "number") {
      if (!facts.lot?.expirationDate) reasons.push("Не указан срок годности партии");
      else if (facts.lot.expirationDate.getTime() - facts.at.getTime() < requirements.minimumRemainingShelfLifeDays * 86_400_000) reasons.push(`Остаточный срок годности меньше ${requirements.minimumRemainingShelfLifeDays} дней`);
    }
    if (rule.disclosureText) reasons.push(rule.disclosureText);
  }

  if (missingCredentials.size > 0) {
    if (decisionWeight[decision] < decisionWeight.MANUAL_REVIEW) decision = "MANUAL_REVIEW";
    if (riskWeight[riskLevel] < riskWeight.ORANGE) riskLevel = "ORANGE";
    reasons.push(`Не хватает подтверждённых документов: ${[...missingCredentials].join(", ")}`);
  }
  const unmetRequirements = reasons.some((reason) => /требуется|Отсутствует|Не подтверждён|Не указан|меньше/.test(reason));
  if (unmetRequirements && decisionWeight[decision] < decisionWeight.MANUAL_REVIEW) decision = "MANUAL_REVIEW";
  if (unmetRequirements && riskWeight[riskLevel] < riskWeight.ORANGE) riskLevel = "ORANGE";
  const status = decision === "BLOCKED" ? "BLOCKED" : decision === "MANUAL_REVIEW" ? "REVIEW_REQUIRED" : "PASSED";
  return { decision, riskLevel, status, reasons: reasons.length > 0 ? reasons : ["Активные ограничивающие правила не применились"], missingCredentials: [...missingCredentials], matchedRules: applicable } as const;
}
