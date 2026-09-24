# Via Península

A live map of passenger trains moving on real track across Spain, starting with Catalonia.

## Language

### Trains

**Train**:
One passenger Trip being run on one service day, in any rail mode: heavy rail, metro, tram, funicular or rack railway. Buses (including rail-replacement buses), cable cars, freight and out-of-service moves are not Trains.
_Avoid_: Vehicle, service, run, circulation

**Trip**:
A timetable entry: the ordered stops and times that a Train runs.
_Avoid_: Service, schedule

**Train number**:
An operator's public identifier for a Train, where one exists (Renfe's five digits). It isn't unique across Spain: two sources describe the same Train only when the Train number matches and their stops overlap.
_Avoid_: Train ID, service code

**Unit**:
A physical piece of rolling stock. One Train can run as several coupled Units.
_Avoid_: Vehicle, trainset, consist

**Block**:
The chain of Trips one Unit runs through a service day, like a metro train shuttling back and forth along its Line. The Metro's live data names each train by its Block, not its Trip.
_Avoid_: Run, service, working, diagram

### Network

**Network**:
A set of Lines under one public brand: Rodalies (including its regional lines), FGC, Metro, TRAM, and later Renfe long-distance.
_Avoid_: System

**Line**:
A line as the public knows it, such as R2 Sud, S1, L3 or T4.
_Avoid_: Route

**Station**:
A place where Trains stop for passengers, as published by whoever runs it (Adif for Renfe, FGC, TMB, TRAM). Tram stops are Stations too; a metro station next to a railway station is a separate Station, and one served by several Lines is a Station for each.
_Avoid_: Stop, halt

### Live data

**Live**:
A Train whose position live data has confirmed recently. Between reports it keeps moving along its Trip.
_Avoid_: Real-time, tracked, GPS

**Scheduled**:
A Train positioned from its Trip's timetable, shifted by its last known Delay if it has a recent one, because no live data covers it or its live data has gone quiet.
_Avoid_: Simulated, estimated, planned

**Delay**:
How late a Train is running against its Trip's timetable. While the Train is Live and moving it is measured from the Train's position; otherwise it is the operator's figure.
_Avoid_: Lateness, offset

**Cancelled**:
A Train its operator has announced won't run.
_Avoid_: Suppressed, removed
