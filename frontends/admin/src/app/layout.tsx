import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { fontVariables } from "@/app/fonts";
import { withBasePath } from "@/lib/base-path";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Admin · Lipidomic Explorer", template: "%s · Lipidomic Explorer Admin" },
  description: "Lipidomic Explorer lab administration workspace.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // The sign-in pages' illustration (public/auth, made by scripts/auth-art.py), under this build's base path.
  const art = { "--auth-art": `url(${withBasePath("/auth/login-samples.svg")})` } as CSSProperties;
  return <html lang="en" className={fontVariables}><body style={art}>{children}</body></html>;
}
