export type ProductPresentationInput = {
  name: string;
  description?: string | null;
  category?: string | null;
  brand?: string | null;
  manufacturer?: string | null;
};

export type ProductPresentation = {
  title: string;
  originalName: string | null;
  category: string;
  summary: string;
};

const CYRILLIC = /[А-ЯЁа-яё]/u;

const clean = (value: string | null | undefined) =>
  String(value ?? "")
    .replace(/&(?:laquo|raquo|nbsp|quot);/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

const firstSentence = (value: string) => {
  const sentence = value.match(/^.{20,170}?(?:[.!?](?=\s|$)|$)/u)?.[0] ?? value;
  return sentence.length > 150
    ? `${sentence.slice(0, 147).replace(/\s+\S*$/u, "").trim()}…`
    : sentence;
};

const readableCategory = (value: string, fullText: string) => {
  const text = `${value} ${fullText}`.toLocaleLowerCase("en");
  const rules: Array<[RegExp, string]> = [
    [/(?:endo|root canal|apex|эндод)/u, "Эндодонтия"],
    [/(?:implant|abutment|имплан)/u, "Имплантология"],
    [/(?:bracket|orthodont|arch wire|ортод)/u, "Ортодонтия"],
    [/(?:handpiece|contra angle|turbine|наконеч)/u, "Наконечники"],
    [/(?:bur|burs|cutter|drill|fraise|боры|фрез)/u, "Боры и фрезы"],
    [/(?:forcep|elevator|scissor|tweezer|instrument|инструмент)/u, "Инструменты"],
    [/(?:adhesive|bond|cement|composite|resin|адгез|цемент|композит)/u, "Материалы"],
    [/(?:autoclave|sterili|стерил)/u, "Стерилизация"],
    [/(?:impression|слеп)/u, "Слепочные материалы"],
    [/(?:glove|mask|saliva ejector|bib|перчат|маск|слюноотсос)/u, "Расходные материалы"],
    [/(?:equipment|scanner|unit|motor|оборуд)/u, "Оборудование"],
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1] ?? "Стоматологические товары";
};

const ratio = (name: string) =>
  name.match(/\b\d+(?:[.,]\d+)?\s*:\s*\d+(?:[.,]\d+)?\b/u)?.[0]?.replace(/\s+/gu, "") ??
  null;

const size = (name: string) => {
  const match = name.match(/\b\d+(?:[.,]\d+)?\s*(?:mm|ml|cm|g|kg|мм|мл|см|г|кг)\b/iu);
  if (!match) return null;
  return match[0]
    .replace(/\bmm\b/iu, "мм")
    .replace(/\bml\b/iu, "мл")
    .replace(/\bcm\b/iu, "см")
    .replace(/\bkg\b/iu, "кг")
    .replace(/\bg\b/iu, "г");
};

const withSpecs = (base: string, name: string, additions: string[] = []) => {
  const specs = [ratio(name), size(name), ...additions].filter(
    (value, index, values): value is string =>
      Boolean(value) && values.indexOf(value) === index,
  );
  return specs.length ? `${base} ${specs.join(", ")}` : base;
};

const translateForeignTitle = (name: string, text: string) => {
  const lower = text.toLocaleLowerCase("en");

  if (/klemmelektrode/u.test(lower))
    return "Щёчный зажим-электрод для депофореза";
  if (/hakenelektrode/u.test(lower))
    return "Крючковый электрод для депофореза";
  if (/nadelelektrode/u.test(lower))
    return "Игловой электрод для корневого канала";

  if (/endo head/u.test(lower))
    return withSpecs("Эндодонтическая головка", name, [
      /wireless motor/u.test(lower) ? "для беспроводного мотора" : "",
      /up\s*&?\s*down|up and down/u.test(lower)
        ? "возвратно-поступательная"
        : "",
    ]);
  if (/implant.+contra angle|contra angle.+implant/u.test(lower))
    return withSpecs("Имплантологический угловой наконечник", name, [
      /\bled\b/u.test(lower) ? "с LED-подсветкой" : "",
      /high torque/u.test(lower) ? "с высоким крутящим моментом" : "",
    ]);
  if (/contra angle.+handpiece|handpiece.+contra angle/u.test(lower))
    return withSpecs("Угловой стоматологический наконечник", name, [
      /fiber optic|optic|led/u.test(lower) ? "с оптикой" : "",
      /45\s*(?:degree|°)/u.test(lower) ? "45°" : "",
      /surgical/u.test(lower) ? "хирургический" : "",
      /reduction/u.test(lower) ? "понижающий" : "",
      /increasing|speed increasing/u.test(lower) ? "повышающий" : "",
    ]);
  if (/straight.+handpiece|handpiece.+straight/u.test(lower))
    return withSpecs("Прямой стоматологический наконечник", name, [
      /increasing|speed increasing/u.test(lower) ? "повышающий" : "",
      /surgical/u.test(lower) ? "хирургический" : "",
    ]);
  if (/high speed.+handpiece|turbine handpiece/u.test(lower))
    return withSpecs("Турбинный наконечник", name, [
      /fiber optic|optic|led/u.test(lower) ? "с подсветкой" : "",
    ]);
  if (/adap(?:t|o)r.+handpiece|handpiece.+adap(?:t|o)r/u.test(lower))
    return withSpecs("Переходник для стоматологического наконечника", name);
  if (/handpiece/u.test(lower))
    return withSpecs("Стоматологический наконечник", name);

  if (/healing abutment|gingiva former|abutment healing/u.test(lower))
    return withSpecs("Формирователь десны", name);
  if (/\babutment\b/u.test(lower))
    return withSpecs("Абатмент для имплантата", name);
  if (/\bimplant\b/u.test(lower))
    return withSpecs("Дентальный имплантат", name);

  if (/extraction forcep/u.test(lower))
    return withSpecs("Щипцы для удаления зубов", name, [
      /\bupper\b/u.test(lower) ? "для верхней челюсти" : "",
      /\blower\b/u.test(lower) ? "для нижней челюсти" : "",
      /\badult\b/u.test(lower) ? "взрослые" : "",
      /child|pediatric/u.test(lower) ? "детские" : "",
    ]);
  if (/periosteal elevator/u.test(lower))
    return withSpecs("Распатор стоматологический", name);
  if (/root elevator|dental elevator|\belevator\b/u.test(lower))
    return withSpecs("Элеватор стоматологический", name);
  if (/needle holder/u.test(lower))
    return withSpecs("Иглодержатель стоматологический", name);
  if (/tweezer/u.test(lower))
    return withSpecs("Пинцет стоматологический", name);
  if (/scissor/u.test(lower))
    return withSpecs("Ножницы стоматологические", name);
  if (/curette|curett/u.test(lower))
    return withSpecs("Кюретка стоматологическая", name);
  if (/periodontal probe|\bprobe\b/u.test(lower))
    return withSpecs("Зонд стоматологический", name);
  if (/mouth mirror|dental mirror|\bmirror\b/u.test(lower))
    return withSpecs("Зеркало стоматологическое", name);
  if (/air water syringe|air syringe/u.test(lower))
    return withSpecs("Пистолет вода-воздух", name);
  if (/impression tray/u.test(lower))
    return withSpecs("Слепочная ложка", name);

  if (/diamond strip/u.test(lower))
    return withSpecs("Алмазная штрипса", name);
  if (/abrasive strip/u.test(lower))
    return withSpecs("Абразивная штрипса", name);
  if (/diamond (?:bur|burs)|diamant/u.test(lower))
    return withSpecs("Алмазный бор", name);
  if (/carbide (?:bur|burs|cutter)|tungsten carbide/u.test(lower))
    return withSpecs("Твердосплавный бор", name);
  if (/\b(?:bur|burs|cutter|fraise)\b/u.test(lower))
    return withSpecs("Стоматологический бор", name);

  if (/apex locator/u.test(lower)) return "Апекслокатор";
  if (/endo motor/u.test(lower)) return "Эндодонтический мотор";
  if (/adhesive|\bbond(?:ing)?\b/u.test(lower))
    return withSpecs("Стоматологический адгезив", name);
  if (/flowable composite/u.test(lower))
    return withSpecs("Текучий композит", name);
  if (/\bcomposite\b/u.test(lower))
    return withSpecs("Стоматологический композит", name);
  if (/\bcement\b/u.test(lower))
    return withSpecs("Стоматологический цемент", name);
  if (/\bbracket\b/u.test(lower))
    return withSpecs("Ортодонтический брекет", name);
  if (/arch ?wire/u.test(lower))
    return withSpecs("Ортодонтическая дуга", name);
  if (/\bwedge\b/u.test(lower))
    return withSpecs("Стоматологический клин", name);
  if (/\bmatrix\b/u.test(lower))
    return withSpecs("Стоматологическая матрица", name);
  if (/autoclave/u.test(lower))
    return withSpecs("Стоматологический автоклав", name);

  return null;
};

const purposeFor = (category: string) => {
  const purposes: Record<string, string> = {
    Эндодонтия: "Для лечения и обработки корневых каналов.",
    Имплантология: "Для хирургического и ортопедического этапов имплантации.",
    Ортодонтия: "Для ортодонтического лечения.",
    Наконечники: "Для подключения к стоматологической установке или мотору.",
    "Боры и фрезы": "Для обработки твёрдых тканей и стоматологических материалов.",
    Инструменты: "Стоматологический инструмент для клинической работы.",
    Материалы: "Стоматологический материал для клинического применения.",
    Стерилизация: "Для очистки, упаковки или стерилизации инструментов.",
    "Слепочные материалы": "Для получения стоматологических оттисков.",
    "Расходные материалы": "Расходный материал для работы стоматологической клиники.",
    Оборудование: "Оборудование для стоматологической клиники.",
  };
  return purposes[category] ?? "Товар для стоматологической практики.";
};

export function createProductPresentation(
  product: ProductPresentationInput,
): ProductPresentation {
  const name = clean(product.name) || "Стоматологический товар";
  const description = clean(product.description);
  const combined = clean(
    `${name} ${product.category ?? ""} ${description} ${product.brand ?? ""}`,
  );
  const category = readableCategory(clean(product.category), combined);
  const translated = CYRILLIC.test(name)
    ? name
    : translateForeignTitle(name, combined);
  const title = translated ?? `${category} · ${name}`;
  const originalName = title === name ? null : name;
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const russianDescription = description.replace(
    new RegExp(`^${escapedName}\\s*[:—–-]*\\s*`, "iu"),
    "",
  );
  const summary =
    russianDescription && CYRILLIC.test(russianDescription)
      ? firstSentence(russianDescription)
      : purposeFor(category);

  return { title, originalName, category, summary };
}
