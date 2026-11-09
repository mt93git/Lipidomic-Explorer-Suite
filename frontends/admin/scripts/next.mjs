import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let mode = process.env.ADMIN_FONT_MODE;
if (!mode || mode === "auto") {
  try {
    const response = await fetch("https://fonts.googleapis.com/css2?family=Nunito+Sans", {
      method: "HEAD", signal: AbortSignal.timeout(2500),
    });
    mode = response.ok ? "google" : "system";
  } catch {
    mode = "system";
  }
}
if (!["google", "system"].includes(mode)) {
  console.error("ADMIN_FONT_MODE must be auto, google, or system.");
  process.exit(1);
}
if (mode === "system") {
  console.log("[admin] Google Fonts unavailable or system mode selected; using system font fallbacks. Set ADMIN_FONT_MODE=google to require brand fonts.");
}
const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, ADMIN_FONT_MODE: mode, NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED ?? "1" },
});
child.on("error", error => { console.error(error.message); process.exit(1); });
child.on("exit", code => process.exit(code ?? 1));
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
