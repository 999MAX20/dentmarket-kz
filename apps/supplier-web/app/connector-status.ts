export function connectorStatusLabel(status: string) {
  const labels: Record<string, string> = {
    READY: "Готов",
    PARTIAL: "Требует настройки",
    CONNECTOR_NEEDED: "Нужно подключение",
    BLOCKED: "Заблокирован",
  };
  return labels[status] ?? "Неизвестный статус";
}
