const clean = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const normalized = (value) =>
  clean(value).toLocaleLowerCase("ru").replace(/[.,]/g, ".").replace(/ё/g, "е");

const shadeFrom = (value) => {
  const latinized = value
    .replace(/[Аа](?=\d)/gu, "A")
    .replace(/[Вв](?=\d)/gu, "B")
    .replace(/[Сс](?=\d)/gu, "C")
    .replace(/(\d)[ ,.](5)\b/gu, "$1.$2");
  return latinized
    .match(
      /\b(?:A[1-4](?:\.5)?|B[1-4]|C[1-4]|D[2-4]|[0-5]M[1-3]|[2-4][LR][12]\.5|OPAQUE[- ]?[0-5]|T)\b/iu,
    )?.[0]
    ?.toLocaleUpperCase("en")
    .replace("OPAQUE ", "OPAQUE-");
};

const measureFrom = (value) => {
  const match = value.match(
    /\b(2|3[,.]5|4|12|50|250)\s*(?:g|г|ml|мл)(?![\p{L}])/iu,
  );
  if (!match) return null;
  const unit = /ml|мл/iu.test(match[0]) ? "мл" : "г";
  return `${match[1].replace(",", ".")} ${unit}`;
};

const TETRIC_N_CERAM_REFS = new Map([
  ["A1", "755750AN"],
  ["A2", "755751AN"],
  ["A2 DENTINE", "755752AN"],
  ["A3", "755753AN"],
  ["A3.5", "755754AN"],
  ["A3.5 DENTINE", "755755AN"],
  ["B1", "755817AN"],
  ["B2", "755818AN"],
]);

const TETRIC_N_FLOW_REFS = new Map([
  ["A1", "750813AN"],
  ["A2", "750814AN"],
  ["A2 DENTINE", "755966AN"],
  ["A3", "750815AN"],
  ["A3.5", "750816AN"],
  ["T", "750822AN"],
]);

const CHARISMA_SMART_REFS = new Map([
  ["A1", "66060392"],
  ["A2", "66060393"],
  ["A3", "66060394"],
  ["A3.5", "66060395"],
  ["B1", "66060396"],
  ["B2", "66060397"],
  ["DENTINE", "66060398"],
]);

const VITA_CLASSICAL_INDEX = new Map([
  ["A1", 31],
  ["A2", 32],
  ["A3", 33],
  ["A3.5", 34],
  ["A4", 35],
  ["B1", 36],
  ["B2", 37],
  ["B3", 38],
  ["B4", 39],
  ["C1", 40],
  ["C2", 41],
  ["C3", 42],
  ["C4", 43],
  ["D2", 44],
  ["D3", 45],
  ["D4", 46],
]);

const VITA_3D_INDEX = new Map([
  ["0M1", 31],
  ["0M2", 32],
  ["0M3", 33],
  ["1M1", 34],
  ["1M2", 35],
  ["2L1.5", 36],
  ["2L2.5", 37],
  ["2M1", 38],
  ["2M2", 39],
  ["2M3", 40],
  ["2R1.5", 41],
  ["2R2.5", 42],
  ["3L1.5", 43],
  ["3L2.5", 44],
  ["3M1", 45],
  ["3M2", 46],
  ["3M3", 47],
  ["3R1.5", 48],
  ["3R2.5", 49],
  ["4L1.5", 50],
  ["4L2.5", 51],
  ["4M1", 52],
  ["4M2", 53],
  ["4M3", 54],
  ["4R1.5", 55],
  ["4R2.5", 56],
  ["5M1", 57],
  ["5M2", 58],
  ["5M3", 59],
]);

const family = ({
  brand,
  manufacturer,
  canonicalProductName,
  sourceName,
  manufacturerRef,
  form,
  shade,
  measure,
}) => ({
  brand,
  manufacturer,
  canonicalProductName,
  sourceName,
  manufacturerRef,
  variantLabel: [form, shade ? `оттенок ${shade}` : "", measure]
    .filter(Boolean)
    .join(" · "),
});

