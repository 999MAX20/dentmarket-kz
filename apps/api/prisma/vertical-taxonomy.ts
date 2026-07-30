export type CategorySeed = { code: string; nameRu: string; nameKk?: string };

export const beautyCategoryCatalog: CategorySeed[] = [
  { code: "professional-cosmetics", nameRu: "Профессиональная косметика" },
  { code: "face-care", nameRu: "Уход за лицом" },
  { code: "body-care", nameRu: "Уход за телом" },
  { code: "hair-care", nameRu: "Уход за волосами" },
  { code: "nail-products", nameRu: "Материалы для ногтей" },
  { code: "lash-brow-products", nameRu: "Материалы для ресниц и бровей" },
  { code: "disposables", nameRu: "Одноразовые расходные материалы" },
  { code: "salon-equipment", nameRu: "Оборудование для салонов" },
  { code: "beauty-tools", nameRu: "Инструменты" },
  { code: "sterilization", nameRu: "Стерилизация и дезинфекция" },
  { code: "spa-products", nameRu: "SPA-материалы" },
  { code: "training-materials", nameRu: "Материалы для обучения" },
].map((category) => ({ ...category, nameKk: category.nameRu }));

export const beautyAttributeCatalog = [
  { code: "beauty_brand_line", nameRu: "Линейка бренда", valueType: "TEXT" as const },
  { code: "beauty_volume", nameRu: "Объём", valueType: "DECIMAL" as const },
  { code: "beauty_volume_unit", nameRu: "Единица объёма", valueType: "TEXT" as const },
  { code: "beauty_skin_type", nameRu: "Тип кожи", valueType: "TEXT" as const },
  { code: "beauty_hair_type", nameRu: "Тип волос", valueType: "TEXT" as const },
  { code: "beauty_shade", nameRu: "Оттенок", valueType: "TEXT" as const },
  { code: "beauty_color", nameRu: "Цвет", valueType: "TEXT" as const },
  { code: "beauty_expiry_months", nameRu: "Срок годности, месяцев", valueType: "INTEGER" as const },
  { code: "beauty_professional_only", nameRu: "Только для профессионального применения", valueType: "BOOLEAN" as const },
  { code: "beauty_sterile", nameRu: "Стерильность", valueType: "BOOLEAN" as const },
].map((attribute) => ({ ...attribute, nameKk: attribute.nameRu }));

export const beautyCategoryAttributeRules: Record<string, Array<[string, boolean]>> = {
  "professional-cosmetics": [["beauty_brand_line", false], ["beauty_volume", true], ["beauty_volume_unit", false], ["beauty_skin_type", false], ["beauty_professional_only", false]],
  "face-care": [["beauty_volume", true], ["beauty_volume_unit", false], ["beauty_skin_type", true], ["beauty_expiry_months", false]],
  "body-care": [["beauty_volume", true], ["beauty_volume_unit", false], ["beauty_skin_type", false], ["beauty_expiry_months", false]],
  "hair-care": [["beauty_volume", true], ["beauty_volume_unit", false], ["beauty_hair_type", true], ["beauty_color", false]],
  "nail-products": [["beauty_volume", true], ["beauty_volume_unit", false], ["beauty_color", false], ["beauty_shade", false]],
  "lash-brow-products": [["beauty_volume", true], ["beauty_volume_unit", false], ["beauty_color", false], ["beauty_professional_only", true]],
  disposables: [["beauty_volume", true], ["beauty_volume_unit", false], ["beauty_sterile", false]],
  "salon-equipment": [["beauty_professional_only", true]],
  "beauty-tools": [["beauty_color", false]],
  sterilization: [["beauty_sterile", true], ["beauty_volume", true], ["beauty_volume_unit", false]],
  "spa-products": [["beauty_volume", true], ["beauty_volume_unit", false], ["beauty_skin_type", false]],
  "training-materials": [["beauty_volume", false], ["beauty_volume_unit", false]],
};

export const beautySearchSynonyms = [
  ["крем для лица", "крем", "уход за лицом"],
  ["сыворотка", "серум", "сироватка"],
  ["шампунь", "шампунь профессиональный", "hair shampoo"],
  ["маска для волос", "маска волос", "hair mask"],
  ["гель лак", "гель-лак", "gel polish"],
  ["база", "база под гель-лак", "base coat"],
  ["топ", "топ для ногтей", "top coat"],
  ["праймер", "дегидратор", "primer"],
  ["ресницы", "lash", "наращивание ресниц"],
  ["брови", "brow", "ламинирование бровей"],
  ["одноразка", "одноразовые материалы", "расходники"],
  ["стерилизация", "сухожар", "автоклав"],
];
