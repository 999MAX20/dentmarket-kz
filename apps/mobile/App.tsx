import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { buildCatalogUrl, CATALOG_API_URL, formatMinorCurrency } from "./lib/catalog";

type Variant = { id: string; sku?: string | null; label?: string; attributes?: Record<string, string> };
type Product = {
  id: string;
  name: string;
  description?: string | null;
  brand?: string | null;
  manufacturer?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  media?: Array<{ sourceUrl?: string | null; metadata?: { sourceImageUrl?: string | null } }>;
  variants?: Variant[];
  offers?: Array<{ id: string; supplier?: { name?: string }; priceMinor?: number | string | null; currency?: string; available?: boolean; packaging?: { name?: string } }>;
};

type SearchResponse = { total: number; items: Product[]; interpretedQuery?: string[]; matchedAliases?: string[] };

const API_URL = process.env.EXPO_PUBLIC_CATALOG_URL ?? CATALOG_API_URL;
const suggestedQueries = ["перчатки", "текучка", "гутта", "карпулы", "эндодонтия"];

const productImage = (product: Product) => {
  const source = product.media?.[0]?.sourceUrl ?? product.imageUrl;
  if (!source) return null;
  if (source.startsWith("http")) return source;
  return `https://dentmarket-shop.vercel.app${source}`;
};

const formatPrice = formatMinorCurrency;

