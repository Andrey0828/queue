"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown, Check, CheckCheck, ChevronDown, CircleHelp, Clock3, Copy, History, ListOrdered, LoaderCircle, LockKeyhole, LogOut, MoreHorizontal, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, Users, X } from "lucide-react";
import type { Entry, Queue, Snapshot } from "@/lib/types";
import { useQueue } from "./use-queue";

type Action = (payload: Record<string, unknown>, success?: string) => Promise<boolean>;
type Confirmation = { title: string; description: string; label: string; payload: Record<string, unknown>; success: string };
const formatDate = (date: string) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" }).format(new Date(date));
const formatTime = (date: string) => new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(new Date(date));
const people = (n: number) => n % 10 === 1 && n % 100 !== 11 ? "человек" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "человека" : "человек";

function Dialog({ title, children, close, locked = false }: { title: string; children: ReactNode; close: () => void; locked?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); dialog?.querySelector<HTMLInputElement>('input[autofocus]')?.focus(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="dialog" aria-labelledby="dialog-title" onCancel={e => { e.preventDefault(); if (!locked) close(); }} onClick={e => { if (e.target === e.currentTarget && !locked) close(); }}>
    <div className="dialog-content"><div className="section-heading"><h2 id="dialog-title">{title}</h2><button type="button" className="icon-button" aria-label="Закрыть" onClick={close} disabled={locked}><X size={20} /></button></div>{children}</div>
  </dialog>;
}

function ClassForm({ queue, act, disabled, onSaved }: { queue?: Queue; act: Action; disabled: boolean; onSaved?: () => void }) {
  const initialDate = queue ? queue.starts_at : new Date().toISOString();
  const moscowInput = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600000).toISOString().slice(0,16);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const date = new Date(`${form.get("startsAt")}:00+03:00`);
    if (Number.isNaN(date.getTime())) return;
    const ok = await act({ action: queue ? "edit" : "create", ...(queue ? { queueId: queue.id, revision: queue.revision } : {}), title: form.get("title"), startsAt: date.toISOString(), note: form.get("note") }, queue ? "Сведения о паре обновлены" : "Очередь создана. Запись доступна с указанного времени");
    if (ok) onSaved?.();
  }
  return <form onSubmit={submit} className="stack-form"><fieldset disabled={disabled}>
    <label>Предмет<input name="title" placeholder="Например, математический анализ" minLength={2} maxLength={100} defaultValue={queue?.title} required /></label>
    <label>Открытие записи <span className="label-hint">по Москве</span><input name="startsAt" type="datetime-local" defaultValue={moscowInput(initialDate)} required /></label>
    <label>Примечание <span className="label-hint">необязательно</span><textarea name="note" placeholder="Аудитория, номер работы или что подготовить" maxLength={300} rows={3} defaultValue={queue?.note} /></label>
    <button className="button primary full" type="submit">{disabled ? <LoaderCircle className="spin" size={18} /> : <Plus size={18} />}{queue ? "Сохранить изменения" : "Создать очередь"}</button>
  </fieldset></form>;
}

function Identity({ data, act, disabled }: { data: Snapshot; act: Action; disabled: boolean }) {
  const [editing, setEditing] = useState(false);
  const myEntry = data.entries.find(e => e.isMe);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (await act({ action: "register", name: form.get("name") }, "Имя сохранено")) setEditing(false);
  }
  if (data.member && !editing) return <div className="identity">
    <div className="avatar" aria-hidden="true">{data.member.name.split(" ").slice(0,2).map(p => p[0]).join("")}</div>
    <div className="identity-text"><span className="secondary">Вы вошли как</span><strong>{data.member.name}</strong></div>
    <button className="icon-button" title={myEntry ? "Имя нельзя изменить во время участия в паре" : "Изменить имя"} aria-label="Изменить имя" disabled={disabled || Boolean(myEntry)} onClick={() => setEditing(true)}><Pencil size={17} /></button>
  </div>;
  return <section className="identity-form"><h2>{editing ? "Ваше имя" : "Знакомимся — и в очередь"}</h2><p className="secondary">Введите фамилию и имя, чтобы группа узнала вас.</p>
    <form onSubmit={submit} className="stack-form"><fieldset disabled={disabled}>
      <label htmlFor="name">Фамилия и имя<input id="name" name="name" autoComplete="name" placeholder="Иванов Алексей" defaultValue={data.member?.name} minLength={2} maxLength={80} required /></label>
      <button className="button primary full" type="submit">{editing ? "Сохранить имя" : "Продолжить"}<ArrowRight size={18} /></button>
      {editing && <button type="button" className="button ghost full" onClick={() => setEditing(false)}>Отмена</button>}
    </fieldset></form>
    {!editing && <p className="small secondary">Без паролей и регистрации. Вход сохранится в этом браузере.</p>}
  </section>;
}

