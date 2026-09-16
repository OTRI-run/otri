# GPX Target Performance Predictor

The GPX predictor is a planned OTRI feature that connects a race course to an expected performance range.

## User questions

The product should support:

- **Target OTRI → required finish time**
- **Finish time → predicted OTRI**
- **Personal target → recommended performance range**

Example:

> GPX: 54.2 km / 3,400 m D+  
> Target: OTRI 650  
> Prediction: 6:05–6:20  
> Midpoint: 6:12  
> Confidence: Moderate

The numbers above are illustrative only; they are not a calibrated OTRI prediction.

## GPX processing

Potential extracted features:

- total distance;
- elevation gain/loss;
- elevation distribution;
- gradient distribution;
- climb/descent segmentation;
- steep-climb burden;
- steep-descent burden;
- altitude;
- route geometry;
- GPX quality and missing-data indicators.

## Course difficulty

Course difficulty should be modeled separately from athlete performance. This allows OTRI to learn how a course behaves before combining course characteristics with a runner's result.

A new or poorly represented course should have greater prediction uncertainty.

## Calibration

GPX geometry alone cannot tell us what an OTRI score means. The model requires real race results to calibrate the relationship between course characteristics, finish times, and observed performances.

Useful calibration data include multiple editions of the same course and repeat runners across different courses.

## Output

A prediction should expose:

- estimated OTRI or finish time;
- uncertainty interval;
- midpoint where useful;
- confidence level;
- whether the course is calibrated or unseen;
- key factors affecting uncertainty.

Avoid false precision. A range is often more useful than a single number.

## Time-to-score curve

For a known course, the interface can show a continuous relationship between finish time and predicted OTRI. This is more useful for race planning than a single target.

Conceptually:

```text
OTRI
  ↑
700|                 •
680|              •
660|           •
640|        •
620|     •
600|  •
   +----------------------→ Finish time
```

The actual curve must come from the published OTRI model and its calibrated parameters.

## Independence

The predictor must calculate OTRI using OTRI's own independently developed methodology. It must never present an estimate as another organization's proprietary score or index prediction.
