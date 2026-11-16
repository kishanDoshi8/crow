# Voice and Vocabulary

How Crow talks, and which word means what. Read with `PRODUCT.md` (brand
personality, Crow voice) before writing any user-facing copy: UI strings, push
notifications, share text, error messages, meta tags.

Status: all five ⚑ decisions in §3 are **agreed as recommended** (question,
"How sure are you?", Owner/Host/Ref/Player, squawks, Scrap vs No result).

---

## 1. Voice

Crow is the friend who keeps score at the pub: quick, a bit cheeky, never
pushy, and scrupulously fair about the numbers.

**Two registers, one rule: the joke never touches the numbers.**

| Register | Where | Sounds like |
|---|---|---|
| **Plain** | Rules, scoring, settings, forms, confirmations, legal, anything with points in it | "Picks close at 8pm." "Everyone gets their points back." |
| **Playful** | Empty states, success toasts, result moments, notifications, share text, onboarding, Room talk | "Nothing to call yet. Your host is cooking something up." "Called it. Crow about it." |

### Crow lexicon (playful moments only, never in rules)

| Phrase | Moment |
|---|---|
| **Call it** | The prompt to make a pick |
| **Called it / Missed it** | The outcome of a pick |
| **Crow about it** | Sharing a win |
| **Time to eat crow** | A lost pick |
| **Top crow** | The weekly leader / #1 |
| **Ghost crow** | Deleted account (exists) |
| ⚑ **Squawk** | Posting in Room talk (optional, see §3) |

Don't invent new crow puns on the fly. If a moment deserves one, add it here
first. Puns wear thin fast, and a short fixed list is what makes them feel like
a brand rather than a gimmick.

### Style rules

- **Sentence case everywhere**: "Reveal result", not "Reveal Results"; "How to play", not "How To Play".
- **Errors:** "Couldn't [verb] [thing]. Try again." Never "Failed to…", never "Error…".
- **Success toasts:** state what happened, past tense, short. "Pick locked in." "Result revealed."
- **Second person, active voice.** "You called it", not "Prediction won".
- **Numbers:** "50 pts" in tight UI, "50 points" in sentences.
- **Emoji:** only in push notification titles and share text, one per message, from a fixed set (🎯 new, ⏰ closing soon, 🔒 locked, 🏆 result, 🐦 invite). None in UI headings or buttons.
- **No pressure tactics:** no "Don't miss out!", no fake urgency, no guilt. A real deadline stated plainly is fine ("1 hour left to pick").
- **Examples and placeholders** use sports and pop culture, never money or crypto.

---

## 2. Glossary: user-facing term → backend

The database and code keep their names. This table is the translation layer.
When a UI term changes, update this table.

