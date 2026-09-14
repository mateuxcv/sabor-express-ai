import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const profile = process.env.EASYPANEL_PROFILE || "production-https";
const project = process.env.EASYPANEL_PROJECT || "extras";
const web = process.env.EASYPANEL_WEB_SERVICE || "saborexpress";
const backend = process.env.EASYPANEL_BACKEND_SERVICE || "sabor-concierge";
const origin = process.env.DEPLOY_PUBLIC_ORIGIN || "https://extras-saborexpress.h67eod.easypanel.host";
const executable = process.env.EASYPANEL_CLI || "easypanel";
const action = process.argv[2];
const target = name => `${project}/${name}`;
const parameters = name => ({ projectName: project, serviceName: name });

function call(args, input) {
  try {
    const output = execFileSync(executable, [...args, "--server", profile, "--format", "json", "--timeout", "90s", "--yes", ...(input === undefined ? [] : ["--input", "-"])], {
      cwd: root,
      input: input === undefined ? undefined : JSON.stringify(input),
      encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 120_000,
      maxBuffer: 16 * 1024 * 1024,
    }).trim();
    return output ? JSON.parse(output) : null;
  } catch (error) {
    // Never echo stdin, environment values, raw CLI responses, or service tokens.
    throw new Error(`EasyPanel operation failed: ${args.slice(0, 2).join(" ")} (exit ${error.status ?? "unknown"}). Inspect the service in the panel for details.`);
  }
}

function assertSecureProfile() {
  const server = call(["server", "show", profile]);
  if (!server?.url?.startsWith("https://")) throw new Error("Use a verified HTTPS EasyPanel profile before sending configuration.");
  if (new URL(origin).protocol !== "https:") throw new Error("DEPLOY_PUBLIC_ORIGIN must use HTTPS.");
}

function environment() {
  const file = path.join(root, ".env");
  if (!existsSync(file)) throw new Error("Configure the root .env before deploying external integrations.");
  const local = parseEnv(readFileSync(file, "utf8"));
  const deploymentFile = path.join(root, ".env.easypanel");
  if (!existsSync(deploymentFile)) {
    writeFileSync(deploymentFile, `# Deployment-only credential. Ignored by Git and Docker.\nCREWAI_SERVICE_TOKEN=${randomBytes(32).toString("hex")}\n`, { flag: "wx", mode: 0o600 });
  }
  const deployment = parseEnv(readFileSync(deploymentFile, "utf8"));
  if (!deployment.CREWAI_SERVICE_TOKEN) throw new Error("The deployment service token is missing from .env.easypanel.");
  const shared = {
    ASSISTANT_PROVIDER: local.ASSISTANT_PROVIDER || "demo",
    CREWAI_SERVICE_TOKEN: deployment.CREWAI_SERVICE_TOKEN,
  };
  const webEnv = {
    ...shared, NODE_ENV: "production", HOSTNAME: "0.0.0.0", PORT: "3000", NEXT_TELEMETRY_DISABLED: "1",
    CREWAI_SERVICE_URL: `http://${project}_${backend}:8000`,
    RD_CRM_REDIRECT_URI: `${origin}/api/crm/callback`,
  };
  const backendEnv = {
    ...shared, PYTHONUTF8: "1", PYTHONUNBUFFERED: "1", CONCIERGE_DB_PATH: "/data/sabor.sqlite3",
    CREWAI_TRACING_ENABLED: "false", OTEL_SDK_DISABLED: "true",
    RD_CRM_REDIRECT_URI: `${origin}/api/crm/callback`,
  };
  for (const [key, value] of Object.entries(local)) {
    if (/^AZURE_/.test(key) || ["RD_CRM_CLIENT_ID", "RD_CRM_CLIENT_SECRET", "RD_CRM_TEXT_FORMAT", "SENTIMENT_USE_LLM"].includes(key)) backendEnv[key] = value;
    if (["AZURE_ENDPOINT", "AZURE_API_KEY"].includes(key) || /^AZURE_AUDIO_/.test(key)) webEnv[key] = value;
  }
  const serialize = values => Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n");
  return { webEnv: serialize(webEnv), backendEnv: serialize(backendEnv), provider: shared.ASSISTANT_PROVIDER };
}

