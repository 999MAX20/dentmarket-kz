type ProductLike = {
  name: string;
  description?: string | null;
  brand?: string | null;
  manufacturer?: string | null;
  category?: string | null;
};

type Fact = {
  label: string;
  value: string;
};

export type ProductPresentation = {
  title: string;
  summary: string;
  originalName: string | null;
  originalDescription: string | null;
  facts: Fact[];
};

const cleanText = (value: string | null | undefined) =>
  String(value ?? "")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&[a-z]+;/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();

const hasCyrillic = (value: string) => /[А-ЯЁа-яё]/u.test(value);

function readAttribute(
  attributes: ReadonlyArray<readonly [string, string]>,
  names: string[],
) {
  const match = attributes.find(([key]) =>
    names.some((name) => key.toLocaleLowerCase("ru") === name.toLocaleLowerCase("ru")),
  );
  return match?.[1]?.trim() || null;
}

function uniqueFacts(facts: Array<Fact | null>) {
  const labels = new Set<string>();
  return facts.filter((fact): fact is Fact => {
    if (!fact?.value || labels.has(fact.label)) return false;
    labels.add(fact.label);
    return true;
  });
}

export function createProductPresentation(
  product: ProductLike,
  attributes: ReadonlyArray<readonly [string, string]>,
  selectedSku?: string | null,
): ProductPresentation {
  const originalName = cleanText(product.name);
  const originalDescription = cleanText(product.description);
  const combinedSource = `${originalName} ${originalDescription}`;
  const isCheekClampElectrode =
    /wangen[\s()-]*klemmelektrode/iu.test(combinedSource);

  const title = isCheekClampElectrode
    ? "Щёчный электрод-зажим для аппаратов депофореза"
    : hasCyrillic(originalName)
      ? originalName
      : `${product.category || "Стоматологический товар"}: ${originalName}`;

  const compatibility =
    readAttribute(attributes, ["Совместимость", "Совместимые модели"]) ??
    (isCheekClampElectrode ? "Humanchemie Magis и Original II" : null);
  const purpose =
    readAttribute(attributes, ["Назначение", "Применение"]) ??
    (isCheekClampElectrode
      ? "Для проведения депофореза в эндодонтии"
      : null);
  const productType =
    readAttribute(attributes, ["Тип товара", "Тип", "Форма выпуска"]) ??
    (isCheekClampElectrode ? "Щёчный электрод-зажим" : null);
  const packageValue = readAttribute(attributes, [
    "Комплектация",
    "Количество",
    "Фасовка",
    "Объём",
    "Масса",
  ]);
  const sku =
    selectedSku ??
    readAttribute(attributes, [
      "Артикул производителя",
      "Артикулы производителя",
      "REF",
      "SKU",
    ]);

  const summary = isCheekClampElectrode
    ? "Зажим фиксируется на щеке пациента и используется как электрод при работе с аппаратами депофореза."
    : hasCyrillic(originalDescription)
      ? originalDescription
      : `Товар из категории «${
          product.category || "Стоматологические товары"
        }». Проверьте назначение и совместимость перед заказом.`;

  return {
    title,
    summary,
    originalName:
      title === originalName ||
      (!isCheekClampElectrode && title.endsWith(originalName))
        ? null
        : originalName,
    originalDescription:
      originalDescription && originalDescription !== summary
        ? originalDescription
        : null,
    facts: uniqueFacts([
      purpose ? { label: "Для чего", value: purpose } : null,
      compatibility
        ? { label: "Совместимость", value: compatibility }
        : null,
      productType ? { label: "Тип товара", value: productType } : null,
      packageValue ? { label: "В упаковке", value: packageValue } : null,
      sku ? { label: "Код производителя", value: sku } : null,
    ]),
  };
}
