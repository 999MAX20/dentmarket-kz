# DentMarket Mobile

Первый мобильный клиент DentMarket для клиники. Клиент изолирован в `apps/mobile` и использует публичный каталог сайта через API.

## Запуск

```bash
pnpm install
pnpm --filter @marketplace/mobile start
```

Затем отсканируйте QR-код в Expo Go или выберите iOS/Android simulator.

По умолчанию используется production-каталог:

```text
https://dentmarket-shop.vercel.app/api/catalog-search
```

Для локального API:

```bash
EXPO_PUBLIC_CATALOG_URL=http://127.0.0.1:3000/api/catalog-search pnpm --filter @marketplace/mobile start
```

## Сейчас работает

- каталог и поиск по стоматологическому сленгу;
- подсказки «перчатки», «текучка», «гутта», «карпулы» и «эндодонтия»;
- карточка товара, фото, описание, варианты и лучшее предложение;
- демо-корзина с количеством, увеличением/уменьшением и очисткой;
- профиль клиники как безопасный экран подготовки авторизации;
- состояния загрузки, ошибки и пустой корзины.

Реальные вход, заказы, ЭЦП, push и оплату подключаем к тем же API после готовности production credentials.
