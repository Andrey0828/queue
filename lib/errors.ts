import { NextResponse } from "next/server";
import { AppError } from "./db";
const messages: Record<string, string> = {
  CONFIGURATION: "Сайт ещё не подключён. Администратору нужно добавить настройки Vercel и выполнить SQL в Supabase.",
  DATABASE_UNAVAILABLE: "Нет связи с базой. Попробуйте ещё раз. Если ошибка повторяется, администратору нужно проверить проект Supabase.",
  FORBIDDEN: "Нужен вход администратора. Сессия могла закончиться.",
  NAME_LOCKED: "Сначала выйдите из текущей очереди. После прохождения пары имя можно изменить при её завершении.",
  INVALID_INPUT: "Проверьте поля. Для имени используйте буквы, пробелы, дефис или точку.",
  ACTIVE_EXISTS: "Уже есть активная очередь. Завершите её перед созданием новой.",
  QUEUE_NOT_ACTIVE: "Эта очередь уже завершена. Список обновлён.",
  STALE_QUEUE: "Очередь успела измениться. Список обновлён — повторите действие с актуальными местами.",
  REGISTRATION_CLOSED: "Администратор закрыл запись в эту очередь.",
  LOGIN_REQUIRED: "Сначала введите своё имя.",
  ALREADY_DONE: "Вы уже прошли в этой очереди. Новая запись будет доступна на следующую пару.",
  QUEUE_FULL: "В очереди уже 200 участников. Обратитесь к администратору.",
  INVALID_POSITION: "Такого места в очереди нет. Укажите номер из текущего списка.",
  ENTRY_NOT_FOUND: "Участника уже нет в очереди. Список обновлён.",
  NOT_FIRST: "Этот участник уже не первый. Проверьте обновлённую очередь.",
  INVALID_ACTION: "Неизвестное действие.",
  DUPLICATE_NAME: "Такое имя уже есть в этой очереди. Если это однофамилец, добавьте имя или отчество; если вы сменили устройство — обратитесь к администратору.",
  RATE_LIMIT: "Слишком много попыток. Подождите немного; после неудачных входов администратора — до 15 минут.",
  WRONG_PASSPHRASE: "Неверная секретная фраза.",
  BAD_ORIGIN: "Запрос отклонён. Откройте сайт напрямую и повторите действие.",
};
export function errorResponse(error: unknown) {
  const known = error instanceof AppError;
  if (!known) console.error("Unexpected API error", error instanceof Error ? error.name : "unknown");
  const code = known ? error.code : "INTERNAL";
  return NextResponse.json({ error: messages[code] ?? "Не удалось выполнить действие. Попробуйте ещё раз.", code }, {
    status: known ? error.status : 500,
    headers: { "Cache-Control": "no-store", ...(code === "RATE_LIMIT" ? { "Retry-After": "60" } : {}) },
  });
}
