---
version: 1
slug: "src-client-index-html"
primary_target: "src/client/index.html"
related_targets: ["src/client/style.css","src/client/main.ts"]
---

# Chess client (lobby + room)

Scope: the whole browser client, src/client (lobby, room, dialogs). Visitor mode: Operate.
Audience: friends who open an invite link on laptop or phone to play one casual game; spectators chat.
Task: pick a name, sit down, play on a 15+10 clock, offer draw / resign, play again.
Constraints: E2E ids and Korean copy the tests read; keyboard, click and drag input; no framework.
Memorable moment: the empty chair at the table edge with the join button on it; opponent moves slide across the stone.

## Direction contract

THESIS: The room is a park stone chess table. Players sit at its top and bottom edges; spectators stand around the bench. Refuses the category default of a dark app with a wooden board beside a generic info panel.

OWN-WORLD: Pale granite plaza ground, a dark polished granite rim framing a travertine/slate inlaid board, coordinates engraved on the rim. Ink is green-black; the single colour is park-bench green, used only where something is active (running clock, primary action, selection). Check is red. Pieces are newly drawn carved-stone SVG silhouettes. Pretendard, tabular numerals for clocks. Stated raises: literal name plaques (quote grammar); colour only on the active edge (cloud edge); one fixed rule per board state (one-bit desktop); the square size is the layout module (Dumbar).

STORY: A friend opens the link, names themself, sees the table with an empty chair facing them, sits, plays, and after the result plaque presses "한 판 더".

FIRST VIEWPORT: Desktop: board column centered-left at viewport height (opponent seat strip, rimmed board, my seat strip), a 360px side column to the right with status, actions, move sheet and chat. Phone: full-width board between the two seat strips, status and actions directly below, move strip and chat after. Lobby: header, a create form, then a plan of tables, each drawn from above with its two seats.

FORM: Park stone chess table, candidate 6 of 7 on the ordered list; seed key 04ba1936.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
