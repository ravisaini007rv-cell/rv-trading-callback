import type { Metadata, Viewport } from "next";
import "./globals.css";
import RegisterSW from "@/components/RegisterSW";

export const metadata: Metadata = {
  title: "RV AI Studio — chat, code, images & video",
  description:
    "A free, multi-model AI assistant: chat and coding help, image generation, and in-browser video editing.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "RV AI", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0b0d12",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
