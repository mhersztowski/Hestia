# `drive-backend` (`app/drive`)

The Drive application's server. It serves the page built from `app/web/drive`
and answers `/api/*`; accounts and files come from the platform
(`app/backend`) through `/platform/*`.

**There is no store here.** The drive shows the platform's files, and the
user's own token decides what it will show — this server forwards, it does not
read on anyone's behalf. That way one account works in every Hestia application
and a backup is one directory rather than several scattered stores.

```
pnpm --filter drive-backend dev     # the server, on DRIVE_PORT (4997)
pnpm --filter drive-web dev         # the page, on DRIVE_WEB_PORT (4998)
```

In development the page proxies `/api` and `/platform` to this server; once
built there is no proxy — this server serves the page too, from `public/`.

A platform that is down does not stop this server: `/api/health` and the page
say so. Otherwise the order of starting applications would become part of the
contract.
