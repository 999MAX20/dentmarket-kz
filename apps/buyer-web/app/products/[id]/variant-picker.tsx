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

function variantDisplayName(variant: Variant) {
  const readableParts = [
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
}: {
  variants: Variant[];
  selectedVariantId: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selected = variants.find((variant) => variant.id === selectedVariantId);

  if (variants.length <= 1) return null;

  if (!selected) return null;

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
    <div className={styles.variantPicker}>
      <strong className={styles.variantTitle}>Выберите вариант товара</strong>
      {facetGroups.map(({ key, options }) => (
        <fieldset className={styles.variantFacet} key={key}>
          <legend>{key}</legend>
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
        <span>Выбрано</span>
        <strong>{variantDisplayName(selected)}</strong>
        {selected.sku ? (
          <small>Артикул производителя: {selected.sku}</small>
        ) : null}
      </div>
    </div>
  );
}
