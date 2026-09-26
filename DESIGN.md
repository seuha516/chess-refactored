---
name: Chess
description: 링크 하나로 친구와 두는 1대1 체스. 해 질 녘 공원의 돌 체스 테이블, 실시간 3D.
colors:
  shade-deep: '#0a0f0d'
  shade: '#101714'
  shade-panel: '#141c19'
  shade-raised: '#1b2521'
  shade-hover: '#25312c'
  line: 'rgba(232, 224, 204, 0.11)'
  line-strong: 'rgba(232, 224, 204, 0.24)'
  stone-text: '#ede6d6'
  stone-text-secondary: '#b9b1a0'
  stone-text-tertiary: '#918b7e'
  sun: '#f5c77e'
  sun-strong: '#ffd999'
  sun-ink: '#22190b'
  sun-core: '#fff0cf'
  check-red: '#e5604a'
  check-red-strong: '#c8412c'
  check-glow: '#ff4a2e'
  travertine-square: '#e2d6bd'
  slate-square: '#5f6d64'
  granite: '#26292a'
  alabaster-piece: '#efe7d8'
  basalt-piece: '#2a2e2d'
typography:
  display:
    fontFamily: "'Hahmlet Variable', 'Nanum Myeongjo', serif"
    fontSize: 'clamp(44px, 6vw, 76px)'
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: '-0.025em'
  result:
    fontFamily: "'Hahmlet Variable', 'Nanum Myeongjo', serif"
    fontSize: 'clamp(56px, 7.5vw, 104px)'
    fontWeight: 800
    lineHeight: 1
    letterSpacing: '-0.02em'
  clock:
    fontFamily: "'Hahmlet Variable', 'Nanum Myeongjo', serif"
    fontSize: '30px'
    fontWeight: 600
    lineHeight: 1
    letterSpacing: '0.01em'
    fontFeature: "'tnum'"
  headline:
    fontFamily: "'Hahmlet Variable', 'Nanum Myeongjo', serif"
    fontSize: '21px'
    fontWeight: 650
    lineHeight: 1.2
  title:
    fontFamily: "'Pretendard Variable', Pretendard, system-ui, sans-serif"
    fontSize: '17px'
    fontWeight: 650
    lineHeight: 1.25
  body:
    fontFamily: "'Pretendard Variable', Pretendard, system-ui, sans-serif"
    fontSize: '15px'
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Pretendard Variable', Pretendard, system-ui, sans-serif"
    fontSize: '13px'
    fontWeight: 650
    lineHeight: 1.4
rounded:
  hairline: '2px'
  cut: '4px'
  dialog: '6px'
spacing:
  xs: '6px'
  sm: '12px'
  md: '16px'
  lg: '24px'
  xl: '48px'
components:
  button:
    backgroundColor: 'transparent'
    textColor: '{colors.stone-text}'
    rounded: '{rounded.cut}'
    padding: '0 15px'
    height: '40px'
  button-primary:
    backgroundColor: '{colors.sun}'
    textColor: '{colors.sun-ink}'
    rounded: '{rounded.cut}'
    padding: '0 15px'
    height: '40px'
  button-primary-hover:
    backgroundColor: '{colors.sun-strong}'
  button-danger:
    backgroundColor: '{colors.check-red}'
    textColor: '#1a0805'
    rounded: '{rounded.cut}'
  input:
    backgroundColor: '{colors.shade-deep}'
    textColor: '{colors.stone-text}'
    rounded: '{rounded.cut}'
    padding: '0 14px'
    height: '44px'
  clock-idle:
    backgroundColor: 'rgba(10, 15, 13, 0.78)'
    textColor: '{colors.stone-text-secondary}'
    typography: '{typography.clock}'
    rounded: '{rounded.cut}'
    padding: '8px 14px 7px'
  clock-running:
    backgroundColor: '{colors.sun}'
    textColor: '{colors.sun-ink}'
  side-panel:
    backgroundColor: '{colors.shade-panel}'
    rounded: '0'
---

# Design System: Chess

## Overview

**Creative North Star: "The Park Table at Golden Hour"**

