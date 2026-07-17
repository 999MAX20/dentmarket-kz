"use client";

import { FormEvent, useState } from "react";
import styles from "./organization-quick-create.module.css";
import { adminAuthHeaders } from "./admin-auth";

const capabilities = [
  ["BUYER", "Покупатель"],
  ["SUPPLIER", "Поставщик"],
  ["IMPORTER", "Импортёр"],
  ["LOGISTICS_PROVIDER", "Логистика"],
  ["SERVICE_PROVIDER", "Сервис"],
] as const;

export function OrganizationQuickCreate() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const selectedCapabilities = capabilities
      .map(([value]) => value)
      .filter((value) => form.getAll("capabilities").includes(value));
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api"}/organizations`,
        {
          method: "POST",
          headers: adminAuthHeaders(),
          body: JSON.stringify({
            legalName: form.get("legalName"),
            displayName: form.get("displayName"),
            bin: form.get("bin"),
            capabilities: selectedCapabilities,
          }),
        },
      );
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? "Организация с таким БИН уже существует."
            : "API отклонил данные организации.",
        );
      setStatus("success");
      setMessage("Организация создана. Audit и outbox записаны.");
      event.currentTarget.reset();
    } catch (error) {
      setStatus("error");
      const detail = error instanceof Error ? error.message : "";
      setMessage(
        detail === "Failed to fetch"
          ? "API недоступен. Запустите backend и PostgreSQL."
          : detail || "Не удалось создать организацию.",
      );
    }
  }

  return (
    <>
      <button className={styles.primaryButton} onClick={() => setOpen(true)}>
        Создать организацию
      </button>
      {open && (
        <div
          className={styles.backdrop}
          role="presentation"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setOpen(false)
          }
        >
          <section
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="organization-dialog-title"
          >
            <div className={styles.header}>
              <div>
                <h2 id="organization-dialog-title">Новая организация</h2>
                <p>Юридический профиль и функции на платформе.</p>
              </div>
              <button
                className={styles.closeButton}
                onClick={() => setOpen(false)}
                aria-label="Закрыть"
              >
                Закрыть
              </button>
            </div>
            <form className={styles.form} onSubmit={submit}>
              <label>
                Юридическое название
                <input name="legalName" required minLength={2} />
              </label>
              <label>
                Название на платформе
                <input name="displayName" required minLength={2} />
              </label>
              <label>
                БИН
                <input
                  name="bin"
                  required
                  inputMode="numeric"
                  pattern="[0-9]{12}"
                  maxLength={12}
                />
              </label>
              <fieldset>
                <legend>Возможности организации</legend>
                <div className={styles.capabilities}>
                  {capabilities.map(([value, label], index) => (
                    <label className={styles.checkbox} key={value}>
                      <input
                        type="checkbox"
                        name="capabilities"
                        value={value}
                        defaultChecked={index === 0}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              {message && (
                <div
                  className={status === "error" ? styles.error : styles.success}
                  role="status"
                >
                  {message}
                </div>
              )}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setOpen(false)}
                >
                  Отмена
                </button>
                <button
                  className={styles.primaryButton}
                  disabled={status === "saving"}
                >
                  {status === "saving" ? "Сохранение..." : "Создать"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
