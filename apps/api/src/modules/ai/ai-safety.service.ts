import { Injectable } from "@nestjs/common";

const injectionPatterns = [
  /ignore (all|any|the|your) (previous|prior|system|developer) instructions?/i,
  /system prompt/i,
  /reveal (secrets?|tokens?|credentials?|api keys?)/i,
  /bypass (authorization|permissions?|tenant|policy)/i,
  /act as (an? )?(admin|operator|root)/i,
  /инструкц.{0,12}(игнор|забуд)/i,
  /(покажи|раскрой|выведи).{0,20}(секрет|токен|ключ|системн)/i,
  /(обойди|отключи).{0,20}(авторизац|права|tenant|политик)/i,
];

const secretPatterns = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*\b/gi,
  /\b(?:password|пароль|secret|секрет|token|токен)\s*[:=]\s*\S+/gi,
];

const medicalAdvicePattern = /(диагноз|назначь лечение|схема лечения|какой препарат назначить|медицинск.{0,12}рекомендац|лечить пациент)/i;
const criticalCommerceActionPattern = /(опубликуй|заблокируй|измени цену|подтверди заказ|проведи оплат|верни деньги|одобри комплаенс)/i;

@Injectable()
export class AiSafetyService {
  inspect(content: string) {
    const reasons = injectionPatterns.filter((pattern) => pattern.test(content)).map((pattern) => pattern.source);
    return { allowed: reasons.length === 0, reasons, containsPossibleSecret: secretPatterns.some((pattern) => { pattern.lastIndex = 0; return pattern.test(content); }), medicalAdviceRequested: medicalAdvicePattern.test(content), criticalCommerceActionRequested: criticalCommerceActionPattern.test(content) };
  }

  redact(content: string) {
    return secretPatterns.reduce((value, pattern) => { pattern.lastIndex = 0; return value.replace(pattern, "[REDACTED]"); }, content);
  }
}
