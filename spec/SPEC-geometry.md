# SPEC-geometry: geometry, input and coordinate rules

Status: Phase 0, version 1 (12 Nov 2026). Owner: the KTN code worker. This file, with
`spec/SPEC-orders.md`, `spec/SPEC-state.md` and `spec/api.d.ts`, is everything the blind
adversarial test writer sees. Every rule here is testable through the functions declared in
`spec/api.d.ts`, imported in tests as `import { ... } from "@core"`.

Words used: MUST is a hard rule; "design units" are points at phone scale on the 390 by 844
portrait playfield.

## 1. Spaces and constants

| Name | Value | Meaning |
|---|---|---|
| `DESIGN` | width 390, height 844 | the one portrait playfield, in design units |
| `TOAST` | width 300, height 240 | the toast slice, a rectangle in toast-local space |
| `MIN_GAP` | 4 | smallest gap between separated pieces, design units |
| `DEFAULT_GAP` | 6 | gap used when the caller gives none |
| `MAX_FAN_DEGREES` | 10 | largest total fan across all separated groups |
| `DEFAULT_FAN_DEGREES` | 6 | fan used when the caller gives none |
| `MIN_PIECE_WIDTH` | 32 | narrowest strip a child is asked to pick up (see SPEC-orders section 6) |
| `SNAP_LINE_MIN_WIDTH` | 2 | snap lines are drawn at least this thick |
| `TAP_SLOP` | 10 | a pointer path shorter than this (total length) is a tap, not a swipe |

There are three coordinate spaces:
1. **View space**: CSS pixels of the browser or WebView viewport, origin top left, y down.
2. **Design space** (the "world"): the 390 by 844 playfield, origin top left, y down.
3. **Toast-local space**: origin at the centre of the toast, x right, y down, before the
   toast's rotation. The toast occupies `x` in `[-150, 150]` and `y` in `[-120, 120]`.

## 2. View to design (letterboxing, resize, rotation)

`fitPlayfield(viewW, viewH, designW = 390, designH = 844)` returns `{ scale, offsetX, offsetY }`:
- `scale = min(viewW / designW, viewH / designH)`;
- `offsetX = (viewW - designW * scale) / 2`, `offsetY = (viewH - designH * scale) / 2`.
- `viewW`, `viewH`, `designW`, `designH` MUST be finite and greater than 0, else `RangeError`.

`viewToDesign(vt, p) = ((p.x - offsetX) / scale, (p.y - offsetY) / scale)` and
`designToView` is its exact inverse. Points in the letterbox bars map outside the playfield
(negative or beyond 390 or 844); that is allowed and they simply miss everything.

The transform MUST be recomputed after every resize, device rotation and letterbox change
(a rotation is a resize with width and height swapped). The game never caches a transform
across such an event. A gesture in progress when a resize happens is cancelled (section 5).

## 3. World to toast-local (the hanging toast)

The toast has a pose `{ x, y, angle }` in design space (`angle` in radians, clockwise positive
because y points down). `worldToLocal(pose, p)` translates by `-(x, y)` then rotates by
`-angle`; `localToWorld` is the exact inverse (round trip within 1e-9 for coordinates under
10 000 in magnitude).

The toast sways while it hangs. **It stops turning on touch**: the pose is frozen at the
pointer-down that starts a gesture, every point of that gesture is converted with the frozen
pose, and the sway resumes only after the cut or the cancel.

## 4. Partition and snap lines

For a denominator `d` (an integer with `2 <= d <= 12`; anything else is a `RangeError`):
- snap line `i` for `i = 1 .. d-1` is the vertical segment at
  `x_i = -W/2 + i * W / d`, `y` strictly between `-H/2` and `H/2`;
- strip `k` for `k = 0 .. d-1` is the rectangle `[x_k, x_{k+1}] x [-H/2, H/2]` with
  `x_0 = -W/2` and `x_d = W/2`. `stripPolygon` returns its four corners counter-clockwise in
  y-down screen terms (any consistent winding is fine; `polygonArea` is absolute).
