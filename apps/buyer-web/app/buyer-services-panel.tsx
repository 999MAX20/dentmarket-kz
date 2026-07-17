"use client";

import { Button, Field, Input, Select, Spinner, Textarea } from "@fluentui/react-components";
import { MarketplaceApiClient, type ApiContext } from "@marketplace/api-client";
import { EmptyState, ErrorState, PageHeader, Section, StatusTag, errorMessage, formatDate, formatMoney, formatStatus } from "@marketplace/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./buyer-services-panel.module.css";

const BUYER_ID = "00000000-0000-4000-8000-000000000030";
const BUYER_USER_ID = "00000000-0000-4000-8000-000000000500";

type Dashboard = { pendingOrders: number; savedLists: number; month: { orderCount: number; spendMinor: string; currency: string }; budgets: Budget[] };
type SavedList = { id: string; name: string; isDefault: boolean; items: Array<{ id: string; offerId: string; quantity: string }> };
type CostCenter = { id: string; code: string; name: string; status: string };
type Budget = { id: string; name: string; limitMinor: string; spentMinor: string; currency: string; periodStart: string; periodEnd: string; status: string };
type Ticket = { id: string; number: string; subject: string; status: string; priority: string; firstResponseDueAt: string | null; resolutionDueAt: string | null; updatedAt: string };
type Conversation = { id: string; title: string | null; updatedAt: string };
type AiMessage = { id: string; role: string; content: string; createdAt: string };