function RowControls({ entry, entries, queue, act, disabled, confirm }: { entry: Entry; entries: Entry[]; queue: Queue; act: Action; disabled: boolean; confirm: (c: Confirmation) => void }) {
  const [expanded, setExpanded] = useState(false);
  const base = { queueId: queue.id, revision: queue.revision, entryId: entry.id };
  return <>
    <div className="row-actions">
      <button className="icon-button" aria-label={`Поднять: ${entry.name}`} title="На место выше" disabled={disabled || entry.position === 1} onClick={() => act({ action: "move", ...base, position: entry.position - 1 }, "Участник перемещён")}><ArrowUp size={17} /></button>
      <button className="icon-button" aria-label={`Опустить: ${entry.name}`} title="На место ниже" disabled={disabled || entry.position === entries.length} onClick={() => act({ action: "move", ...base, position: entry.position + 1 }, "Участник перемещён")}><ArrowDown size={17} /></button>
      <button className={`icon-button ${expanded ? "selected" : ""}`} aria-label={`Управление: ${entry.name}`} aria-expanded={expanded} disabled={disabled} onClick={() => setExpanded(!expanded)}><MoreHorizontal size={20} /></button>
    </div>
    {expanded && <div className="row-editor">
      <form onSubmit={async e => { e.preventDefault(); const form = new FormData(e.currentTarget); if (await act({ action: "move", ...base, position: Number(form.get("position")) }, "Участник перемещён")) setExpanded(false); }}>
        <label htmlFor={`position-${entry.id}`}>На место</label><div className="input-action"><input id={`position-${entry.id}`} name="position" type="number" min={1} max={entries.length} defaultValue={entry.position} required disabled={disabled} /><button className="button secondary-button" disabled={disabled} type="submit">Перенести</button></div>
      </form>
      {entries.length > 1 && <form onSubmit={async e => { e.preventDefault(); const form = new FormData(e.currentTarget); if (await act({ action: "swap", ...base, otherId: form.get("otherId") }, "Участники поменялись местами")) setExpanded(false); }}>
        <label htmlFor={`swap-${entry.id}`}>Поменяться с</label><div className="input-action"><select id={`swap-${entry.id}`} name="otherId" required disabled={disabled} defaultValue=""><option value="" disabled>Выберите участника</option>{entries.filter(item => item.id !== entry.id).map(item => <option key={item.id} value={item.id}>{item.position}. {item.name}</option>)}</select><button className="button secondary-button" disabled={disabled} type="submit" title="Поменять местами"><ArrowUpDown size={18} /><span className="sr-only">Обменять</span></button></div>
      </form>}
      <button className="button danger-text" disabled={disabled} onClick={() => confirm({ title: "Убрать из очереди?", description: `${entry.name} потеряет текущее место. Остальные участники сдвинутся на одну позицию.`, label: "Убрать участника", payload: { action: "remove", ...base }, success: "Участник убран из очереди" })}><Trash2 size={17} />Убрать из очереди</button>
    </div>}
  </>;
}

