# Chrome Web Store listing

The text for the listing, and the reason for every permission the extension
asks for (FR-011, SC-006). It is a deliverable of P9 whether or not the
submission happens in that phase: a member installing an unpacked build reads
the same prompt a store reviewer does, and neither is owed less.

## Short description

Today's tasks and your next meetings beside the page you are working on, from
your own Botvy.

## Full description

Botvy is a self-hosted assistant. This extension is its companion at the desk:
it shows the tasks you have due today and the meetings coming in the next seven
days, lets you add a task, a reminder or a meeting in a few keystrokes, and
turns whatever you are reading into one of those with a right-click.

It is a companion, not a second app. Everything it does exists on your phone,
and nothing lives only here. It talks to one server — **your** Botvy, at the
address you give it — and to nothing else.

**It works with the network off.** What you add is kept and sent when the
connection returns, exactly once. The panel says whether it is in step,
catching up, offline, or holding something your Botvy refused, and never shows
you yesterday's list as though it were today's.

## Permissions, and why each one is here

| Permission | Why |
|---|---|
| `sidePanel` | The panel itself. It is the whole product surface. |
| `storage` | Your sign-in, the address of your Botvy, and your time zone and language so dates are shown in yours. No task or meeting text is kept here. |
| `alarms` | A once-a-minute heartbeat. Chrome shuts a background script down when it is idle; without this the panel would quietly stop keeping up. |
| `contextMenus` | The four right-click entries: add a selection as a task or a reminder, save the page to read, add the page as a task. |
| `notifications` | Showing a reminder your Botvy has just sent, so that sitting at your computer does not mean being told only on your phone. |
| `identity` | Signing in with Google, if you use a Google account. Nothing is asked for unless you press that button. |

**No host permissions are requested up front.** The address of your Botvy is
yours and differs for every member, so the extension asks for permission to
reach *that one origin* when you sign in — never for the web at large.

**There is no `scripting` permission and no content script.** The extension
never reads a page you are on. The text a right-click captures is the text you
selected, which Chrome hands to the extension with the click.

## What leaves this browser, and where it goes

Only to your own Botvy, at the address you entered. There is no analytics, no
telemetry, no third-party service, and no server operated by anyone else. Sign
out and everything cached here is deleted, your session is ended on your Botvy,
and this browser is removed from your device list.

## Data disclosure (store form)

- **Personally identifiable information** — collected: no (the extension stores
  your own sign-in on your own computer; nothing is transmitted to the
  developer).
- **Authentication information** — stored locally to keep you signed in; sent
  only to the server you configure.
- **Web history** — not collected. The extension has no access to the pages you
  visit; a captured page's address is one you chose to capture.
- **Sold or transferred to third parties** — no.
- **Used for anything other than the stated feature** — no.
