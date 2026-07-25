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

type CuratedCopy = {
  title: string;
  summary: string;
  purpose?: string;
  productType?: string;
  compatibility?: string;
};

const CURATED_PRODUCT_COPY: Record<string, CuratedCopy> = {
  "atacamit-wurzelfüllzement": {
    title: "Корневой пломбировочный цемент Atacamit",
    summary:
      "Цемент для постоянного пломбирования корневых каналов, в том числе после депофореза.",
    purpose: "Для постоянного пломбирования корневых каналов",
    productType: "Эндодонтический цемент",
  },
  "calciumhydroxid-hochdispers 15 g paste im fläschen": {
    title: "Паста гидроксида кальция, флакон 15 г",
    summary:
      "Высокодисперсная паста гидроксида кальция для эндодонтического применения.",
    purpose: "Для обработки корневых каналов и покрытия пульпы",
    productType: "Паста гидроксида кальция",
  },
  "calciumhydroxid-hochdispers dosierspritze mit 1,7 g paste und 5 kanülen": {
    title: "Паста гидроксида кальция, шприц 1,7 г и 5 канюль",
    summary:
      "Высокодисперсная паста гидроксида кальция в дозирующем шприце с пятью канюлями.",
    purpose: "Для обработки корневых каналов и покрытия пульпы",
    productType: "Паста гидроксида кальция",
  },
  "cupral® 15 g paste im fläschchen": {
    title: "Паста Cupral, флакон 15 г",
    summary:
      "Медикаментозная паста Cupral для эндодонтического лечения и депофореза.",
    purpose: "Для обработки корневых каналов",
    productType: "Эндодонтическая паста",
  },
  "cupral® 5 g paste im fläschchen": {
    title: "Паста Cupral, флакон 5 г",
    summary:
      "Медикаментозная паста Cupral для эндодонтического лечения и депофореза.",
    purpose: "Для обработки корневых каналов",
    productType: "Эндодонтическая паста",
  },
  "cupral® dosierspritze mit 1,7 g paste und 5 kanülen": {
    title: "Паста Cupral, шприц 1,7 г и 5 канюль",
    summary:
      "Медикаментозная паста Cupral в дозирующем шприце с пятью канюлями.",
    purpose: "Для обработки корневых каналов",
    productType: "Эндодонтическая паста",
  },
  "cupral® liquid": {
    title: "Жидкость Cupral для промывания корневых каналов",
    summary:
      "Жидкость Cupral для промывания каналов до и после инструментальной обработки.",
    purpose: "Для промывания корневых каналов",
    productType: "Эндодонтическая жидкость",
  },
  "dentin-versiegelungsliquid großsparpackung 2 x 20 ml": {
    title: "Жидкость для герметизации дентина, 2 × 20 мл",
    summary:
      "Средство для снижения чувствительности дентина и профилактики вторичного кариеса.",
    purpose: "Для герметизации дентина",
    productType: "Дентин-герметизирующая жидкость",
  },
  "dentin-versiegelungsliquid probierpackung 2 x 5 ml": {
    title: "Жидкость для герметизации дентина, 2 × 5 мл",
    summary:
      "Средство для снижения чувствительности дентина и профилактики вторичного кариеса.",
    purpose: "Для герметизации дентина",
    productType: "Дентин-герметизирующая жидкость",
  },
  "ersatzkanülen 100 stück": {
    title: "Сменные канюли для шприцев Cupral, 100 шт.",
    summary:
      "Канюли для дозирующих шприцев Cupral и высокодисперсного гидроксида кальция.",
    productType: "Сменные канюли",
  },
  "galvanisches stiftelement": {
    title: "Гальванический штифтовой элемент для депофореза",
    summary:
      "Штифтовой элемент для длительного эндодонтического лечения методом депофореза.",
    purpose: "Для длительного лечения методом депофореза",
    productType: "Гальванический штифтовой элемент",
  },
  "hämostatikum al-cu": {
    title: "Гемостатик Al-Cu",
    summary:
      "Средство для остановки небольших кровотечений слизистой полости рта и пульпы.",
    purpose: "Для остановки небольших кровотечений",
    productType: "Гемостатик",
  },
  handstück: {
    title: "Наконечник для аппаратов депофореза Humanchemie",
    summary:
      "Рабочий наконечник для аппаратов депофореза Humanchemie Magis и Original II.",
    productType: "Наконечник",
    compatibility: "Humanchemie Magis и Original II",
  },
  "interims-kronenzement": {
    title: "Временный цемент для фиксации коронок",
    summary:
      "Цемент для временной фиксации коронок и небольших мостовидных протезов.",
    purpose: "Для временной фиксации коронок и мостов",
    productType: "Временный цемент",
  },
  "kavitäten-waschliquid": {
    title: "Жидкость для очистки полостей и культей",
    summary:
      "Жидкость для очистки, обезжиривания и высушивания полостей и культей зубов.",
    purpose: "Для подготовки полостей и культей",
    productType: "Очищающая жидкость",
  },
  "kavitätenspalt-dichtungsmixtur": {
    title: "Смесь для герметизации краевых щелей пломбы",
    summary:
      "Средство для герметизации краевых щелей и профилактики вторичного кариеса.",
    purpose: "Для герметизации краёв реставрации",
    productType: "Герметизирующая смесь",
  },
  "magis®-apex-kabel-set": {
    title: "Комплект кабелей для апекслокатора MAGIS",
    summary:
      "Комплект кабелей для функции определения рабочей длины аппарата Humanchemie Magis.",
    productType: "Комплект кабелей",
    compatibility: "Humanchemie Magis",
  },
  "nachtouchierlösung 20 ml": {
    title: "Жидкость для второго этапа глубокого фторирования, 20 мл",
    summary:
      "Жидкость для второго этапа процедур с препаратами Tiefenfluorid и Dentin-Versiegelungsliquid.",
    purpose: "Для второго этапа глубокого фторирования",
    productType: "Стоматологическая жидкость",
  },
  "nachtouchierlösung balance 20 ml": {
    title: "Жидкость Tiefenfluorid balance, второй этап, 20 мл",
    summary:
      "Жидкость для второго этапа процедуры глубокого фторирования Tiefenfluorid balance.",
    purpose: "Для второго этапа глубокого фторирования",
    productType: "Стоматологическая жидкость",
  },
  "tiefenfluorid balance großsparpackung 2 x 20 ml": {
    title: "Препарат Tiefenfluorid balance, 2 × 20 мл",
    summary:
      "Комплект для глубокого фторирования, снижения чувствительности и профилактики кариеса.",
    purpose: "Для глубокого фторирования",
    productType: "Фторирующая система",
  },
  "tiefenfluorid balance probierpackung 2 x 5 ml": {
    title: "Препарат Tiefenfluorid balance, 2 × 5 мл",
    summary:
      "Пробный комплект для глубокого фторирования, снижения чувствительности и профилактики кариеса.",
    purpose: "Для глубокого фторирования",
    productType: "Фторирующая система",
  },
  "tiefenfluorid großsparpackung 2 x 20 ml": {
    title: "Препарат Tiefenfluorid, 2 × 20 мл",
    summary:
      "Комплект для глубокого фторирования, герметизации фиссур и профилактики кариеса.",
    purpose: "Для глубокого фторирования",
    productType: "Фторирующая система",
  },
  "tiefenfluorid junior großsparpackung 2 x 20 ml": {
    title: "Препарат Tiefenfluorid junior, 2 × 20 мл",
    summary:
      "Комплект для глубокого фторирования и профилактики кариеса у детей.",
    purpose: "Для глубокого фторирования у детей",
    productType: "Фторирующая система",
  },
  "tiefenfluorid junior probierpackung 2 x 5 ml": {
    title: "Препарат Tiefenfluorid junior, 2 × 5 мл",
    summary:
      "Пробный комплект для глубокого фторирования и профилактики кариеса у детей.",
    purpose: "Для глубокого фторирования у детей",
    productType: "Фторирующая система",
  },
  "tiefenfluorid probierpackung 2 x 5 ml": {
    title: "Препарат Tiefenfluorid, 2 × 5 мл",
    summary:
      "Пробный комплект для глубокого фторирования, герметизации фиссур и профилактики кариеса.",
    purpose: "Для глубокого фторирования",
    productType: "Фторирующая система",
  },
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
  const curated = CURATED_PRODUCT_COPY[originalName.toLocaleLowerCase("de")];
  const isCheekClampElectrode =
    /wangen[\s()-]*klemmelektrode/iu.test(combinedSource);
  const isCheekHookElectrode =
    /wangen[\s()-]*hakenelektrode/iu.test(combinedSource);
  const isRootCanalNeedleElectrode =
    /wurzelkanal[\s()-]*nadelelektrode/iu.test(combinedSource);
  const isReciprocatingEndoHead =
    /(?:0[.,]4\s*mm.*up\s*&?\s*down.*endo\s*head|endo\s*head.*0[.,]4\s*mm)/iu.test(
      combinedSource,
    );

  const title = curated?.title ?? (isCheekClampElectrode
    ? "Щёчный электрод-зажим для аппаратов депофореза"
    : isCheekHookElectrode
      ? "Щёчный электрод-крючок для аппаратов депофореза"
      : isRootCanalNeedleElectrode
        ? "Игольчатый электрод для корневого канала"
        : isReciprocatingEndoHead
          ? "Эндодонтическая головка с ходом 0,4 мм"
          : hasCyrillic(originalName)
            ? originalName
            : `${product.category || "Стоматологический товар"}: ${originalName}`);

  const compatibility = curated?.compatibility ??
    readAttribute(attributes, ["Совместимость", "Совместимые модели"]) ??
    (isCheekClampElectrode ||
    isCheekHookElectrode ||
    isRootCanalNeedleElectrode
      ? "Humanchemie Magis и Original II"
      : null);
  const purpose = curated?.purpose ??
    readAttribute(attributes, ["Назначение", "Применение"]) ??
    (isCheekClampElectrode ||
    isCheekHookElectrode ||
    isRootCanalNeedleElectrode
      ? "Для проведения депофореза в эндодонтии"
      : isReciprocatingEndoHead
        ? "Для механической обработки корневых каналов"
      : null);
  const productType = curated?.productType ??
    readAttribute(attributes, ["Тип товара", "Тип", "Форма выпуска"]) ??
    (isCheekClampElectrode
      ? "Щёчный электрод-зажим"
      : isCheekHookElectrode
        ? "Щёчный электрод-крючок"
        : isRootCanalNeedleElectrode
          ? "Игольчатый электрод"
          : isReciprocatingEndoHead
            ? "Эндодонтическая головка"
            : null);
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

  const summary = curated?.summary ?? (isCheekClampElectrode
    ? "Зажим фиксируется на щеке пациента и используется как электрод при работе с аппаратами депофореза."
    : isCheekHookElectrode
      ? "Электрод-крючок фиксируется на щеке пациента и используется с аппаратами депофореза."
      : isRootCanalNeedleElectrode
        ? "Игольчатый электрод устанавливается в корневой канал при проведении депофореза."
        : isReciprocatingEndoHead
          ? "Угловая головка для эндодонтической обработки с возвратно-поступательным ходом 0,4 мм."
          : hasCyrillic(originalDescription)
            ? originalDescription
            : `Товар из категории «${
                product.category || "Стоматологические товары"
              }». Проверьте назначение и совместимость перед заказом.`);

  return {
    title,
    summary,
    originalName:
      title === originalName ||
      (!isCheekClampElectrode &&
        !isCheekHookElectrode &&
        !isRootCanalNeedleElectrode &&
        !isReciprocatingEndoHead &&
        !curated &&
        title.endsWith(originalName))
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
