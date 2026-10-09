# #327: every interface string in English, Spanish, Basque and Galician

Generated from `src/web/i18n.ts` on branch `327-basque-galician` (9 Oct 2026), and updated after the review (cab5183): Basque writes one in words, after its noun, as Euskaltzaindia's norm 203 has it, so its three singulars with a noun read "geltoki bat" and "irteera bat" with no `{n}`. The Basque (eu) and Galician (gl) are machine-translated, from the Catalan and the Spanish, for a speaker to check. Catalan is left out to keep the table narrow; it's in the file. `{n}`, `{network}`, `{ago}`, `{station}`, `{headsign}` and `{time}` are filled in by the map, and `one…` keys are the singular of the key after or before them.

## The switch

| ca | es | eu | gl | en |
|---|---|---|---|---|
| Català | Castellano | Euskara | Galego | English |

The chip shows each language's code: CA, ES, EU, GL, EN.

## About's machine-translation note (`MACHINE_TRANSLATED`)

- **eu:** Euskarazko testuak itzulpen automatikoz eginak dira, eta hiztun batek ez ditu oraindik berrikusi. Zuzendu beharreko zerbait ikusten baduzu, jakinarazi iezaguzu GitHub-en.
- **gl:** Os textos en galego son unha tradución automática, e aínda non os revisou ningún falante. Se ves algo que corrixir, avísanos en GitHub.

GitHub links to https://github.com/gariasf/viapeninsula/issues.

## `STRINGS`

| key | en | es | eu | gl |
|---|---|---|---|---|
| `language` | Language | Idioma | Hizkuntza | Idioma |
| `map` | Map | Mapa | Mapa | Mapa |
| `showCredits` | Show or hide the credits | Mostrar u ocultar los créditos | Erakutsi edo ezkutatu kredituak | Amosar ou agochar os créditos |

_As OpenStreetMap's own site words it._

| key | en | es | eu | gl |
|---|---|---|---|---|
| `osmContributors` | © OpenStreetMap contributors | © Colaboradores de OpenStreetMap | © OpenStreetMap laguntzaileak | © Colaboradores do OpenStreetMap |

_Before the day an operator last updated its data, in the credits._

| key | en | es | eu | gl |
|---|---|---|---|---|
| `updated` | updated | actualizado el | azken eguneratzea: | actualizado o |

_Live and Scheduled, and what each means in About's key. Alone, they're the followed Train's status, and what a Train's pill tells a screen reader._

| key | en | es | eu | gl |
|---|---|---|---|---|
| `live` | Live | En directo | Zuzenean | En directo |
| `liveMeans` | position confirmed by live data | posición confirmada por datos en tiempo real | denbora errealeko datuek baieztatutako posizioa | posición confirmada por datos en tempo real |
| `scheduled` | Scheduled | Programado | Programatuta | Programado |
| `scheduledMeans` | position from the timetable | posición según el horario | ordutegiaren araberako posizioa | posición segundo o horario |

_The legend's counts of every Train on the map, Live and Scheduled. {n} is how many._

| key | en | es | eu | gl |
|---|---|---|---|---|
| `liveCount` | {n} live | {n} en directo | {n} zuzenean | {n} en directo |
| `scheduledCount` | {n} scheduled | {n} programados | {n} programatuta | {n} programados |
| `oneScheduledCount` | {n} scheduled | {n} programado | {n} programatuta | {n} programado |

_The banner, while a Network's live data is unavailable: {network} is its name._

| key | en | es | eu | gl |
|---|---|---|---|---|
| `liveUnavailable` | {network} live data unavailable | {network}: sin datos en tiempo real | {network}: denbora errealeko daturik ez | {network}: sen datos en tempo real |

_After a Network's name in the banner, while its timetable has no Trips today, so it has no Trains on the map (#226)._

| key | en | es | eu | gl |
|---|---|---|---|---|
| `noTimetable` | no timetable today | sin horario hoy | gaur ordutegirik ez | sen horario hoxe |

_The banner alone, while the map has never got live data, and so can't name a Network._