| Concept | Say (UI) ⚑ | Don't say | Backend name |
|---|---|---|---|
| A thing to predict | **question** | prediction, bet, market, game | `predictions` table, `prediction_*` functions, `/predictions/` routes |
| Its choices | **options** | outcomes, sides, lines | `prediction_options` |
| Several questions created together | **set** | bundle, slate | `create_predictions`, `PredictionSetForm` |
| A player's choice | **pick** | bet, wager, play, call (as noun) | `bets` table, `place_bet`, `cancel_bet`, `BetSheet` |
| Points put on a pick | **points on it** · label "How sure are you?" | stake, wager, bet amount, risk | `bets.amount` |
| Make / change / undo a pick | **Lock in pick · Change pick · Take back pick** | place bet, update bet, cancel bet | `place_bet` (upsert), `cancel_bet` |
| Points won on a pick | **points won** · "+120" | payout, winnings, return, profit | `bets.payout` (net = payout − amount) |
| Total points on a question | **points in play** | pool, pot, wagered, handle | sum of `bets.amount` |
| Who won what (breakdown) | **How the points split** | payouts | `private.prediction_payouts` |
| Winner's multiple | **×4 call** · "long shot" for ≥10× | odds, return | `largest_win_multiplier` |
| Your total in a series | **your points** | balance, bankroll, stack, wallet | `series_wallets.balance` |
| Points not yet on a pick | **free to use** | available to bet | `balance − escrow` (client calc) |
| Points on open picks | **on open picks** | in open bets, escrow | `series_wallets.escrow` |
| Points at series start | **starting points** | stack, buy-in | `series.starting_stack` |
| Monday bonus | **weekly top-up** | bonus, reload | `series.weekly_topup`, `weekly_claims` |
| Net over a series/career | **net points** | profit | `net_profit` columns |
| Question is accepting picks | **Open** | live (ok in "Goes live"), draft | `status = 'draft'` ⚠ "draft" means *open* in the DB |
| Created but not visible yet | **Scheduled** | draft | `status = 'scheduled'` |
| Picks closed, awaiting result | **Locked** | closed, betting closed | `status = 'locked'` |
| Result set | **Result in** · action: **Reveal result** | resolved, settled, decided, closed | `status = 'revealed'`, `resolve_prediction_v2`, `resolve_predictions` |
| Ended, nobody wins or loses | **No result** (everyone gets points back) | void, push, refunded | `status = 'no_result'` |
| Removed from play | **Scrapped** · action: **Scrap question** | cancelled | `status = 'cancelled'` |
| Points returned | **back to you / points back** | refund, refunded | refund paths in `cancel_bet`, resolve fns |
| Fix a revealed result | **Fix result** | correct, amend | `correct_prediction_result` |
| A competition with its own points and table | **series** | season, league, tournament | `series` table |
| Series states | **Not started · Playing · Finished · Archived** | draft, active, completed | `series.status` = draft/active/completed/archived |
| Questions planned in a series | **questions** ("12 questions") | games | `series.expected_games`, `final_games` |
| Minimum picks to be ranked | **picks to rank** | minimum bets | `series.min_bets_to_rank` |
| Ranking | **standings** | leaderboard, table, ranking | `leaderboard` feature/route, `series_standing_snapshots` |
| #1 at series end | **champion** · title | winner | `series_results` |
| Group | **room** | league, group, pool | `rooms` |
| Room roles | **Owner · Host · Ref · Player** ⚑ | organizer, resolver, member, staff, admin | `room_members.role` = owner/organizer/resolver/member |
| Hosts + refs together | **hosts** ("Hosts only") | staff | `can.organize`, `is_organizer` |
| Organizer inbox | **Needs you** | queue, to-do | `NeedsYouCard`, `ManagePage` |
| Room feed | **Activity** | activities, feed | `room_activities` |
| Per-question chat | **Room talk** · posts are **squawks** ⚑ | phrases, comments | `prediction_posts`, `talk` schema |
| Series-end placements | **trophies** | placements | `series_results`, `TrophyCabinet` |
| Special series honours | **awards** | special awards, rewards | `seriesRewards.ts` |
| Career achievements | **milestones** | achievements, unlocks | `room_member_milestones` |
| "What next?" voting | **Up next** | suggestions | `series_suggestions` |

### Banned in UI copy

`bet`, `betting`, `wager`, `stake`, `odds`, `payout`, `pay out`, `paid`,
`winnings`, `profit`, `pot`, `pool`, `bankroll`, `house`, `high roller`,
`all in`, `jackpot`, `cash`, `money`, `bidding`.

Allowed only in the Terms of Service, where they describe what is prohibited
("Crow must not be used for real-money betting").

---

## 3. Open decisions ⚑

1. **"Question" vs keeping "prediction".** Recommendation: *question*. It's
   shorter and friendlier, it matches the set form ("Add another question"), and
   it reads naturally in push ("New question in Matchday Crew"). Keep
   "prediction game" in marketing and meta tags, since that's what people
   search for.
2. **The points-on-a-pick label.** Recommendation: the slider is labelled
   "How sure are you?" and lists say "50 pts on Arsenal". There's no noun for a
   stake at all, and the confidence framing makes it read as a skill game, not
   a wager.
