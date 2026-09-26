---
version: 1
slug: "src-client-index-html"
primary_target: "src/client/index.html"
related_targets: ["src/client/style.css","src/client/main.ts","src/client/scene"]
---

# Chess client (lobby + room)

Scope: the whole browser client, src/client (lobby, room, dialogs). Visitor mode: Operate, with the board as an Experience moment.
Audience: friends who open an invite link on laptop or phone to play one casual game; spectators chat.
Task: pick a name, sit down, play on a 15+10 clock, offer draw / resign, play again.
Constraints: E2E ids and Korean copy the tests read; keyboard, click and drag input; no framework; a 2D board when WebGL is missing; prefers-reduced-motion honoured.
Memorable moment: a capture — the attacker slams down, the game freezes for a beat, the taken piece spins off the table edge and lands beside the board; a mate topples the king in slow motion.

## Direction contract

THESIS: The room is a real stone chess table in a park at golden hour, rendered live in 3D; every move is a stone hitting stone. Refuses the category default of a flat top-down board beside a rounded info card, and the "3D chess" default of a glossy studio void.

OWN-WORLD: Low warm sun through a tree canopy: dappled leaf light drifts across a polished dark granite slab with an inlaid travertine/slate board and engraved coordinates; the surroundings fall into cool green-black shade. Pieces are carved alabaster and black basalt. UI is shade: green-black ground, stone-white text, hairlines, 4px cut corners, no cards or pills. Sunlight is the only accent: what is active stands in the light (running clock, selection, targets, primary action). Check is red. Hahmlet (engraved serif) for room names, results and clocks; Pretendard for everything else.

STORY: A friend opens the link, sees the table from above the park, the camera settles to their chair, they sit; pieces rain onto the board; they play with weight and sound; after the toppled king and the title band they press "한 판 더".

FIRST VIEWPORT: Desktop room: the 3D table fills everything left of a 380px shade column; the opponent's plate and clock sit over the far edge, mine over the near edge; the column holds the referee line, actions, score sheet and chat. Phone: plates above and below a near-top-down table spanning the width, the column's content follows. Lobby: the live table idles under the canopy on the right half (top on phones); the left holds the Hahmlet heading, create form and the list of tables.

FORM: User-pinned extension of the park stone table (seed key 04ba1936, candidate 6 of 7) into a real-time 3D world; no new roll. Signature interaction: escalating impact grammar (move → capture hit-stop and knock-off → check shudder → mate slow-motion topple), plus the camera fly-in and 180° orbit on flip.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
