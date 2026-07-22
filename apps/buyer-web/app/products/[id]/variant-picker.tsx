"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "./page.module.css";

type Variant = {
  id: string;
  sku: string | null;
  label: string;
};

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

  return (
    <div className={styles.variantPicker}>
      <label htmlFor="product-variant">Выберите комплектацию</label>
      <select
        id="product-variant"
        value={selectedVariantId}
        onChange={(event) => {
          const next = new URLSearchParams(searchParams.toString());
          next.set("variant", event.target.value);
          router.replace(`${pathname}?${next.toString()}`, { scroll: false });
        }}
      >
        {variants.map((variant) => (
          <option key={variant.id} value={variant.id}>
            {variant.label}
          </option>
        ))}
      </select>
      {selected?.sku ? (
        <span>
          Выбран этот вариант · артикул {selected.sku}
        </span>
      ) : null}
    </div>
  );
}
