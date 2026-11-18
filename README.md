# Cards New Tab

[![Get it on cmux](https://cmux.com/extensions/badge.svg)](https://cmux.com/setups/manaflow-ai/cmux-newtab-cards-look)

![The Cards New Tab page: one rounded field, the project and agent under it, three chat cards](screenshots/after-few-light.png)

cmux's Cards New Tab page, as a look you install: the folder and the machine over one rounded
field, the agent under it, then "Chats" and three chats as cards (the ones that need you first,
then the most recent), each with its age, its title and what it waits on (or its last reply).

It used to ship inside cmux as a New Tab template. It is now built only on the public
customization API, so you can read and change every part of it:

| File | What it does |
| --- | --- |
| `cmux-setup.json` | Sets `tabs.newTabApp` to this look's view, so it draws the New Tab page |
| `customize/` | A `cmux.newtab/1` view: the field, the chips and the chat cards (`main.js`) |
| `shots/` | How the screenshots are drawn: `main.js` in cmux's own app runtime, through cmux's web New Tab page |
| `SHOTS.md` | Before (the template cmux shipped) and after (this look), side by side |

```sh
cmux setup install github.com/manaflow-ai/cmux-newtab-cards-look
cmux setup remove manaflow-ai/newtab-cards-look
```

Reading your chats is granted at install. Starting a chat from the field and opening a card need
Run actions and Change workspaces, which you turn on in Settings > Apps > My views.

While it is installed, its `customize/` view stands in for your own view, if you have one;
`cmux setup remove` puts yours back and cmux draws its own New Tab page again.

## What the public API does not do yet

The look follows cmux's own page as far as the API reaches today. What is still missing is
tracked in the cmux repository and lands there, not here:

- cmux's own composer as a view node: the folder and machine pickers, the permission mode and the
  model under the field, attachments, dictation. Until then the field is a plain text field that
  starts a chat with `newTab.submit`, the folder and machine are labels, and the agent is a menu.
- Recent chats and the chats that need you, read and ordered by cmux itself (`agent_chat.list` with
  `limit` and `state`), with each chat's last reply. Until then, on an older cmux, the look orders
  the chats itself.
- An agent's own mark (cmux's cards show the agent's logo; a view gets the chat glyph), and the
  cards' raised surface and shadow.
- With no chats, cmux's page shows placeholder cards while it reads; the look says "No chats yet".
