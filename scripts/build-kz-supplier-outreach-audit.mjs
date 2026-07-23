import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const registryPath = path.join(root, "data/suppliers-kz-registry.csv");

const parseCsvLine = (line) => {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(value);
      value = "";
    } else value += char;
  }
  cells.push(value);
  return cells;
};

const csv = await fs.readFile(registryPath, "utf8");
const [headerLine, ...lines] = csv.trim().split(/\r?\n/);
const headers = parseCsvLine(headerLine);
const registry = lines.map((line) =>
  Object.fromEntries(headers.map((header, index) => [header, parseCsvLine(line)[index] ?? ""])),
);

const enrichment = {
  "Medstom KZ": {
    phone: "+7 708 030-91-17",
    email: "",
    address: "Астана, ул. Алимхана Ермекова, 1/1а, цоколь",
    contactStatus: "READY_TO_CONTACT",
    outreachPriority: "HIGH",
    partnerEvidence: "На сайте заявлены DENU, Olident, Sani, COXO, Fomos, Falcon, IQ Dent и Handy.",
    sources: ["https://medstom.kz/"],
  },
  KazDentService: {
    phone: "+7 775 522-75-04; +7 705 319-99-61",
    email: "makhanov13n@gmail.com",
    address: "Алматы, мкр. Самал-3, дом 3",
    social: "Instagram: kazdent.service",
    contactStatus: "READY_TO_CONTACT",
    outreachPriority: "HIGH",
    partnerEvidence: "Публично указывает Dentsply Sirona, DÜRR DENTAL, Ivoclar, Atlas Copco и YouJoy.",
    sources: ["https://kazdentservice.kz/"],
  },
  "Joseph Company": {
    phone: "",
    email: "",
    address: "Казахстан; точный офис требует подтверждения",
    contactStatus: "CONTACT_RESEARCH_REQUIRED",
    outreachPriority: "MEDIUM",
    partnerEvidence: "Публичные материалы SHINING 3D подтверждают профиль компании; прямой контакт не найден.",
    sources: ["https://joseph-company.kz/", "https://joseph-company.kz/assets/catalog/aoralscan-3.pdf"],
  },
  "LIRA Medical Group": {
    phone: "+7 701 070-57-44",
    email: "dentmaterialskz@gmail.com",
    address: "Алматы, пр. Сейфуллина, 183а",
    contactStatus: "READY_TO_CONTACT",
    outreachPriority: "HIGH",
    partnerEvidence: "На сайте заявлен широкий ассортимент и 14 000+ SKU; нужен прямой экспорт.",
    sources: ["https://dent-materials.kz/about"],
  },
  IMS: {
    phone: "+7 775 493-91-17; +7 7132 54-11-42; +7 7132 54-44-19; +7 7132 56-10-32",
    email: "info@ims.kz",
    address: "Актобе, пр. Абылхаир-хана, 29В",
    legalId: "БИН 960440001166",
    contactStatus: "READY_TO_CONTACT",
    outreachPriority: "HIGH",
    partnerEvidence: "Крупный региональный дистрибьютор; нужен XLSX/PDF/EDI.",
    sources: ["https://ims.kz/contacts", "https://ims.kz/requisites"],
  },
  Unident: {
    phone: "",
    email: "info@unident-online.kz",
    address: "Казахстан; адрес и телефон требуют подтверждения",
    contactStatus: "PARTIAL_CONTACT",
    outreachPriority: "HIGH",
    partnerEvidence: "Сайт заявляет 100 000+ товаров и бренды Castellini, Anthos, Siger, Kaeser, Dental Art, Dental X, MGF, MyRay, Genoray, Zhermack и др.",
    sources: ["https://www.unident-online.kz/"],
  },
  Ordamed: {
    phone: "8 800 070-70-72; +7 727 270-70-72; +7 777 270-70-72",
    email: "info@ordamed.kz",
    address: "Алматы, ул. Дуйсенова, 25/202",
    contactStatus: "READY_TO_CONTACT",
    outreachPriority: "HIGH",
    partnerEvidence: "Контакты подтверждены в экосистеме компании; стоматологический ассортимент и юрлицо сверить на первом звонке.",
    sources: ["https://ordamed.com/kz/"],
  },
  KulimSnab: {
    phone: "+7 747 777-47-63",
    email: "tursunov.muratbek@gmail.com",
    address: "Шымкент, ул. Байтурсынова, 35/7; доменные данные указывают также Астану",
    contactStatus: "SECONDARY_SOURCE_CONFIRMATION_REQUIRED",
    outreachPriority: "MEDIUM",
    partnerEvidence: "Профиль магазина подтверждается каталогами/справочниками; контакт получен из доменных данных и требует подтверждения.",
    sources: ["https://kulimsnab.kz/", "https://kz.all-url.info/kz/kulimsnab.kz/", "https://2gis.kz/shymkent/firm/70000001079245241"],
  },
  "DentalShop Kazakhstan": {
    phone: "+7 702 733-00-33; +7 700 120-00-17; +7 700 880-00-04; +7 700 880-00-02; +7 700 870-00-01",
    email: "dental_shop01@mail.ru",
    address: "Шымкент, Аргынбекова 17/7; Актобе, Мангилик Ел 16; Алматы, Жумабекова 41; Астана, Айнаколь 66",
    contactStatus: "READY_TO_CONTACT",
    outreachPriority: "HIGH",
    partnerEvidence: "Сеть в четырёх городах; подходит для пилотной выгрузки региональных остатков.",
    sources: ["https://dentalshopkazakhstan.com/about"],
  },
  Stomtech: {
    phone: "+7 707 881-88-18",
    email: "",
    address: "Казахстан; офис требует подтверждения",
    contactStatus: "PARTIAL_CONTACT",
    outreachPriority: "HIGH",
    partnerEvidence: "IDL Dental Technologies заявляет прямые поставки европейского оборудования, регистрацию в РК и сервис.",
    sources: ["https://stomtech.kz/"],
  },
  AllForDent: {
    phone: "+7 708 971-47-67; +7 701 218-37-30",
    email: "allfordentkz@gmail.com",
    address: "Алматы, 10 мкр., дом 3, кв. 39",
    contactStatus: "READY_TO_CONTACT",
    outreachPriority: "HIGH",
    partnerEvidence: "Публичный каталог импортирован; лучший кандидат для проверки автоматического сопоставления прайса.",
    sources: ["https://a4d.kz/about"],
  },
  "Nord Stom": {
    phone: "",
    email: "",
    address: "Казахстан; контакты требуют подтверждения",
    contactStatus: "CONTACT_RESEARCH_REQUIRED",
    outreachPriority: "HIGH",
    partnerEvidence: "Публичный каталог импортирован; Proteco Asia называет Nord Stom действующим дистрибьютором Tokuyama.",
    sources: ["https://nordstom.kz/", "https://proteco.kz/company/news/izmenenie_formata_prodazh_proteco_asia/"],
  },
  AMDgroup: {
    phone: "+7 727 313-15-23",
    email: "social@amdgroup.kz",
    address: "Алматы, ул. Богенбай батыра, 149",
    contactStatus: "READY_TO_CONTACT",
    outreachPriority: "HIGH",
    partnerEvidence: "Публичный каталог импортирован; нужен полный актуальный прайс и остатки.",
    sources: ["https://amdgroup.kz/"],
  },
  "СТОМир": {
    phone: "+7 727 323-62-96; +7 707 288-73-33",
    email: "sales@stomir.kz",
    address: "Алматы, ул. Шевченко, 165Б",
    contactStatus: "READY_TO_CONTACT",
    outreachPriority: "HIGH",
    partnerEvidence: "Публичный каталог и цены доступны; заявлены IMD, Amazing White, NIC и другие бренды.",
    sources: ["https://stomir.kz/"],
  },
  "Proteco Asia": {
    phone: "+7 701 345-40-32; +7 727 339-60-06",
    email: "info@proteco.kz",
    address: "Алматы, ул. Огородная, 1а; прежний/юридический адрес: ул. Макатаева, 117",
    legalId: "БИН 210540034580",
    contactStatus: "READY_TO_CONTACT",
    outreachPriority: "HIGH",
    partnerEvidence: "Импортёр Tokuyama; с апреля 2026 прямые продажи прекращены, продажи идут через Nord Stom, Stom Mart, Astra Dent, Astom.kz и Regomed.",
    sources: ["https://proteco.kz/contacts/", "https://proteco.kz/company/news/izmenenie_formata_prodazh_proteco_asia/", "https://proteco.kz/info/rekviziti-too-proteko-asia.pdf"],
  },
  "LUCH LLP": {
    phone: "+7 727 274-01-57; +7 705 248-45-14",
    email: "info@luch.asia",
    address: "Алматы, ул. Клочкова, 163; есть региональные филиалы",
    contactStatus: "READY_TO_CONTACT",
    outreachPriority: "HIGH",
    partnerEvidence: "Подтверждается каталогами производителей NSK, Solventum и Ivoclar.",
    sources: ["https://luch.asia/contacts"],
  },
  Stomed: {
    phone: "+7 7142 28-01-75",
    email: "reg@medsales.kz; magudkovskaya@medsales.kz",
    address: "Костанай, ул. Уральская, 14",
    legalId: "Связанное юрлицо СервисМед Компани: БИН 170140009842",
    contactStatus: "READY_TO_CONTACT",
    outreachPriority: "HIGH",
    partnerEvidence: "Указан NSK; контакты также присутствуют в инструкциях зарегистрированных медизделий.",
    sources: ["https://medsales.kz/", "https://www.goszakup.gov.kz/ru/registry/show_supplier/179249", "https://heliy.kz/pdf/%D0%9B%D0%B8%D0%B4%D0%BE%D0%BA%D1%81%D0%BE%D1%80%20%D0%B3%D0%B5%D0%BB%D1%8C.pdf"],
  },
  "Astra Medical": {
    phone: "+7 727 391-08-28; +7 771 718-18-50",
    email: "manager1@adent.kz; info@adent.kz",
    address: "Алматы, пр. Абая, 58А",
    contactPerson: "Лаура Аберзайитова",
    contactStatus: "READY_TO_CONTACT",
    outreachPriority: "HIGH",
    partnerEvidence: "Официальная страница дилера Planmeca; также указан сервисным центром EKOM.",
    sources: ["https://www.planmeca.com/find-dealers/llp-astra-medical/", "https://www.ekom.sk/en/contact/service-centers/asia/kazakhstan"],
  },
  "HELIY LLP": {
    phone: "+7 727 375-95-01; +7 727 375-06-15; +7 707 225-86-42; +7 707 632-05-05",
    email: "info@heliy.kz; shop1@heliy.kz; shop2@heliy.kz",
    address: "Алматы, ул. Нурлы жол, 3Б; магазин: ул. Жамбыла, 97",
    contactStatus: "READY_TO_CONTACT",
    outreachPriority: "HIGH",
    partnerEvidence: "Дистрибьютор Solventum; в публичных документах указан как представитель/организация по претензиям для ряда медизделий.",
    sources: ["https://www.heliy.kz/contacts/stores/", "https://www.heliy.kz/upload/catalog-pdf/%D0%9A%D0%B0%D1%82%D0%B0%D0%BB%D0%BE%D0%B3%20%D0%9E%D1%80%D1%82%D0%BE%D0%B4%D0%BE%D0%BD%D1%82%D0%B8%D1%8F_-%D1%81%D0%B6%D0%B0%D1%82%D1%8B%D0%B9.pdf"],
  },
  "VITIME LLP": {
    phone: "+7 727 273-03-98; +7 727 273-15-74",
    email: "",
    address: "Публичные справочники: Алматы, ул. Суюнбая, 66в; также магазины в Астане, Кокшетау и Костанае",
    contactStatus: "LEGAL_STATUS_AND_CONTACT_CONFIRMATION_REQUIRED",
    outreachPriority: "MEDIUM",
    partnerEvidence: "Указан Solventum как дистрибьютор; найдено сообщение 2024 года о ликвидации одноимённого ТОО, поэтому контактировать только после проверки действующего юрлица.",
    sources: ["https://22179-kz.all.biz/", "https://2gis.kz/firm/70000001047066154"],
  },
  "IVO-HANDELS KZ": {
    phone: "+7 700 111-59-09",
    email: "info@ivohandels.com",
    address: "Алматы, пр. Аль-Фараби, 100, офис 7",
    contactStatus: "READY_TO_CONTACT",
    outreachPriority: "HIGH",
    partnerEvidence: "Официальный дистрибьютор Ivoclar; также предлагает Komet, Shera и Schick.",
    sources: ["https://ivohandels.com/", "https://ivohandels.com/about-us/history/", "https://www.ivoclar.com/en_us/distributors"],
  },
  "Ident LLC": {
    phone: "",
    email: "",
    address: "Казахстан; контакты не найдены",
    contactStatus: "CONTACT_RESEARCH_REQUIRED",
    outreachPriority: "MEDIUM",
    partnerEvidence: "Компания присутствует в официальном каталоге дистрибьюторов Ivoclar для Казахстана.",
    sources: ["https://www.ivoclar.com/en_us/distributors"],
  },
};

