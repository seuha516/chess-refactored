---
name: Chess
description: 링크 하나로 친구와 두는 1대1 체스. 공원의 돌 체스 테이블.
colors:
  plaza: '#d5d7d2'
  slab: '#e8e9e5'
  slab-recessed: '#cfd2cb'
  field: '#f4f5f2'
  line: '#bfc3bb'
  line-strong: '#9da199'
  ink: '#1c211f'
  ink-secondary: '#454c48'
  ink-tertiary: '#5a615d'
  granite: '#2c312e'
  granite-engraving: '#bdb7aa'
  travertine-square: '#e6decb'
  slate-square: '#7c8a80'
  bench-green: '#2f5a45'
  bench-green-pressed: '#234535'
  on-green: '#f4f1ea'
  check-red: '#b3261e'
  notice-amber: '#ecd79c'
typography:
  display:
    fontFamily: "'Pretendard Variable', Pretendard, system-ui, sans-serif"
    fontSize: 'clamp(32px, 5vw, 46px)'
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: '-0.035em'
  headline:
    fontFamily: "'Pretendard Variable', Pretendard, system-ui, sans-serif"
    fontSize: '20px'
    fontWeight: 750
    lineHeight: 1.3
    letterSpacing: '-0.02em'
  title:
    fontFamily: "'Pretendard Variable', Pretendard, system-ui, sans-serif"
    fontSize: '16px'
    fontWeight: 650
    lineHeight: 1.45
  body:
    fontFamily: "'Pretendard Variable', Pretendard, system-ui, sans-serif"
    fontSize: '15px'
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Pretendard Variable', Pretendard, system-ui, sans-serif"
    fontSize: '13px'
    fontWeight: 600
    lineHeight: 1.4
  clock:
    fontFamily: "'Pretendard Variable', Pretendard, system-ui, sans-serif"
    fontSize: '24px'
    fontWeight: 650
    lineHeight: 1
    letterSpacing: '0.01em'
    fontFeature: "'tnum'"
rounded:
  control: '8px'
  panel: '14px'
  dialog: '16px'
  pill: '999px'
spacing:
  xs: '6px'
  sm: '10px'
  md: '16px'
  lg: '24px'
  xl: '32px'
components:
  button:
    backgroundColor: '{colors.slab}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '0 14px'
    height: '38px'
  button-hover:
    backgroundColor: '{colors.field}'
  button-primary:
    backgroundColor: '{colors.bench-green}'
    textColor: '{colors.on-green}'
    rounded: '{rounded.control}'
    padding: '0 14px'
    height: '38px'
  button-primary-hover:
    backgroundColor: '{colors.bench-green-pressed}'
  button-danger:
    backgroundColor: '{colors.check-red}'
    textColor: '#ffffff'
    rounded: '{rounded.control}'
  input:
    backgroundColor: '{colors.field}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '0 12px'
    height: '42px'
  clock-idle:
    backgroundColor: '{colors.slab-recessed}'
    textColor: '{colors.ink-secondary}'
    typography: '{typography.clock}'
    rounded: '{rounded.control}'
    padding: '7px 12px'
  clock-running:
    backgroundColor: '{colors.bench-green}'
    textColor: '{colors.on-green}'
  side-panel:
    backgroundColor: '{colors.slab}'
    rounded: '{rounded.panel}'
---

# Design System: Chess

## Overview

**Creative North Star: "The Park Stone Table"**

The room is a stone chess table in a city park. Two players sit at its top and bottom edges;
spectators stand around it and talk. The page ground is pale granite paving, the board is an inlay
of warm travertine and cool slate framed by a dark polished granite rim, and the coordinates are
engraved on that rim. Everything else is flat, quiet stone so the board and the clocks carry the
screen.

This is an Operate surface: people come to play one game. Density is moderate, hierarchy comes from
type weight and position rather than containers, and colour is almost absent. The one colour, park
bench green, appears only where something is active right now. The world is light because the
table lives in daylight; there is no dark theme.

**Key Characteristics:**

- A dark granite table with an inlaid board is the only heavy object on the page.
- Seats, not panels: each player is a strip on their edge of the table with name, taken pieces and
  clock.