3. **Roles: Host and Ref.** "Resolver" is jargon and "organizer" is long. The
   app already says "The host will start one soon!" in one place.
4. **Squawks for Room talk posts.** A fun, tightly scoped crow word. Skip it if
   it feels like one pun too many.
5. **Scrap vs No result.** Two distinct outcomes, so two distinct words:
   *No result* = the event happened but can't be decided (washed out);
   *Scrap* = mistake, or the event won't happen.

---

## Appendix: copy change list (delete once applied)

Paths are relative to `apps/web/src/features/` unless they start with
`apps/`, `supabase/` or `shared/`. Line numbers are as of this draft.

### A. Gambling vocabulary (highest priority)

| Where | Now | Proposed |
|---|---|---|
| `onboarding/components/HowToPlayModal.tsx:27` | Bet during the week and you get a top-up on Monday. | Make a pick during the week and you get a top-up on Monday. |
| `HowToPlayModal.tsx:31` | Place your bet | Make your call |
| `HowToPlayModal.tsx:33` | …pick a side and put points on it. The more you risk, the more you can win. | …pick an option and put points on it. The surer you are, the more you put on, and the more you can win. |
| `HowToPlayModal.tsx:39` | Once the organizer calls a result, winners get paid. Bet on enough predictions to be ranked… top ranked balance takes the title. | Once the host reveals the result, the winners collect points. Make enough picks to be ranked: when the series ends, the most points takes the title. |
| `predictions/view/BetSheet.tsx:117` | Place bet · 50 pts | Lock in pick · 50 pts |
| `BetSheet.tsx:119` | Update bet | Change pick |
| `BetSheet.tsx:125` | Your bet on | Your pick |
| `BetSheet.tsx:131` | Move your bet from | Switch your pick from |
| `BetSheet.tsx:147` | Balance | Your points |
| `BetSheet.tsx:187` | Stake | How sure are you? |
| `BetSheet.tsx:205` | · changes as others bet. Locked at the deadline. | · changes as others pick. Fixed when picks close. |
| `BetSheet.tsx:208` | No one to win from on this pick yet. Locked at the deadline. | Nobody's picked against you yet. Fixed when picks close. |
| `BetSheet.tsx:90` | Couldn't place the bet. | Couldn't lock in your pick. Try again. |
| `BetSheet.tsx:105` | Bet cancelled. Your points are back. | Pick taken back. Your points are back. |
| `BetSheet.tsx:108` | Couldn't cancel the bet. | Couldn't take back your pick. Try again. |
| `BetSheet.tsx:223` | Cancel bet | Take back pick |
| `predictions/components/InPlayPredictions.tsx:278` | Your stake | Points on it |
| `InPlayPredictions.tsx:279` | Nothing staked · 50 pts refunded | No pick · 50 pts back |
| `predictions/view/PicksList.tsx:38` | Payouts | How the points split |
| `PicksList.tsx:41` | All refunded | Everyone got their points back |
| `PicksList.tsx:119` | , 50 staked | , 50 pts on it |
| `predictions/components/HistoryFeed.tsx:30` | My bets | My picks |
| `HistoryFeed.tsx:49` | You haven't placed any bets yet. | You haven't made any picks yet. |
| `predictions/components/PredictionForm.tsx:214` | …can't change once someone has bet. | …can't change once someone has picked. |
| `PredictionForm.tsx:252` | Options can't change once someone has bet. | Options can't change once someone has picked. |
| `PredictionForm.tsx:205` | e.g. "Will Bitcoin reach $100k by Sunday Night?" | e.g. "Who wins the derby on Sunday?" |
| `predictions/components/PredictionTiming.tsx:161` | Bidding deadline | Picks close |
| `predictions/components/CorrectResultDrawer.tsx:139,210` | …everyone who bet | …everyone who picked |
| `predictions/components/ResolvePredictionDrawer.tsx:242` | All bets are returned… | Everyone gets their points back, and nobody wins or loses. |
| `activities/components/cards/PredictionCancelledCard.tsx:25` | All bets were refunded. | Everyone got their points back. |
| `activities/components/cards/PredictionLockedCard.tsx:25` | 12 bets · 600 pts wagered | 12 picks · 600 pts in play |
| `activities/components/cards/PredictionRevealedCard.tsx:27` | Arsenal · 600 pts pool | Arsenal · 600 pts in play |
| `leaderboard/components/leaderboard/PredictionHistoryFeed.tsx:23` | Refunded / Your points were refunded | Points back / You got your points back |
| `PredictionHistoryFeed.tsx:66` | No payout. | No points won. |
| `PredictionHistoryFeed.tsx:197` | Pool | In play |
| `leaderboard/components/leaderboard/OverallStandingsList.tsx:44` | Profit | Net points |
| `leaderboard/pages/LeaderboardPage.tsx:71` | Total profit across every series, with titles won. | Net points across every series, with titles won. |
| `LeaderboardPage.tsx:76-77` | Top balance among players with 3+ bets wins the title. | Most points among players with 3+ picks takes the title. |
| `leaderboard/components/leaderboard/RankingRuleHint.tsx:6` | Bet on | Pick on |
| `leaderboard/lib/standings.ts:18,23` | needs 2 more bets · Bet on 3 settled predictions to be ranked. | needs 2 more picks · Make 3 picks on questions with results to be ranked. |
| `leaderboard/components/player/CareerStats.tsx:76` | Lifetime winnings | All-time points |
| `CareerStats.tsx:82,90` | Best return · 400 pts on 100 | Best call · 400 pts from 100 |
| `series/components/WalletPopover.tsx:13-14` | Available to bet · In open bets | Free to use · On open picks |
| `WalletPopover.tsx:76,87` | You've bet this week. · Place a bet before Monday to get 100. | You've picked this week. · Make a pick before Monday to get 100. |
| `series/components/SeriesEditDialog.tsx:131` | …locked once anyone has placed a bet. | …locked once anyone has made a pick. |
| `SeriesEditDialog.tsx:137,149` | Minimum bets to be ranked · Players who bet on fewer settled predictions… | Picks to rank · Players with fewer picks on finished questions… |
| `series/pages/SeriesCreatePage.tsx:269` | …players who bet that week. Locked once anyone bets. | …players who picked that week. Locked once anyone picks. |
| `series/lib/points.ts:21` | Minimum bets must be… | Picks to rank must be… |
| `rooms/components/RoomMenuDrawer.tsx:202,337` | Open bets come back to you · Bets on open predictions… | Points on open picks come back to you · Picks on open questions… |
| `rooms/pages/MembersPage.tsx:350` | Bets on open predictions go back to them | Points on open picks go back to them |
| `account/pages/DeleteAccountPage.tsx:127` | Bets on open predictions are refunded | Points on open picks are returned |
| `talk/components/RoomTalk.tsx:47` | Betting closed | Picks locked |
| `shared/lib/seriesRewards.ts:3` | Biggest Profit | Biggest haul |
| `seriesRewards.ts:4,17` | High Roller · 2,000 risked | Fearless · 2,000 pts on picks |
| `shared/lib/milestones.ts:16` | Won at odds of 10× or more. | Called a 10× long shot. |
| `milestones.ts:20` | Bet on every game of a 10+ game series. | Picked every question in a 10+ question series. |
| `share/cards/InviteCard.tsx:137` | Everyone starts with 1,000 pts. Top balance takes the title. | Everyone starts with 1,000 pts. Most points takes the title. |
| `rooms/pages/JoinRoomPage.tsx:181` | Same points for everyone. Top balance when the series ends takes the title. | Same points for everyone. Most points when the series ends takes the title. |
| `predictions/components/stats/UserStats.tsx:36`, `SeriesCreatePage.tsx:160` | Top balance when the series closes wins the title | Most points when the series ends takes the title |
| `rooms/components/SeriesHeroCard.tsx:134` | 400 points to spend, 600 in play | 400 free to use, 600 on open picks |
| `preferences/components/RoomPreferencesDialog.tsx:54` | Betting deadline (1h) | Picks close in 1 hour |
| `supabase/schemas/stats/functions/get_room_stat_cards.sql:60` | Biggest Bet · Most Profit | Boldest pick · Biggest haul |
| `supabase/.../private_fire_push_notification_for_deadline_1h.sql:28` | ⏰ 1 Hour Left to Bet! | ⏰ 1 hour left to pick |
| `supabase/.../private_on_prediction_status_change.sql:41,59,90-91` | 🎯 New Prediction · 🏆 Result Is In · 🔒 Betting Closed | 🎯 New question · 🏆 Result's in · 🔒 Picks locked |
| `supabase/.../private_fire_push_notification_for_result_needed.sql:41` | ⚑ Result needed | 🏆 Result needed (no ⚑ outside the emoji set) |
| `supabase/schemas/predictions/functions/place_bet.sql:49,61` | Betting deadline has passed · Minimum bet is 1 point | Picks are closed for this one · Put at least 1 point on it |
| `supabase/migrations/…_room_talk.sql` phrase seeds | Easy money · Pay up | Easy call · Eat crow |

