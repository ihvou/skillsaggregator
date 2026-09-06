# Onboarding illustration prompts

For M131. Prompts for generating the four onboarding illustrations, plus the export and
integration specs that make them droppable into the app.

## Format: raster illustration, not SVG

An earlier draft of this doc argued hard for SVG markup. That was right for the approach
it assumed — arrangements of outlined geometric icons — and wrong once we abandoned that
approach. The objections do not survive contact with the actual numbers:

| Objection to PNG | Verdict |
|---|---|
| Bundle size | **Void.** Four images at 840x444 run 200-500 KB against a 79 MB APK. |
| No theme adaptation | **Void.** There is no dark mode; the palette is fixed. |
| Line art goes soft | **Not applicable.** True of 1.5px strokes, irrelevant to flat illustration. |
| Integration cost | **Zero.** `expo-image` is already a dependency and already used in `SkillTile`, `ResourceTile` and `ResourceCard`; `assets/` already holds PNGs. |

The only real SVG advantage left is nudging a coordinate by hand, which matters for
diagrams and not for illustration. **Generate raster.**

**Consequence worth accepting up front:** if slides 1 and 2 become illustrations, slides
3 and 4 must too. A set where two screens are painted and two are wireframe diagrams
looks unfinished. All four, one style.

## Style block — put this in every prompt

Risograph is the recommendation, for four practical reasons: it runs on two spot inks
plus paper, which *is* the app palette; its charm comes from imperfection, so it
disguises the artifacts image models produce; it reads as warm and deliberate rather
than corporate; and it stays legible at thumbnail size.

```
Style: two-colour risograph screen print on warm off-white paper.

- Inks: deep black and vivid violet. Paper is warm off-white. No other colours.
  Where the two inks overlap they produce a darker plum tone — this is intended.
- Visible halftone grain and slight ink misregistration. Imperfect edges are correct.
- Bold simplified shapes and confident flat areas. Minimal fine detail.
- No gradients, no photographic realism, no 3D rendering, no drop shadows, no glossy
  highlights, no lens effects.
- Generous negative space. The composition must read clearly at thumbnail size.
- No text, no letters, no numbers, no brand logos, no watermarks, no UI elements.
- NO FACES. Any human figure is seen from behind, cropped below the shoulders, or
  silhouetted. Avoid showing hands in detail.
- Landscape composition, roughly 1.9:1.
```

The face and hand rule is not stylistic fussiness — faces and hands are where image
models fail most visibly, and a single melted hand makes the whole set look generated.

## Generate all four in one image

Ask for a **2x2 grid of four panels in a single generation**, describing all four scenes
in one prompt, then slice the result. Generating them separately produces four different
grain levels, ink weights and violet saturations, and the set will not hang together.
At 2048x1080 overall each panel lands near 1024x540, comfortably above the 840x444
target.

If one panel misses, regenerate the whole grid rather than that panel alone.

## The four scenes

All four are **physical-object metaphors** rather than screen diagrams. That is what
keeps them warm, and it also keeps them from restating the UI directly beneath them —
the failure that sank the first attempt at slides 1 and 2.

**Panel 1 — "What do you want to get better at?"**
```
A person seen from behind at the foot of a series of ascending platforms that rise
toward the upper right, like a podium or a staircase built of solid blocks. On each
platform sits a different piece of sport equipment in silhouette — a racket, a ball,
boxing gloves, a bike wheel, skis. The figure is stepping up onto the first platform.
That platform, and the equipment on it, are printed in violet; everything else is black
on paper. The mood is ambition and momentum, not browsing.
```

**Panel 2 — "Level up one skill at a time"**
```
A hand-drawn training wall chart pinned up in a gym: a single column of a dozen short
rows, each row standing for one specific skill, drawn as a bold dash rather than
readable words. Five rows carry a heavy hand-inked tick, done. One row near the middle
is printed in violet and circled, the one being worked on now. The rest wait in black.
It should read as a personal record of progress, hand-kept, not as a software interface.
```
This one carries the most weight, because it does two jobs at once: it shows what a
sub-skill *is* — a specific, tickable thing rather than a whole sport — and it previews
the progression the app actually tracks.

**The honesty boundary on panel 2, and it is a real constraint.** Ticked / in-progress /
waiting is exactly what ships: `get_user_skill_progress` returns `watched_count` against
a `target` of `least(3, total_count)`, so a sub-skill completes at three tutorials
watched, across 492 of them. **Do not draw numeric levels, XP bars, points, stars, or a
stat that climbs 1→2→3.** No such thing exists — beginner/intermediate/advanced is a tag
on the *content*, not on the user's attainment, and the gamification block
(`M55`-`M63`, `MI28`-`MI31`) is deliberately out of this release. Drawing an RPG
character sheet with levels would promise the deferred backlog on the first screen
anyone sees. A checklist of many skills with some complete is the honest version of the
same feeling.

