# Via Península

A live map of passenger trains moving on real track across Spain, starting with Catalonia.

## Language

### Trains

**Train**:
One passenger Trip being run on one service day, in any rail mode: heavy rail, metro, tram, funicular or rack railway. Buses (including rail-replacement buses), cable cars, freight and out-of-service moves are not Trains.
_Avoid_: Vehicle, service, run, circulation

**Trip**:
A timetable entry: the ordered Calls and their times that a Train runs. Where a timetable lists one Train in parts, a Trip for each part of its run that it sells, as Renfe's long-distance timetable does, the parts make one Trip. So do a Network's Trips of one Train number that meet at one Station in the same minute, as Rodalies' R4 Trip of 33527 from Manresa to Rajadell and its RL4 Trip on from there do: one Trip, named by the Line of most of its run, RL4. Trips of one number that don't meet so, or that are in two Networks, stay apart.
_Avoid_: Service, schedule

**Call**:
A Trip's call at one Station: when its Train arrives and leaves, and how far along the Trip's shape the Station is.
_Avoid_: Stop, visit

**Train number**:
An operator's public identifier for a Train, where one exists (Renfe's five digits). It isn't unique across Spain: two timetables describe the same Train only when the Train number matches and their stops overlap, and a live report that names a Train only by its number describes the Trip of that number, in any Network, whose timetable runs nearest when it was reported. Of a Rodalies or núcleo Trip, such a report says something only where its GPS gives a Delay, or it cancels the Train (#429): the operator's own figure is against its long-distance timetable, which can run apart from the Trip's (#442).
_Avoid_: Train ID, service code

**Unit**:
A physical piece of rolling stock. One Train can run as several coupled Units. Where Units join or split, the part of the run they make coupled is one Train, and each branch they run apart another, all under one Train number.
_Avoid_: Vehicle, trainset, consist

**Block**:
The chain of Trips one Unit runs through a service day, like a metro train shuttling back and forth along its Line. The Metro's live data names each train by its Block, not its Trip.
_Avoid_: Run, service, working, diagram

### Network

**Network**:
A set of Lines under one public brand: in Catalonia Rodalies (including its regional lines), FGC, Metro and TRAM; beyond it each Renfe Cercanías núcleo (Cercanías Madrid, Cercanías Bilbao…), Renfe's AVE y Larga Distancia and Media Distancia y Avant, Ouigo, and Euskotren (ADR-0010).
_Avoid_: System

**Region**:
Networks that are built and loaded together: a Network on its own, or a group whose Lines share Stretches, as Catalonia's Rodalies, FGC, TRAM and Metro are one (ADR-0014). Each has a track file, and a Trips file for each day, of its own, which the build makes on its own, so that a region whose build fails keeps its last files while the others publish, and which the map loads once the region is in view from zoom 7, or a link or Nearby needs it, but for long distance's, which it loads at every view (#266). Not an administrative region: Cercanías Madrid is one, though its C2 runs on to Guadalajara.
_Avoid_: Area, zone, autonomous community

**Line**:
A line as the public knows it, such as R2 Sud, S1, L3 or T4. An operator's internal variants of a Line join the Line the public knows, as FGC's R53 and R63 join R5 and R6. AVE y Larga Distancia's and Media Distancia y Avant's Lines are the names their timetable gives its Trips, such as AVE, Alvia or MD, as it names no others.
_Avoid_: Route

**Kind of service**:
What a Line runs as: commuter and suburban, as Rodalies' R1–R8, RG1, RT1, RT2, RL3 and RL4, and FGC's S and L Lines; regional, as R11–R17, FGC's R5, R50, R6, R60, RL1 and RL2, and Media Distancia y Avant's Lines; long distance, as AVE y Larga Distancia's Lines; or metro, tram, rack railway and funicular, as the Metro's and TRAM's Lines, and FGC's MM and FV. Zoomed in, a Train's pill is outlined by its Line's kind of service, which the bundle names for each Line.
_Avoid_: Service type, train type, category, class, product

**Running side**:
Which track of a double track a Network's Trains run on, looking the way they go. A Network in Spain keeps right, unless all its double track keeps left, as Cercanías Bilbao's does.
_Avoid_: Handedness, traffic side

**Gauge**:
How far apart a track's rails are: Iberian (1668 mm), standard (1435 mm, the high-speed lines') or metre (1000 mm, FEVE's lines'). A Train runs on the track of its gauge, and one that runs on two, as an Alvia does, changes from one to the other only at a gauge changer. A Network can run on two, as Cercanías Santander does, each of its Lines on one: C1 on Iberian gauge, and C2 and C3 on metre gauge, though a Station a Line calls at may be nearer the other's track.
_Avoid_: Track width

