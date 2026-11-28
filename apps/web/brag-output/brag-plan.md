# Crow launch video: plan

**What it is:** a private prediction game for friend groups. The host asks questions, everyone picks, Crow keeps score. No money.
**Who for:** any group chat that already argues about the weekend's football, the Oscars, Eurovision.
**Sets it apart:** private rooms, points not money, picks hidden until they lock, a real standings table.
**Best claim:** "Your group chat already argues about it. Keep score."
**Visual hook:** a group chat argument popping in, bubble by bubble, then Crow settles it.
**Real UI shown:** the real `OptionsBoard` (open, then revealed), the pick sheet markup from `BetSheet`, the real `StandingRow` + `RankChange`, `CrowTile`, `Button variant="linear"`, compiled with the app's own Tailwind + global.css tokens, dark theme, Fira Code.
**Tone:** `default`, punchy and playful, dark matchday ledger. No betting words (VOICE.md).
**Share caption:** "Your group chat already argues about it. Now it keeps score. Crow: the prediction game for friends. playcrow.app"

People data: all names are the placeholders already on the landing page (Priya, Sam, Jordan, You). Nothing from the database.

## Angle
The argument you already have, every weekend. Crow turns it into a game with a score. Callback: Sam is loudest in the chat, Sam ends up eating crow.

## Music
120 BPM, 4/4, beat = 0.5 s, bar = 2 s, key of A minor -> C major lift at the result. 20 s = 10 bars. Kick on beats, clap on 2 and 4, plucky synth bass, bell lead on the hits. Every cut lands on a beat.

## Storyboard (1920x1080, 30 fps, 20.0 s)

| # | Time | Scene | On screen | Sound |
|---|---|---|---|---|
| 1 | 0.0–4.0 | Hook | Chat bubbles pop in on beats: Sam "Spurs win Sunday. Easy." / Priya "no chance" / Jordan "draw. calling it." / Sam "screenshot this". At 2.0 the line lands: **Your group chat already argues about it.** (hold 2 s) | soft pops in key on each bubble, filtered drums |
| 2 | 4.0–6.5 | Reveal | Bubbles fly off; CrowTile pops, "crow" wordmark, line **Keep score.** then sub "The prediction game for friends." | full drums drop at 4.0, riser out |
| 3 | 6.5–11.0 | Call it | Phone with the real question card "Who wins the derby on Sunday?" (Open pill). Tap on Arsenal -> selected. Pick sheet slides up: 50 pts, tap +50 -> 100 pts, tap "Lock in pick · 100 pts" -> "Pick locked in". Left caption **Call it.** then **Put points on it.** | tick on taps, swoosh on sheet |
| 4 | 11.0–14.5 | Result | Pill Open -> Locked -> Result's in. Board turns to revealed: Arsenal Won 46%, Draw 22%, Spurs 32%, bars fill. Big **+117** and **Called it.** | bell hit on reveal, chord lift |
| 5 | 14.5–17.5 | Standings | "Matchday Crew · Week 6" table, You moves 3 -> 2 past Sam (+117), RankChange pills. Caption **Sam eats crow.** | whoosh on swap |
| 6 | 17.5–20.0 | Outro | CrowTile + **Call it. Crow about it.** + playcrow.app + "Free. No money. Just bragging rights." | final hit, tail |

Numbers add up: 1,300 pts in play (Arsenal 600, Draw 280, Spurs 420). 100 on Arsenal returns 100 x 1300/600 = 217, net +117. Standings: Priya 1,640; Sam 1,410; You 1,350 -> 1,467.
