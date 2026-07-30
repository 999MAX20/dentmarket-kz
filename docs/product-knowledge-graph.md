# Product Knowledge Graph

Product карточка остаётся canonical-объектом, а связи живут отдельно в `ProductRelation`. Это позволяет добавлять аналоги и совместимость без дублирования товара.

Поддерживаемые типы:

- `COMPATIBLE_WITH` — совместим с;
- `REPLACES` — заменяет;
- `CONSUMABLE_FOR` — расходник для;
- `USED_WITH` — используется вместе с;
- `SUCCESSOR_OF` — новое поколение;
- `DISCONTINUED_REPLACED_BY` — снят с производства и заменён.

Каждая связь хранит направление, статус, confidence, тип источника, URL/evidence и период действия. Неподтверждённые связи могут использоваться только во внутренних рекомендациях; публичная выдача графа возвращает только `VERIFIED`.

## API

- `GET /catalog/managed/products/:productId/relations` — внутренний каталог, включая предложения на проверку;
- `GET /catalog/products/:productId/relations` — публичный каталог, только подтверждённые связи.

## Intake

Шаблон: `data/templates/product-knowledge-graph.csv`.

Правила:

- `fromExternalId + toExternalId + type` уникальны;
- самоссылки запрещены;
- confidence — число от 0 до 1;
- `VERIFIED` требует URL или evidence;
- связи не создаются из одного совпадения названий без источника.

Проверка шаблона:

```bash
pnpm catalog:validate:knowledge-graph
```