- Colour means "active": the running clock, the latest move, the primary action, the selection.
- The square size is the layout module; board, rim and columns derive from it.
- Newly drawn carved-stone piece silhouettes (SVG, 45x45 viewBox).

## Colors

A cool granite neutral scale around one warm inlay, with a single green for whatever is active.

### Primary

- **Park Bench Green** (#2f5a45): running clock, latest move in the move sheet, primary buttons
  (참가, 방 만들기, 한 판 더), selected square tint (55% alpha), target hover, focus rings, the
  invite button while a player waits alone. Pressed/hover state Bench Green Pressed (#234535). Text
  on it is On Green (#f4f1ea).

### Neutral

- **Granite Plaza** (#d5d7d2): page ground and sticky top bar.
- **Slab** (#e8e9e5): the side column, lobby tables, dialogs, default buttons.
- **Recessed Slab** (#cfd2cb): idle clock, confirm bar.
- **Field** (#f4f5f2): inputs, other people's chat bubbles, button hover.
- **Line** (#bfc3bb) and **Strong Line** (#9da199): hairline dividers; input and button borders.
- **Ink** (#1c211f), **Ink Secondary** (#454c48), **Ink Tertiary** (#5a615d): text. Tertiary only on
  Slab or lighter.
- **Polished Granite** (#2c312e) with a fleck tile (public/images/granite.svg): the table rim and the
  lobby's mini boards only. **Rim Engraving** (#bdb7aa) for coordinates on it.
- **Travertine** (#e6decb) and **Slate** (#7c8a80): light and dark squares; also the promotion
  choices' ground.

### State colours

- **Check Red** (#b3261e): the king in check (radial glow), a running clock under 30 seconds,
  resign confirmation, error text.
- **Last move**: a wash in the stone's own tones over both squares: ink `rgb(28 33 31 / 21%)` on
  travertine, light `rgb(236 234 226 / 32%)` on slate.
- **Destination marks** (`--mark`): ink at 48% on travertine, light at 92% on slate, so dots and
  capture rings keep 3:1 against their square.
- **Notice Amber** (#ecd79c): the connection banner, the only non-stone colour outside play.

### Named Rules

**The Active Edge Rule.** Green marks only what is active at this moment. A decorative green
element makes the running clock harder to find.

**The One Rule Per State Rule.** On the board, `::before` tints a square (last move, selection,
check) and `::after` marks a destination (dot for a move, ring for a capture). No state borrows
another's mark.

## Typography

**Font:** Pretendard Variable (self-hosted from the `pretendard` npm package, dynamic subset), with
system Korean fallbacks. One family for everything; tabular numerals for clocks, counts and move
numbers.

**Character:** A neutral Korean workhorse set with firm weights; hierarchy comes from weight
(500–800) and size, never from a second family.

### Hierarchy

- **Display** (800, clamp(32px, 5vw, 46px), 1.1, -0.035em): the lobby heading only.
- **Headline** (750, 20px): dialog titles; room title in the top bar at 700/17px.
- **Title** (650, 16px): seat names, the status line, lobby table names (700).
- **Body** (400, 15px, 1.5): chat, lead text (17px on the lobby).
- **Label** (600, 12.5–13.5px): counts, seat tags (나 · 백), time control, buttons in the controls
  row.
- **Clock** (650, 24px, tabular): seat clocks; 22px on phones.

**The Keep-All Rule.** Korean text uses `word-break: keep-all` so words never split across lines.

## Layout

- **Module:** `--square` = clamp(40px, min((100dvh − 236px) / 8.7, (100vw − 88px − side) / 8.7),
  88px); `--rim` = 0.35 × square; `--board` = 8 squares + 2 rims. The board fills the viewport height
  on desktop.
- **Room (≥900px):** two columns, board column (seat, table, seat) and a side column (360px, 320px
  below 1180px) that matches the board column's height exactly (absolutely positioned inner) with
  status/actions, move sheet (2 parts) and chat (3 parts).
- **Room (<900px):** one column; the side column follows the board; the move sheet becomes one
  horizontally scrolling line; the chat log is 260px tall.
- **Phones (<600px):** the board runs full width inside a thin 6px granite rim; coordinates move
  inside the squares; seats and side content keep a 12px gutter.
- **Lobby:** max 1080px, heading, lead and create form, then a grid of tables
  (auto-fill, minmax(232px, 1fr); 160px below 720px).
- **Spacing:** 6 / 10 / 16 / 24 / 32px; more space above a section than inside it.

## Elevation & Depth

Flat stone at rest; depth belongs to objects that physically stand above the plaza.

### Shadow Vocabulary

- **Table** (`inset 0 1px 0 rgb(255 255 255 / 9%), 0 2px 3px rgb(28 33 31 / 18%), 0 22px 40px -18px rgb(28 33 31 / 55%)`):
  the granite table only.
- **Plaque** (`0 2px 4px rgb(28 33 31 / 16%), 0 30px 56px -18px rgb(28 33 31 / 60%)`): the flat
  travertine result plaque on the board.
- **Dialog** (`0 32px 64px -24px rgb(28 33 31 / 60%)`) over a 45% ink backdrop.
- **Lifted piece** (`drop-shadow(0 8px 6px rgb(28 33 31 / 35%))`): the piece being dragged.
- **Hover lift** (mini table rises 3px, its shadow deepens to `0 18px 22px -12px`): lobby tables.

**The Heavy Object Rule.** Only the table, the plaque, dialogs and a lifted piece cast shadows.
Panels separate with hairlines, not shadows.

## Shapes

Controls 8px, panels 14px, the result plaque 12px, dialogs 16px, seat pucks and chat bubbles round (chat
bubbles 12px with a 4px corner toward the speaker). The table rim radius follows the rim
(0.4 × rim + 4px); the board inside is square-cornered.

## Components

### Seat strip (signature)

52px row on the table edge: colour puck (22px; cream, charcoal, or dashed when empty), name (650)
with tags (나 · 백 · 연결 끊김 · 대기 중), pieces this player took (22px, overlapping by 7px) with the
material lead (+3), and the clock at the far end. An empty seat reads "빈 자리" and carries the
참가 button; the viewer's own waiting seat carries 일어나기. A new occupant settles in with a 260ms
rise.

### Table and board

Granite rim with engraved coordinates, travertine/slate squares as buttons, SVG pieces. Moves slide
190ms (cubic-bezier(0.2, 0.8, 0.25, 1)), castling slides the rook too; reduced motion skips it.

### Buttons

- **Shape:** 8px, 38px tall (34px in the controls row), 600 weight.
- **Default:** Slab with Strong Line border; hover Field. **Primary:** Bench Green. **Danger:** Check
  Red, only for confirming resignation. **Ghost:** transparent, 7% ink on hover.
- **Pressed:** translateY(1px). **Focus:** 2px green outline, 2px offset.

### Confirm bar

Resign and draw offer take a second press: the controls row is replaced by a Recessed Slab bar with
the question, the action and 취소. It closes by itself after 6 seconds or on Escape.

### Inputs

42px, Field background, Strong Line border, green caret; focus turns the border and outline green.

### Result plaque

A flat travertine plaque (#e6decb, 1px ink hairline) centered on the board: result (800, up to 46px;
green for a win), reason, then the join button and 닫기. While the plaque is shown the seat's 참가
button moves onto it (labelled 한 판 더 or 참가하기), so there is only one join button, and the status
line leads with the result.

### Lobby table

No card: each room is a mini table (112px granite frame, 8×8 checker) standing on the plaza between
its two seat pills, with the room name and status (green dot while playing) below. The table rises
on hover and the name underlines.

## Do's and Don'ts

### Do:

- **Do** derive board, rim and column sizes from `--square`.
- **Do** keep green for the active thing: running clock, latest move, primary action, selection.
- **Do** keep text on Plaza at Ink Secondary or darker; Ink Tertiary only on Slab or lighter.
- **Do** give every new board state its own mark on `::before` (tint) or `::after` (destination).

### Don't:

- **Don't** add shadows to panels, lists or buttons; they belong to heavy objects only.
- **Don't** use the granite fleck texture anywhere but the table and mini tables.
- **Don't** use a browser `confirm()` or `alert()`; use the confirm bar.
- **Don't** put green on permanent chrome; the brand mark is granite.
- **Don't** wrap a lobby table in a card; it stands on the plaza.
- **Don't** introduce a second typeface or a dark theme without a new direction decision.
