# Architecture

The OTRI repository separates the public website from future scoring, data, and API infrastructure.

The architecture should remain modular: data ingestion and validation feed reproducible scoring logic; presentation layers consume published, versioned outputs rather than embedding scoring rules in UI components.