export function inferVerifiedVariantFamily(sourceName) {
  const source = clean(sourceName);
  const value = normalized(source);

  if (/tetric n[- ]ceram 2/iu.test(value)) {
    const baseShade = shadeFrom(source);
    const shade = /dent/iu.test(source) ? `${baseShade} DENTINE` : baseShade;
    const manufacturerRef = TETRIC_N_CERAM_REFS.get(shade);
    if (!manufacturerRef) return null;
    return family({
      brand: "Ivoclar",
      manufacturer: "Ivoclar Vivadent AG",
      canonicalProductName: "Ivoclar Tetric N-Ceram 2",
      sourceName: source,
      manufacturerRef,
      form: "Шприц",
      shade,
      measure: "3.5 г",
    });
  }

  if (/tetric n[- ]flow 2/iu.test(value)) {
    const baseShade = shadeFrom(source);
    const shade = /dent/iu.test(source) ? `${baseShade} DENTINE` : baseShade;
    const manufacturerRef = TETRIC_N_FLOW_REFS.get(shade);
    if (!manufacturerRef) return null;
    return family({
      brand: "Ivoclar",
      manufacturer: "Ivoclar Vivadent AG",
      canonicalProductName: "Ivoclar Tetric N-Flow 2",
      sourceName: source,
      manufacturerRef,
      form: "Шприц",
      shade,
      measure: "2 г",
    });
  }

  if (/(?:charisma|karizma|каризма) smart/iu.test(value)) {
    const shade =
      shadeFrom(source) ?? (/dentine|дентин/iu.test(source) ? "DENTINE" : null);
    const manufacturerRef = CHARISMA_SMART_REFS.get(shade);
    if (!manufacturerRef) return null;
    return family({
      brand: "Kulzer",
      manufacturer: "Kulzer GmbH",
      canonicalProductName: "Kulzer Charisma Smart",
      sourceName: source,
      manufacturerRef,
      form: "Шприц",
      shade,
      measure: "4 г",
    });
  }

  if (!/lumex ac/iu.test(value)) return null;
  const measure = measureFrom(source);
  if (/жидк|modelling liquid/iu.test(value) && measure) {
    const manufacturerRef = measure === "250 мл" ? "BLML250" : "BLML50";
    return family({
      brand: "VITA",
      manufacturer: "VITA Zahnfabrik H. Rauter GmbH & Co. KG",
      canonicalProductName: "VITA LUMEX AC Modelling Liquid",
      sourceName: source,
      manufacturerRef,
      form: "Флакон",
      measure,
    });
  }

  const shade = shadeFrom(source);
  if (!shade || !measure) return null;
  const suffix = measure === "50 г" ? "50" : "12";
  if (/opaque[ /-]*opaque|опакуе опакуе/iu.test(value)) {
    const number = shade.match(/\d/)?.[0];
    if (!number) return null;
    return family({
      brand: "VITA",
      manufacturer: "VITA Zahnfabrik H. Rauter GmbH & Co. KG",
      canonicalProductName: "VITA LUMEX AC Opaque",
      sourceName: source,
      manufacturerRef: `B5325${number}12`,
      form: "Порошок",
      shade: `Opaque-${number}`,
      measure,
    });
  }

  const isOpaqueDentine = /opaque dentine|опакуе дентине/iu.test(value);
  const index = VITA_CLASSICAL_INDEX.get(shade) ?? VITA_3D_INDEX.get(shade);
  if (!index || !/(?:dentine|дентине)/iu.test(value)) return null;
  const is3dMaster = VITA_3D_INDEX.has(shade);
  const prefix = is3dMaster ? "B530" : "B534";
  const adjustedIndex = is3dMaster
    ? index + (isOpaqueDentine ? 30 : 0)
    : index + (isOpaqueDentine ? 0 : 20);
  return family({
    brand: "VITA",
    manufacturer: "VITA Zahnfabrik H. Rauter GmbH & Co. KG",
    canonicalProductName: isOpaqueDentine
      ? "VITA LUMEX AC Opaque Dentine"
      : "VITA LUMEX AC Dentine",
    sourceName: source,
    manufacturerRef: `${prefix}${String(adjustedIndex).slice(-2)}${suffix}`,
    form: "Порошок",
    shade,
    measure,
  });
}
