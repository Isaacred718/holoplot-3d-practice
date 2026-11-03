# Stream Deck setup — Holoplot 3D (Practice)

The deck talks to the web app with plain hotkeys. No plugin, no driver
beyond the normal Stream Deck software.

## The one hard limit
A USB Stream Deck **cannot** drive the app on an iPad — the deck only
sends keystrokes to the computer it is plugged into, and iPad Safari
never sees them. Plug the deck into the Mac (or PC) and keep the app's
browser tab focused there. Everything below assumes that setup.

## Setup (about 10 minutes, one time)
1. Open https://isaacred718.github.io/holoplot-3d-practice/ in a desktop
   browser and leave that tab focused while you work.
2. In the Stream Deck app, create a profile (or a page in your existing
   profile) for this app.
3. For each button below: drag a **System → Hotkey** action onto it,
   click the hotkey field, and press the listed key (F13–F24 are above
   the number row on a full keyboard; if your keyboard lacks them, the
   Hotkey field also accepts them from the deck software's key picker
   or by pressing Shift+F1… combos are NOT used here — plain F13–F24
   plus the three Shift+F-key entries at the end).
4. Title each button as listed so the deck reads like the tool rail.

## Layout (15-key, 3 rows of 5)
Row 1: Select (F13) · Orbit (F14) · Hand (F15) · Rectangle (F16) · Push/Pull (F17)
Row 2: Move (F18) · Tape (F19) · Eraser (F20) · Zoom Extents (F21) · Undo (F22)
Row 3: Save (F23) · Delete block (F24) · Next venue (Shift+F13) · Res Low/High (Shift+F14) · Snap (Shift+F15)

Shift+F16 opens/closes the in-app Shortcuts panel, which also lists
this map. The same map is downloadable in the app as
`streamdeck-keymap.json`.

## Colours (suggested, matches the app's rail)
Tools blue, view actions (Zoom Extents) teal, Undo amber,
Delete red, Save green, toggles grey.

## Test checklist (first plug-in)
- App tab focused, press deck Select → status bar says "Deck: select tool."
- F16 Rectangle → draw a block with two clicks.
- F24 with the block selected → block deleted. F22 → it comes back.
- Shift+F13 → venue cycles and the camera reframes.
If a press does nothing, the tab was not focused, or that button's
Hotkey action is not set to the exact F-key.
