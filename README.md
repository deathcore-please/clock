# Wall Clock Dashboard

A portrait-first wall clock and weather display for Chromium. It runs as a normal
website on desktop Chrome and Raspberry Pi OS, with a same-origin Cloudflare Pages
Function protecting the OpenWeather API key.

## What it shows

- 24-hour clock, seconds, and date
- Current temperature, conditions, feels-like temperature, humidity, and high/low
- Six upcoming 3-hour forecast periods, advancing automatically as the day passes
- Offline fallback to the last successful weather response
- Fullscreen entry from the page; press `Escape` to exit
- A Home Assistant-controlled background theme driven by the Wipro bulb
- Live tasks pushed from Home Assistant's Android to-do widget
- A weekday Route 37 commute view from 08:08 until 08:30
- Live bus position, distance, update age, and available punctuality information

## Fast local UI development

Node.js 22.13 or newer is required.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open the local URL printed by Vite. This mode uses deterministic mock weather,
so it does not need an API key.

Preview the Route 37 view outside its normal weekday time window by adding one
of these development-only query strings to the URL:

```text
?previewBus=station
?previewBus=outbound
?previewBus=inbound
?previewBus=stale
?previewBus=untracked
```

## Test the Cloudflare Function locally

Copy `.dev.vars.example` to `.dev.vars`, add your OpenWeather key and coordinates,
then run:

```powershell
npm run d1:migrate:local
npm run pages:dev
```

Open `http://localhost:8788`. This builds the site and runs the production
`/api/state` Pages Function locally. Set `WEATHER_MOCK=true` in `.dev.vars` when
you want to exercise the complete Pages stack without making a real API call.

Never commit `.dev.vars` or any file containing either API key.

Set `BUS_MOCK=true` to preview the complete Cloudflare bus path without a BODS
key. For live Route 37 positions, add `BODS_API_KEY` and set `BUS_MOCK=false`.

## Cloudflare Pages deployment

Pages Functions require Git integration or Wrangler deployment; dashboard Direct
Upload does not support Functions.

For Git integration:

1. Push this repository to GitHub.
2. In Cloudflare, create a Pages project from the repository.
3. Set the build command to `npm run build`.
4. Set the output directory to `dist`.
5. Under **Settings → Variables and Secrets**, add:

| Name | Type | Example |
| --- | --- | --- |
| `OPENWEATHER_API_KEY` | Encrypted secret | Your OpenWeather key |
| `BODS_API_KEY` | Encrypted secret | Your BODS key |
| `AMBIENT_WEBHOOK_SECRET` | Encrypted secret | A random value of at least 32 bytes |
| `WEATHER_LAT` | Variable | `51.6286` |
| `WEATHER_LON` | Variable | `-0.7482` |
| `WEATHER_LOCATION_NAME` | Variable | `High Wycombe` |
| `DISPLAY_TIMEZONE` | Variable | `Europe/London` |
| `WEATHER_UNITS` | Variable | `metric` |
| `WEATHER_MOCK` | Variable | `false` |
| `BUS_MOCK` | Variable | `false` |
| `BUS_MOCK_SCENARIO` | Variable | `station` |

Redeploy after changing variables or secrets.

### Home Assistant state in D1

The Home Assistant bridges store the latest bulb state and complete task-list
snapshot in D1 so updates remain globally consistent. Create the database once
and apply every pending migration before deploying these features:

```powershell
npm run d1:create
npm run d1:migrate:remote
```

`d1:create` writes the real `AMBIENT_DB` binding and database UUID into
`wrangler.jsonc`. Commit that binding, add the encrypted
`AMBIENT_WEBHOOK_SECRET`, and redeploy the Pages project. For a dashboard-created
database, add a D1 binding named exactly `AMBIENT_DB` and run every numbered SQL
file in `migrations/` from its Console in ascending order.

The Home Assistant snippets, task-list seed instructions, and endpoint checks are in
[`home-assistant/README.md`](home-assistant/README.md). Home Assistant only makes
outbound requests; it does not need a public URL or port forwarding.

## Raspberry Pi Chromium

On Raspberry Pi OS Desktop, open the deployed URL in Chromium and select
**Full screen**. A normal press of `Escape` exits the page's fullscreen mode.

For automatic browser fullscreen at desktop login, add a Chromium launch line to
`~/.config/labwc/autostart`:

```text
chromium https://your-clock.pages.dev --start-fullscreen --noerrdialogs --disable-infobars --no-first-run &
```

Chromium's startup fullscreen is browser fullscreen rather than the page's Web
Fullscreen mode, so current Chromium may require holding `Escape` to exit it.
Use the on-page button when single-press `Escape` behaviour is important.

For an always-on display, disable screen blanking through:

```text
sudo raspi-config
```

Choose **Display Options → Screen Blanking → No**, and also disable any sleep or
eco timer in the monitor's own menu.

## Validation

```powershell
npm run check
```

This runs type checking, linting, unit/component tests, and a production build.
