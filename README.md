# Hestia

A pnpm monorepo for household finances. The same stack as MyCastle (Node 20 +
TypeScript 5.9, tsup, Vitest 4, React 18 + MUI 6 + Vite 6) and the same split:
shared code in `packages/`, runnable applications in `app/`.

Conventions and the rules this repository is written to are in
[`CLAUDE.md`](./CLAUDE.md) — that file is also what Claude Code reads on start.

## Structure

```
packages/core                @hestia/core                 the MyCastle base (verbatim copy) + `finance/`
packages/node-core           @hestia/node-core            the MyCastle base (verbatim copy) + `simple/`
packages/node-devtools       @hestia/node-devtools        codemap (code knowledge, UML) + git (moved from MyCastle)
packages/core-sci            @hestia/core-sci             the scientific core from MyCastle (solvers, units, formula graph)
packages/ui-core             @hestia/ui-core              reusable React components (the toolbar, the drive)
packages/ui-texteditor                @hestia/ui-texteditor                 the Monaco text/code editor, its VFS, MJD editors, plugins
packages/ui-sci-blocks       @hestia/ui-sci-blocks        the document blocks over core-sci (formula, sim, plot, the reader)
packages/ui-ai               @hestia/ui-ai                the AI assistant (moved from MyCastle's texteditor)
packages/ui-cad              @hestia/ui-cad               the CAD pages (moved from cad-app): notes/, cad2d/, cad3d/
packages/ui-scene3d          @hestia/ui-scene3d           the 3D scene graph + the layout solver
                             @hestia/ui-scene3d/cad-viewer  read-only viewers: CAD, 3D, electronics, PCB, map, notes
packages/ui-markdown-editor  @hestia/ui-markdown-editor   the Markdown editor, behind capability providers
packages/ui-devtools         @hestia/ui-devtools          browser developer tools, an umbrella over two
                             @hestia/ui-devtools/diagrams the diagram editor (moved from MyCastle's web-devtools)
                             @hestia/ui-devtools/codemap  the codemap editor (MyCastle's Programming → UML page)
packages/viewers             @hestia/viewers              PDF and DjVu (moved from MyCastle's Drive page)

app/backend            hestia-backend        PLATFORM: files (VFS), MQTT, accounts     :4990
app/iot                iot-backend           devices and readings                      :4992
app/web/iot            iot-web               the IoT page → `app/iot/public`           :4993 (dev)
app/finances           finances-backend      household finances                        :4894
app/web/finances       finances-web          the finance page → `app/finances/public`  :4895 (dev)
app/cad                cad-backend           CAD: notes, 2D drawing, 3D model          :4994
app/web/cad            cad-web               the CAD pages → `app/cad/public`          :4996 (dev)
app/drive              drive-backend         the drive: browsing and editing files      :4997
app/web/drive          drive-web             the drive page → `app/drive/public`        :4998 (dev)
```

### The platform and the applications

`app/backend` is the **only** place holding accounts and files. The domain
applications (`app/iot`, `app/finances`, `app/cad`, `app/drive`) have no users and no
store of their own — they ask the platform, passing **the user's token** rather
than a service account. Were they to walk the files "on everyone's behalf", any
mistake of theirs in checking permissions would open somebody else's data; this
way one place guards the boundaries.

The browser talks **only to its own server**: `/api/*` is handled by the
application and `/platform/*` is forwarded on to the platform. The platform's
address is an address as seen by the server — `localhost` in the configuration
means the phone itself on a phone, so the page cannot use it directly.

The MQTT broker sits on the **same port** as the platform's HTTP (the `/mqtt`
WebSocket): a second exposed service is a second port in the firewall, a second
rule in the proxy and a second place where the address can be wrong.

### The copied base

`packages/core` and `packages/node-core` started as a verbatim copy of
`drive/mycastle/packages/*` (the file system, the MQTT broker, authentication,
models, VFS). Hestia's own code sits beside it in separate directories
(`core/src/finance/`, `node-core/src/simple/`), so that a later update of the
base does not turn into deciding by hand what belongs to whom.

Note that the base is **no longer a byte-for-byte copy**: besides the package
names in imports (`@mhersztowski/*` → `@hestia/*`), its comments have been
translated into English along with the rest of the repository. Pulling a newer
version of the base therefore means a merge, not an overwrite.

Dependencies point one way: `core` knows nothing about the server or the
browser, `node-core` knows only `core`, and every application depends on the
packages — never on one another. That is why the same summary computes the same
way on both sides; were the server and the screen to compute separately, at the
first discrepancy there would be no telling which one is right.

## Running it

```bash
pnpm install
cp app/backend/.env.example  app/backend/.env
cp app/iot/.env.example      app/iot/.env
cp app/finances/.env.example app/finances/.env
cp app/cad/.env.example      app/cad/.env
cp app/drive/.env.example    app/drive/.env

pnpm dev            # platform (4990) + IoT (4992) + the IoT page (4993)
pnpm dev:finances   # finances: backend (4894) + the page (4895)
pnpm dev:cad        # platform (4990) + CAD (4994) + the CAD page (4996)
pnpm build          # everything, in dependency order

node app/backend/dist/index.js   # the platform alone
node app/iot/dist/index.js       # IoT: the API and the page on 4992
node app/cad/dist/index.js       # CAD: the API and the pages on 4994
```

