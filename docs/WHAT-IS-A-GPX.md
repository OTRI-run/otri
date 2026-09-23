# What is a GPX file, and where do I get one?

A **GPX file** (GPS Exchange Format, `.gpx`) is a small text file that describes a route as a list of points: latitude, longitude and usually elevation, in order along the track. Every GPS watch, phone app and route planner can read and write it, which is why OTRI uses it as the one course format. A course file for a 100 km race is typically 0.5 to 3 MB.

OTRI reads only the track points. Waypoints, timestamps, heart rate and other extensions are ignored, and a file you upload to the calculator is measured and then discarded unless you click **Share this score**.

## Where to get the GPX of a race

- **The race website.** Most trail races publish the course GPX weeks before the event, usually on the "Course" or "Route" page next to the map and the elevation profile, sometimes per distance. Look for "Download GPX", "Track" or "Trace".
- **The organizer's email or race briefing.** Many organizers attach the file to the final participant email or the mandatory-kit briefing.
- **Races on OTRI.** If the organizer has already submitted the course to OTRI, pick the race from the list on the calculator instead of uploading. That file has been measured on the server and cannot be changed.
- **Your own recording.** After the race, export the activity from your watch platform: Garmin Connect (activity → gear icon → *Export to GPX*), Strava (activity → *…* → *Export GPX*), Coros, Suunto and Polar have the same option. A recording is a real trace of the course, including the detours you took, so expect a slightly longer distance than the official figure.
- **Route planners.** Komoot, Strava Routes, Gaia, Caltopo and similar tools export any planned route as GPX.

## What makes a good file

- **Dense points.** OTRI needs a point at least every 30 m on average to measure the course reliably; a file with fewer points is still scored but labelled *Low* confidence and the page says why. Recordings at one-second intervals and organizer files drawn on a map are both fine; a file "simplified" to a few hundred points for a small download is not.
- **One track.** A file with several tracks or segments is joined in order. If the file also contains an alternative route or last year's course, remove it in a route planner first.
- **The right distance.** If the race has several distances, make sure you have the file for yours. The calculator shows the measured length so you can check.
- **Elevation is optional.** Where OTRI has terrain data installed for the region, it reads elevation from the Copernicus GLO-30 terrain model and ignores the file's own values. Elsewhere the file's elevations are used and the confidence label says so.

## Privacy

Uploading a file to the calculator sends it to the OTRI server, which measures it and forgets it. Nothing is stored unless you share the result, and a shared course is stored under an id derived from its contents, without your name or account. See `PRIVACY.md`.
