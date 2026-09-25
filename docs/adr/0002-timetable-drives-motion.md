# The timetable drives motion; live data only corrects it

No live feed is smooth enough to draw as-is: Renfe Cercanías pins stopped and arriving trains to station coordinates (36% of consecutive positions implied more than 180 km/h), FGC's data is 2–4 minutes old and refreshes every ~2 minutes, and the Metro publishes predictions only. So every Train moves along its Trip's track from the timetable, and live data only shifts it in time: its Delay comes from its position while it's Live and moving, and from the operator otherwise. Small disagreements are eased in (a Train slows or speeds up but never moves backwards); big ones snap.

A Train its report has standing at a Station is held there: its Delay is never so small or so large that the timetable has it anywhere else when it was reported, where that Station is one its Trip calls at after its first (#39). FGC's trip updates lag Geotren by a minute or two, and so had Trains leave Stations Geotren still had them standing at. Renfe's pinned Trains are the exception, and keep Renfe's figure: Renfe pins Trains coming into a Station too, and its pinned Stations are stale, so holding them made their jumps worse (#8: 115 against 85). A Train standing at its Trip's first Station can be there long before it leaves, off the map, so it isn't held either.

## Considered Options

- **Plot live positions directly**, as markers that jump from report to report. Rejected: trains would teleport between stations, freeze for minutes at a time, and Networks without positions would show no Trains at all.
