import { Geist } from "next/font/google";
import Script from "next/script";
import "@/styles/globals.css";
import { ReactNode } from "react";

const geistSans = Geist({ subsets: ["latin"] });

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
