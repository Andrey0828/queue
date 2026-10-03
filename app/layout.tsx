import type { Metadata, Viewport } from "next";
import "@fontsource-variable/manrope";
import "./globals.css";

export const metadata: Metadata = {
  title: "Перед парой — очередь группы",
  description: "Запись в очередь перед парой. Своё место видно сразу, изменения появляются у всей группы.",
  robots: { index: false, follow: false },
  applicationName: "Перед парой",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f5f6f8" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