export default function App() {
  const [screen, setScreen] = useState<"catalog" | "cart" | "profile" | "checkout">("catalog");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Product | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartProducts, setCartProducts] = useState<Record<string, Product>>({});
  const [favorites, setFavorites] = useState<Record<string, Product>>({});
  const [city, setCity] = useState("Алматы");
  const [cityOpen, setCityOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("Все");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const cartCount = useMemo(() => Object.values(cart).reduce((sum, quantity) => sum + quantity, 0), [cart]);
  const visibleProducts = useMemo(() => products.filter((product) => {
    const category = String(product.category ?? "").toLocaleLowerCase("ru");
    const categoryMatches = categoryFilter === "Все" || category.includes(categoryFilter.toLocaleLowerCase("ru"));
    const availabilityMatches = !onlyAvailable || product.offers?.some((offer) => offer.available);
    return categoryMatches && availabilityMatches;
  }), [categoryFilter, onlyAvailable, products]);

  useEffect(() => {
    void AsyncStorage.getItem("dentmarket.mobile.state").then((value) => {
      if (value) {
        try {
          const saved = JSON.parse(value) as { cart?: Record<string, number>; cartProducts?: Record<string, Product>; favorites?: Record<string, Product>; city?: string };
          setCart(saved.cart ?? {}); setCartProducts(saved.cartProducts ?? {}); setFavorites(saved.favorites ?? {}); setCity(saved.city ?? "Алматы");
        } catch { /* corrupted local cache is ignored */ }
      }
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (hydrated) void AsyncStorage.setItem("dentmarket.mobile.state", JSON.stringify({ cart, cartProducts, favorites, city }));
  }, [cart, cartProducts, favorites, city, hydrated]);

  const loadCatalog = useCallback(async (nextQuery = submittedQuery) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(buildCatalogUrl(API_URL, nextQuery));
      if (!response.ok) throw new Error(`Каталог недоступен (${response.status})`);
      const payload = (await response.json()) as SearchResponse;
      setProducts(payload.items ?? []);
      setTotal(payload.total ?? 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить каталог");
    } finally {
      setLoading(false);
    }
  }, [submittedQuery]);

  useEffect(() => { void loadCatalog(""); }, [loadCatalog]);

  const submitSearch = (value = query) => {
    setSubmittedQuery(value);
    void loadCatalog(value);
  };

  const addToCart = (product: Product) => {
    setCartProducts((current) => ({ ...current, [product.id]: product }));
    setCart((current) => ({ ...current, [product.id]: (current[product.id] ?? 0) + 1 }));
  };

  const changeQuantity = (productId: string, delta: number) => {
    setCart((current) => {
      const nextQuantity = (current[productId] ?? 0) + delta;
      if (nextQuantity <= 0) {
        const next = { ...current };
        delete next[productId];
        setCartProducts((items) => {
          const nextItems = { ...items };
          delete nextItems[productId];
          return nextItems;
        });
        return next;
      }
      return { ...current, [productId]: nextQuantity };
    });
  };

  const toggleFavorite = (product: Product) => setFavorites((current) => {
    const next = { ...current };
    if (next[product.id]) delete next[product.id]; else next[product.id] = product;
    return next;
  });

  if (screen === "checkout") {
    return <SafeAreaView style={styles.safe}><StatusBar style="dark" /><View style={styles.header}><View><Text style={styles.logo}>DM</Text><Text style={styles.brand}>Оформление</Text><Text style={styles.subtitle}>Шаг 1 из 2 · демо-заказ</Text></View><Pressable onPress={() => setScreen("cart")}><Text style={styles.backText}>Назад</Text></Pressable></View><ScrollView contentContainerStyle={styles.cartScreen}><Text style={styles.heroKicker}>ДЕМО CHECKOUT</Text><Text style={styles.detailTitle}>Куда доставить?</Text><Text style={styles.muted}>Город и условия будут привязаны к организации клиники после входа.</Text><View style={styles.checkoutField}><Text style={styles.fieldLabel}>ГОРОД</Text><Text style={styles.fieldValue}>{city}</Text></View><View style={styles.checkoutField}><Text style={styles.fieldLabel}>ОРГАНИЗАЦИЯ</Text><Text style={styles.fieldValue}>Demo Dental Clinic</Text><Text style={styles.muted}>Профиль клиники будет выбран после авторизации</Text></View><View style={styles.infoCard}><Text style={styles.infoLabel}>КОРЗИНА</Text><Text style={styles.emptyTitle}>{cartCount} поз. · поставщик подтвердит наличие</Text><Text style={styles.muted}>Сейчас это демонстрационный заказ: деньги не списываются.</Text></View><Pressable onPress={() => { setCart({}); setCartProducts({}); setScreen("catalog"); }} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Создать демо-заказ</Text></Pressable></ScrollView><BottomNav screen={screen} cartCount={cartCount} onChange={setScreen} /></SafeAreaView>;
  }

  if (screen === "cart") {
    const items = Object.keys(cart).map((id) => cartProducts[id]).filter(Boolean);
    return <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}><View><Text style={styles.logo}>DM</Text><Text style={styles.brand}>Корзина</Text><Text style={styles.subtitle}>Демо-режим закупки</Text></View><Pressable onPress={() => setScreen("catalog")}><Text style={styles.backText}>Каталог</Text></Pressable></View>
      <ScrollView contentContainerStyle={styles.cartScreen}><Text style={styles.heroKicker}>ПРОВЕРКА ЗАКУПКИ</Text><Text style={styles.detailTitle}>Ваша корзина</Text><Text style={styles.muted}>{cartCount ? `${cartCount} шт. · данные сохраняются в демо-сессии` : "Пока ничего не добавлено"}</Text>
        {!items.length ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Корзина пока пустая</Text><Text style={styles.muted}>Добавьте товары из каталога — здесь появятся количество, упаковка и поставщик.</Text><Pressable onPress={() => setScreen("catalog")} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Перейти в каталог</Text></Pressable></View> : items.map((item) => <View key={item.id} style={styles.cartItem}><View style={styles.cartItemImage}>{productImage(item) ? <Image source={{ uri: productImage(item)! }} style={styles.cartImage} resizeMode="contain" /> : null}</View><View style={styles.cartItemBody}><Text style={styles.productName}>{item.name}</Text><Text style={styles.muted}>{formatPrice(item.offers?.[0]?.priceMinor, item.offers?.[0]?.currency)}</Text><View style={styles.quantityRow}><Pressable onPress={() => changeQuantity(item.id, -1)} style={styles.quantityButton}><Text style={styles.quantityButtonText}>−</Text></Pressable><Text style={styles.quantity}>{cart[item.id]}</Text><Pressable onPress={() => changeQuantity(item.id, 1)} style={styles.quantityButton}><Text style={styles.quantityButtonText}>+</Text></Pressable></View></View></View>)}
        {items.length ? <View style={styles.infoCard}><Text style={styles.infoLabel}>СЛЕДУЮЩИЙ ШАГ</Text><Text style={styles.emptyTitle}>Заказ в демо-режиме</Text><Text style={styles.muted}>Реальное оформление станет доступно после входа клиники, активного договора и подключения поставщика.</Text><Pressable onPress={() => setScreen("checkout")} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Оформить демо-заказ</Text></Pressable><Pressable onPress={() => { setCart({}); setCartProducts({}); }} style={styles.outlineButton}><Text style={styles.outlineButtonText}>Очистить корзину</Text></Pressable></View> : null}
      </ScrollView><BottomNav screen={screen} cartCount={cartCount} onChange={setScreen} />
    </SafeAreaView>;
  }

  if (screen === "profile") {
    return <SafeAreaView style={styles.safe}><StatusBar style="dark" /><View style={styles.header}><View><Text style={styles.logo}>DM</Text><Text style={styles.brand}>Профиль клиники</Text><Text style={styles.subtitle}>DentMarket Kazakhstan</Text></View></View><ScrollView contentContainerStyle={styles.cartScreen}><Text style={styles.heroKicker}>КАБИНЕТ КЛИНИКИ</Text><Text style={styles.detailTitle}>Покупайте уверенно</Text><Text style={styles.description}>В мобильном приложении будут доступны заказы, документы, персональные цены и уведомления поставщиков.</Text><View style={styles.profileCard}><Text style={styles.profileIcon}>DC</Text><View><Text style={styles.emptyTitle}>Demo Dental Clinic</Text><Text style={styles.muted}>Покупатель · Алматы</Text></View></View>{["Вход и организация", "Документы и договор ЭЦП", "Уведомления", "Помощь"].map((label) => <Pressable key={label} style={styles.profileRow} onPress={() => setScreen("catalog")}><Text style={styles.profileRowText}>{label}</Text><Text style={styles.profileArrow}>›</Text></Pressable>)}</ScrollView><BottomNav screen={screen} cartCount={cartCount} onChange={setScreen} /></SafeAreaView>;
  }

  if (selected) {
    const quantity = cart[selected.id] ?? 0;
    const offer = selected.offers?.find((item) => item.available) ?? selected.offers?.[0];
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.detailScroll}>
          <Pressable onPress={() => setSelected(null)} style={styles.back}><Text style={styles.backText}>‹  Вернуться в каталог</Text></Pressable>
          {productImage(selected) ? <Image source={{ uri: productImage(selected)! }} style={styles.detailImage} resizeMode="contain" /> : <View style={styles.detailImagePlaceholder}><Text style={styles.placeholderText}>Фото добавляем</Text></View>}
          <View style={styles.detailMeta}><Text style={styles.eyebrow}>{selected.category ?? "СТОМАТОЛОГИЧЕСКИЕ МАТЕРИАЛЫ"}</Text><Pressable onPress={() => toggleFavorite(selected)}><Text style={styles.favorite}>{favorites[selected.id] ? "♥" : "♡"}</Text></Pressable></View>
          <Text style={styles.detailTitle}>{selected.name}</Text>
          <Text style={styles.muted}>{[selected.brand, selected.manufacturer].filter(Boolean).join(" · ")}</Text>
          <Text style={styles.description}>{selected.description || "Характеристики товара и предложения поставщиков."}</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>ЛУЧШЕЕ ПРЕДЛОЖЕНИЕ</Text>
            <Text style={styles.price}>{formatPrice(offer?.priceMinor, offer?.currency)}</Text>
            <Text style={styles.muted}>{offer?.supplier?.name ?? "Пока без предложения"}{offer?.packaging?.name ? ` · ${offer.packaging.name}` : ""}</Text>
          </View>
          <Pressable onPress={() => addToCart(selected)} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{quantity ? `В корзине · ${quantity}` : "Добавить в корзину"}</Text></Pressable>
          {selected.variants?.length ? <View style={styles.infoCard}><Text style={styles.infoLabel}>ВАРИАНТЫ</Text>{selected.variants.slice(0, 8).map((variant) => <Text key={variant.id} style={styles.variant}>{variant.label || variant.sku || "Вариант товара"}</Text>)}</View> : null}
        </ScrollView>
        {cartCount > 0 ? <View style={styles.cartBar}><Text style={styles.cartBarText}>Корзина · {cartCount}</Text><Pressable onPress={() => setSelected(null)}><Text style={styles.cartLink}>Продолжить покупки</Text></Pressable></View> : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}><View><Text style={styles.logo}>DM</Text><Text style={styles.brand}>DentMarket</Text><Text style={styles.subtitle}>Закупки для стоматологий</Text></View><Pressable onPress={() => setScreen("cart")} style={styles.cartBadge}><Text style={styles.cartBadgeText}>{cartCount}</Text><Text style={styles.cartCaption}>корзина</Text></Pressable></View>
      <FlatList
        data={visibleProducts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<View><Text style={styles.heroKicker}>B2B ЗАКУПКИ</Text><Text style={styles.heroTitle}>Всё для клиники — в одном месте</Text><Text style={styles.heroDescription}>Ищите материалы по названию, бренду, артикулу и привычному сленгу стоматологов.</Text><Pressable onPress={() => setCityOpen((value) => !value)} style={styles.cityButton}><Text style={styles.cityButtonText}>⌖  Доставка в {city}</Text><Text style={styles.cityButtonArrow}>{cityOpen ? "⌃" : "⌄"}</Text></Pressable>{cityOpen ? <View style={styles.cityPanel}>{["Алматы", "Астана", "Шымкент", "Караганда"].map((option) => <Pressable key={option} onPress={() => { setCity(option); setCityOpen(false); }} style={styles.cityOption}><Text style={styles.cityOptionText}>{option}</Text>{city === option ? <Text style={styles.cityCheck}>✓</Text> : null}</Pressable>)}</View> : null}<View style={styles.searchRow}><TextInput value={query} onChangeText={setQuery} onSubmitEditing={() => submitSearch()} placeholder="Например: текучка, гутта, перчатки" placeholderTextColor="#82908a" style={styles.searchInput} returnKeyType="search"/><Pressable onPress={() => submitSearch()} style={styles.searchButton}><Text style={styles.searchButtonText}>Найти</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{suggestedQueries.map((item) => <Pressable key={item} onPress={() => { setQuery(item); submitSearch(item); }} style={styles.chip}><Text style={styles.chipText}>{item}</Text></Pressable>)}</ScrollView><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{["Все", "Расходные", "Инструменты", "Оборудование", "Эндодонтия"].map((item) => <Pressable key={item} onPress={() => setCategoryFilter(item)} style={[styles.chip, categoryFilter === item && styles.chipActive]}><Text style={[styles.chipText, categoryFilter === item && styles.chipTextActive]}>{item}</Text></Pressable>)}<Pressable onPress={() => setOnlyAvailable((value) => !value)} style={[styles.chip, onlyAvailable && styles.chipActive]}><Text style={[styles.chipText, onlyAvailable && styles.chipTextActive]}>В наличии</Text></Pressable></ScrollView><View style={styles.resultHeader}><Text style={styles.resultCount}>{loading ? "Загружаем каталог…" : `${visibleProducts.length} из ${total} товаров`}</Text>{submittedQuery ? <Pressable onPress={() => { setQuery(""); setSubmittedQuery(""); void loadCatalog(""); }}><Text style={styles.clear}>Сбросить</Text></Pressable> : null}</View>{error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => void loadCatalog()}><Text style={styles.retry}>Повторить</Text></Pressable></View> : null}</View>}
        ListEmptyComponent={loading ? <ActivityIndicator color="#176b56" size="large" style={styles.loader} /> : null}
        renderItem={({ item }) => <Pressable onPress={() => setSelected(item)} style={styles.productCard}><View style={styles.productImageWrap}>{productImage(item) ? <Image source={{ uri: productImage(item)! }} style={styles.productImage} resizeMode="contain" /> : <Text style={styles.placeholderText}>Фото добавляем</Text>}</View><View style={styles.productBody}><View style={styles.productTitleRow}><Text style={styles.productCategory}>{item.category ?? "СТОМАТОЛОГИЧЕСКИЕ МАТЕРИАЛЫ"}</Text><Pressable onPress={() => toggleFavorite(item)}><Text style={styles.favorite}>{favorites[item.id] ? "♥" : "♡"}</Text></Pressable></View><Text style={styles.productName}>{item.name}</Text><Text style={styles.muted}>{[item.brand, item.manufacturer].filter(Boolean).join(" · ") || "Поставщик уточняется"}</Text><Text style={styles.productPrice}>{formatPrice(item.offers?.find((offer) => offer.available)?.priceMinor ?? item.offers?.[0]?.priceMinor, item.offers?.[0]?.currency)}</Text><Pressable onPress={() => addToCart(item)} style={styles.outlineButton}><Text style={styles.outlineButtonText}>{cart[item.id] ? `В корзине · ${cart[item.id]}` : "В корзину"}</Text></Pressable></View></Pressable>}
      />
      <BottomNav screen={screen} cartCount={cartCount} onChange={setScreen} />
    </SafeAreaView>
  );
}