function configure() {
  assertSecureProfile();
  const configuration = environment();
  const { services } = call(["projects", "list-with-services"]);
  if (!services.some(item => item.projectName === project && item.name === web)) throw new Error("The expected web service must exist before configuration.");
  if (!services.some(item => item.projectName === project && item.name === backend)) {
    call(["app", "create", target(backend)], {
      ...parameters(backend), domains: [], ports: [],
      mounts: [{ type: "volume", name: "sabor-data", mountPath: "/data" }],
      deploy: { replicas: 1, zeroDowntime: false },
    });
    console.log(`Created internal service ${target(backend)}.`);
  }
  const mounts = call(["mounts", "list", target(backend)]);
  const existingMounts = Array.isArray(mounts) ? mounts : mounts?.mounts || [];
  if (!existingMounts.some(item => item.mountPath === "/data")) {
    call(["mounts", "create", target(backend)], { ...parameters(backend), values: { type: "volume", name: "sabor-data", mountPath: "/data" } });
  }
  const backendDomains = call(["domains", "list", "--project-name", project, "--service-name", backend]);
  for (const domain of backendDomains) {
    call(["domains", "delete", "--id", domain.id, "--yes"]);
  }
  for (const [name, file, env] of [[web, "Dockerfile", configuration.webEnv], [backend, "Dockerfile.backend", configuration.backendEnv]]) {
    call(["app", "update-source-github", target(name)], { ...parameters(name), owner: "mateuxcv", repo: "sabor-express-ai", ref: "main", path: "/" });
    call(["app", "update-build", target(name)], { ...parameters(name), build: { type: "dockerfile", file } });
    call(["app", "update-env", target(name)], { ...parameters(name), env });
    call(["app", "update-deploy", target(name)], { ...parameters(name), deploy: { replicas: 1, zeroDowntime: name === web } });
    console.log(`Configured ${target(name)} with ${file}; environment values were not logged.`);
  }
  const domains = call(["domains", "list", "--project-name", project, "--service-name", web]);
  const domain = domains.find(item => item.host === new URL(origin).host);
  if (!domain) throw new Error("The expected public domain is not attached to the web service.");
  call(["domains", "update"], { ...domain, https: true, serviceDestination: { protocol: "http", port: 3000, projectName: project, serviceName: web, path: "/" } });
  console.log(`Public origin: ${origin}; assistant provider: ${configuration.provider}.`);
  console.log("Backend exposure: internal network only. CRM authorization must be completed for the public callback.");
}

function status() {
  for (const name of [web, backend]) {
    const service = call(["app", "inspect", target(name)]);
    console.log(JSON.stringify({ service: target(name), enabled: service.enabled, build: service.build, source: service.source, deploy: service.deploy, mounts: service.mounts }, null, 2));
  }
}

function requestDeployment(name) {
  assertSecureProfile();
  const query = ["actions", "list", "--project-name", project, "--service-name", name, "--type", "deployment", "--limit", "5"];
  const before = call(query);
  const pending = before.find(item => item.status === "pending");
  if (pending) {
    console.log(`Deployment ${pending.id} is already pending for ${target(name)}; follow that action instead of starting another build.`);
    return;
  }
  let requestError;
  try { call(["app", "deploy", target(name)]); }
  catch (error) { requestError = error; }
  // EasyPanel can keep the deployment request open longer than the HTTP timeout.
  // A new action is authoritative evidence that the server accepted the request.
  const after = call(query);
  const created = after.find(item => !before.some(previous => previous.id === item.id));
  if (created) {
    console.log(`Deployment action ${created.id} for ${target(name)}: ${created.status}. Verify the action log and container health before considering it ready.`);
    if (!["pending", "done"].includes(created.status)) process.exitCode = 1;
  } else if (requestError) throw requestError;
  else console.log(`Deployment requested for ${target(name)}; inspect its action and health.`);
}

try {
  if (action === "configure") configure();
  else if (action === "status") status();
  else if (action === "deploy-web" || action === "deploy-backend") {
    const name = action === "deploy-web" ? web : backend;
    requestDeployment(name);
  } else throw new Error("Usage: node scripts/deploy-easypanel.mjs configure|status|deploy-backend|deploy-web");
} catch (error) { console.error(error.message); process.exitCode = 1; }
