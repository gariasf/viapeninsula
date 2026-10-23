<h1 align="center">Via Península</h1>

<p align="center"><strong>A live map of passenger trains moving on real track across Spain.</strong></p>

<p align="center">
  <a href="https://viapeninsula.gariasf.com"><strong>Open the map</strong></a> ·
  <a href="#what-it-shows">What it shows</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="docs/development.md">Development</a>
</p>

<p align="center">
  <a href="https://github.com/gariasf/viapeninsula/actions/workflows/deploy.yml"><img alt="Deploy" src="https://github.com/gariasf/viapeninsula/actions/workflows/deploy.yml/badge.svg"></a>
  <a href="https://github.com/gariasf/viapeninsula/actions/workflows/daily.yml"><img alt="Daily build" src="https://github.com/gariasf/viapeninsula/actions/workflows/daily.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="Licence: AGPL-3.0" src="https://img.shields.io/badge/licence-AGPL--3.0-blue"></a>
</p>

<a href="https://viapeninsula.gariasf.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/readme/barcelona-dark.webp">
    <img alt="Barcelona at the evening peak on a Friday: 431 Trains live on Rodalies, FGC, the Metro and TRAM, each a pill with its Line's name, and Lines that share track drawn side by side" src="docs/readme/barcelona-light.webp">
  </picture>
</a>

Each Train on the map is a pill with its Line's name, or zoomed out a dot. Where its operator publishes live data, the Train is drawn where that data puts it, and is Live; where none does, or the data has gone quiet, it runs to its timetable, shifted by its last known Delay, and is drawn dashed as Scheduled. Between reports, Trains keep moving along their track, traced on OpenStreetMap's rails, so they run where they really run rather than in straight lines from Station to Station. Their positions are estimates, built from the operators' timetables and live data.

## What it shows

<table>
  <tr>
    <td width="25%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/readme/follow-dark.webp"><img alt="A Metro L5 Train followed on a phone: Live, confirmed 55 seconds ago, due at its next Station, Hospital Clínic, in 28 seconds, with how far along its Line it is" src="docs/readme/follow-light.webp" width="180"></picture></td>
    <td width="25%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/readme/board-dark.webp"><img alt="Passeig de Gràcia's board: the next departures of Rodalies and the Metro, which meet there, under the Station's Alerts" src="docs/readme/board-light.webp" width="180"></picture></td>
    <td width="25%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/readme/line-dark.webp"><img alt="R2 Nord's Line screen: its six Trains now, three of them late, its Alert, and its Trains along its Stations" src="docs/readme/line-light.webp" width="180"></picture></td>
    <td width="25%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/readme/now-dark.webp"><img alt="Now on a Friday evening: Rodalies de Catalunya's Lines with Trains late, R4's 7 of 18 first, and a button to follow a random Train" src="docs/readme/now-light.webp" width="180"></picture></td>
  </tr>
  <tr>
    <td align="center">Follow a Train</td>
    <td align="center">A Station's board</td>
    <td align="center">A Line</td>
    <td align="center">Now</td>
  </tr>
</table>

- **On the track, side by side.** Each Line is traced along the rails it runs on, and where a region's Lines share track, as Rodalies' do through Barcelona, the map draws them side by side, in one order, as a metro map would.
- **Follow a Train.** Tap one and the map keeps it in view, with a card counting down to its next Station and the rest of its calls.
- **Boards, Lines and Search.** A Station's next departures, those of every Network that meets there on one board; a Line's Trains along its Stations; and Search for a Station, a Line or a Train number.
- **Now and Nearby.** What's wrong at this moment, Network by Network: the Lines with Trains late or cancelled. A Train to follow at random, and the Trains near you.
- **Alerts in the operators' own words.** Renfe's and TRAM's Alerts on the Lines and Stations they name, and Closures drawn on the Lines they close.
- **Favourites and a Passport.** Keep the Stations and Lines you use. Turn the Passport on, and each Train you follow from end to end is a Ride, with a Stamp for each Line, kind of service and Network. Both stay in your browser, with no account and no cookies.
- **3D bridges.** On a desktop, from zoom 14, a Line on a bridge rises onto a deck on piers, and tunnels have mouths.
- **Five languages, light and dark.** Catalan, Spanish, Basque, Galician and English, and the map follows your system's dark mode.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/readme/viaduct-dark.webp">
    <img alt="The Madrid–Valladolid high-speed line's Arroyo del Valle viaduct, tilted: AVE's Line raised on a deck over the valley, on piers, to a tunnel's mouth" src="docs/readme/viaduct-light.webp" width="80%">
  </picture>
