"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "./page.module.css";

type Variant = {
  id: string;
  sku: string | null;
  label: string;
  attributes: Record<string, string>;
};

const FACET_ORDER = [
  "Формат продажи",
  "Система",
  "Материал",
  "Тип брекетов",
  "Пропись",
  "Паз",
  "Челюсть",
  "Позиция зуба",
  "Торк",
  "Крючок",
  "Форма выпуска",
  "Количество",
  "Объём",
  "Масса",
  "В одной единице",
  "Оттенок",
  "Вкус",
  "Соединение",
  "Комплектация",
];

const FACET_HELP: Record<string, string> = {
  "Формат продажи": "Один брекет, набор на одну челюсть или полный комплект",
  Система: "Линейка брекет-системы производителя",
  Материал: "Металлический, керамический или другой вариант",
  "Тип брекетов": "Лигатурная или самолигирующая система",
  Пропись: "Система заложенных параметров: Roth, MBT и другие",
  Паз: "Размер паза брекета, например 0.018 или 0.022",
  Челюсть: "Верхняя или нижняя челюсть",
  "Позиция зуба": "Номер конкретного зуба для одиночного брекета",
  Торк: "Вариант торка для выбранной позиции",
  Крючок: "Исполнение с крючком или без него",
  "Форма выпуска": "Что именно получите: шприц, капсулы, набор или другую форму",
  Количество: "Сколько единиц будет в упаковке",
  Объём: "Объём одной упаковки или ёмкости",
  Масса: "Вес материала в выбранной упаковке",
  "В одной единице": "Сколько материала находится в одной дозе или капсуле",
  Оттенок: "Цвет материала по шкале производителя",
  Вкус: "Вкус расходного материала",
  Соединение: "Тип крепления или подключения к оборудованию",
  Комплектация: "Что входит в выбранный набор",
};

function variantDisplayName(variant: Variant) {
  const readableParts = [
    variant.attributes["Формат продажи"],
    variant.attributes["Материал"],
    variant.attributes["Тип брекетов"],
    variant.attributes["Челюсть"],
    variant.attributes["Позиция зуба"],
    variant.attributes["Паз"],
    variant.attributes["Пропись"],
    variant.attributes["Торк"],
    variant.attributes["Крючок"],
    variant.attributes["Форма выпуска"],
    variant.attributes["Оттенок"],
    variant.attributes["Масса"],
    variant.attributes["Объём"],
    variant.attributes["Количество"],
    variant.attributes["Комплектация"],
  ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
  if (readableParts.length) return readableParts.join(" · ");
  if (variant.label && !/^((REF|SKU)\s*)?[A-Z0-9-]+$/i.test(variant.label.trim())) return variant.label;
  const code = variant.sku ?? variant.label;
  return code ? `Вариант товара · ${code}` : "Вариант товара";
}

export default function VariantPicker({
  variants,
  selectedVariantId,
  requiresPositionSkuMatrix = false,
}: {
  variants: Variant[];
  selectedVariantId: string;
  requiresPositionSkuMatrix?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selected = variants.find((variant) => variant.id === selectedVariantId);

  if (!selected) return null;

  if (variants.length <= 1) {
    return (
      <section className={styles.variantPicker} aria-label="Выбранный товар">
        <div className={styles.variantIntro}>
          <span className={styles.variantStep}>Один вариант</span>
          <strong className={styles.variantTitle}>Выбирать ничего не нужно</strong>
          <p>Цена и наличие ниже относятся именно к этой комплектации.</p>
        </div>
        {requiresPositionSkuMatrix ? (
          <p className={styles.variantNotice}>
            Нужен один брекет на замену? Он появится отдельным вариантом с
            номером зуба и точным кодом производителя. Пока в этой карточке
            подтверждён только набор.
          </p>
        ) : null}
        <div className={styles.selectedVariant}>
          <span>Товар для заказа</span>
          <strong>{variantDisplayName(selected)}</strong>
          {selected.sku ? <small>Код производителя: {selected.sku}</small> : null}
        </div>
      </section>
    );
  }

  const form = selected.attributes["Форма выпуска"];
  const scopedVariants = form
    ? variants.filter((variant) => variant.attributes["Форма выпуска"] === form)
    : variants;
  const facetGroups = FACET_ORDER.map((key) => {
    const source = key === "Форма выпуска" ? variants : scopedVariants;
    const options = [
      ...new Set(
        source
          .map((variant) => variant.attributes[key])
          .filter((value): value is string => Boolean(value)),
      ),
    ].sort((left, right) => left.localeCompare(right, "ru", { numeric: true }));
    return { key, options };
  }).filter(({ options }) => options.length > 1);

  const selectVariant = (facet: string, value: string) => {
    const candidates = variants.filter(
      (variant) => variant.attributes[facet] === value,
    );
    const ranked = candidates
      .map((variant) => ({
        variant,
        score: FACET_ORDER.reduce(
          (total, key) =>
            key !== facet &&
            selected.attributes[key] &&
            selected.attributes[key] === variant.attributes[key]
              ? total + 1
              : total,
          0,
        ),
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.variant.label.localeCompare(right.variant.label, "ru"),
      );
    const variant = ranked[0]?.variant;
    if (!variant) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("variant", variant.id);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <section className={styles.variantPicker} aria-label="Выбор варианта товара">
      <div className={styles.variantIntro}>
        <span className={styles.variantStep}>Перед сравнением цен</span>
        <strong className={styles.variantTitle}>Сначала выберите нужный вариант</strong>
        <p>Поставщики, цена и наличие будут показаны только для выбранного варианта.</p>
      </div>
      {requiresPositionSkuMatrix ? (
        <p className={styles.variantNotice}>
          Нужен один брекет на замену? Он появится отдельным вариантом с номером
          зуба и точным кодом производителя. Сейчас можно выбрать только
          подтверждённые наборы.
        </p>
      ) : null}
      {facetGroups.map(({ key, options }, index) => (
        <fieldset className={styles.variantFacet} key={key}>
          <legend><span>{index + 1}</span>{key}</legend>
          <small className={styles.variantHelp}>{FACET_HELP[key] ?? "Выберите подходящее значение"}</small>
          <div className={styles.variantOptions}>
            {options.map((option) => {
              const active = selected.attributes[key] === option;
              return (
                <button
                  aria-pressed={active}
                  className={active ? styles.variantOptionActive : undefined}
                  key={option}
                  onClick={() => selectVariant(key, option)}
                  type="button"
                >
                  {option}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
      <div className={styles.selectedVariant}>
        <span>Вы выбрали</span>
        <strong>{variantDisplayName(selected)}</strong>
        {selected.sku ? (
          <small>Код производителя: {selected.sku}</small>
        ) : null}
      </div>
    </section>
  );
}
