# Deploying Sabor Express on EasyPanel

The deployment uses two app services built from the root of the same private GitHub repository:

| Service | Dockerfile | Port | Exposure |
| --- | --- | --- | --- |
| `extras/saborexpress` | `Dockerfile` | 3000 | Public HTTPS through EasyPanel/Traefik |
| `extras/sabor-concierge` | `Dockerfile.backend` | 8000 | Internal project network only |

The web service resolves the backend at `http://extras_sabor-concierge:8000`. The backend has a persistent volume named `sabor-data`, mounted at `/data`, containing the SQLite database and its CRM encryption key. It uses one replica and stop-first updates because its worker, session coordination and voice controller assume a single process.

## Images and runtime behavior

- The web image uses Next.js standalone output and includes `public/` and `.next/static`. The runtime runs as the built-in unprivileged Node user.
- The Python image preserves the repository paths needed by the shared catalog. Its entrypoint initializes ownership of the mounted data directory, then uses `gosu` to run Uvicorn as the unprivileged `concierge` user.
- Both images expose HTTP health checks. `/api/health` checks the web process; `/health` checks the Python process and reports chat-provider configuration without making a model request.
- `.dockerignore` excludes environment files, databases, original media, Git history, development dependencies and test artifacts from the build context.
- A fresh deployment starts with a fresh operational database. It does not transfer local conversations, CRM tokens or account mappings.

## CLI setup and configuration

Use an authenticated EasyPanel CLI profile with an HTTPS panel URL. On Windows, `scripts/connect-easypanel-https.ps1` can create a second HTTPS profile by reusing the selected profile's existing Windows Credential Manager entry. It does not print or persist the API key in a file, and it leaves the default profile unchanged.

The deployment helper requires Node.js with `node:util.parseEnv` and reads the root `.env` for the application's existing configuration. A separate `.env.easypanel` stores the deployment-only service token; it is excluded by both Git and Docker.

```powershell
node scripts/deploy-easypanel.mjs configure
node scripts/deploy-easypanel.mjs status
node scripts/deploy-easypanel.mjs deploy-backend
# Wait for the backend to become healthy before deploying the web service.
node scripts/deploy-easypanel.mjs deploy-web
```

Configuration values are sent to the EasyPanel CLI through stdin, not command arguments or output. The web service receives only the Azure variables needed for file transcription and the shared backend token; the remaining integrations are configured on the backend.

The helper defaults to the services above. `EASYPANEL_PROFILE`, `EASYPANEL_PROJECT`, `EASYPANEL_WEB_SERVICE`, `EASYPANEL_BACKEND_SERVICE` and `DEPLOY_PUBLIC_ORIGIN` can override the target. The public domain and web service must already exist. Review the target before running the helper: it replaces source, build and environment settings for those two services and removes domain mappings from the backend.

## GitHub and updates

EasyPanel must have read access to `mateuxcv/sabor-express-ai`. Both services use branch `main` and repository path `/`. Commit and push the Dockerfiles and application changes before requesting a build. Deployment is explicit through the CLI or panel; a Git push alone should not be assumed to have deployed either service.

## CRM authorization

The deployed callback is:

```text
https://extras-saborexpress.h67eod.easypanel.host/api/crm/callback
```

Register that exact callback in the RD Station CRM application. Then open the deployed `/crm`, authorize the account and select the pipelines, stages and owners. Copying the application's client ID and secret does not transfer a local OAuth connection. Existing records in the local database are not migrated by this deployment.

## Publication scope

The initial deployment is publicly accessible, as selected by the project owner. The prototype does not implement operator accounts or tenant isolation. Its public application endpoints can invoke the configured external services. Keep provider budgets and the demonstration's intended exposure in mind when operating it.

Back up `/data` as a unit so that the database and CRM encryption key remain together. Do not enable multiple backend replicas or start-first updates without adding distributed coordination.
