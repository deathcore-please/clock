# Wall Clock Dashboard

A portrait-first wall clock and weather display for Chromium. It runs as a normal
website on desktop Chrome and Raspberry Pi OS, with a same-origin Cloudflare Pages
Function protecting the OpenWeather API key.

## What it shows

- 24-hour clock, seconds, and date
- Current temperature, conditions, feels-like temperature, humidity, and high/low
- Four upcoming 3-hour forecast periods, advancing automatically as the day passes
- Offline fallback to the last successful weather response
- Fullscreen entry from the page; press `Escape` to exit
- A neutral ambient-light state ready for a future Home Assistant bridge

## Fast local UI development

Node.js 22.13 or newer is required.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open the local URL printed by Vite. This mode uses deterministic mock weather,
so it does not need an API key.

## Test the Cloudflare Function locally

Copy `.dev.vars.example` to `.dev.vars`, add your OpenWeather key and coordinates,
then run:

```powershell
npm run pages:dev
```

Open `http://localhost:8788`. This builds the site and runs the production
`/api/state` Pages Function locally. Set `WEATHER_MOCK=true` in `.dev.vars` when
you want to exercise the complete Pages stack without making a real API call.

Never commit `.dev.vars` or any file containing the OpenWeather key.

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
| `WEATHER_LAT` | Variable | `51.5074` |
| `WEATHER_LON` | Variable | `-0.1278` |
| `WEATHER_LOCATION_NAME` | Variable | `London` |
| `DISPLAY_TIMEZONE` | Variable | `Europe/London` |
| `WEATHER_UNITS` | Variable | `metric` |
| `WEATHER_MOCK` | Variable | `false` |

Redeploy after changing variables or secrets.

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