- `stripPolygon` is built by half-plane clipping of `toastPolygon` (`clipHalfPlane`), so it
  still works if the toast outline changes; for the rectangle the floating area of each strip is
  `W * H / d` within 1e-6.
- `clipHalfPlane(poly, nx, ny, c)` keeps the part of `poly` where `nx * x + ny * y <= c`.
  Clipping an empty polygon, or a polygon wholly outside, returns `[]`. A polygon with fewer than
  3 points has area 0. Clipping never creates NaN.

**Floating areas are for drawing only.** The size of a piece is its exact rational
(`1/d`, SPEC-orders section 4). No acceptance decision ever reads a polygon area.

## 5. Gestures (pointer handling)

`createGestureTracker({ tapSlop? })` returns a tracker fed with `PointerSample`s
`{ phase, pointerId, x, y, t }` where `phase` is `down`, `move`, `up`, `cancel` or
`lostcapture`. It returns a `GestureEvent` or `null` for each sample.

1. **First finger wins.** A `down` while no pointer is active makes that pointer active and
   returns `{ kind: "start", pointerId, at }`. A `down` from any pointer while one is active
   (including a repeated `down` from the active pointer) is ignored: `null`, no state change.
2. `move` from the active pointer appends its point and returns `null`. Samples from any other
   pointer are ignored (`null`).
3. `up` from the active pointer ends the gesture. If the total path length (sum of the lengths of
   consecutive segments) is below `tapSlop` (default 10), the result is
   `{ kind: "tap", pointerId, at }` with `at` the down point; otherwise
   `{ kind: "swipe", pointerId, path, duration }` where `path` holds every accepted point from
   the down to the up inclusive and `duration = t_up - t_down`.
4. `cancel` or `lostcapture` from the active pointer returns `{ kind: "cancelled", pointerId }`
   and discards the path: **no partial cut ever happens**. A `lostcapture` that arrives after the
   `up` (browsers send one) is from an inactive pointer and is ignored.
5. Points with a non-finite `x` or `y` are dropped (the sample is otherwise processed as if it
   carried the last good point; a `down` with a non-finite point is ignored entirely).
6. `reset()` drops any active gesture silently (used on resize, rotation, app pause).
7. `activePointer` is the active pointer id or `null`.

The scene listens with pointer capture on the canvas, turns browser gestures off
(`touch-action: none`), recomputes the view transform on every `down`, and feeds samples in
design space.

## 6. Resolving a swipe into cuts

`resolveSwipe(toast, d, path, alreadyCut = [])` takes a path in toast-local space and returns
`{ kind, lines }`, where `lines` are the **newly** cut line indices, ascending, without
duplicates, never including an index in `alreadyCut`.

Pre-processing: drop non-finite points, then drop each point equal to the previous kept point.
Fewer than 2 points left: `{ kind: "none", lines: [] }`.

**Rule A, across (the swipe crosses lines).** Process the path segment by segment, so a fast
finger whose samples are far apart still cuts every line it passed. For each segment `p -> q` and
each line `i`: let `side(x) = -1 if x < x_i, else +1`. The segment crosses line `i` when
`side(p.x) != side(q.x)` and the crossing point (linear interpolation at `x = x_i`) has `y`
strictly between `-H/2` and `H/2`. If any segment crosses any line, the result is
`kind: "across"` and `lines` is every crossed line not in `alreadyCut`.
- A swipe that crosses lines 2 and 3 of eighths but not the others cuts exactly 2 and 3.
- Crossing the same line several times (a zigzag) cuts it once.
- Crossing a line's extension above or below the toast does not cut it.
- A path that only touches a corner of the toast, or runs along the top edge (`y = -H/2`),
  crosses nothing inside and does not cut by Rule A.