| key | en | es | eu | gl |
|---|---|---|---|---|
| `noLive` | Live data unavailable, positions from the timetable | Datos en tiempo real no disponibles, posiciones según el horario | Denbora errealeko daturik ez, posizioak ordutegiaren arabera | Datos en tempo real non dispoñibles, posicións segundo o horario |

_The follow panel. {n} is a number of minutes, and {ago} how long ago, as ago() words it._

| key | en | es | eu | gl |
|---|---|---|---|---|
| `stopFollowing` | Stop following this train | Dejar de seguir este tren | Utzi tren honi jarraitzeari | Deixar de seguir este tren |
| `onTime` | on time | puntual | garaiz | puntual |
| `late` | {n} min late | {n} min de retraso | {n} min atzeratuta | {n} min de atraso |
| `early` | {n} min early | {n} min de adelanto | {n} min aurreratuta | {n} min de adianto |
| `confirmed` | confirmed {ago} ago | confirmado hace {ago} | duela {ago} baieztatua | confirmado hai {ago} |
| `lastConfirmed` | last confirmed live {ago} ago | confirmado en directo por última vez hace {ago} | zuzenean azkenekoz duela {ago} baieztatua | confirmado en directo por última vez hai {ago} |
| `noLiveTrain` | no live data | sin datos en tiempo real | denbora errealeko daturik ez | sen datos en tempo real |
| `speed` | Estimated speed | Velocidad estimada | Kalkulatutako abiadura | Velocidade estimada |
| `unit` | Unit | Unidad | Unitatea | Unidade |
| `nextStations` | Next stations | Próximas estaciones | Hurrengo geltokiak | Próximas estacións |
| `nextStation` | Next station | Próxima estación | Hurrengo geltokia | Próxima estación |

_The followed Train's strip's name with its fold open, as it lists the Stations the Train has already left too; and what a screen reader hears after each of those, whose subject is the Train, so that it needn't agree with a Station's name._

| key | en | es | eu | gl |
|---|---|---|---|---|
| `stations` | Stations | Estaciones | Geltokiak | Estacións |
| `passed` | passed | ya ha pasado | dagoeneko igaro da | xa pasou |

_Where the followed Train's next Stations start: the Station it last left._

| key | en | es | eu | gl |
|---|---|---|---|---|
| `left` | Left {station} | Ha salido de {station} | {station} geltokitik irten da | Saíu de {station} |

_How long until a Train comes: under a time on a board or in Nearby, and under the followed Train's next Station's._

| key | en | es | eu | gl |
|---|---|---|---|---|
| `minutes` | {n} min | {n} min | {n} min | {n} min |
| `inMinutes` | in {n} min | en {n} min | {n} min barru | en {n} min |
| `now` | now | ahora | orain | agora |

_At the foot of a peeking followed Train: how many Stations it has still to come after the next, and the last of them, where it's headed, and when it's due there._

| key | en | es | eu | gl |
|---|---|---|---|---|
| `moreStations` | {n} more stations, to {headsign} at {time} | {n} estaciones más, hasta {headsign} ({time}) | {n} geltoki gehiago, {headsign} arte ({time}) | {n} estacións máis, ata {headsign} ({time}) |
| `oneMoreStation` | {n} more station, to {headsign} at {time} | {n} estación más, hasta {headsign} ({time}) | Geltoki bat gehiago, {headsign} arte ({time}) | {n} estación máis, ata {headsign} ({time}) |

_The fold atop a pulled-up followed Train's strip: how many Stations it has already left, which shows them, and once shown hides them._

| key | en | es | eu | gl |
|---|---|---|---|---|
| `earlierStations` | {n} earlier stations | {n} estaciones anteriores | Aurreko {n} geltoki | {n} estacións anteriores |
| `oneEarlierStation` | {n} earlier station | {n} estación anterior | Aurreko geltoki bat | {n} estación anterior |
| `hideEarlierStations` | Hide {n} earlier stations | Ocultar las {n} estaciones anteriores | Ezkutatu aurreko {n} geltokiak | Agochar as {n} estacións anteriores |
| `oneHideEarlierStation` | Hide {n} earlier station | Ocultar la estación anterior | Ezkutatu aurreko geltokia | Agochar a estación anterior |

