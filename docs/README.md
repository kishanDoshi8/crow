# Crow docs

Design notes and how-tos behind [playcrow.app](https://playcrow.app). Start
with the [project README](../README.md) for the overview.

## Architecture and design

- [Database security rules](database-security.md): how Postgres enforces the game when the browser talks to it directly
- [Database schema files](database-schema.md): how `supabase/schemas/` and the migrations stay in step
- [Event packs](event-packs.md): ready-made questions for real fixtures, from research to design
- [Performance](performance.md): keeping the app quick to open and smooth to use
- [Engineering standards](engineering-standards.md): structure and conventions for `apps/web`

## Running it

- [Running Crow locally](development.md)
- [Server setup](server-setup.md): the production droplet, nginx and tag-based releases
- [Deploying without stale versions](deployment-caching.md): cache rules and update checks for the installed app
- [Error reporting](error-reporting.md)
- [Google sign-in](google-sign-in.md)
- [Account deletion](account-deletion.md)

## Product

- [Analytics](analytics.md): measuring how rooms are doing, with no third-party trackers
- [Which shareables bring people in](sharing-stats.md)
- [Roadmap](roadmap.md)
- [Moving from Verdict to Crow](crow-launch.md): the launch checklist for the new address