**Rule B, along (finger forgiveness).** Only if Rule A found no crossing. Clip each segment to the
closed toast rectangle and keep the inside parts. If there are none: `kind: "none"`. Let the
inside parts' points span `[minY, maxY]` and `[minX, maxX]`. Rule B applies when:
- `maxY - minY >= H / 2` (the swipe runs along at least half the toast's height), and
- there is a line `i` with `|x - x_i| <= r` for every inside point, where the forgiveness radius
  is `r = W / (3 d)` (a third of the gap between lines). Lines are `3r` apart, so at most one line
  can qualify.

Then the result is `kind: "along"` with `lines = [i]` (or `[]` if `i` is in `alreadyCut`).
Otherwise `kind: "none"`, `lines: []`.

`forgivenessRadius(toast, d) = W / (3 d)`. `snapToLine(toast, d, x)` returns the line index `i`
with `|x - x_i| <= r`, or `null`. **Forgiveness only chooses which line a swipe snaps to. It never
changes what the plate accepts** (SPEC-orders section 5).

### 6.1 Later swipes after a partial cut

After a partial cut the groups are drawn separated (section 8), so a remaining line is no longer
where Rule A and Rule B would look for it. `resolveSwipeOnGroups(toast, d, path, cutLines, groups)`
takes each still-joined group as drawn (`{ start, end, x, y, angle }`, centre in toast-local space,
angle in degrees), maps the path into that group's own unseparated frame (undo the turn about the
drawn centre, then shift to the group's original centre), and applies `resolveSwipe` with every
line outside the group, or already cut, treated as already cut. The result is the union of the
groups' new lines, ascending; `kind` is `across` if any group was crossed, else `along` if any
group snapped, else `none`. With nothing cut there is one group in its original place and the
result equals `resolveSwipe`.

## 7. Cut state and groups

The cut state of one toast is its denominator and the set of cut line indices.
`groupsOf(d, cutLines)` returns the maximal runs of strips still joined, left to right, each as
`{ start, end }` (inclusive strip indices). With no cuts there is one group `{0, d-1}`; with every
line cut there are `d` groups of one strip. Indices outside `1 .. d-1`, duplicates and
non-integers in `cutLines` are a `RangeError`.

`isSeparated(d, cutLines, k)` is true when strip `k` is a group on its own (both its inner
neighbouring lines are cut; an edge strip needs only its one inner line). **Only a separated
strip is a piece the child can serve.** A joined run wobbles and stays on the toast.

## 8. The cut layout (PLAN-v6 cut state)

`layoutCut(toast, d, cutLines, { gap?, fanDegrees? })` returns one `PieceLayout` per strip,
in strip order: `{ index, group, x, y, angle }` where `(x, y)` is the strip's centre in
toast-local space after separation and `angle` is in degrees.
- `gap` is clamped to at least `MIN_GAP` (default `DEFAULT_GAP`); `fanDegrees` to
  `[0, MAX_FAN_DEGREES]` (default `DEFAULT_FAN_DEGREES`). Non-finite options use the defaults.
- With `G` groups, group `g` turns by `a_g = -F/2 + F * g / (G - 1)` degrees (0 when `G = 1`),
  about its own centre. So every angle is within `[-F/2, F/2]` and the total fan is at most 10.
- Groups are placed left to right by their axis-aligned bounding boxes after rotation, with
  exactly `gap` between neighbouring boxes, and the whole row centred on `x = 0`; group centres
  keep `y = 0`. So **gaps are equal, at least 4, order is kept and no two groups overlap**.
- Strips inside one group move rigidly with it (same angle, centres rotated about the group
  centre).
- With one group (nothing cut) every strip keeps its original centre and angle 0.

## 9. The plate

The plate shows the whole-toast outline in ink. `plateSlots(rect, d)` splits `rect` into `d`
equal vertical slots, left to right, each the full height; slot `j` receives the `j`-th piece
served. The fill is the union of the filled slots, so the filled area reads as the numerator
against the outline as the whole. The label appears only when the order is matched.

## 10. Drawing rules the code owns (checked by eye and screenshot, not by unit tests)

- Snap lines: dark dashed ink, at least `SNAP_LINE_MIN_WIDTH` thick at phone scale, evenly spaced.
- Separated pieces: the toast texture clipped to the piece, an ink outline, a thin white sticker
  edge, a cut-edge strip on each cut edge and a small hard shadow.
- The count is never trusted to art; every line, gap, outline and fill is drawn in code.
- The cut is a streak of light. No blade is ever drawn or named.
- Feedback within 50 ms of the input; the food may freeze for impact, input never freezes.