_A Station's board._

| key | en | es | eu | gl |
|---|---|---|---|---|
| `closeBoard` | Close the departures board | Cerrar el panel de salidas | Itxi irteeren panela | Pechar o panel de saídas |
| `nextDepartures` | Next departures | Próximas salidas | Hurrengo irteerak | Próximas saídas |
| `noDepartures` | No upcoming departures | Ninguna salida próxima | Ez dago hurrengo irteerarik | Ningunha saída próxima |
| `cancelled` | Cancelled | Cancelado | Bertan behera | Cancelado |

_A departure at a Station its Train won't stop at, as one cut short doesn't run to (#346)._

| key | en | es | eu | gl |
|---|---|---|---|---|
| `notStopping` | Doesn't stop here | No para aquí | Ez da hemen gelditzen | Non para aquí |

_At the foot of a peeking board: how many departures more it lists._

| key | en | es | eu | gl |
|---|---|---|---|---|
| `moreDepartures` | {n} more departures | {n} salidas más | {n} irteera gehiago | {n} saídas máis |
| `oneMoreDeparture` | {n} more departure | {n} salida más | Irteera bat gehiago | {n} saída máis |

_Nearby Trains: their panel's title, and the button that opens them._

| key | en | es | eu | gl |
|---|---|---|---|---|
| `nearby` | Nearby trains | Trenes cercanos | Inguruko trenak | Trens próximos |
| `nearbyButton` | Nearby | Cerca | Inguruan | Preto |
| `closeNearby` | Close nearby trains | Cerrar los trenes cercanos | Itxi inguruko trenak | Pechar os trens próximos |
| `passingNearby` | Passing within 1.5 km in the next hour | Pasan a menos de 1,5 km en la próxima hora | Datorren orduan 1,5 km baino gutxiagora igaroko dira | Pasan a menos de 1,5 km na próxima hora |
| `noneNearby` | No trains pass within 1.5 km in the next hour | Ningún tren pasa a menos de 1,5 km en la próxima hora | Datorren orduan ez da trenik igaroko 1,5 km baino gutxiagora | Ningún tren pasa a menos de 1,5 km na próxima hora |
| `locating` | Finding where you are… | Buscando dónde estás… | Non zauden bilatzen… | Buscando onde estás… |
| `noLocation` | Your location isn't available, so nearby trains can't be shown | No se ha podido saber dónde estás, así que no se pueden mostrar los trenes cercanos | Ezin izan da jakin non zauden; beraz, ezin dira inguruko trenak erakutsi | Non se puido saber onde estás, así que non se poden amosar os trens próximos |

_Nearby, where the viewer refused to say where they are: that the browser isn't sharing it, and how to allow it (#324)._

| key | en | es | eu | gl |
|---|---|---|---|---|
| `locationBlocked` | Your browser isn't sharing your location with this map | El navegador no comparte tu ubicación con este mapa | Nabigatzaileak ez du zure kokapena mapa honekin partekatzen | O navegador non comparte a túa localización con este mapa |
| `allowLocation` | To see nearby trains, allow location for this site in your browser's settings, then try again | Para ver los trenes cercanos, permite la ubicación para este sitio en la configuración del navegador y vuelve a intentarlo | Inguruko trenak ikusteko, baimendu kokapena gune honetarako nabigatzailearen ezarpenetan, eta saiatu berriro | Para ver os trens próximos, permite a localización para este sitio na configuración do navegador e téntao de novo |

_The button under Nearby's message that asks the browser again where the viewer is._

| key | en | es | eu | gl |
|---|---|---|---|---|
| `tryAgain` | Try again | Volver a intentarlo | Saiatu berriro | Tentar de novo |

_The button beside Nearby's that follows a random Train._

| key | en | es | eu | gl |
|---|---|---|---|---|
| `followRandom` | Follow a random train | Seguir un tren al azar | Jarraitu ausazko tren bati | Seguir un tren ao chou |

_The handle at the top of the panel on a phone, which pulls it up or lets it down._

| key | en | es | eu | gl |
|---|---|---|---|---|
| `showMore` | Show more | Mostrar más | Erakutsi gehiago | Amosar máis |
| `showLess` | Show less | Mostrar menos | Erakutsi gutxiago | Amosar menos |

_The About dialog, and the legend's button that opens it._

| key | en | es | eu | gl |
|---|---|---|---|---|
| `about` | About this map | Acerca de este mapa | Mapa honi buruz | Sobre este mapa |
| `close` | Close | Cerrar | Itxi | Pechar |
| `estimates` | Via Península shows Catalonia's trains, metros and trams, and Renfe's Cercanías trains in the rest of Spain, as they run. Their positions are estimates derived from the operators' data, built from timetables and live data. | Via Península muestra los trenes, metros y tranvías de Cataluña, y los trenes de Cercanías de Renfe en el resto de España, mientras circulan. Las posiciones son estimaciones derivadas de los datos de los operadores, calculadas a partir de los horarios y de los datos en tiempo real. | Via Penínsulak Kataluniako trenak, metroak eta tranbiak erakusten ditu, baita Renferen Cercanías trenak ere Espainiako gainerako lekuetan, dabiltzan bitartean. Posizioak operadoreen datuetatik ateratako zenbatespenak dira, ordutegietatik eta denbora errealeko datuetatik kalkulatuak. | Via Península amosa os trens, metros e tranvías de Cataluña, e os trens de Cercanías de Renfe no resto de España, mentres circulan. As posicións son estimacións derivadas dos datos dos operadores, calculadas a partir dos horarios e dos datos en tempo real. |

_After estimates: what a Train's pill says zoomed in, as pillOf() outlines it._

| key | en | es | eu | gl |
|---|---|---|---|---|
| `outlines` | Zoomed in, each train is a label with its line's name, shaped by the line's kind of service: rounded for commuter and suburban lines, pointed at both ends for regional lines, and a rounded square for the lines of TMB's metro, TRAM, Cádiz's tram-train, the rack railway and the funiculars. | Con el mapa ampliado, cada tren es una etiqueta con el nombre de su línea, y su forma indica el tipo de servicio: redondeada para las líneas de cercanías y las suburbanas, acabada en punta por ambos extremos para las regionales, y cuadrada con las esquinas redondeadas para las del metro de TMB, del TRAM, del tren-tranvía de Cádiz, del cremallera y de los funiculares. | Mapa handituta, tren bakoitza bere linearen izena daraman etiketa bat da, eta haren formak zerbitzu mota adierazten du: biribildua aldiriko eta hiri-inguruko lineetan, bi muturretan puntaduna eskualdeko lineetan, eta izkina biribilduko karratua TMBren metroko, TRAMeko, Cadizko tren-tranbiako, kremailerako eta funikularretako lineetan. | Co mapa ampliado, cada tren é unha etiqueta co nome da súa liña, e a súa forma indica o tipo de servizo: arredondada para as liñas de proximidade e as suburbanas, rematada en punta polos dous extremos para as rexionais, e cadrada coas esquinas arredondadas para as do metro de TMB, do TRAM, do tren-tranvía de Cádiz, do tren de cremalleira e dos funiculares. |

_About's key: the pills a Train is drawn as, Live and Scheduled, and its outlines._

| key | en | es | eu | gl |
|---|---|---|---|---|
| `readingTheMap` | Reading the map | Cómo leer el mapa | Nola irakurri mapa | Como ler o mapa |
| `credits` | Credits | Créditos | Kredituak | Créditos |
| `sourceCode` | Source code | Código fuente | Iturburu-kodea | Código fonte |
| `privacy` | Privacy | Privacidad | Pribatutasuna | Privacidade |
| `noCookies` | This site uses no cookies: all it keeps on your device is the language you choose and where you leave the map. | Esta web no usa cookies: solo guarda en tu dispositivo el idioma que elijas y el lugar donde dejes el mapa. | Webgune honek ez du cookierik erabiltzen: zure gailuan, aukeratzen duzun hizkuntza eta mapa uzten duzun lekua baino ez ditu gordetzen. | Esta web non usa cookies: só garda no teu dispositivo o idioma que escollas e o lugar onde deixes o mapa. |

_After noCookies. Cloudflare Web Analytics goes by that name in every language, and About links it where the sentence names it._

| key | en | es | eu | gl |
|---|---|---|---|---|
| `visitsCounted` | Visits are counted with Cloudflare Web Analytics, which uses no cookies and keeps nothing on your device. | Las visitas se cuentan con Cloudflare Web Analytics, que no usa cookies ni guarda nada en tu dispositivo. | Bisitak Cloudflare Web Analytics bidez zenbatzen dira, eta tresna horrek ez du cookierik erabiltzen, ezta ezer gordetzen ere zure gailuan. | As visitas cóntanse con Cloudflare Web Analytics, que non usa cookies nin garda nada no teu dispositivo. |

68 entries.

## The review's verdicts (9 Oct 2026)

Every Basque and Galician string above was read against the ca/es/en: grammar, register, the domain terms, placeholders, plural forms and capitals. All placeholders match. One clear error was fixed:

- **Basque singulars** (`oneMoreStation`, `oneEarlierStation`, `oneMoreDeparture`) wrote "1 geltoki", "Aurreko 1 geltoki", "1 irteera". Basque puts one after its noun, and Euskaltzaindia's norm 203 (2025, §13.1) says one is usually written in words even among figures ("minutu bat eta 28 segundora"). They now read "Geltoki bat gehiago, {headsign} arte ({time})", "Aurreko geltoki bat" and "Irteera bat gehiago".

The domain terms are used consistently: Train tren, Station geltoki / estación, Line linea / liña, Live Zuzenean / En directo, Scheduled Programatuta / Programado, Delay atzeratuta, aurreratuta / atraso, adianto, Nearby Inguruko trenak / Trens próximos, board irteeren panela / panel de saídas, live data denbora errealeko datuak / datos en tempo real, timetable ordutegia / horario.

The three the build was least sure of:

- **gl "Trens próximos"** (Nearby trains): keep. Placed after its noun, "próximo" means near in Galician as in Spanish ("trenes próximos"); before it, it means next, as the board's "Próximas saídas" has it. A speaker might prefer "Trens preto de ti", which is longer.
- **eu "azken eguneratzea:"** (updated, before the date): keep. "Azken eguneratzea: <data>" is the usual label on Basque sites, and its colon lets the date follow, as the code puts it. "Eguneratze-data:" would also do.
- **eu "Programatuta"** (Scheduled): keep. It's standard Basque (programatu), it mirrors ca/es's Programat/Programado, and as a stative form it pairs with "Zuzenean" in the legend ("343 zuzenean, 68 programatuta"). Alternatives for a speaker: "Aurreikusita" (as planned) or "Ordutegikoa" (the timetable's).

Left for a speaker, none of them errors:

- eu "Cercanías" in About: Renfe's own Basque name for its Cercanías in Euskadi is "Aldiriak". The map names its Networks as Renfe publishes them ("Cercanías Bilbao"), so About keeps the brand, as ca does.
- eu "Kalkulatutako abiadura" (Estimated speed, screen reader only): About calls the positions "zenbatespenak", so "Zenbatetsitako abiadura" would match it.
- eu "Unitatea 447": label first, as the other languages have it; Basque would also write "447 unitatea".
- eu "aldiriko eta hiri-inguruko lineetan" (commuter and suburban): near-synonyms in Basque, kept to mirror ca/es's two kinds.
- eu "GitHub-en": Euskaltzaindia also accepts "GitHuben".
- gl "Sobre este mapa" ("Acerca deste mapa" also used), "amosar/agochar" ("mostrar/ocultar" also used), "Tentar de novo" ("Volver tentar" also used).