export default function QueueApp({ configured, groupName }: { configured: boolean; groupName: string }) {
  const [tab, setTab] = useState<"queue" | "history">("queue");
  const [selectedQueue, setSelectedQueue] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const { data, error, busy, notice, lastUpdated, refresh, act, setNotice } = useQueue(configured, selectedQueue, offset);
  const [adminLogin, setAdminLogin] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [editingQueue, setEditingQueue] = useState(false);
  const [adding, setAdding] = useState(false);
  const queue = data?.queue;
  const registrationOpen = Boolean(queue?.registration_open);
  const scheduled = queue?.status === "open" && !registrationOpen;
  const opensMessage = queue ? `Запись откроется ${formatDate(queue.starts_at)} в ${formatTime(queue.starts_at)} по Москве автоматически.` : "";
  const waiting = data?.entries.filter(e => e.status === "waiting") ?? [];
  const completed = data?.entries.filter(e => e.status === "done").sort((a,b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? "")) ?? [];
  const me = data?.entries.find(e => e.isMe);
  const isArchive = queue?.status === "finished";
  const disabled = busy || Boolean(error);
  const admin = Boolean(data?.isAdmin);
  const base = { queueId: queue?.id, revision: queue?.revision };

  function requestConfirmation(value: Confirmation) { setNotice(""); setConfirmation(value); }

  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.origin); setNotice("Ссылка скопирована — отправьте её в беседу группы"); }
    catch { setNotice("Скопируйте ссылку из адресной строки браузера"); }
  }
  function changeTab(next: "queue" | "history") { setTab(next); setSelectedQueue(null); setEditingQueue(false); setAdding(false); }

  return <div className="app-shell">
    <a className="skip-link" href="#main">К очереди</a>
    <header className="site-header"><a className="brand" href="/" aria-label="Перед парой — на главную"><span className="brand-mark"><ListOrdered size={25} strokeWidth={2} /></span><span>перед парой<span className="brand-period">.</span></span></a><div className="header-end"><span className="group-name">{groupName}</span><button className="button ghost share-button" aria-label="Пригласить группу" onClick={copyLink}><Copy size={17} /><span>Пригласить группу</span></button></div></header>
    <div className="page-heading"><div><h1>Всё по очереди.</h1><p>Своё место — без сообщений в беседе.</p></div><span className="group-label"><Users size={17} />{groupName}</span></div>

    {!configured ? <main id="main" className="setup-panel"><div className="empty-symbol"><LockKeyhole size={30} /></div><h2>Осталось подключить базу</h2><p>Сайт готов к настройке. Администратору нужно выполнить <code>supabase/schema.sql</code> в Supabase и добавить переменные окружения в Vercel.</p><p>Пошаговая инструкция находится в файле <code>README.md</code> проекта. После настройки и повторного развёртывания здесь появится очередь.</p></main> : <>
      <nav className="tabs" aria-label="Разделы"><button className={tab === "queue" ? "active" : ""} aria-current={tab === "queue" ? "page" : undefined} disabled={busy} onClick={() => changeTab("queue")}><ListOrdered size={18} />Текущая очередь</button><button className={tab === "history" ? "active" : ""} aria-current={tab === "history" ? "page" : undefined} disabled={busy} onClick={() => changeTab("history")}><History size={18} />История пар</button><div className={`sync-state ${error ? "disconnected" : ""}`} title={lastUpdated ? `Последнее обновление: ${lastUpdated.toLocaleTimeString("ru-RU")}` : "Подключение"}>{error ? <RefreshCw size={14} /> : <span className="status-dot" />}<span>{error ? "Нет обновлений" : data ? "Обновляется автоматически" : "Подключаемся"}</span></div></nav>
      {error && <div className="error-banner" role="alert"><p>{error}</p><button className="button secondary-button" onClick={() => refresh(true)}><RefreshCw size={16} />Обновить</button></div>}
      {!data ? <main id="main" className="loading-panel" aria-busy={!error}><LoaderCircle size={26} className={error ? "" : "spin"} /><p>{error ? "Ожидаем подключения" : "Загружаем очередь…"}</p></main> : <div className="workspace">
        <main id="main" className="main-column">
          {tab === "history" && !selectedQueue ? <section className="queue-panel history-panel"><div className="panel-heading"><div><h2>Прошлые пары</h2><p className="secondary">Очереди сохраняются после завершения.</p></div><History size={23} className="muted-icon" /></div>
            {data.history.length === 0 ? <div className="empty-state"><History size={34} /><h3>История начнётся с первой пары</h3><p>Когда администратор завершит очередь, она появится здесь.</p></div> : <div className="history-list">{data.history.map(item => <button className="history-row" key={item.id} onClick={() => setSelectedQueue(item.id)}><span className="date-tile"><b>{new Date(item.starts_at).toLocaleDateString("ru-RU", { day: "2-digit", timeZone: "Europe/Moscow" })}</b><span>{new Date(item.starts_at).toLocaleDateString("ru-RU", { month: "short", timeZone: "Europe/Moscow" })}</span></span><span className="history-info"><strong>{item.title}</strong><span>{new Date(item.starts_at).toLocaleDateString("ru-RU", { year: "numeric", timeZone: "Europe/Moscow" })} · {formatTime(item.starts_at)} · прошли {item.completed} из {item.total}</span></span><ArrowRight size={19} /></button>)}</div>}
            {(offset > 0 || data.historyMore) && <div className="pagination"><button className="button secondary-button" disabled={offset === 0} onClick={() => setOffset(Math.max(0,offset-20))}>Новее</button><span>{offset + 1}–{offset + data.history.length}</span><button className="button secondary-button" disabled={!data.historyMore} onClick={() => setOffset(offset+20)}>Раньше</button></div>}
          </section> : <>
            {selectedQueue && <button className="button ghost back-button" onClick={() => setSelectedQueue(null)}><ArrowLeft size={17} />К истории пар</button>}
            {!queue ? <section className="queue-panel no-queue"><div className="empty-symbol"><ListOrdered size={36} /></div><h2>{selectedQueue ? "Очередь не найдена" : "Скоро здесь соберётся группа"}</h2><p>{selectedQueue ? "Вернитесь к истории и выберите другую пару." : admin ? "Создайте очередь и задайте время открытия записи." : "Администратор ещё не открыл очередь. Можно заранее ввести своё имя."}</p>{!admin && !selectedQueue && <div className="waiting-note"><Clock3 size={17} />Новая очередь появится автоматически</div>}</section> : <section className="queue-panel">
              <div className="class-heading"><div className="class-topline"><span className={`badge ${registrationOpen ? "open" : ""}`}>{registrationOpen ? "Запись открыта" : scheduled ? "Ожидает открытия" : isArchive ? "Пара завершена" : "Запись закрыта"}</span><span className="class-time"><Clock3 size={15} /><span>Открытие записи: {formatDate(queue.starts_at)} · {formatTime(queue.starts_at)} МСК</span></span></div><div className="section-heading"><h2>{queue.title}</h2>{admin && !isArchive && <button className="icon-button" disabled={disabled} onClick={() => setEditingQueue(!editingQueue)} aria-expanded={editingQueue} aria-label="Изменить сведения о паре"><Pencil size={18} /></button>}</div>{queue.note && <p className="class-note">{queue.note}</p>}{editingQueue && !isArchive && <div className="edit-class"><ClassForm queue={queue} act={act} disabled={disabled} onSaved={() => setEditingQueue(false)} /></div>}</div>
              <div className="list-heading"><h3>{isArchive ? "Остались в очереди" : "В очереди"}<span className="count">{waiting.length}</span></h3><span className="secondary small">{isArchive ? "На момент завершения" : "В порядке записи"}</span></div>
              {waiting.length === 0 ? <div className="empty-state compact"><Users size={32} /><h3>{isArchive ? "Никто не остался ждать" : completed.length ? "Все прошли" : "Первое место свободно"}</h3><p>{isArchive ? "Список прошедших — ниже." : scheduled ? opensMessage : registrationOpen ? "Запишитесь, и ваше имя появится здесь." : "Администратор пока закрыл запись."}</p></div> : <ol className="queue-list">{waiting.map(entry => <li className={`queue-row ${entry.isMe ? "my-row" : ""} ${entry.position === 1 ? "first-row" : ""}`} key={entry.id}><span className="position" aria-label={`Место ${entry.position}`}>{String(entry.position).padStart(2,"0")}</span><div className="entry-info"><span className="entry-name">{entry.name}{entry.isMe && <span className="you-label">это вы</span>}</span>{entry.position === 1 && !isArchive && <span className="first-label">Следующий по очереди</span>}</div>{admin && !isArchive ? <RowControls entry={entry} entries={waiting} queue={queue} act={act} disabled={disabled} confirm={requestConfirmation} /> : entry.position === 1 && !isArchive ? <ArrowRight className="first-arrow" size={21} /> : null}</li>)}</ol>}
              {admin && !isArchive && <div className="add-area">{adding ? <form onSubmit={async e => { e.preventDefault(); const form = new FormData(e.currentTarget); if (await act({ action: "add", ...base, name: form.get("name") }, "Участник добавлен в конец очереди")) setAdding(false); }}><label htmlFor="add-name">Фамилия и имя участника</label><div className="input-action"><input id="add-name" name="name" placeholder="Петрова Мария" minLength={2} maxLength={80} disabled={disabled} required /><button className="button primary" type="submit" disabled={disabled}>Добавить</button><button type="button" className="icon-button" aria-label="Отменить добавление" disabled={busy} onClick={() => setAdding(false)}><X size={18} /></button></div><p className="small secondary">Запись будет добавлена от администратора, без привязки к устройству участника.</p></form> : <button className="button ghost" disabled={disabled} onClick={() => setAdding(true)}><Plus size={18} />Добавить участника</button>}</div>}
              {completed.length > 0 && <details className="completed-list" open={isArchive}><summary><span><CheckCheck size={18} />Уже прошли <b>{completed.length}</b></span><ChevronDown size={18} /></summary><ul>{completed.map(entry => <li key={entry.id}><Check size={16} /><span>{entry.name}{entry.isMe ? " · это вы" : ""}</span><time>{entry.completedAt && formatTime(entry.completedAt)}</time></li>)}</ul></details>}
              {!isArchive && <div className="queue-footnote"><ShieldCheck size={15} /><span>Порядок меняет только администратор</span></div>}
            </section>}
            {admin && queue && <details className="audit-panel"><summary><span><History size={17} />Журнал действий</span><ChevronDown size={17} /></summary><p className="small secondary">Последние 100 действий этой пары. Доступно только администратору.</p><ul>{data.audit.map(item => <li key={item.id}><span>{item.description}</span><time dateTime={item.created_at}>{formatDate(item.created_at)} · {formatTime(item.created_at)}</time></li>)}</ul></details>}
          </>}
        </main>
        <aside className="side-column" aria-label="Ваше место и управление">
          {tab === "queue" && <section className="personal-panel">
            <Identity data={data} act={act} disabled={disabled} />
            {data.member && <div className={`my-place ${me?.status === "waiting" ? "has-place" : ""}`}>
              {me?.status === "waiting" ? <><div className="place-title">Ваше место<span className="ticket-caption">{groupName}</span></div><div className="place-number">{String(me.position).padStart(2,"0")}<span>/ {waiting.length}</span></div><p>{me.position === 1 ? "Вы следующие. Приготовьтесь!" : `Перед вами ${me.position - 1} ${people(me.position - 1)}`}</p><button className="button ticket-button full" disabled={disabled} onClick={() => requestConfirmation({ title: "Выйти из очереди?", description: "Если запишетесь снова, окажетесь в конце списка.", label: "Выйти из очереди", payload: { action: "leave", queueId: queue?.id }, success: "Вы вышли из очереди" })}>Выйти из очереди<LogOut size={16} /></button></> : me?.status === "done" ? <div className="done-place"><CheckCheck size={30} /><h3>Вы уже прошли</h3><p>На следующую пару можно будет записаться в новую очередь.</p></div> : <><h3>{scheduled ? "Запись скоро откроется" : queue ? "Займите своё место" : "Вы готовы к записи"}</h3><p>{queue ? scheduled ? opensMessage : registrationOpen ? "Вы добавитесь в конец очереди. Место сохранится, даже если закрыть страницу." : "Запись закрыта. Дождитесь, пока администратор её откроет." : "Как только очередь откроется, здесь появится кнопка записи."}</p><button className="button primary full" disabled={disabled || !registrationOpen} onClick={() => act({ action: "join", queueId: queue?.id }, "Вы в очереди. Ваше место сохранено")}><Plus size={18} />Встать в очередь</button></>}
            </div>}
          </section>}
          {admin && tab === "queue" && <section className="admin-panel"><div className="section-heading"><h2><ShieldCheck size={19} />Управление</h2><span className="admin-label">Админ</span></div>{!queue ? <ClassForm act={act} disabled={disabled} /> : <><p className="secondary small">{waiting[0] ? `Следующий: ${waiting[0].name}` : "Пока никто не ждёт"}</p><button className="button dark full" disabled={disabled || !waiting.length} onClick={() => requestConfirmation({ title: "Отметить как прошедшего?", description: `${waiting[0]?.name} перейдёт в список прошедших. Очередь сдвинется на одно место.`, label: "Прошёл, следующий", payload: { action: "complete", ...base, entryId: waiting[0]?.id }, success: "Участник отмечен как прошедший" })}><Check size={18} />Прошёл, следующий</button><button className="button secondary-button full" disabled={disabled} onClick={() => act({ action: "toggle", ...base }, queue.status === "open" ? "Запись закрыта" : "Запись разрешена с указанного времени")}><LockKeyhole size={16} />{queue.status === "open" ? "Закрыть запись" : "Разрешить запись"}</button><button className="button ghost full finish-button" disabled={disabled} onClick={() => requestConfirmation({ title: "Завершить эту пару?", description: `Очередь «${queue.title}» сохранится в истории. ${waiting.length ? `В ней ещё ждут ${waiting.length} ${people(waiting.length)}. ` : ""}После завершения редактирование будет недоступно.`, label: "Завершить пару", payload: { action: "finish", ...base }, success: "Пара завершена. Можно открыть следующую очередь" })}>Завершить пару</button></>}</section>}
          <section className="rules-panel"><h2><CircleHelp size={18} />Как всё устроено</h2><ul><li>Записываетесь — встаёте в конец.</li><li>Выходите и возвращаетесь — занимаете новое место.</li><li>Обмен и перенос — через администратора.</li></ul><p className="small secondary">Обновление раз в 8 секунд, пока страница открыта. Время открытия записи — московское.</p></section>
        </aside>
      </div>}
    </>}
    <footer className="site-footer"><span>Меньше суеты перед парой.</span>{admin ? <button className="text-button" disabled={busy} onClick={() => act({ action: "adminLogout" }, "Вы вышли из режима администратора")}><LogOut size={15} />Выйти из управления</button> : <button className="text-button" disabled={!configured || busy} onClick={() => { setNotice(""); setAdminLogin(true); }}><LockKeyhole size={15} />Вход администратора</button>}</footer>
    <div className={`toast ${notice ? "visible" : ""}`} role="status" aria-live="polite">{notice && <><span>{notice}</span><button className="icon-button" aria-label="Закрыть сообщение" onClick={() => setNotice("")}><X size={18} /></button></>}</div>
    {adminLogin && <Dialog title="Вход администратора" locked={busy} close={() => setAdminLogin(false)}><p className="secondary">Введите секретную фразу. Режим управления действует 12 часов.</p><form className="stack-form" onSubmit={async e => { e.preventDefault(); const form = new FormData(e.currentTarget); if (await act({ action: "adminLogin", passphrase: form.get("passphrase") }, "Режим администратора включён")) setAdminLogin(false); }}><label>Секретная фраза<input name="passphrase" type="password" autoComplete="current-password" maxLength={256} required autoFocus disabled={busy} /></label>{notice && <p className="form-message" role="status">{notice}</p>}<button className="button primary full" disabled={busy} type="submit">{busy ? <LoaderCircle size={18} className="spin" /> : <ShieldCheck size={18} />}Войти в управление</button></form></Dialog>}
    {confirmation && <Dialog title={confirmation.title} locked={busy} close={() => setConfirmation(null)}><p className="secondary">{confirmation.description}</p>{notice && <p className="form-message" role="status">{notice}</p>}<div className="dialog-actions"><button className="button secondary-button" disabled={busy} onClick={() => setConfirmation(null)}>Отмена</button><button className="button primary" disabled={disabled} onClick={async () => { await act(confirmation.payload, confirmation.success); setConfirmation(null); }}>{busy && <LoaderCircle size={17} className="spin" />}{confirmation.label}</button></div></Dialog>}
  </div>;
}
