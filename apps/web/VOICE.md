# Voice and Vocabulary

How Crow talks, and which word means what. Read with `PRODUCT.md` (brand
personality, Crow voice) before writing any user-facing copy: UI strings, push
notifications, share text, error messages, meta tags.

Applied across the app, push notifications and Room talk phrases in
November 2026. New copy follows this file; if a word isn't here, add it here
first.

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
| **Squawk** | Posting in Room talk (only there) |

Don't invent new crow puns on the fly. If a moment deserves one, add it here
first. Puns wear thin fast, and a short fixed list is what makes them feel like
a brand rather than a gimmick.

### Style rules

- **Sentence case everywhere**: "Reveal result", not "Reveal Results"; "How to play", not "How To Play".
- **Errors:** "Couldn't [verb] [thing]. Try again." Never "Failed to…", never "Error…".
- **Success toasts:** state what happened, past tense, short. "Pick locked in." "Result revealed."
- **Second person, active voice.** "You called it", not "Prediction won".
- **Numbers:** "50 pts" in tight UI, "50 points" in sentences.
- **Emoji:** only in push notification titles, share text and the How to play slides, one per message, from a fixed set: 🎯 new question, ⏰ closing soon, 🔒 picks locked, 🏆 result in, ↩️ called off, ⏳ result needed (hosts), 🙋 join request, 👋 new player, 🐦 you're in / shared messages. None in UI headings or buttons.
- **No pressure tactics:** no "Don't miss out!", no fake urgency, no guilt. A real deadline stated plainly is fine ("1 hour left to pick").
- **Examples and placeholders** use sports and pop culture, never money or crypto.

---

## 2. Glossary: user-facing term → backend

The database and code keep their names. This table is the translation layer.
When a UI term changes, update this table.

| Concept | Say (UI) | Don't say | Backend name |
|---|---|---|---|
| A thing to predict | **question** | prediction, bet, market, game | `predictions` table, `prediction_*` functions, `/predictions/` routes |
| Its choices | **options** | outcomes, sides, lines | `prediction_options` |
| Several questions created together | **set** | bundle, slate | `create_predictions`, `PredictionSetForm` |
| A player's choice | **pick** | bet, wager, play, call (as noun) | `bets` table, `place_bet`, `cancel_bet`, `BetSheet` |
| Points put on a pick | **points on it** · slider label "How sure are you?" (no noun for a stake) | stake, wager, bet amount, risk | `bets.amount` |
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
| Room roles | **Owner · Host · Ref · Player** | organizer, resolver, member, staff, admin | `room_members.role` = owner/organizer/resolver/member |
| Hosts + refs together | **hosts** ("Hosts only") | staff | `can.organize`, `is_organizer` |
| Organizer inbox | **Needs you** | queue, to-do | `NeedsYouCard`, `ManagePage` |
| Room feed | **Activity** | activities, feed | `room_activities` |
| Per-question chat | **Room talk** · posts are **squawks** | phrases, comments | `prediction_posts`, `talk` schema |
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

## 3. Why the backend keeps its names

Renaming `predictions` → `questions` or `bets` → `picks` in the database would
touch tables, RLS policies, around a hundred SQL functions, realtime
publications, edge functions, generated types and every client query, plus a
live data migration, all for no change a player can see. So the backend keeps
its names, and §2 is the translation layer. Code comments may use either word.

What does follow this file on the server:

- **Push notification titles** (`supabase/schemas/notifications/…`,
  `create_predictions`, `resolve_predictions`, `publish_scheduled_predictions`,
  `join_room`). Change them in the schema file *and* in a migration.
- **Room talk phrases** (`public.talk_phrases.text`, seeded by migration).
- **The invite link preview** (`supabase/functions/invite-preview`).

What doesn't:

- **`raise exception` messages** in SQL functions ("Betting deadline has
  passed") are for developers and tests. The app shows its own copy for
  these, so never show a raw server error message as the main text.
- **Award descriptions saved on `series_awards.description`** are older
  wording. The app shows `getSeriesAwardDescription()` from
  `shared/lib/seriesRewards.ts` instead.
- **Stat card labels in `get_room_stat_cards`** aren't used by the app.
