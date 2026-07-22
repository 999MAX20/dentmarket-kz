const statusLabels: Record<string, string> = {
  ACTIVE: "Активно",
  ARCHIVED: "В архиве",
  AUTHORIZED: "Авторизовано",
  AWAITING_CONFIRMATION: "Ждёт подтверждения",
  BLOCKED: "Заблокировано",
  CALCULATED: "Рассчитано",
  CANCELLED: "Отменено",
  CAPTURED: "Оплачено",
  CLOSED: "Закрыто",
  COMPLETED: "Завершено",
  CONFIRMED: "Подтверждено",
  DRAFT: "Черновик",
  FAILED: "Ошибка",
  FRESH: "Актуально",
  HIDDEN: "Скрыто",
  IN_PROGRESS: "В работе",
  MAPPED: "Сопоставлено",
  MATCHED: "Сопоставлено",
  OPEN: "Открыто",
  PARTIAL: "Частично готово",
  PASSED: "Проверка пройдена",
  PAUSED: "Приостановлено",
  PENDING: "Ожидает",
  PUBLISHED: "Опубликовано",
  READY: "Готово",
  REJECTED: "Отклонено",
  RESOLVED: "Решено",
  REVIEW_REQUIRED: "Нужна проверка",
  RUNNING: "Выполняется",
  STALE: "Устарело",
  UNDER_REVIEW: "На проверке",
  VERIFIED: "Проверено",
};

export function formatAdminStatus(value: string | null | undefined) {
  if (!value) return "Нет статуса";
  return statusLabels[value] ?? "Требуется уточнение";
}