export function BuyerServicesPanel({ mode, buyerId = BUYER_ID, apiContext }: { mode: "workspace" | "support" | "assistant"; buyerId?: string; apiContext?: ApiContext }) {
  const api = useMemo(() => new MarketplaceApiClient(process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api", apiContext ?? { actorId: BUYER_USER_ID, organizationId: buyerId }), [apiContext, buyerId]);
  if (mode === "workspace") return <ProcurementWorkspace api={api} />;
  if (mode === "support") return <SupportWorkspace api={api} />;
  return <AssistantWorkspace api={api} />;
}

function ProcurementWorkspace({ api }: { api: MarketplaceApiClient }) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [lists, setLists] = useState<SavedList[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [listName, setListName] = useState("");
  const [center, setCenter] = useState({ code: "", name: "" });
  const [budget, setBudget] = useState({ name: "Расходные материалы", limit: "500000", costCenterId: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextDashboard, nextLists, nextCenters, nextBudgets] = await Promise.all([api.get<Dashboard>("/owner/buyer/dashboard"), api.get<SavedList[]>("/owner/saved-lists"), api.get<CostCenter[]>("/owner/cost-centers"), api.get<Budget[]>("/owner/budgets")]);
      setDashboard(nextDashboard); setLists(nextLists); setCostCenters(nextCenters); setBudgets(nextBudgets);
    } catch (cause) { setError(errorMessage(cause)); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);
  const createList = async () => { if (!listName.trim()) return; setBusy("list"); try { await api.post("/owner/saved-lists", { name: listName, isDefault: lists.length === 0 }); setListName(""); await load(); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(null); } };
  const createCenter = async () => { if (!center.code.trim() || !center.name.trim()) return; setBusy("center"); try { await api.post("/owner/cost-centers", center); setCenter({ code: "", name: "" }); await load(); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(null); } };
  const createBudget = async () => { setBusy("budget"); const start = new Date(); const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1); try { await api.post("/owner/budgets", { name: budget.name, costCenterId: budget.costCenterId || null, periodStart: start.toISOString(), periodEnd: end.toISOString(), limitMinor: Math.round(Number(budget.limit) * 100), currency: "KZT" }); await load(); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(null); } };
  if (!dashboard && !error) return <div className={styles.loading}><Spinner label="Загружаем рабочее пространство закупок" /></div>;
  if (error && !dashboard) return <ErrorState description={error} action={<Button onClick={() => void load()}>Повторить</Button>} />;
  return <div className={styles.stack}>
    <PageHeader eyebrow="Управление закупками" title="Списки и бюджеты" description="Повторяющиеся закупки, центры затрат и лимиты клиники собраны в одном рабочем пространстве." />
    {error ? <div className={styles.error}>{error}</div> : null}
    <div className={styles.metrics}><Metric label="Расходы за месяц" value={formatMoney(dashboard?.month.spendMinor ?? 0, "KZT")} detail={`${dashboard?.month.orderCount ?? 0} заказов`} /><Metric label="Активные заказы" value={String(dashboard?.pendingOrders ?? 0)} detail="В исполнении" /><Metric label="Сохранённые списки" value={String(lists.length)} detail="Для быстрого повтора" /></div>
    <div className={styles.columns}>
      <Section title="Сохранённые списки" description="Создайте шаблон регулярной закупки."><div className={styles.form}><Field label="Название списка"><Input value={listName} onChange={(_, data) => setListName(data.value)} placeholder="Еженедельные расходники" /></Field><Button appearance="primary" disabled={busy === "list" || !listName.trim()} onClick={() => void createList()}>Создать</Button></div>{lists.length ? <div className={styles.rows}>{lists.map((list) => <div className={styles.row} key={list.id}><div><strong>{list.name}</strong><small>{list.items.length} позиций</small></div>{list.isDefault ? <StatusTag tone="info">Основной</StatusTag> : null}</div>)}</div> : <EmptyState title="Списков пока нет" description="Создайте первый список для повторных закупок." />}</Section>
      <Section title="Центры затрат" description="Разделяйте закупки по филиалам и кабинетам."><div className={styles.formGrid}><Field label="Код"><Input value={center.code} onChange={(_, data) => setCenter((value) => ({ ...value, code: data.value }))} placeholder="ALM-01" /></Field><Field label="Название"><Input value={center.name} onChange={(_, data) => setCenter((value) => ({ ...value, name: data.value }))} placeholder="Филиал Алматы" /></Field><Button appearance="primary" disabled={busy === "center" || !center.code || !center.name} onClick={() => void createCenter()}>Добавить</Button></div><div className={styles.rows}>{costCenters.map((item) => <div className={styles.row} key={item.id}><div><strong>{item.name}</strong><small>{item.code}</small></div><StatusTag tone="success">{formatStatus(item.status)}</StatusTag></div>)}</div></Section>
    </div>
    <Section title="Бюджет закупок" description="Лимит на следующий месячный период."><div className={styles.budgetForm}><Field label="Название"><Input value={budget.name} onChange={(_, data) => setBudget((value) => ({ ...value, name: data.value }))} /></Field><Field label="Центр затрат"><Select value={budget.costCenterId} onChange={(_, data) => setBudget((value) => ({ ...value, costCenterId: data.value }))}><option value="">Общий бюджет</option>{costCenters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field><Field label="Лимит, ₸"><Input type="number" min="0" value={budget.limit} onChange={(_, data) => setBudget((value) => ({ ...value, limit: data.value }))} /></Field><Button appearance="primary" disabled={busy === "budget" || !budget.name || Number(budget.limit) <= 0} onClick={() => void createBudget()}>Установить лимит</Button></div><div className={styles.rows}>{budgets.map((item) => <div className={styles.row} key={item.id}><div><strong>{item.name}</strong><small>{formatDate(item.periodStart)} — {formatDate(item.periodEnd)}</small></div><div className={styles.money}><strong>{formatMoney(item.limitMinor, item.currency)}</strong><small>использовано {formatMoney(item.spentMinor, item.currency)}</small></div></div>)}</div></Section>
  </div>;
}

function SupportWorkspace({ api }: { api: MarketplaceApiClient }) {
  const [tickets, setTickets] = useState<Ticket[]>([]); const [subject, setSubject] = useState(""); const [description, setDescription] = useState(""); const [priority, setPriority] = useState("NORMAL"); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { setLoading(true); try { setTickets(await api.get<Ticket[]>("/support/tickets")); setError(null); } catch (cause) { setError(errorMessage(cause)); } finally { setLoading(false); } }, [api]);
  useEffect(() => { void load(); }, [load]);
  const create = async () => { setBusy(true); try { await api.post("/support/tickets", { subject, description, category: "PROCUREMENT", priority, links: [] }); setSubject(""); setDescription(""); await load(); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); } };
  return <div className={styles.stack}><PageHeader eyebrow="Сервис" title="Поддержка" description="Обращения привязаны к организации, имеют SLA и сохраняют всю переписку." />{error ? <div className={styles.error}>{error}</div> : null}<div className={styles.columns}><Section title="Новое обращение" description="Опишите проблему — команда увидит её в очереди SLA."><div className={styles.ticketForm}><Field label="Тема"><Input value={subject} onChange={(_, data) => setSubject(data.value)} /></Field><Field label="Приоритет"><Select value={priority} onChange={(_, data) => setPriority(data.value)}><option value="NORMAL">Обычный</option><option value="HIGH">Высокий</option><option value="URGENT">Срочный</option><option value="LOW">Низкий</option></Select></Field><Field label="Описание"><Textarea rows={6} value={description} onChange={(_, data) => setDescription(data.value)} /></Field><Button appearance="primary" disabled={busy || subject.trim().length < 4 || description.trim().length < 10} onClick={() => void create()}>{busy ? "Отправляем…" : "Создать обращение"}</Button></div></Section><Section title="Мои обращения" description="Актуальный статус и сроки реакции.">{loading ? <div className={styles.loading}><Spinner /></div> : tickets.length ? <div className={styles.rows}>{tickets.map((ticket) => <div className={styles.ticket} key={ticket.id}><div><small>{ticket.number}</small><strong>{ticket.subject}</strong><span>Обновлено {formatDate(ticket.updatedAt, true)}</span></div><div><StatusTag tone={ticket.status === "RESOLVED" || ticket.status === "CLOSED" ? "success" : ticket.priority === "URGENT" ? "danger" : "info"}>{formatStatus(ticket.status)}</StatusTag><small>{ticket.firstResponseDueAt ? `Ответ до ${formatDate(ticket.firstResponseDueAt, true)}` : "SLA рассчитан"}</small></div></div>)}</div> : <EmptyState title="Обращений нет" description="Новые обращения и ответы поддержки появятся здесь." />}</Section></div></div>;
}