**Stretch**:
A length of track, or of tracks too close together to tell apart zoomed out, that one set of Lines on the same level runs along. The map draws them side by side along it, in one order, and a Line counts once on it whichever way and whichever of its tracks it runs (ADR-0006). Lines of one Network and one colour take one place on it, as C4a and C4b do up to their fork.
_Avoid_: Bundle (that's the data the map loads), corridor, edge

**Shape**:
The track a Trip's Train runs along: points in order, each with its distance along it, which is what a Call's distance is measured on. Many Trips share one. The daily build makes it from the shape its feed gives, traced along OpenStreetMap's rails (ADR-0004), or, where a Trip doesn't fit that or its timetable has none, as Renfe's long-distance one hasn't, from the Trip's own Stations, traced the same way (#280, #259). The track file stores it as Pieces (ADR-0015). Not a Stretch, which is track a set of Lines share on the map (ADR-0006).
_Avoid_: Route, path

**Piece**:
A run of a traced shape's points between junctions, shape ends and turn-backs, which the track file stores once for every shape that runs it, either way (ADR-0015). Not a Stretch: a Stretch is track Lines share on the map, a Piece is how the file stores a shape. Nor the `pieces` of `sideBySide()`, which cut the track between two of a shape's points into legs of at most 50 m, nor `pieces()` of `bundle.ts`, the parts a stroke that eases from one side to another is drawn in.
_Avoid_: Segment, edge, part

**Station**:
A place where Trains stop for passengers, as published by whoever runs it (Adif for Renfe and Ouigo, FGC, TMB, TRAM, Euskotren). One Station can serve several Networks, as Sants does Rodalies, AVE y Larga Distancia, Media Distancia y Avant and Ouigo, with one board for them all. Tram stops are Stations too; a metro station next to a railway station is a separate Station, and one served by several Lines is a Station for each, which the map shows as one place.
_Avoid_: Stop, halt

**Interchange**:
Places of other Networks that people change between on foot, as Passeig de Gràcia's Rodalies Station and its Metro place. The map draws an interchange as one badge of its Networks' marks, named once, and its places share one board (ADR-0005).
_Avoid_: Transfer, connection, hub, station complex

### Live data

**Live**:
A Train whose position live data has confirmed recently. Between reports it keeps moving along its Trip. A long-distance Train's position that holds, as Renfe's long-distance live data repeats one for minutes, keeps it Live for up to 5 minutes, though it moves it nowhere (#443).
_Avoid_: Real-time, tracked, GPS

**Scheduled**:
A Train positioned from its Trip's timetable, shifted by its last known Delay if it has a recent one, because no live data covers it or its live data has gone quiet.
_Avoid_: Simulated, estimated, planned

**Delay**:
How late a Train is running against its Trip's timetable. While the Train is Live and moving it is measured from the Train's position; otherwise it is the operator's figure, except that a Rodalies, Cercanías or long-distance Train carries on from its last GPS Delay, as Renfe's figure is often minutes off, and a position unchanged since its report before counts as none, and one Renfe has named at one Station for 10 minutes or more, counted from when the fetcher first had it named there, stands there, as late as it has stood (ADR-0002). The map shows none for a Metro Train: TMB runs the Metro by headway, and its timetable names no Blocks, so a Metro Train's Delay is only against whichever Trip its Block runs.
_Avoid_: Lateness, offset

**Cancelled**:
A Train its operator has announced won't run.
_Avoid_: Suppressed, removed

**Skipped Station**:
A Station a Train's Trip calls at that its operator has said the Train won't stop at, as Renfe does where it cuts a Train short or starts it late. The Train ends at its last Station before those it skips at its Trip's end, starts at its first after those it skips at its start, and runs on through those it skips between others. One that would stop at one Station or none is Cancelled. Renfe's long-distance feed says so by Train number, of every part of the Train's run; a Train's own Network's feed, where it says so too, goes first.
_Avoid_: Cancelled stop, omitted stop

### Alerts

**Alert**:
An operator's notice about a Line, a Station or a Train, from its live alerts feed (Renfe's, TRAM's), in its own words (ADR-0012).
_Avoid_: Incident, notice, warning, disruption

**Closure**:
A part of a Line between two of its Stations that's closed, with buses or nothing in its Trains' place, or down to a single track, for as long as its Alert or the timetable says. A Closure a TRAM Alert makes lasts only while the timetable runs the Trains of the Alert's Lines short of it. The map draws only the Closures it can place on the Line's track. Within a closed one, a Train isn't drawn, and boards show it not stopping, unless it's Live within it: live data wins. Once a Live Train of its Line is seen within one an Alert makes, it hides none of that Line's Trains until its Alert changes, though it's still drawn.
_Avoid_: Closed stretch (a Stretch is track, ADR-0006), cut, blockade

### Passport

**Passport**:
A viewer's Rides and Stamps, kept only in their browser, from when they turn it on (ADR-0011). Clearing the browser's data, or changing device, loses it.
_Avoid_: Profile, account, collection

**Ride**:
A Train a viewer followed from its Trip's first Station to its last Station on the map, at real speed, with their Passport on. It counts once per Train. It was seen Live if live data confirmed the Train at least once while it was followed.
_Avoid_: Trip (that's the timetable's), journey, run

**Stamp**:
What Rides earn in a Passport: one for each Line, kind of service and Network ridden, dated by its first Ride. It's filled once one of its Rides was seen Live, and ringed while none was.
_Avoid_: Badge (a Line's name on the map, ADR-0008), achievement, medal
