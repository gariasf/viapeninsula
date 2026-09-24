# The timetable drives motion; live data only corrects it

No live feed is smooth enough to draw as-is: Renfe Cercanías pins stopped and arriving trains to station coordinates (36% of consecutive positions implied more than 180 km/h), FGC's data is 2–4 minutes old and refreshes every ~2 minutes, and the Metro publishes predictions only. So every Train moves along its Trip's track from the timetable, and live data only shifts it in time: its Delay comes from its position while it's Live and moving, and from the operator otherwise. Small disagreements are eased in (a Train slows or speeds up but never moves backwards); big ones snap.

## Considered Options

- **Plot live positions directly**, as markers that jump from report to report. Rejected: trains would teleport between stations, freeze for minutes at a time, and Networks without positions would show no Trains at all.