</p>

## Networks

| | Networks | Live data |
|---|---|---|
| **Catalonia** | Rodalies de Catalunya · FGC · Metro de Barcelona · TRAM | Renfe's GPS · FGC's positions · TMB's predictions · TRAM's positions |
| **Cercanías** | Madrid · Asturias · Bilbao · Cádiz · Cartagena · Ferrol · León · Málaga · Murcia/Alicante · San Sebastián · Santander · Sevilla · Valencia · Zaragoza | Renfe's GPS |
| **Basque Country** | Euskotren | Euskotren's trip updates |
| **Long distance** | AVE y Larga Distancia · Media Distancia y Avant · Ouigo | Renfe's GPS; Ouigo publishes none, so its Trains run to their timetable |

Iryo publishes no data on its trains, so they aren't on the map.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/readme/spain-dark.webp">
    <img alt="Spain zoomed out: the long-distance Lines across the country and their Trains" src="docs/readme/spain-light.webp" width="80%">
  </picture>
</p>

## How it works

```mermaid
flowchart LR
  subgraph build ["Daily build · GitHub Actions"]
    tt["Timetables"] --> trace["Trace each Line on the rails,<br>place each Trip on its track"]
    rails["OpenStreetMap's rails"] --> trace
  end
  subgraph fetch ["Fetcher · Cloudflare Durable Object"]
    feeds["Live feeds and Alerts"] --> snap["A snapshot every 20 s"]
  end
  trace -->|"three days' bundles, by region"| r2[("Cloudflare R2")]
  snap --> r2
  r2 --> site["The map · MapLibre GL"]
```

- **The daily build** reads each Network's timetable, traces each of its Lines along OpenStreetMap's rails ([ADR-0004](docs/adr/0004-track-follows-openstreetmap.md)), places every Trip on its track, and publishes the next three service days to R2, in a track file for each region and a Trips file for each region and day ([ADR-0014](docs/adr/0014-the-bundle-is-built-by-region-a-track-file-and-a-trips-file-for-each.md)).
- **The fetcher** reads the operators' live feeds, from every 20 seconds to every 2 minutes as each allows, and writes what they report to one snapshot on R2, with their Alerts beside it ([ADR-0003](docs/adr/0003-live-data-snapshot-on-r2.md)).
- **The map** loads each region's files as it comes into view, and moves every Train along its Trip by its timetable, frame by frame, corrected by each live report as it comes ([ADR-0002](docs/adr/0002-timetable-drives-motion.md)).

It's TypeScript throughout: [MapLibre GL JS](https://maplibre.org) on [OpenFreeMap](https://openfreemap.org)'s basemap, built with Vite and served from Cloudflare Workers.

## Development

You need Node 24 or later, and for the daily build and its tests, `unzip` and osmium-tool (`brew install osmium-tool`).

```sh
npm install
npm run dev     # the site at http://localhost:5173, reading the live data
npm test
npm run check   # typecheck
```

[docs/development.md](docs/development.md) has the rest: the daily build and how to check a change to it, the page harness for browser checks, the fetcher, the Cloudflare setup and the Actions workflows. The domain language is in [CONTEXT.md](CONTEXT.md), the decisions in [docs/adr](docs/adr), the v1 spec in [issue #1](https://github.com/gariasf/viapeninsula/issues/1), and the work is planned in [issues](https://github.com/gariasf/viapeninsula/issues) and [milestones](https://github.com/gariasf/viapeninsula/milestones).

## Licence and credits

The code is [AGPL-3.0](LICENSE). Timetables and live data come from Renfe and FGC under CC BY 4.0, from Eusko Trenbideak through Moveuskadi under CC BY 4.0, from TMB, from TRAM (Powered by TRAM Barcelona), and Ouigo's timetable from the Ministry of Transport's NAP under its LDA MITRAMS licence (Powered by MITRAMS). TMB's and TRAM's terms ask for the day their data was last updated to be shown with it: TMB's feed's start date and, as TRAM's feeds have none, the day the build read them, or where it built them from their copy, the day that was kept. The track follows OpenStreetMap's rails and the basemap comes from OpenFreeMap, both © OpenStreetMap contributors under the ODbL.
