# Warcon Discord bot

A single-container Discord bot for WARDOGS servers. It polls each server's RCON listener (the same
HTTP API the Warcon panel uses) and posts to a channel:

- **Match results**: when the map changes or the match restarts, which faction won and the score.
- **Kicks, bans and unbans** from the listener's audit log, with the reason, whoever issued them
  (Warcon, the in-game console, any other tool).
- **A leaderboard message** showing today's top players by kills, with deaths and K/D, refreshed on
  a schedule. Its Today / This week / This month / All time buttons reply privately (only the
  clicker sees it) with that period, so the message itself never changes.
- **A cash leaderboard message** in the same channel, same buttons: top earners by cash gained in
  the period. Spending is never subtracted and the balance carries across matches.
- The API reports per player only kills, deaths and cash: there are no heals, revives, vehicle or
  weapon stats and no kill feed (see https://wardogs.tech/rcon-reference), so no leaderboard can
  be built for those. Kills are counted from the per-player totals the server reports;
  the API exposes no weapon or vehicle detail, so there is no per-weapon split.

Bun, SQLite on a volume, no other dependencies. Periods are UTC, weeks start on Monday.

## Landing page

The bot also serves a landing page at `/` (source in `site/`): live player count, current map,
average ping, 30-day uptime (share of reachable polls), the monthly top 10 by kills, the server
join code with a copy button, and the Discord's member counts from its public invite. The page
polls `GET /api/site` every 30 seconds; that document is public and read-only. Put a custom
domain on the Railway service to host it at your own address. Replace `site/assets/*.png` to
change the artwork.

## Discord setup

1. [Developer Portal](https://discord.com/developers/applications) → New Application.
2. **Bot** tab → Reset Token → copy it (`DISCORD_BOT_TOKEN`).
3. **General Information** → copy the Public Key (`DISCORD_PUBLIC_KEY`).
4. **OAuth2 → URL Generator**: scope `bot`, permissions **Send Messages** and **Embed Links**
   (`permissions=18432`). Open the URL and add the bot to your server.
5. In Discord, enable Developer Mode (Settings → Advanced), right-click the channel → Copy Channel
   ID (`DISCORD_EVENTS_CHANNEL_ID`; `DISCORD_LEADERBOARD_CHANNEL_ID` if the leaderboard should
   live elsewhere).
6. After the bot is deployed and reachable, **General Information → Interactions Endpoint URL** =
   `https://<your-domain>/interactions`. Discord verifies it on save, so the bot must be running.
   Without this the leaderboard still posts, but the buttons do nothing.

## Railway

One service from this repository with **Root Directory** `/bot` (the Dockerfile is picked up),
a **volume** mounted at `/data`, a public domain, and these variables:

| Variable                         | Required | Meaning                                                                                    |
| -------------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `DISCORD_BOT_TOKEN`              | yes      | Bot token.                                                                                 |
| `DISCORD_PUBLIC_KEY`             | yes      | Application public key; verifies button clicks.                                            |
| `DISCORD_EVENTS_CHANNEL_ID`      | yes      | Channel for match results, kicks and bans.                                                 |
| `DISCORD_LEADERBOARD_CHANNEL_ID` | no       | Channel for the leaderboard message (default: the events channel).                         |
| `DISCORD_INVITE`                 | no       | Invite code whose member counts the landing page shows (default `warfrogs`).               |
| `GAME_URL` + `GAME_PASSWORD`     | yes*     | One server: `http://host:7776` and its RCON password. `GAME_NAME` labels it.               |
| `GAME_SERVERS`                   | yes*     | Several: `[{"name":"EU #1","url":"http://h:7776","password":"..."}]` (replaces the above). |
| `GAME_TLS_INSECURE`              | no       | `true` accepts a self-signed certificate on an https listener.                             |
| `POLL_SECONDS`                   | no       | Poll cadence per server (default 10).                                                      |
| `LEADERBOARD_REFRESH_SECONDS`    | no       | How often the leaderboard message is re-rendered (default 900); shown in its footer.       |
| `LEADERBOARD_SIZE`               | no       | Rows shown, at most 25 (default 10).                                                       |
| `DATA_DIR`                       | no       | SQLite location (default `/data` in the image).                                            |

The listener must be reachable from Railway: bind it to a public address on the game host with a
strong RCON password, or use an https listener. `GET /health` on the bot reports each server's
reachability.

## Local

```
cd bot && bun install
GAME_URL=http://127.0.0.1:7776 GAME_PASSWORD=... DISCORD_BOT_TOKEN=... DISCORD_PUBLIC_KEY=... \
DISCORD_EVENTS_CHANNEL_ID=... DATA_DIR=./data bun run start
bun test      # unit tests
bun run check # tsc
```
