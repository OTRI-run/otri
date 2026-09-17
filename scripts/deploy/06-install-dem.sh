#!/usr/bin/env bash
# Install pinned Copernicus DEM GLO-30 tiles on the Droplet and write the terrain manifest that
# `OTRI_DEM_MANIFEST` points at, so course elevation comes from a named, checksummed dataset
# instead of whatever the uploaded GPX happened to contain (course-measurement-v2, scoring V0.7).
#
# Tiles come from the public Copernicus GLO-30 COG bucket (open licence, attribution required):
#   https://copernicus-dem-30m.s3.amazonaws.com/<TILE>/<TILE>.tif
#   TILE = Copernicus_DSM_COG_10_<N|S><lat>_00_<E|W><lon>_00_DEM   (1x1 degree, ~25 MB each)
#
# Coverage is NOT global unless you install every tile. A course outside the installed tiles is
# still measured, from its own uploaded elevations, and its score reports Low confidence with the
# reason - never silently. Install the tiles for every region you expect organizers to upload.
#
# Usage (as the deploy user):
#   ./06-install-dem.sh N45E006 N45E007 N46E006 N46E007 N07E098 N08E098
#   ./06-install-dem.sh --list   # show what is installed
#
# Re-running is safe: existing tiles are checksummed, not re-downloaded. Then re-run
# 02-deploy-app.sh (it picks the manifest up into .env) or set OTRI_DEM_MANIFEST yourself.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/otri}"
DEM_DIR="${DEM_DIR:-${APP_DIR}/dem}"
MANIFEST="${DEM_DIR}/manifest.json"
BUCKET="https://copernicus-dem-30m.s3.amazonaws.com"

if [[ ${EUID} -eq 0 ]]; then
  echo "Run this as the deploy user (e.g. otri), not root." >&2
  exit 1
fi

mkdir -p "${DEM_DIR}"

if [[ "${1:-}" == "--list" ]]; then
  if [[ -f "${MANIFEST}" ]]; then
    python3 -c 'import json,sys; m=json.load(open(sys.argv[1])); print(m["dataset"], m["release"]); [print(" -", t["path"], t["sha256"][:12]) for t in m["tiles"]]' "${MANIFEST}"
  else
    echo "No manifest at ${MANIFEST}"
  fi
  exit 0
fi

if [[ $# -eq 0 ]]; then
  echo "Give at least one tile id, e.g. N45E006 (see header)." >&2
  exit 1
fi

# N45E006 -> Copernicus_DSM_COG_10_N45_00_E006_00_DEM
tile_name() {
  local id="$1"
  if [[ ! "${id}" =~ ^([NS])([0-9]{2})([EW])([0-9]{3})$ ]]; then
    echo "Bad tile id '${id}': expected like N45E006 or S08W073" >&2
    exit 1
  fi
  echo "Copernicus_DSM_COG_10_${BASH_REMATCH[1]}${BASH_REMATCH[2]}_00_${BASH_REMATCH[3]}${BASH_REMATCH[4]}_00_DEM"
}

for id in "$@"; do
  name="$(tile_name "${id}")"
  target="${DEM_DIR}/${name}.tif"
  if [[ -f "${target}" ]]; then
    echo "==> ${name}.tif already present"
    continue
  fi
  echo "==> Downloading ${name}.tif"
  curl -fsSL --retry 3 -o "${target}.part" "${BUCKET}/${name}/${name}.tif"
  mv "${target}.part" "${target}"
done

echo "==> Writing ${MANIFEST}"
python3 - "${DEM_DIR}" "${MANIFEST}" <<'PY'
import hashlib, json, sys
from pathlib import Path
dem_dir, manifest = Path(sys.argv[1]), Path(sys.argv[2])
tiles = []
for tif in sorted(dem_dir.glob('Copernicus_DSM_COG_10_*_DEM.tif')):
    h = hashlib.sha256()
    with tif.open('rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    tiles.append({'path': tif.name, 'sha256': h.hexdigest()})
manifest.write_text(json.dumps({
    'dataset': 'Copernicus DEM GLO-30',
    'release': 'COG public bucket, 2022-05',
    'datum': 'EGM2008 (orthometric)',
    'resolution_m': 30,
    'attribution': 'Produced using Copernicus WorldDEM-30 (c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA; all rights reserved.',
    'tiles': tiles,
}, indent=2) + '\n', encoding='utf-8')
print(f'{len(tiles)} tile(s) pinned')
PY

echo
echo "==> Done. Next:"
echo "    OTRI_DEM_MANIFEST=${MANIFEST} is picked up automatically by 02-deploy-app.sh; re-run it."
echo "    Courses outside these tiles fall back to uploaded elevations and score Low confidence."
