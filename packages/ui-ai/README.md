# `@hestia/ui-ai`

The AI assistant, moved over from MyCastle's
`packages/ui-texteditor/src/monaco/agent`: the engine, the model providers
(Anthropic and anything OpenAI-compatible), the file and web tools, and the chat
panel.

A package of its own because an assistant is a thing a page may or may not want,
and the pages that do not should carry no part of it — no provider, no key
handling, no chat. That is also why it left the text editor: it was never the
editor's, it only lived there.

## What came along unchanged

The engine's behaviour is as it was, including two things worth keeping:

- **Every tool call of a turn runs at once.** Each file operation is its own
  round trip; awaiting them one by one made file access "terribly slow" over
  many files. The results are put back in the order the model asked for them,
  because Anthropic wants a `tool_result` for every id.
- **An empty write is refused.** A model sometimes writes an empty file "for
  now" and corrects itself afterwards — and that destroys what was there. An
  error rather than a quiet success makes it retry with the whole content in the
  same turn.

Its file tools work on a `FileSystemProvider` from `@hestia/core`, which is the
same VFS abstraction MyCastle used, so nothing in the agent had to change to
follow it here.

## In a drive

`driveAssistant()` is the `DriveAssistant` capability that `@hestia/ui-core`
describes:

```tsx
import { driveAssistant } from '@hestia/ui-ai';

<Drive
  store={store}
  assistant={driveAssistant({ provider, defaultConfig, onFileWritten: refresh })}
/>
```

The implementation lives here rather than in `core-ui`, which is the point of
the seam: the drive package never mentions a model provider or an API key. Pass
`null` and the drive offers no assistant at all — no button, no empty panel
explaining that one is unavailable.

The folder the user is looking at and the file that is open reach the agent as
**context**, not as instructions: "the user is looking at `X`" is the difference
between an assistant and a search box.

Note that the agent works on a `FileSystemProvider` while the drive works on its
own `DriveStore`. Two contracts on purpose: the drive needs a listing and a
preview, the agent needs a file system it can act on.

## Status

- ✅ Typechecks. No tests: what is here is a protocol against somebody else's
  API and a chat panel, and the parts worth asserting on (the tool executor's
  refusals) would need the provider mocked to say anything.
