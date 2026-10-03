import Link from "next/link";
export default function NotFound() {
  return <main className="fatal"><h1>Здесь нет очереди</h1><p>Вся группа собирается на главной странице.</p><Link className="button primary" href="/">Открыть очередь</Link></main>;
}
