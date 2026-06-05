import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Bootstrap } from "@/components/Bootstrap";
import { RegisterSW } from "@/components/RegisterSW";
import { AppShell } from "@/components/app-shell/AppShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bouwproject — Digital Twin",
  description:
    "Plan, ontwerp en bouw je renovatie. Plattegrond, 3D, installaties, fasering en kosten.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Bouwproject",
  },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#ea580c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="nl"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <RegisterSW />
        <Bootstrap>
          <AppShell>{children}</AppShell>
        </Bootstrap>
      </body>
    </html>
  );
}