**Copy changes belong with this art.** The illustrations cannot carry the reframe alone —
today's slide 1 body reads "Choose what should appear first on Discover", which is
settings language and undoes the intent. Suggested, subject to review:
slide 1 title **"What do you want to get better at?"**, body about choosing what to
train first rather than what to sort first; slide 2 title **"Level up one skill at a
time"**, body naming the concrete examples already there (the backhand clear, the low
serve, squat depth). Change the titles in `slides` at `app/onboarding.tsx:14` together
with the art, not separately.

**Panel 3 — "Build your Watch later"**
```
A stack of chunky physical cards in a wooden card holder, seen at a slight angle. The
front two cards are folded forward and marked with a bold tick, finished. The next card
stands upright and is printed in violet, ready. Two more wait behind it in black. A
queue you are working through, not a feed.
```

**Panel 4 — "Add outside videos"**
```
A cork pinboard. Three loose paper clippings of different shapes fly in from the left
edge, slightly overlapping, and are pinned into one neat column on the board alongside
clippings already there. The newest clipping is printed in violet. Generic paper
rectangles only — no logos, no app icons, no recognisable brand marks.
```

## On memes

Worth saying directly, because the instinct behind it is right even though the execution
would hurt you.

**Do not ship a recognisable meme.** Nearly every famous one is a copyrighted photograph
or film still owned by someone who licenses it commercially — Distracted Boyfriend is a
stock photo whose photographer has pursued licensing, Drake is a music video frame,
Success Kid is a photographer's copyrighted image. Onboarding art in a commercial app is
commercial use. Beyond the IP exposure, memes age in months while onboarding is the screen
you change least often, humour does not survive translation, and a meme quietly contradicts
the one thing the app is selling — that this is reviewed, curated, and not another feed.

**But the underlying instinct is correct**: the current art is sterile and nothing about it
makes anyone want to continue. The fix is *original* humour you own. Two that are funny and
on-message:

- **The status quo, honestly drawn** — a figure from behind, dwarfed by an enormous
  chaotic wall of near-identical video thumbnails, all shouting the same thing. Everyone
  who has searched "badminton backhand" recognises it instantly.
- **The 22-minute video for 40 useful seconds** — a very long strip stretching the full
  width, with one tiny violet sliver near the end marked as the only part that mattered.
  That joke *is* the sub-skill pitch, and it costs no IP risk at all.

Either could replace panel 1 or 2. The second pairs especially well with panel 2's motion
study.

## Export and integration

1. **Slice** the 2x2 grid into four panels.
2. **Crop** each to exactly 1.9:1, then resize to **840x444** (3x of the 280x148 slot).
3. **Save as PNG** into `apps/mobile/assets/onboarding/`. WebP is roughly 3-5x smaller and
   Metro handles it, but verify one renders on both platforms before converting the set —
   PNG is the safe default and the size difference does not matter here.
4. **Reference** with the `expo-image` `Image` already used elsewhere in the app:
   `<Image source={require("../assets/onboarding/slide1.png")} style={{width:"100%",height:148}} contentFit="contain" />`
5. **Replace** the four `OnboardingDiagram` SVG branches in `app/onboarding.tsx:129+`, and
   drop the now-unused `react-native-svg` import from that file **only if nothing else in
   it uses SVG** — see the warning below.
6. Keep an `accessibilityLabel` on each image, as the current SVG code already does.

**Do not remove `react-native-svg` from `package.json`.** It is pinned in
`metro.config.js` as a singleton to fix the duplicate-native-view crash (M123), and other
components rely on it. Removing the onboarding import is fine; touching the dependency is
not.

**Consider a taller slot.** Illustrations want more vertical room than schematics. If 148pt
feels cramped once the art is real, 170-180pt is worth trying — but that shifts the
onboarding layout, so check it against M124's safe-area fix rather than in isolation.

## Judge at actual size, always

The single most reliable mistake in this whole exercise: evaluating art at 1700px that
ships at 280pt. Both earlier attempts looked acceptable large and fell apart small.
Drop each candidate into a 280x148 box on a white background, next to the real headline
and the real chips, before accepting it.

## Appendix — the superseded SVG route

The earlier approach asked for flat geometric SVG: arrangements of outlined sport glyphs.
Two attempts were made, one generated and one hand-authored. Both were rejected as too
sterile. The failures are recorded because they are general:

- **Six small scattered objects do not compose at 280pt.** They get pushed to the corners
  and leave a dead centre. Fewer and larger is the fix.
- **A filled accent shape unbalances outline art.** One filled violet mountain outweighed
  five outlined glyphs combined. Accent belongs on a stroke in that style.
- **A glyph needs its distinguishing feature spelled out.** A racket without strings is a
  magnifying glass; a dot with radiating lines is an explosion, not a shuttlecock; a
  circle with four thick spokes is a ship's wheel, not a bike wheel.
- **Strokes crossing a shape must be clipped to it.** Unclipped racket strings overflowed
  the head and turned to mush at true size; a `clipPath` fixed it outright.
- **An arc needs an origin.** "Motion arcs between the glyphs" produced swooshes attached
  to nothing; anchoring one to an object made it read as trajectory.

The last hand-authored SVG is kept in the session scratchpad, not committed. If the raster
route is ever abandoned, start from these lessons rather than from the original prompts.
