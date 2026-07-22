const clean = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const displayNumber = (value) => String(value).replace(".", ",");

const unique = (values) => [...new Set(values.filter(Boolean))];

const FORM_PATTERNS = [
  [/набор/iu, "Набор"],
  [/quickmix/iu, "Шприц QuickMix"],
  [/одноразов(?:ые|ых) дозы|l-pop/iu, "Одноразовые дозы"],
  [/singledose|унидоз/iu, "Унидозы"],
  [/капсул/iu, "Капсулы"],
  [/шприц/iu, "Шприц"],
  [/флакон/iu, "Флакон"],
  [/тюбик/iu, "Тюбик"],
  [/картридж/iu, "Картридж"],
  [/насадк/iu, "Насадки"],
  [/стоматологическая установка/iu, "Стоматологическая установка"],
];

const FLAVORS = [
  "дыня",
  "карамель",
  "вишня",
  "мята",
  "кола-лайм",
  "пина-колада",
  "жевательная резинка",
];

export function extractVariantAttributes(label) {
  const value = clean(label);
  const attributes = {};
  if (!value) return attributes;

  const form = FORM_PATTERNS.find(([pattern]) => pattern.test(value));
  if (form) attributes["Форма выпуска"] = form[1];

  const countedDose = value.match(
    /(\d+)\s*(?:капсул[а-я]*|унидоз[а-я]*|доз[а-я]*|шприц[а-я]*|флакон[а-я]*|тюбик[а-я]*|картридж[а-я]*)?\s*[×xх]\s*(\d+(?:[.,]\d+)?)\s*(мл|г)(?![а-яa-z])/iu,
  );
  if (countedDose) {
    attributes["Количество"] = `${countedDose[1]} шт.`;
    attributes["В одной единице"] =
      `${displayNumber(countedDose[2])} ${countedDose[3].toLocaleLowerCase("ru")}`;
  } else {
    const count = value.match(
      /\b(\d+)\s*(?:шт\.?|капсул[а-я]*|унидоз[а-я]*|доз[а-я]*)(?![а-яa-z])/iu,
    );
    if (count) attributes["Количество"] = `${count[1]} шт.`;
  }

  const measurements = [
    ...value.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(мл|г|л)(?![а-яa-z])/giu),
  ].map((match) => ({
    amount: displayNumber(match[1]),
    unit: match[2].toLocaleLowerCase("ru"),
  }));
  if (!countedDose && measurements.length > 0) {
    const measurement = measurements[0];
    attributes[measurement.unit === "г" ? "Масса" : "Объём"] =
      `${measurement.amount} ${measurement.unit}`;
    if (form && !attributes["Количество"]) attributes["Количество"] = "1 шт.";
  }

  const shadeSource = value
    .replace(/[Аа](?=\d)/gu, "A")
    .replace(/[Вв](?=\d)/gu, "B")
    .replace(/[Сс](?=\d)/gu, "C")
    .replace(/[Оо](?=[АаA]\d)/gu, "O");
  const shadeTokens = unique(
    [
      ...shadeSource.matchAll(
        /\b(?:A[1-4](?:[.,]5)?O?|B[1-4]|C[1-4]|D[2-4]|OA[1-4](?:[.,]5)?|AO\d|AE|JE|BW|BOW|TR|WO|PO|GA\d(?:[.,]\d+)?|BL|CL|CO|OB|OD|OL|OM)\b/giu,
      ),
    ].map((match) => match[0].toLocaleUpperCase("en").replace(",", ".")),
  );
  const namedShade = value.match(
    /(Bleach (?:Light|XL)|белый непрозрачный|белый опаковый|универсальный|прозрачный|режущий край)/iu,
  )?.[1];
  if (shadeTokens.length > 0 || namedShade)
    attributes["Оттенок"] = unique([
      ...shadeTokens,
      namedShade ? clean(namedShade) : "",
    ]).join(" / ");

  const flavor = FLAVORS.find((candidate) =>
    value.toLocaleLowerCase("ru").includes(candidate),
  );
  if (flavor)
    attributes["Вкус"] =
      `${flavor[0].toLocaleUpperCase("ru")}${flavor.slice(1)}`;

  const connection = value.match(/для соединения\s+(.+?)(?:\s*·|$)/iu)?.[1];
  if (connection) attributes["Соединение"] = clean(connection);

  const kit = value.match(/^(.*?набор)(?:\s*[:·]|$)/iu)?.[1];
  if (kit) attributes["Комплектация"] = clean(kit);

  return attributes;
}

export function normalizedCatalogIdentity(value) {
  return clean(value)
    .replace(/&amp;/giu, "&")
    .toLocaleLowerCase("ru")
    .replace(/ё/gu, "е")
    .replace(/[^a-zа-я0-9]+/giu, " ")
    .trim();
}