The room is a real stone chess table in a park, drawn live in 3D (three.js). A low sun comes
through a tree canopy: dappled light drifts across a polished dark granite slab with an inlaid
travertine and slate board, the coordinates are engraved on the slab for whoever sits at the near
edge, and everything around the table falls into cool green-black shade. Pieces are carved
alabaster and black basalt. Every move is stone meeting stone, and the table acts it out.

The interface around the table is shade: flat green-black ground, stone-white text, hairlines, 4px
cut corners. There are no cards, pills or panels with shadows. It stays an Operate surface: the
board, the clocks and the next action carry the screen, and the 3D scene never hides a control.

**Key Characteristics:**

- The 3D table is the only lit object; the UI is the shade around it.
- Sunlight is the only accent: what is active stands in the light.
- Impact escalates with the event: move, capture, check, mate.
- The DOM board is laid invisibly over the 3D board and keeps input, focus and screen-reader text.
- Two faces: Hahmlet (engraved serif) for names on stone, results and clocks; Pretendard for the rest.

## Colors

A green-black shade scale, warm stone-white text, and one colour of light.

### Primary

- **Sunlight** (#f5c77e): the running clock, the primary action (방 만들기, 참가, 한 판 더), the
  latest move in the sheet, the "your turn" status, the invite button while waiting alone, focus
  rings, the material lead (+3), a room in play in the lobby. Hover Sun Strong (#ffd999). Text on it
  is Sun Ink (#22190b, 11:1).
- In the scene the same light marks the selected piece (a warm pool under it), legal targets (small
  pools of light with a Sun Core #fff0cf centre) and capture targets (a ring of light round the
  piece), and the last move (a 20–30% wash on both squares).

### Neutral

- **Shade** (#101714): page ground, scene fog and background. **Deep Shade** (#0a0f0d): inputs, the
  confirm bar. **Panel Shade** (#141c19): the side column and dialogs. **Raised** (#1b2521) and
  **Hover** (#25312c): promotion choices, scrollbars.
- **Line** (stone-white at 11%) and **Strong Line** (24%): hairline dividers, button borders.
- **Stone Text** (#ede6d6), **Secondary** (#b9b1a0), **Tertiary** (#918b7e, ≥4.5:1 on Panel Shade).
- **Travertine** (#e2d6bd) and **Slate** (#5f6d64): board squares in the 2D fallback and the lobby's
  mini tables. **Granite** (#26292a): their frame.

### State colours

- **Check Red** (#e5604a): a clock under 30 seconds (the running one blinks between Check Red and
  #c8412c), resign confirmation, errors. In the scene the king in check stands in a pulsing
  red glow (#ff4a2e).

### Named Rules

**The Light Means Active Rule.** Sunlight marks only what is active now. A decorative warm element
competes with the running clock and the lit targets.

**The Shade Rule.** UI surfaces are flat shade with hairlines. No colored glows, no glass, no
gradients except the functional scrims that keep type readable over the scene's edges.

## Typography

**Display font:** Hahmlet Variable (`@fontsource-variable/hahmlet`, SIL OFL 1.1), an engraved
Korean serif, for the lobby heading, room names, result titles, clocks, move numbers and the
coordinates cut into the slab.
**UI font:** Pretendard Variable (dynamic subset) for everything else.

### Hierarchy

- **Display** (Hahmlet 700, clamp(44px, 6vw, 76px), 1.02): the lobby heading 대국실.
- **Result** (Hahmlet 800, clamp(56px, 7.5vw, 104px)): 승리 (sunlight), 패배 (secondary), 무승부.
- **Clock** (Hahmlet 600, 30px, tabular; 26px on phones).
- **Headline** (Hahmlet 650, 21px): room title; room names in the lobby at 20px; dialog titles 24px.
- **Title** (Pretendard 650, 17–18px): seat names, the status line.
- **Body** (Pretendard 400, 15px): chat, lead text at 17.5px.
- **Label** (Pretendard 600–700, 13–14px): counts, tags, controls.

**The Keep-All Rule.** Korean text uses `word-break: keep-all` so words never split across lines.

## Layout

- **Room (≥900px):** the stage (3D table) fills everything left of a side column (380px, 340px below
  1180px). A transparent top bar spans both: back and room title over the stage, invite, sound and
  name over the column. The opponent's seat strip sits under the top bar, mine at the bottom; the
  camera frames the board in the safe area between them (`--safe-*` insets on `.scene`).
- **Camera:** 30° field of view; elevation 50° on wide stages rising to 64° on tall ones so the
  far squares stay tappable; the distance is fitted to the safe area every resize.
- **Room (<900px):** top bar, opponent strip, the table (0.9 × screen width tall), my strip, then
  status/actions, the move sheet as one scrolling line, chat.
- **Lobby:** heading, create form and the list of tables on the left (620px); the live table idles
  on the right half, slowly orbiting; on phones it sits on top (46vh).
- **Spacing:** 6 / 12 / 16 / 24 / 48px.

## Elevation & Depth

Depth is real: the scene has a sun (spot light with a canopy cookie and PCF shadows), sky fill and
reflections from a generated sky. The UI casts almost nothing.

- **Clock** `0 6px 14px -6px rgb(0 0 0 / 60%)` while running.
- **Dialog** hairline plus `0 40px 80px -24px rgb(0 0 0 / 80%)` over a 62% shade backdrop.
- **Banner** `0 16px 32px -12px rgb(0 0 0 / 60%)`.

## Motion

- **Arrival:** entering a room, the camera comes down from above the park to the chair (1.5s).
  Flipping the board orbits the camera 180° with a small rise (1.1s).
- **Move:** the piece is lifted (opponent's: 0.1s), thrown on an arc (0.26–0.52s; knights higher)
  and lands hard: dust ring, a small shake, a click-and-knock sound pitched by piece weight.
- **Capture:** freeze 60–160ms by the value taken, shake and punch-in, stone chips, a flash; the
  taken piece spins off and lands beside the capturer's side of the board.
- **Check:** the king shudders, a red glow pulses under it, a low knock and a tense ring.
- **Mate:** the hit, slow motion (0.4×), the camera closes in, the king topples, a boom; the title
  band opens (clip-path) and the result is thrown down onto the table (1.75s after the move).
  Resignation, time and disconnection topple the king without slow motion; draws topple nothing.
- **New game:** every piece arcs home and the fallen king stands up.
- Reduced motion: no shake, freeze, slow motion or camera flights; moves are 0.14s slides.

## Sound

Synthesised with Web Audio (no files): stone clicks and knocks, captures with grit, check, mate,
topple, setup cascade, promotion, clock ticks (at 30 seconds, then each of the last ten), chimes
for a draw offer or someone sitting down. A toggle in the top bar, remembered in the browser.

## Components

### Seat strip (signature)

56px row: colour puck (20px, flat alabaster or basalt with a hairline), name with tags (나 · 백 ·
연결 끊김 · 대기 중), pieces taken with the sunlit material lead, and the clock. An empty seat reads
빈 자리 and carries 참가.

### Stage and board

`.scene` holds the canvas and the DOM board; the board is a 512px grid mapped onto the 3D board
with a `matrix3d` homography, transparent, with a 4px sunlight focus ring. Without WebGL, or on software rendering (no GPU), the same
grid is the 2D board (travertine/slate, SVG pieces, granite rim).

### Buttons

4px cut corners, 40px (36px in controls). Default: transparent with Strong Line border. Primary:
Sunlight. Danger: Check Red, only to confirm resignation. Ghost: no border.

### Result band

A full-width shade band (84%) with hairlines across the table at 36% height, the result in Hahmlet
800 with the reason and 한 판 더 / 닫기.

### Lobby table row

No card: rows separated by hairlines; a 44px mini board between two seat marks (sunlit while
playing), the room name in Hahmlet, status and players, an arrow that slides on hover.

## Do's and Don'ts

### Do:

- **Do** keep sunlight for the active thing, in the UI and in the scene.
- **Do** act out every board change the server reports; snap when it cannot be explained as one move.
- **Do** keep every control in the DOM, over or beside the canvas.
- **Do** scale impact with the event.

### Don't:

- **Don't** put colored glows, glass or gradients on UI surfaces.
- **Don't** imitate materials in CSS; material lives in the scene.
- **Don't** use cards, pills or radii above 6px.
- **Don't** let the scene cover the status, the clocks or a primary action.
- **Don't** use a browser `confirm()` or `alert()`; use the confirm bar.