function AssistantWorkspace({ api }: { api: MarketplaceApiClient }) {
  const [conversation, setConversation] = useState<Conversation | null>(null); const [messages, setMessages] = useState<AiMessage[]>([]); const [question, setQuestion] = useState("Покажи мои активные заказы"); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { setLoading(true); try { const conversations = await api.get<Conversation[]>("/ai/conversations"); const current = conversations[0] ?? await api.post<Conversation>("/ai/conversations", { role: "BUYER", title: "Помощник по закупкам" }); setConversation(current); setMessages(await api.get<AiMessage[]>(`/ai/conversations/${current.id}/messages`)); setError(null); } catch (cause) { setError(errorMessage(cause)); } finally { setLoading(false); } }, [api]);
  useEffect(() => { void load(); }, [load]);
  const send = async () => { if (!conversation || question.trim().length < 2) return; setBusy(true); try { await api.post(`/ai/conversations/${conversation.id}/messages`, { content: question, confirmedToolExecutionId: null }); setQuestion(""); setMessages(await api.get<AiMessage[]>(`/ai/conversations/${conversation.id}/messages`)); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); } };
  return <div className={styles.stack}><PageHeader eyebrow="Экспериментальная функция" title="AI-помощник по закупкам" description="Помощник видит только разрешённые данные вашей клиники, не получает прямого доступа к базе и подтверждает действия перед записью." />{error ? <div className={styles.error}>{error}</div> : null}<Section title={conversation?.title ?? "Диалог"} description="Не отправляйте пароли, ключи и медицинские данные пациентов.">{loading ? <div className={styles.loading}><Spinner label="Открываем защищённый диалог" /></div> : <><div className={styles.chat}>{messages.length ? messages.map((message) => <article key={message.id} data-role={message.role}><small>{message.role === "user" ? "Вы" : "DentMarket AI"}</small><p>{message.content}</p></article>) : <EmptyState title="Начните с вопроса" description="Например: покажи активные заказы или расходы за месяц." />}</div><div className={styles.composer}><Textarea rows={3} value={question} onChange={(_, data) => setQuestion(data.value)} placeholder="Спросите о заказах, бюджете или поставках" /><Button appearance="primary" disabled={busy || !conversation || question.trim().length < 2} onClick={() => void send()}>{busy ? "Проверяем данные…" : "Отправить"}</Button></div></>}</Section></div>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <article className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
