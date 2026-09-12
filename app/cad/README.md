# `app/cad` — the CAD application

The server for the CAD pages: the notes, the 2D drawing and the 3D model. It
serves the built frontend (`app/web/cad` → `public/`) and exposes `/api/*`;
accounts and files come from the platform (`app/backend`), which it forwards to
under `/platform/*`.

```bash
pnpm dev:cad     # the platform, this server and the page, together
pnpm build:cad   # the packages, the page into `public/`, then this server
```

`build:cad` builds the **whole** application, not only the server: without the
page in `public/` the server would start and serve nothing, which is a way of
being broken that says nothing about its cause. The step that builds the page
alone is `build:web-cad`, and it is what `build:cad` calls first.

| Address | What it is |
| ------- | ---------- |
| `/api/health` | Whether this server is up, and whether the platform answers |
| `/api/me` | Who the caller is, as this application sees them (the platform checks the token) |
| `/platform/*` | Forwarded to the platform with the caller's own token |
| everything else | The built page from `public/` |

## Why there is so little here

The CAD pages compute everything in the browser: the drawing engine, the
constraint solver and the OpenCascade kernel all run there, and what they
produce goes into the user's files on the platform. So this server keeps no
store of its own and has almost no API.

It exists all the same. The page then talks to **one** address, its own, and
where the platform lives stays a matter of this server's configuration rather
than something the browser has to guess — the same arrangement `app/iot` uses.
And work that genuinely needs Node (converting a STEP file outside the browser,
meshing a model too large for it) has somewhere to go without moving the
application first.

## Configuration (`.env`)

| Variable | Default | What it is |
| -------- | ------- | ---------- |
| `CAD_PORT` | 4994 | This server's port |
| `CAD_WEB_PORT` | 4996 | The page's port in development (read by `app/web/cad/vite.config.ts`) |
| `HESTIA_PLATFORM_URL` | `http://localhost:4990` | Where the platform is, as seen **by this server** |

A platform that is down does not stop this server from starting: `/api/health`
and the page say so. Otherwise the order in which the applications are started
would become part of the contract.
