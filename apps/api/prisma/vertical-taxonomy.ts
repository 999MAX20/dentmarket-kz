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
