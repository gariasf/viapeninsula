# Via Península

A live map of passenger trains moving on real track across Spain, starting with Catalonia.

## Language

### Trains

**Train**:
One passenger Trip being run on one service day, in any rail mode: heavy rail, metro, tram, funicular or rack railway. Buses (including rail-replacement buses), cable cars, freight and out-of-service moves are not Trains.
_Avoid_: Vehicle, service, run, circulation

**Trip**:
A timetable entry: the ordered stops and times that a Train runs. Where a timetable lists one Train in parts, a Trip for each part of its run that it sells, as Renfe's long-distance timetable does, the parts make one Trip.
_Avoid_: Service, schedule

**Train number**:
An operator's public identifier for a Train, where one exists (Renfe's five digits). It isn't unique across Spain: two sources describe the same Train only when the Train number matches and their stops overlap.
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

**Line**:
A line as the public knows it, such as R2 Sud, S1, L3 or T4. An operator's internal variants of a Line join the Line the public knows, as FGC's R53 and R63 join R5 and R6. AVE y Larga Distancia's and Media Distancia y Avant's Lines are the names their timetable gives its Trips, such as AVE, Alvia or MD, as it names no others.
_Avoid_: Route

**Kind of service**:
What a Line runs as: commuter and suburban, as Rodalies' R1–R8, RG1, RT1, RT2, RL3 and RL4, and FGC's S and L Lines; regional, as R11–R17, FGC's R5, R50, R6, R60, RL1 and RL2, and Media Distancia y Avant's Lines; long distance, as AVE y Larga Distancia's Lines; or metro, tram, rack railway and funicular, as the Metro's and TRAM's Lines, and FGC's MM and FV. Zoomed in, a Train's pill is outlined by its Line's kind of service. The bundle names none, so the map tells it by the Line's Network and name.
_Avoid_: Service type, train type, category, class, product

**Running side**:
Which track of a double track a Network's Trains run on, looking the way they go. Every Network in Spain keeps right.
_Avoid_: Handedness, traffic side

**Stretch**:
A length of track, or of tracks too close together to tell apart zoomed out, that one set of Lines on the same level runs along. The map draws them side by side along it, in one order, and a Line counts once on it whichever way and whichever of its tracks it runs (ADR-0006).
_Avoid_: Bundle (that's the data the map loads), corridor, edge

**Station**:
A place where Trains stop for passengers, as published by whoever runs it (Adif for Renfe and Ouigo, FGC, TMB, TRAM, Euskotren). One Station can serve several Networks, as Sants does Rodalies, AVE y Larga Distancia, Media Distancia y Avant and Ouigo, with one board for them all. Tram stops are Stations too; a metro station next to a railway station is a separate Station, and one served by several Lines is a Station for each, which the map shows as one place.
_Avoid_: Stop, halt

### Live data

**Live**:
A Train whose position live data has confirmed recently. Between reports it keeps moving along its Trip.
_Avoid_: Real-time, tracked, GPS

**Scheduled**:
A Train positioned from its Trip's timetable, shifted by its last known Delay if it has a recent one, because no live data covers it or its live data has gone quiet.
_Avoid_: Simulated, estimated, planned

**Delay**:
How late a Train is running against its Trip's timetable. While the Train is Live and moving it is measured from the Train's position; otherwise it is the operator's figure, except that a Rodalies or Cercanías Train carries on from its last GPS Delay, as Renfe's figure is often minutes off. The map shows none for a Metro Train: TMB runs the Metro by headway, and its timetable names no Blocks, so a Metro Train's Delay is only against whichever Trip its Block runs.
_Avoid_: Lateness, offset

**Cancelled**:
A Train its operator has announced won't run.
_Avoid_: Suppressed, removed