### B. "Prediction" → "question" (if decision 1 is agreed)

Every UI instance of "prediction(s)": route titles in `app/router/index.tsx`
(New prediction, Edit prediction, Manage prediction), `RoomSidebar`, `ManagePage`,
`HistoryFeed`, `CopyPredictionSheet`, `SeriesDetailView`, `NewSet`,
`ResolveSeveral`, `ShareOpenPredictionsButton` ("🐦 A prediction is open in…" →
"🐦 A new question is open in…"), the empty states, `RoomPreferencesDialog`
labels, `CareerStats` "Predictions", `milestones.ts` "Made 100 predictions", and
the server error strings in `create_prediction.sql`. Find them with
`grep -rn "rediction" --include=*.tsx` and skip identifiers and imports.

Also replace "games" in a series: `SeriesGamesField.tsx` (Expected games, No set
number of games), `SeriesOverviewCard.tsx:72`, `SeriesTile.tsx:77`
("3 of 10 games played" → "3 of 10 questions done"), `seriesRewards.ts:18`.

### C. Resolve / settle / reveal / close → one vocabulary

| Where | Now | Proposed |
|---|---|---|
| `ResolvePredictionDrawer.tsx:72` | Reveal Results | Reveal result |
| `ResolvePredictionDrawer.tsx:309` | Results revealed successfully! | Result revealed. |
| `ResolvePredictionDrawer.tsx:337` | Are you sure you want to reveal the results? This action cannot be undone. | Reveal this result? Points move straight away. |
| `ResolvePredictionDrawer.tsx:136,160-164` | Cancel prediction · Prediction cancelled. | Scrap question · Question scrapped. Everyone's points are back. |
| `ResolvePredictionDrawer.tsx:155` | Confirm No Result | End with no result |
| `PredictionRevealedCard.tsx:18,24` | Winner decided · Resolved | Result's in |
| `share/cards/ResultCard.tsx:86` | ✓ Resolved | ✓ Result in |
| `series/components/SeriesTile.tsx:99`, `CareerStats.tsx:67` | Settled · 4 of 9 settled | Finished · 4 of 9 called |
| `OverallStandingsList.tsx:37` | …once a prediction is settled. | …once the first result is in. |
| `app/router/index.tsx:270`, `ManagePage.tsx:91` | Close several (at once) | Reveal several |
| `ResolveSeveral.tsx:129,137` | 3 predictions closed · Nothing was closed. | 3 results revealed · Nothing changed. |
| `CorrectResultDrawer.tsx:135` | Correct result | Fix result |
| `PredictionStatusLine.tsx:186` | Cancelled / Revealed / Marked by Sam | Scrapped / Revealed / Ended by Sam |