const suppliers = registry.map((item) => ({
  ...item,
  ...(enrichment[item.supplierName] ?? {
    contactStatus: "CONTACT_RESEARCH_REQUIRED",
    outreachPriority: "MEDIUM",
    sources: [item.website].filter(Boolean),
  }),
}));

const totals = {
  suppliers: suppliers.length,
  readyToContact: suppliers.filter((item) => item.contactStatus === "READY_TO_CONTACT").length,
  partialContact: suppliers.filter((item) => /PARTIAL|SECONDARY|CONFIRMATION/.test(item.contactStatus)).length,
  researchRequired: suppliers.filter((item) => item.contactStatus === "CONTACT_RESEARCH_REQUIRED").length,
  highPriority: suppliers.filter((item) => item.outreachPriority === "HIGH").length,
};

const report = {
  generatedAt: new Date().toISOString(),
  market: "Kazakhstan",
  methodology: "Публичные контакты и партнёрские признаки. Статусы производителя/дистрибьютора не считаются юридическим подтверждением без прямой проверки.",
  totals,
  suppliers,
};

await fs.writeFile(
  path.join(root, "data/reports/kz-supplier-outreach-audit.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
const md = [
  "# Поставщики Казахстана: готовность к сотрудничеству",
  "",
  `Сформирован: ${report.generatedAt}`,
  "",
  `Всего: ${totals.suppliers}; готовы к первому контакту: ${totals.readyToContact}; высокий приоритет: ${totals.highPriority}.`,
  "",
  "| Поставщик | Приоритет | Контакт | Телефон | Email | Основание |",
  "|---|---|---|---|---|---|",
  ...suppliers.map((item) =>
    `| ${item.supplierName} | ${item.outreachPriority} | ${item.contactStatus} | ${item.phone || "—"} | ${item.email || "—"} | ${(item.partnerEvidence || item.notes || "").replace(/\|/g, "/")} |`,
  ),
  "",
  "Контакты со статусом подтверждения нельзя использовать для массовой рассылки до ручной проверки.",
  "",
];
await fs.writeFile(
  path.join(root, "data/reports/kz-supplier-outreach-audit.md"),
  `${md.join("\n")}\n`,
);

console.log(JSON.stringify({ ok: true, ...totals }, null, 2));
