"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "@/lib/types";

export function useQueue(enabled: boolean, selectedQueue: string | null, offset: number) {
  const key = `${selectedQueue ?? "active"}:${offset}`;
  const [result, setResult] = useState<{ key: string; data: Snapshot } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const sequence = useRef(0);
  const inFlight = useRef(false);
  const mutating = useRef(false);
  const currentKey = useRef(key);
  currentKey.current = key;

  const refresh = useCallback(async (force = false) => {
    if (!enabled || (inFlight.current && !force)) return;
    const requestId = ++sequence.current;
    inFlight.current = true;
    try {
      const query = new URLSearchParams({ offset: String(offset) });
      if (selectedQueue) query.set("queue", selectedQueue);
      const response = await fetch(`/api/state?${query}`, { cache: "no-store", signal: AbortSignal.timeout(16000) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Не удалось обновить очередь.");
      if (requestId === sequence.current && currentKey.current === key) {
        setResult({ key, data: json }); setError(""); setLastUpdated(new Date());
      }
    } catch (e) {
      if (requestId === sequence.current && currentKey.current === key) setError(e instanceof Error && e.name !== "TimeoutError" ? e.message : "Сервер не ответил вовремя. Проверьте подключение и обновите очередь.");
    } finally { if (requestId === sequence.current) inFlight.current = false; }
  }, [enabled, key, offset, selectedQueue]);

  useEffect(() => {
    if (!enabled) return;
    void refresh(true);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible" && !mutating.current) void refresh(); }, 8000);
    const wake = () => { if (document.visibilityState === "visible") void refresh(true); };
    const offline = () => setError("Нет интернета. Показана последняя загруженная очередь; действия временно недоступны.");
    window.addEventListener("online", wake); window.addEventListener("offline", offline);
    window.addEventListener("focus", wake); document.addEventListener("visibilitychange", wake);
    return () => { window.clearInterval(timer); window.removeEventListener("online", wake); window.removeEventListener("offline", offline); window.removeEventListener("focus", wake); document.removeEventListener("visibilitychange", wake); ++sequence.current; inFlight.current = false; };
  }, [enabled, refresh]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 7000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const act = async (input: Record<string, unknown>, success = "Готово") => {
    if (mutating.current) return false;
    mutating.current = true; setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(20000) });
      const json = await response.json();
      if (!response.ok) {
        await refresh(true);
        setNotice(json.error || "Не удалось выполнить действие.");
        return false;
      }
      await refresh(true);
      setNotice(success);
      return true;
    } catch {
      setNotice("Не удалось получить ответ. Обновите очередь перед повторной попыткой: действие могло сохраниться.");
      await refresh(true);
      return false;
    } finally { mutating.current = false; setBusy(false); }
  };
  return { data: result?.key === key ? result.data : null, error, busy, notice, lastUpdated, refresh, act, setNotice };
}
