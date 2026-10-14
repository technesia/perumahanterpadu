import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Taman Pesona Rajeg Mulya", template: "%s · Taman Pesona Rajeg Mulya" },
  description: "Aplikasi pengelolaan Perumahan Taman Pesona Rajeg Mulya — RT 004 RW 04, Desa Rajeg Mulya, Kab Tangerang.",
  icons: { icon: "/brand/logo.jpg" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#3d5726" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={inter.variable}>
      <body><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}