function BottomNav({ screen, cartCount, onChange }: { screen: "catalog" | "cart" | "profile" | "checkout"; cartCount: number; onChange: (screen: "catalog" | "cart" | "profile" | "checkout") => void }) {
  return <View style={styles.bottomNav}><Pressable onPress={() => onChange("catalog")} style={styles.navItem}><Text style={[styles.navIcon, screen === "catalog" && styles.navActive]}>⌂</Text><Text style={[styles.navLabel, screen === "catalog" && styles.navActive]}>Каталог</Text></Pressable><Pressable onPress={() => onChange("cart")} style={styles.navItem}><Text style={[styles.navIcon, screen === "cart" && styles.navActive]}>▢</Text><Text style={[styles.navLabel, screen === "cart" && styles.navActive]}>Корзина{cartCount ? ` · ${cartCount}` : ""}</Text></Pressable><Pressable onPress={() => onChange("profile")} style={styles.navItem}><Text style={[styles.navIcon, screen === "profile" && styles.navActive]}>◉</Text><Text style={[styles.navLabel, screen === "profile" && styles.navActive]}>Профиль</Text></Pressable></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f7f4" },
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, backgroundColor: "#fff", flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#e4ebe6" },
  logo: { position: "absolute", color: "#fff", backgroundColor: "#176b56", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 7, fontWeight: "800", fontSize: 15, overflow: "hidden" },
  brand: { marginLeft: 54, color: "#17332a", fontSize: 19, fontWeight: "800" },
  subtitle: { marginLeft: 54, color: "#7b8982", fontSize: 11, marginTop: 2 },
  cartBadge: { alignItems: "center", backgroundColor: "#e8f2ed", borderRadius: 14, minWidth: 54, paddingVertical: 6 },
  cartBadgeText: { color: "#176b56", fontSize: 17, fontWeight: "800" }, cartCaption: { color: "#5e7469", fontSize: 10 },
  list: { padding: 18, paddingBottom: 40 }, heroKicker: { color: "#176b56", fontSize: 12, letterSpacing: 1.5, fontWeight: "800", marginTop: 6 }, heroTitle: { color: "#14261f", fontSize: 35, lineHeight: 39, fontWeight: "800", marginTop: 10 }, heroDescription: { color: "#6a7b72", fontSize: 15, lineHeight: 22, marginTop: 12, marginBottom: 18 },
  searchRow: { backgroundColor: "#fff", borderRadius: 16, padding: 6, flexDirection: "row", borderWidth: 1, borderColor: "#d9e5df" }, searchInput: { flex: 1, paddingHorizontal: 12, color: "#17332a", fontSize: 15 }, searchButton: { backgroundColor: "#176b56", paddingHorizontal: 18, borderRadius: 11, justifyContent: "center" }, searchButtonText: { color: "#fff", fontWeight: "800" }, chips: { gap: 8, paddingVertical: 14 }, chip: { backgroundColor: "#e8f2ed", borderRadius: 20, paddingHorizontal: 13, paddingVertical: 8 }, chipText: { color: "#176b56", fontWeight: "700" }, resultHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 }, resultCount: { color: "#17332a", fontSize: 18, fontWeight: "800" }, clear: { color: "#176b56", fontWeight: "700" }, error: { backgroundColor: "#fff0ed", padding: 12, borderRadius: 12, marginBottom: 12 }, errorText: { color: "#9b3e32" }, retry: { color: "#9b3e32", fontWeight: "800", marginTop: 6 }, loader: { marginTop: 30 },
  productCard: { backgroundColor: "#fff", borderRadius: 18, marginBottom: 14, overflow: "hidden", borderWidth: 1, borderColor: "#e0e9e3" }, productImageWrap: { height: 190, backgroundColor: "#f8faf8", justifyContent: "center", alignItems: "center", padding: 18 }, productImage: { width: "100%", height: "100%" }, placeholderText: { color: "#91a098", fontWeight: "700" }, productBody: { padding: 16 }, productCategory: { color: "#176b56", fontSize: 10, letterSpacing: 1, fontWeight: "800" }, productName: { color: "#14261f", fontSize: 19, lineHeight: 23, fontWeight: "800", marginTop: 6 }, muted: { color: "#708078", fontSize: 13, marginTop: 6 }, productPrice: { color: "#14261f", fontSize: 18, fontWeight: "800", marginTop: 14 }, outlineButton: { borderColor: "#176b56", borderWidth: 1, borderRadius: 10, alignItems: "center", paddingVertical: 11, marginTop: 13 }, outlineButtonText: { color: "#176b56", fontWeight: "800" },
  detailScroll: { padding: 18, paddingBottom: 110 }, back: { paddingVertical: 8, marginBottom: 12 }, backText: { color: "#176b56", fontWeight: "800", fontSize: 15 }, detailImage: { width: "100%", height: 280, backgroundColor: "#fff", borderRadius: 18 }, detailImagePlaceholder: { width: "100%", height: 280, backgroundColor: "#fff", borderRadius: 18, justifyContent: "center", alignItems: "center" }, eyebrow: { color: "#176b56", fontSize: 11, letterSpacing: 1.2, fontWeight: "800", marginTop: 22 }, detailMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }, favorite: { color: "#176b56", fontSize: 26 }, detailTitle: { color: "#14261f", fontSize: 32, lineHeight: 36, fontWeight: "800", marginTop: 8 }, description: { color: "#66766e", fontSize: 15, lineHeight: 23, marginTop: 18 }, infoCard: { backgroundColor: "#e8f2ed", borderRadius: 16, padding: 16, marginTop: 18 }, infoLabel: { color: "#176b56", fontSize: 11, letterSpacing: 1.2, fontWeight: "800" }, price: { color: "#14261f", fontSize: 24, fontWeight: "800", marginTop: 8 }, variant: { color: "#17332a", fontSize: 14, paddingTop: 10 }, primaryButton: { backgroundColor: "#176b56", borderRadius: 13, paddingVertical: 15, alignItems: "center", marginTop: 18 }, primaryButtonText: { color: "#fff", fontWeight: "800", fontSize: 16 }, cartBar: { position: "absolute", left: 14, right: 14, bottom: 14, backgroundColor: "#14261f", borderRadius: 16, padding: 15, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, cartBarText: { color: "#fff", fontWeight: "800" }, cartLink: { color: "#9ce0c3", fontWeight: "700" }, bottomNav: { flexDirection: "row", backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#e0e9e3", paddingTop: 8, paddingBottom: 8 }, navItem: { flex: 1, alignItems: "center", gap: 2 }, navIcon: { color: "#81918a", fontSize: 19 }, navLabel: { color: "#81918a", fontSize: 11, fontWeight: "700" }, navActive: { color: "#176b56" }, cartScreen: { padding: 20, paddingBottom: 100 }, emptyCard: { backgroundColor: "#fff", borderRadius: 18, padding: 18, marginTop: 24, borderWidth: 1, borderColor: "#e0e9e3" }, emptyTitle: { color: "#17332a", fontSize: 17, fontWeight: "800", marginTop: 7 }, cartItem: { backgroundColor: "#fff", borderRadius: 16, padding: 12, marginTop: 12, flexDirection: "row", borderWidth: 1, borderColor: "#e0e9e3" }, cartItemImage: { width: 78, height: 78, backgroundColor: "#f5f7f4", borderRadius: 12, justifyContent: "center", alignItems: "center" }, cartImage: { width: 70, height: 70 }, cartItemBody: { flex: 1, paddingLeft: 12 }, quantityRow: { flexDirection: "row", alignItems: "center", marginTop: 10 }, quantityButton: { borderWidth: 1, borderColor: "#b8ccc1", borderRadius: 8, width: 30, height: 30, justifyContent: "center", alignItems: "center" }, quantityButtonText: { color: "#176b56", fontSize: 20, lineHeight: 22 }, quantity: { width: 38, textAlign: "center", color: "#17332a", fontWeight: "800" }, profileCard: { backgroundColor: "#e8f2ed", borderRadius: 18, padding: 16, marginTop: 24, flexDirection: "row", alignItems: "center" }, profileIcon: { color: "#176b56", backgroundColor: "#fff", borderRadius: 30, padding: 12, fontWeight: "800", marginRight: 12 }, profileRow: { backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e0e9e3", paddingVertical: 18, flexDirection: "row", justifyContent: "space-between" }, profileRowText: { color: "#17332a", fontWeight: "700", fontSize: 15 }, profileArrow: { color: "#176b56", fontSize: 22 }, cityButton: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#d9e5df", padding: 13, marginBottom: 8, flexDirection: "row", justifyContent: "space-between" }, cityButtonText: { color: "#176b56", fontWeight: "800" }, cityButtonArrow: { color: "#176b56", fontWeight: "800" }, cityPanel: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#d9e5df", marginBottom: 8 }, cityOption: { padding: 13, borderBottomWidth: 1, borderBottomColor: "#edf1ee", flexDirection: "row", justifyContent: "space-between" }, cityOptionText: { color: "#17332a", fontWeight: "700" }, cityCheck: { color: "#176b56", fontWeight: "800" }, chipActive: { backgroundColor: "#176b56" }, chipTextActive: { color: "#fff" }, productTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, checkoutField: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#d9e5df", padding: 15, marginTop: 14 }, fieldLabel: { color: "#176b56", fontSize: 10, letterSpacing: 1.2, fontWeight: "800" }, fieldValue: { color: "#17332a", fontSize: 17, fontWeight: "800", marginTop: 6 }
});
