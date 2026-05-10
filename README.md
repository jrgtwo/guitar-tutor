# Fretwork

**See the whole neck.**

A clean, beautiful, full 22-fret guitar fretboard for studying scales, arpeggios, and notes the way they actually live on the instrument — not as a six-fret diagram in a book.

---

## The gap we're filling

Most online fretboard tools show you a tiny six-to-eight fret window. That's fine for memorizing one box of the minor pentatonic. It's useless for understanding how that pattern *connects* to the next one, or what the same scale looks like up at the 12th fret, or why the third degree keeps showing up under your ring finger.

Fretwork shows you the entire neck at once. Every instance of every note in the scale, lit up across all 22 frets, color-coded by degree.

Built primarily as a reference and study tool for intermediate-to-advanced players, but designed so a beginner can pick it up and start learning shapes immediately.

---

## What you get

**The fretboard is the hero.** Every UI decision serves one goal: let the player see the neck clearly. Nothing competes with the visualization for attention.

**Three modes, one view:**

- **Scales** — Major, the seven modes, harmonic and melodic minor, pentatonics, and blues. Pick any key, and every scale tone lights up across the entire neck.
- **Arpeggios** — Triads, sevenths, sus chords, diminished, half-diminished. Same color-by-degree treatment as scales.
- **Notes** — Pick any note. See every instance of it on the neck. Made for memorization drills.

**Capo as a visual element.** Set the capo to fret 5 and you see a real bar drawn across the neck, the area to its left dimmed, and the open-string labels in the headstock retune to reflect the new playable nut. It teaches you *why* a capo changes things — not just shifts numbers behind the scenes.

**Six tunings out of the box.** Standard, Drop D, DADGAD, Open G, Open D, Half-Step Down — and every scale and arpeggio works correctly across all of them.

**Color-coded by degree.** Roots in amber, major thirds in coral, perfect fifths in sage, the rest in cream. Look at any shape and instantly see where the chord tones are. Don't want the colors? One toggle and they're all uniform.

**Three label modes.** Show note names, show interval degrees (1, b3, 5, b7), or show no labels at all and just read the shapes.

**Right- or left-handed.** One toggle flips the whole neck. Labels still read normally.

---

## Built for sharing, not for sign-ups

Every configuration you build has a URL. Send it to your bandmate, drop it in a lesson note, bookmark it for later. The recipient doesn't need an account. They don't need to log in. They open the link and see exactly what you saw.

No social features. No follower counts. No comments on shapes. The unit of sharing is a *configuration*, not a profile.

---

## What's next

This is v1 — a complete, free, anonymous reference tool. The roadmap is intentional and player-first:

- **v1.1 — Accounts and chord shapes.** Save configurations across devices. A library of CAGED chord voicings (Major, Minor, 7, Maj7, Min7, Min7♭5) rendered with active fingering plus ghosted instances of the same chord tones across the neck.
- **v1.2 — Audio.** Click a note to hear it. Play scales ascending and descending. Hear chord voicings.
- **v1.3 — Practice tools.** Mark scales as known/learning/mastered. Personal learning plans. Spaced repetition for fretboard memorization.

Audio playback, advanced practice tools, and ad-free experience will be the Pro tier when those features ship. The visualization itself — the whole point of the product — will always be free.

---

## Core principle

> The fretboard is the hero. Every UI decision should serve "let the player see the neck clearly."

If a feature distracts from the neck, we don't ship it. If a control would compete with the visualization for attention, we put it somewhere quieter. Settings live in an overlay, not a sidebar. There's no left navigation rail. The neck gets the room it needs.

---

## Run it locally

```bash
npm install
npm run dev
```

Then open the printed URL. That's it.
