# Portfolio capture

This opt-in local tool prepares a fictional workspace through the real API and captures
the real messenger UI. It is not an application seed command or a frontend test suite.
Production application code, environment defaults and dependency manifests are unchanged.

## Reproduce

Requires Node.js 24, a local Unix-socket Docker engine with Compose 2.20+, Google Chrome,
and an installed Playwright package. Playwright is capture tooling, not an app dependency.
The original capture used Playwright `1.63.0-alpha-2026-08-31` and local Chrome.
If Playwright is not already available, install it only in the ignored tooling directory:

```bash
npm install --prefix .playwright-mcp/portfolio-media/tooling --no-save --package-lock=false --ignore-scripts playwright@1.63.0-alpha-2026-08-31
PORTFOLIO_PLAYWRIGHT_MODULE="$(pwd)/.playwright-mcp/portfolio-media/tooling/node_modules/playwright/index.mjs" node scripts/portfolio/run.mjs --build
```

`PORTFOLIO_PLAYWRIGHT_MODULE` can instead point to an existing Playwright `index.mjs`.
With a normally resolvable installation, omit the variable. `--build` builds the project's
images, including the frontend, before capture and pulls missing service images. To avoid rebuilding already verified images
from the same source revision, explicitly select their local names or IDs:

```bash
node scripts/portfolio/run.mjs --images <LOCAL_PHP_IMAGE> <LOCAL_NGINX_IMAGE>
```

The `--images` mode never pulls; PostgreSQL and Mercure images must also be cached locally.

Each run starts from new disposable volumes and registers three role-named demo users
with reserved `example.invalid` emails and a random password. It creates a direct chat and
a four-message group conversation with a quoted reply, a three-vote poll, two reactions
and two readers. Re-running reproduces the scenario without resetting any existing database.
Message IDs, clock times and browser font rasterisation may differ between runs.

Only one capture process may run at a time. Output goes to
`.playwright-mcp/portfolio-media/`: three 1600 × 1200 PNG sheets plus mobile smoke captures.
The script never automatically overwrites the reviewed public gallery. Visually review the
three sheets, check their metadata/privacy, then copy only `01-cover.png`,
`02-ai-assistant.png` and `03-group-chat.png` to `frontend/public/portfolio/`.

## What the images prove

The group data is persisted through real API operations. Typing is sent through the API
after browser subscription and must appear via real Mercure before capture. The native
receipt dialog is opened and verified, then closed for the final group frame. The screenshot
shows the app's blue read ticks, not an invented group receipt label.

AI is a **hand-written synthetic fixture**, not a live model result. The browser intercepts
the exact AI request and renders the fixture through the existing send/response flow. It
never forwards that request to the backend or Anthropic. The fixture is marked in the
message itself, and the detail sheet repeats the disclosure outside the application.
The original capture encountered `/api/chats/ai/typing`, which the real backend rejected
with HTTP 500 because `ai` is not a chat UUID. The capture fixture retains a local no-op
for that path. The application now skips typing requests for virtual AI chats; the separate
frontend regression suite verifies zero requests without that no-op. The capture itself
does not establish that the live AI flow is error-free.

The surrounding HTML adds only a portfolio title, frame and caption. The detail uses the
app's own sidebar toggle and a 1.3× iframe scale. The account email and version line are
hidden in this disposable capture context. No messages, avatars, status indicators or
application controls are painted over or generated. Remote fonts are blocked; the app's
existing system-font fallback is used. No image-generation service is involved.

## Isolation and cleanup

The runner refuses remote Docker endpoints, pins the selected local endpoint, ignores root
`.env` via `--env-file /dev/null`, and inherits only Docker CLI plumbing. All app credentials
are generated in memory; the AI key is empty. PHP, PostgreSQL, Mercure and scheduler run on
an internal network without external routing. Only Nginx gets a separate edge network and
a dynamically assigned `127.0.0.1` port. Browser requests to external origins are blocked.
The seed contains no URLs, attachments or external link-preview requests.

Browser auth uses a fresh nonpersistent context. No credentials, cookies, browser profiles,
storageState, HAR, traces or API response bodies are saved. Draft screenshots contain only
the synthetic workspace. The ownership record stores the random Compose project name,
Docker endpoint digest and cleanup status, not credentials.

Cleanup runs in `finally`, including handled SIGINT/SIGTERM, and verifies that the owned
project has no remaining containers, networks or volumes. A killed process, machine failure
or unavailable Docker engine cannot perform its own cleanup; once the original engine is
available again, use:

```bash
node scripts/portfolio/run.mjs --cleanup
```

This removes only resources of the recorded portfolio project. Keep its ownership record
until cleanup succeeds. Local build images/cache and the screenshot files are retained.
The tool does not deploy, publish, upload to external services or change Git state.
