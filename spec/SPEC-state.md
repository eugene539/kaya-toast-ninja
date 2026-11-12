# SPEC-state: save, resume, clock, deliveries, audio interruption

Status: **stub for Phase 0.** Phase 0 has no persistence beyond a stub (Docs/10 Phase 0 non-goals).
The full rules are written in Phase 1, before the Phase 1 adversarial tests (state, audio and
serve). Nothing in this file is testable yet; the Phase 0 adversarial tests do not cover it.

## What Phase 1 will pin (from Docs/10 section 2.3)

1. **Save**: two slots, each with a sequence number and a checksum; write the new slot, then flip.
   Writes are serialised (a second save while one is in flight is queued). A failed write leaves
   the last good slot in force. A WebView process death or force quit mid-write loses at most the
   last action. Every schema change ships with a migration and an upgrade-over-save test.
2. **Resume**: the current order resumes after an interruption or a force quit, at the same
   order, dial choice and served pieces.
3. **Clock**: one delivery a day keyed to the local calendar date. The first completed shift of a
   date earns tonight's delivery; later shifts that day add plates to the photo wall only. An
   earned delivery waits however long the child is away and is granted exactly once, even if the
   app dies between granting and saving. Moving the clock backwards never revokes anything; moving
   it forwards grants at most one pending delivery. Timezone changes and midnight mid-shift are
   pinned here in Phase 1.
4. **Audio**: unlocked on the first tap; resumed on app resume, after an interruption and after a
   headphone route change; if a resume fails, the next tap recovers it.

## Phase 0 behaviour

- The prototype keeps state in memory only. A reload starts again at the first demo order.
- Audio: the first pointer-down anywhere resumes the Web Audio context; if a later sound finds the
  context suspended, the next pointer-down resumes it again.
