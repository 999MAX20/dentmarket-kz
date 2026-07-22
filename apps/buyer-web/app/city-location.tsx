"use client";

import { useEffect, useState } from "react";
import styles from "./city-location.module.css";

const STORAGE_KEY = "dentmarket:city";
type City = { id: string | null; name: string };
const fallbackCities: City[] = ["Алматы", "Астана", "Шымкент", "Караганда", "Актобе", "Тараз", "Павлодар", "Усть-Каменогорск", "Костанай", "Кызылорда", "Уральск", "Атырау", "Актау", "Петропавловск", "Семей"].map((name) => ({ id: null, name }));
const fromCoordinates = (latitude: number, longitude: number) => {
  if (latitude > 43.0 && latitude < 43.5 && longitude > 76.5 && longitude < 77.5) return "Алматы";
  if (latitude > 51.0 && latitude < 51.5 && longitude > 70.3 && longitude < 71.8) return "Астана";
  if (latitude > 42.1 && latitude < 42.5 && longitude > 68.3 && longitude < 69.0) return "Шымкент";
  if (latitude > 49.6 && latitude < 50.0 && longitude > 72.8 && longitude < 73.5) return "Караганда";
  if (latitude > 50.1 && latitude < 50.5 && longitude > 57.0 && longitude < 58.0) return "Актобе";
  return null;
};

export function CityLocation() {
  const [city, setCity] = useState<string | null>(null);
  const [cityId, setCityId] = useState<string | null>(null);
  const [cityList, setCityList] = useState<City[]>(fallbackCities);
  const [candidate, setCandidate] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) { try { const parsed = JSON.parse(saved) as City; if (parsed.name) { setCity(parsed.name); setCityId(parsed.id ?? null); return; } } catch { if (fallbackCities.some(({ name }) => name === saved)) { setCity(saved); } } }
    void fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "https://dentmarket-api.vercel.app/api"}/catalog/cities`, { cache: "no-store", signal: AbortSignal.timeout(2500) }).then((response) => response.ok ? response.json() as Promise<Array<{ id: string; nameRu: string }>> : []).then((items) => { if (items.length) setCityList(items.map((item) => ({ id: item.id, name: item.nameRu }))); }).catch(() => undefined);
    if (!navigator.geolocation) { setOpen(true); return; }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setCandidate(fromCoordinates(coords.latitude, coords.longitude)); setDetecting(false); setOpen(true); },
      () => { setDetecting(false); setOpen(true); },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 86_400_000 },
    );
  }, []);

  const choose = (next: string) => { const selected = cityList.find(({ name }) => name === next) ?? { id: null, name: next }; window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selected)); setCity(selected.name); setCityId(selected.id); setCandidate(null); setOpen(false); window.dispatchEvent(new CustomEvent("dentmarket:city-changed", { detail: selected })); };
  return <div className={styles.wrap}>
    <button className={styles.current} type="button" onClick={() => setOpen(true)} aria-label="Выбрать город"><span className={styles.pin}>⌖</span><span>{detecting ? "Определяем город…" : city ?? "Выберите город"}</span><span className={styles.chevron}>⌄</span></button>
    {open ? <div className={styles.popover} role="dialog" aria-label="Выбор города"><div className={styles.title}>{candidate ? `Ваш город — ${candidate}?` : city ? `Доставляем в город ${city}` : "В каком вы городе?"}</div><p className={styles.copy}>{candidate ? "Покажем наличие, склад и условия доставки для вашего города." : "Выберите город, чтобы видеть актуальные условия доставки."}</p>{candidate ? <div className={styles.actions}><button className={styles.primary} type="button" onClick={() => choose(candidate)}>Да, верно</button><button className={styles.secondary} type="button" onClick={() => setCandidate(null)}>Выбрать другой</button></div> : <select className={styles.select} value={city ?? ""} onChange={(event) => event.target.value && choose(event.target.value)}><option value="">Выберите город</option>{cityList.map((item) => <option key={item.id ?? item.name} value={item.name}>{item.name}</option>)}</select>}<button className={styles.close} type="button" onClick={() => setOpen(false)}>Не сейчас</button></div> : null}
  </div>;
}
