import type { Metadata } from "next";
import type { ReactNode } from "react";
import { fontVariables } from "@/app/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Admin · Lipidomic Explorer", template: "%s · Lipidomic Explorer Admin" },
  description: "Lipidomic Explorer lab administration workspace.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" className={fontVariables}><body>{children}</body></html>;
}
