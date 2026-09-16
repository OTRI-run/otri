#!/usr/bin/env python3
"""Fast deterministic 200-runner test for OTRI V0.3.

Usage:
    python scripts/test_otri_phuket_200.py PHUKET_TRAIL_2026_PKT15.gpx

The script is intentionally dependency-free (Python standard library only).
It uses the V0.3 production settings: 50 m segments, deterministic elevation
smoothing, Minetti gradient cost, and the published curved OTRI score curve.
It prints 200 deterministic fake finishers with finish time, physical pace,
performance rate Q, raw score and public OTRI, and writes a CSV beside the GPX.
"""
from __future__ import annotations

import argparse
import csv
import math
import random
import statistics
import xml.etree.ElementTree as ET
from pathlib import Path

SEGMENT_M = 50.0
MIN_GRADE, MAX_GRADE = -0.45, 0.45
SPIKE_THRESHOLD_M = 50.0
SMOOTH_RADIUS_M = 10.0
A = 2.2351808956091976
B = 0.0007254607359190918
C = 0.0000004405557501338660

def haversine_m(a, b):
    r = 6371000.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = math.radians(b[0]-a[0]), math.radians(b[1]-a[1])
    x = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*r*math.asin(math.sqrt(x))

def grad_cost(g):
    if not math.isfinite(g) or not MIN_GRADE <= g <= MAX_GRADE:
        raise ValueError(f"grade outside V0.3 domain: {g:.5f}")
    return 155.4*g**5 - 30.4*g**4 - 43.3*g**3 + 46.3*g**2 + 19.5*g + 3.6

def rolling(cum, vals, radius, median):
    out, lo, hi = [], 0, 0
    for i in range(len(vals)):
        while lo < i and cum[i] - cum[lo] > radius:
            lo += 1
        hi = max(hi, i)
        while hi + 1 < len(vals) and cum[hi+1] - cum[i] <= radius:
            hi += 1
        w = vals[lo:hi+1]
        out.append(statistics.median(w) if median else statistics.fmean(w))
    return out

def interp(cum, vals, x):
    if x <= cum[0]: return vals[0]
    if x >= cum[-1]: return vals[-1]
    lo, hi = 0, len(cum)-1
    while lo + 1 < hi:
        mid = (lo+hi)//2
        if cum[mid] <= x: lo = mid
        else: hi = mid
    span = cum[hi]-cum[lo]
    if span <= 0: return vals[lo]
    f = (x-cum[lo])/span
    return vals[lo] + f*(vals[hi]-vals[lo])

def read_course(path: Path):
    root = ET.parse(path).getroot()
    ns = {'g': 'http://www.topografix.com/GPX/1/1'}
    pts = []
    for p in root.findall('.//g:trkpt', ns):
        e = p.find('g:ele', ns)
        if e is None: raise ValueError('GPX point missing elevation')
        pts.append((float(p.attrib['lat']), float(p.attrib['lon']), float(e.text)))
    if len(pts) < 2: raise ValueError('GPX needs at least two track points')
    clean = [pts[0]]
    for p in pts[1:]:
        if p[:2] != clean[-1][:2]: clean.append(p)
    cum = [0.0]
    for a,b in zip(clean, clean[1:]): cum.append(cum[-1] + haversine_m(a,b))
    elev = [p[2] for p in clean]
    desp = list(elev)
    for i in range(1, len(elev)-1):
        l,m,r = elev[i-1:i+2]
        if abs(m-l) > SPIKE_THRESHOLD_M and abs(m-r) > SPIKE_THRESHOLD_M: desp[i] = (l+r)/2
    elev = rolling(cum, desp, SMOOTH_RADIUS_M, True)
    elev = rolling(cum, elev, SMOOTH_RADIUS_M, False)
    total = cum[-1]
    bounds, d = [], 0.0
    while d < total:
        bounds.append(d); d += SEGMENT_M
    bounds.append(total)
    demand = gain = loss = 0.0
    grades = []
    for s,e in zip(bounds,bounds[1:]):
        dh = interp(cum,elev,e) - interp(cum,elev,s)
        g = dh/(e-s)
        demand += (e-s)/1000.0 * grad_cost(g)/3.6
        gain += max(dh,0.0); loss += max(-dh,0.0); grades.append(g)
    return total/1000.0, demand, gain, loss, grades

def score(demand_km, seconds):
    q = demand_km/(seconds/3600.0)
    disc = B*B - 4*C*(A-math.log(q))
    raw = (-B + math.sqrt(disc))/(2*C)
    return q, raw, round(max(0.0, min(1000.0, raw)))

def fake_times():
    rng = random.Random(20260916)
    mins = sorted(max(55.0, min(145.0, x)) for x in (
        [rng.gauss(62,3) for _ in range(8)] +
        [rng.gauss(74,5) for _ in range(52)] +
        [rng.gauss(88,6) for _ in range(100)] +
        [rng.gauss(108,8) for _ in range(40)]
    ))
    secs = sorted(int(round(x*60 + rng.gauss(0,12))) for x in mins)
    for i in range(1,len(secs)):
        if secs[i] <= secs[i-1]: secs[i] = secs[i-1] + 1
    return secs

def fmt_time(s): return f'{s//3600}:{(s%3600)//60:02d}:{s%60:02d}'
def pace(s, km):
    x=s/km; m=int(x//60); sec=round(x%60)
    if sec == 60: m += 1; sec = 0
    return f'{m}:{sec:02d}'

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('gpx', type=Path)
    args = ap.parse_args()
    km, demand, gain, loss, grades = read_course(args.gpx)
    print('\nOTRI V0.3 — 200 RUNNER GPX TEST')
    print('='*88)
    print(f'GPX:                 {args.gpx}')
    print(f'Physical distance:   {km:.3f} km')
    print(f'Course demand:       {demand:.3f} demand-km')
    print(f'Elevation gain/loss: +{gain:.1f} / -{loss:.1f} m')
    print(f'Segments:            {len(grades)} x 50 m')
    print(f'Grade range:         {min(grades)*100:.1f}% to {max(grades)*100:.1f}%')
    print('-'*88)
    print(f"{'#':>3}  {'Finish':>8}  {'Pace/km':>8}  {'Q':>8}  {'Raw':>8}  {'OTRI':>5}")
    print('-'*88)
    out = args.gpx.with_name(args.gpx.stem + '_200_fake_results.csv')
    rows = []
    for n, s in enumerate(fake_times(), 1):
        q, raw, ot = score(demand, s)
        p = pace(s, km)
        print(f'{n:3d}  {fmt_time(s):>8}  {p:>8}  {q:8.3f}  {raw:8.2f}  {ot:5d}')
        rows.append([n, fmt_time(s), s, p, round(q,3), round(raw,2), ot])
    with out.open('w', newline='', encoding='utf-8') as f:
        w = csv.writer(f); w.writerow(['runner','finish_time','finish_seconds','pace_min_per_km','performance_rate_q','otri_raw','otri_score']); w.writerows(rows)
    print('='*88)
    print(f'CSV: {out}')

if __name__ == '__main__': main()
