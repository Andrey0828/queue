"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="fatal"><h1>Не получилось открыть очередь</h1><p>Попробуйте загрузить страницу ещё раз.</p><button className="button primary" onClick={reset}>Попробовать снова</button></main>;
}
