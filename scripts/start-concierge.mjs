import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const service = path.join(root, "services", "concierge");
const python = path.join(service, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");

if (!existsSync(python)) {
  console.error("Crie o ambiente Python seguindo docs/crewai.md antes de iniciar o serviço.");
  process.exit(1);
}

const child = spawn(python, ["-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", "8000"], {
  cwd: service,
  stdio: "inherit",
  env: { ...process.env, PYTHONUTF8: "1" },
});
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
