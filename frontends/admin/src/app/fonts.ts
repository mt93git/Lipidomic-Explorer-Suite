import { Cormorant_Garamond, Nunito_Sans, IBM_Plex_Mono } from "next/font/google";

const title = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", variable: "--font-title" });
const body = Nunito_Sans({ subsets: ["latin"], display: "swap", variable: "--font-body" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], display: "swap", variable: "--font-mono" });

export const fontVariables = `${title.variable} ${body.variable} ${mono.variable}`;
