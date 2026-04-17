import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Script from "next/script";
import "@/styles/globals.css";
import { ReactNode } from "react";

const geistSans = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Kurk AI",
  description: "Voice-powered hotel concierge for the in-room tablet.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/favicon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.className}  h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Script src="https://cdn.lordicon.com/lordicon.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
