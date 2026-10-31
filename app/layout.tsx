import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import { type ReactNode, ViewTransition } from "react";
import { ChatLauncher } from "@/components/ai/ChatLauncher";
import { CursorLight } from "@/components/shared/CursorLight";
import { LiquidGlass } from "@/components/shared/LiquidGlass";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const display = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ExoVerse",
  description:
    "Explore worlds beyond our solar system through real NASA data and AI-powered scientific exploration.",
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`} data-scroll-behavior="smooth">
      <body>
        <ViewTransition>{children}</ViewTransition>
        <ChatLauncher />
        <CursorLight />
        <LiquidGlass />
      </body>
    </html>
  );
}
