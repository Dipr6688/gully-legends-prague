import type { Metadata } from "next";
import { Bangers, Barlow_Condensed, Permanent_Marker } from "next/font/google";
import { SiteHeader } from "@/components/navigation/SiteHeader";
import "./globals.css";

const bangers = Bangers({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-bangers",
  display: "swap"
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-barlow-condensed",
  display: "swap"
});

const permanentMarker = Permanent_Marker({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-permanent-marker",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Gully Legends Prague",
  description: "No Rules. Only Fun! Cricket dashboard for ČZU Gully Arena."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${bangers.variable} ${barlowCondensed.variable} ${permanentMarker.variable}`}>
        <SiteHeader />
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
