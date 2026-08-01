import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Footer from "@/components/Footer";
import Sidebar from "@/components/Sidebar";
import VerifyBanner from "@/components/VerifyBanner";
import { UserProvider } from "@/lib/useUser";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "A Stoic Mind",
    template: "%s · A Stoic Mind",
  },
  description: "A Stoic Mind — describe the product in one indexable sentence.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex font-sans">
        <UserProvider>
          <Sidebar />
          <div className="flex min-h-screen min-w-0 flex-1 flex-col">
            <VerifyBanner />
            <main className="flex-1 flex flex-col">{children}</main>
            <Footer />
          </div>
        </UserProvider>
      </body>
    </html>
  );
}