### D. Roles and room words (if decision 3 is agreed)

`rooms/lib/roles.ts` (Organizer → Host, Resolver → Ref, Member → Player, plus
their descriptions), `MembersPage.tsx:78-79,212,757`, `RoomSidebar.tsx:158`
("Staff" → "Hosts"), `RoomSettingsPage.tsx:140` ("Staff get a push…"),
`RoomPreferencesDialog.tsx:58` ("Result needed (staff)" → "Result needed (hosts)"),
`JoinRoomPage.tsx:171` ("Organized by" → "Hosted by"), `PredictionTiming.tsx:153`,
`PredictionView.tsx:348`, `SeriesCreatePage.tsx:102`, `InPlayPredictions.tsx:485`
(already says "host"). Also "Members" → "Players" on the route title and
`RoomMenuDrawer` ("Members & roles" → "Players & roles").

### E. Sentence case and consistency fixes

- Title Case → sentence case: Reveal Results, Outcome Options, Min 2 Required,
  The Question, Start Draft, Confirm No Result, How To Play, Your Rooms,
  Create Room, Join Room, Notifications Disabled, What's Hot, Last Played,
  No Result, Series Champion, Hall of Champions, Special Awards, This Room,
  Streak Milestone, award names in `seriesRewards.ts` and `trophyPrestige.ts`.
