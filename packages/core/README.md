# @hestia/core

The shared model: domain models, nodes, the MQTT topic and packet registry, the
RPC registry, the VFS abstraction, data sources, MJD — plus `finance/`, which is
Hestia's own and sits in a directory of its own so that a later update of the
base stays a merge rather than a guess about who owns which file.

Everything outside `finance/` came from MyCastle's `packages/core`, with the
package scope rewritten (`@mhersztowski/*` -> `@hestia/*`) and the comments
translated into English.

## What came over in the September 2026 update

The Hestia copy was made from an older MyCastle. Brought over from the current
one:

- **Planning fields on tasks and projects** — `TaskPriority`, `TaskTimeEntry`,
  `TaskStatusDef`, `DEFAULT_TASK_STATUSES`, and on `TaskModel`/`TaskNode`:
  `status`, `priority`, `startDate`, `dueDate`, `assignees`, `tags`,
  `timeEntries`, `parentTaskId`, `order`, `docPath`, `dependsOn`. On
  `ProjectModel`/`ProjectNode`: `color`, `statuses`, `archived`.
- **Time tracking on `TaskNode`** — `isTracking`, `trackedMinutes`,
  `startTracking`, `stopTracking`. `trackedMinutes` takes `now` as a parameter
  rather than reading the clock, or the result would depend on the moment of
  the call and there would be no way to test it.
- **Dependencies on `TaskNode`** — `addDependency`, `removeDependency`. Only the
  predecessor side is stored; "blocks" is its inverse, computed from the whole
  set.
- **Cancelled occurrences on `EventNode`** — `exceptions`, `isCancelledOn`,
  `cancelOccurrence`, `restoreOccurrence`, and `compareToOn` / `sortByTimeOn`
  for ordering one day's list by time of day.
- **A fix to date parsing in `EventNode`** — the old version caught an
  exception, but `dayjs('not-a-date')` does not throw: it returns an Invalid
  Date, which then compares as NaN against everything and left the list sorted
  arbitrarily. `parseValidOrNull` checks `isValid()` instead.
- **Device registration** — `DeviceRegistrationRequest`,
  `IotDeviceClient.requestRegistration()` and the `registerRequest` MQTT topic.
  A device asks on every connection; the entry appears only once it is accepted
  in the panel.
- **`drive/publicPaths.ts`** — which Drive directories are readable without
  logging in. One rule for the server and the page, because the two had a copy
  each and a drift between them means either serving a file the UI does not mark
  as public, or showing a link that leads to a 403.

## What was deliberately left out

- **The `kasiaInbox` / `kasiaOutbox` MQTT topics.** They belong to the assistant
  living in MyCastle's `media-backend`, an application Hestia does not have, and
  nothing in `core` is supposed to be about one application. Twenty lines in
  MyCastle's `mqtt/topics.ts` if they are ever wanted.
- **`models/VoiceActionModel.ts`.** The model of the Aura voice assistant, whose
  logic is defined in Blockly — and Blockly is out of scope for the port.
- **`core-backend`'s `api.ts`, `projects/` and `server/`**, as before.

## Differences from the MyCastle source, on purpose

Every ported file is identical to MyCastle's once comments are ignored, except:

- `DEFAULT_TASK_STATUSES` carries English labels (`To do`, `In progress`,
  `Done`) rather than Polish ones, because interface text in this repository is
  English — the same decision already made for `EventNode.describeRecurrence`.
- In `drive/publicPaths.ts` the two local identifiers are English
  (`normalize`, `path` rather than `normalizuj`, `sciezka`).
- Test names and comments are English.

## Tests

`pnpm test` runs them. As of this port `EventNode.test.ts` **has not been run**:
it needs `dayjs`, and the port was done in an environment with no network and
no `node_modules`, so `pnpm install` could not run. Everything else in the
package that does not reach for an external dependency was run and passes
(`TaskNode`, `TaskNode.roundtrip`, `ProjectNode`, `drive/publicPaths` — 63
assertions). Running `pnpm test` on a machine with the dependencies installed is
what closes that gap.