The platform creates the first account when the database is empty
(`HESTIA_ADMIN_USER` / `HESTIA_ADMIN_PASSWORD`, `admin`/`admin` by default —
change it after signing in). Without `HESTIA_JWT_SECRET` the secret is generated
at startup, so a restart signs everyone out; there is, however, never a default
secret known to everyone who has seen this repository.

In development the frontend runs separately and `/api` goes through the Vite
proxy to the backend. Once built there is no proxy — the backend serves both from
the same port.

**Ports live in one place**: the application's `.env`. The Vite configuration
reads the same file, so changing a port does not mean touching two configurations.

## Data

The store is a single file, `app/finances/data/finances.json`. At the scale of
household finances a database would be a burden with no upside: the file can be
opened in an editor, committed to git and copied with `cp`. In exchange
`JsonStore` takes on the two things a database usually handles — atomic writes
(through a sibling file and a rename) and queued changes (so two concurrent
modifications do not overwrite each other).

An empty store is given sample data at startup — a freshly installed application
with an empty list says nothing about what a working one looks like.

**Amounts are a whole number of minor units.** `0.1 + 0.2 !== 0.3`, so a
statement's total can drift from the bank by one unit — and nobody can explain
such a difference afterwards. Major units appear only on the way in and on the
way out (`toMinorUnits` / `formatAmount`).

## Language

Code, comments and the interface are in **English**. The locale and the currency
stay local: `formatAmount` prints `1 234,56 zł`, because that is the money the
household actually keeps.

## Documentation

TypeDoc generates two kinds of documentation, each in **Markdown and JSON**,
into `docs-site/` (git-ignored):

| | what it covers | for whom |
|---|---|---|
| **API** (`docs-site/api/`) | only what the packages export from `src/index.ts` | somebody working *with* Hestia |
| **complete** (`docs-site/full/`) | every module under `src/`, internals and private members included, plus the web applications | somebody working *on* Hestia |

The split answers two different questions. The API run says what can be
imported from `@hestia/core`; listing internal modules there would make the
public surface look several times larger than it is. The complete run is the
opposite — it exists precisely for what the other one leaves out, which is why
it also covers `app/web/*`, whose entry point is `main.tsx` and which a
barrel-based run cannot see at all.

```bash
pnpm docs              # both kinds, Markdown + JSON
pnpm docs:api          # public API only
pnpm docs:full         # everything
pnpm docs:api:md       # a single format, when only one is needed
pnpm docs:api:json
pnpm docs:full:md
pnpm docs:full:json
pnpm docs:clean
```

Configuration lives in `typedoc.json` (API) and `typedoc.full.json` (complete).
The complete run needs `tsconfig.docs.json`, which spans the whole repository —
something no build config should do, hence a file of its own.

## Commands

| command | what it does |
|---|---|
| `pnpm test` | every suite (Vitest, projects from `packages/*`, `app/*` and `app/web/*`) |
| `pnpm typecheck` | `tsc --noEmit` in every package |
| `pnpm build` | a full build in dependency order |
| `pnpm docs` | API and complete documentation, Markdown + JSON |
| `pnpm dev:platform` / `pnpm dev:finances` / `pnpm dev:cad` | individual applications |

## API

### Platform (`app/backend`)

| route | description |
|---|---|
| `POST /api/auth/login`, `GET /api/auth/me` | signing in, and who the token belongs to |
| `GET /api/platform/info` | what this server is, and where MQTT is |
| `GET /api/users/{user}/vfs/{readdir\|readFile\|stat\|exists}` | reading; `readFile` answers base64 in `data`, or the bytes themselves with `download=1` |
| `POST /api/users/{user}/vfs/{writeFile\|mkdir\|delete\|rename\|copy}` | writing |
| `/api/vfs/{operation}` | the same, for the caller's own space, without naming themselves |

The dialect is MyCastle's, deliberately: the pages moved over from it read
`{ data }` in base64 and a listing of `{ name, type }` with `1` for a file and
`2` for a directory. Matching the contract was cheaper than translating on every
request, and base64 is also why a PDF survives the trip.

**The user is in the path so that an admin can reach somebody else's space** —
but who may is decided by the **token**. Were the path to decide, typing another
name into the address bar would be enough.

### Finances (`app/finances`)

| route | description |
|---|---|
| `GET /api/health` | a check that the server is alive |
| `GET /api/summary?month=YYYY-MM` | everything the main page needs, in one request |
| `GET /api/transactions?month=YYYY-MM` | the list, newest first |
| `POST /api/transactions` | adding one (refuses an account that does not exist) |
| `PUT`/`DELETE /api/transactions/:id` | changing and deleting |
| `GET`/`POST /api/accounts`, `/api/categories` | the lookups; accounts come back with the balance computed |

### IoT (`app/iot`)

| route | description |
|---|---|
| `GET /api/health` | whether the platform responds, and where MQTT is |
| `GET`/`POST /api/devices` | the device list and registration |
| `POST /api/devices/:deviceName/reading` | a reading (an unknown device adds itself) |
| `DELETE /api/devices/:deviceName` | removing a device |

An unknown `/api/*` returns JSON with a 404; every other path gets
`index.html`, so refreshing a page inside the application does not end on an
error page.
