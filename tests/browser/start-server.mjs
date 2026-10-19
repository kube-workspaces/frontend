import { cp } from "node:fs/promises";
import { spawn } from "node:child_process";

const production = process.argv[2] === "production";
const env = {
  ...process.env,
  NODE_ENV: "production",
  HOSTNAME: "127.0.0.1",
  PORT: production ? "3100" : "3102",
  NEXT_PUBLIC_API_URL: "",
  API_URL: "http://127.0.0.1:9",
  PROXY_URL: "http://127.0.0.1:9",
};
// Match the standalone container layout, including the actual production wrapper.
// The other server exercises server.mjs's routing against the same built app.
if (production) {
  await cp("public", ".next/standalone/public", { recursive: true });
  await cp(".next/static", ".next/standalone/.next/static", { recursive: true });
  await cp("server-prod.mjs", ".next/standalone/server-prod.mjs");
}
const child = spawn(process.execPath, [production ? "server-prod.mjs" : "server.mjs"], {
  cwd: production ? ".next/standalone" : process.cwd(), env, stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