- "Failed to …" → "Couldn't … Try again." (`LoginPage`, `SignupPage`,
  `ForgotPasswordPage`, `ResetPasswordPage`, `New.tsx`, `SeriesCreatePage`,
  `SeriesPage`, `JoinRoomPage`, `RoomPreferencesDialog`, `ResolvePredictionDrawer`).
- Pick one name: "Hall of Champions" vs "Hall of Fame" (`SeriesOrganizerActionsMenu.tsx:303`).
- "Explore" vs "Browse rooms anyone can join": use "Explore rooms" everywhere.
- `HowToPlayModal.tsx:78,143`: drop the emoji from the title and button.
- `home/components/CreatePlayer.tsx:82`: placeholder "e.g. Kishan" → a neutral name.
- `JoinRoomPage.tsx:85` "Joined room successfully." → "You're in."
- `ResolvePredictionDrawer.tsx:335` "Are you sure?" → state the consequence instead.
- `onboarding/components/RebrandWelcomeDialog.tsx`: retire once Verdict users have migrated.

### F. Playful moments to (re)write

Empty states and toasts that should carry the voice (one line each, plain
first, then the wink):

| Where | Now | Proposed |
|---|---|---|
| `InPlayPredictions.tsx:475` | No predictions yet. The host will start one soon! | Nothing to call yet. Your host is cooking something up. |
| `ResultsCard.tsx:84` | You're all caught up. New results show up here. | All caught up. Results land here. |
| `talk/components/RoomTalk.tsx:108` | Nobody has said anything yet. | Quiet in here. Someone say something bold. |
| `SmallRoomInviteCard.tsx:23` | It's just you so far. Predictions are better with friends. | Just you so far. Calling it alone is no fun. |
| `TrophyShowcase.tsx:207` | No trophies yet… | Shelf's empty. Finish top 3 in a series to fill it. |
| `PredictionHistoryFeed.tsx:309` | No resolved predictions yet… | No results yet. Check back after the first one's in. |
| `share/cards/InviteCard.tsx:114` | No calls yet | No calls yet. Be first. |
| `CreatePlayer.tsx:54` | Welcome Sam! | Welcome to the flock, Sam. |

### G. Outside the app shell

- `apps/web/index.html` and `supabase/functions/invite-preview/index.ts:141`:
  "Prediction series for your friends. Same points for everyone, top balance wins."
  → "The prediction game for your group chat. Same points for everyone, most points wins."
- `apps/web/public/manifest.webmanifest` and `manifest.json`: keep "Call it, then crow about it."
- `legal/pages/TermsPage.tsx` and `PrivacyPage.tsx`: update "predictions" /
  "organizer" if decisions 1 and 3 land. Keep the betting prohibition wording as it is.
