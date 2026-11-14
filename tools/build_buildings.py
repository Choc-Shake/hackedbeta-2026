#!/usr/bin/env python3
"""One-time data export: OpenStreetMap -> js/buildings.js

The app never talks to OpenStreetMap. We downloaded the campus once and
turned it into a plain JavaScript file with this script.

Download (https://overpass-api.de/api/interpreter), bbox = North Campus:
  BBOX = (53.5170,-113.5370,53.5320,-113.5170)
  ways.json : way["building"]["name"](BBOX)->.b; .b out body center; node(w.b)["entrance"]; out;
  rels.json : relation["building"]["name"](BBOX)->.r; .r out body center; way(r.r)->.rw; .rw out body; node(w.rw)["entrance"]; out;
  geom.json : (way["building"]["name"](BBOX); relation["building"]["name"](BBOX);); out geom;

Run:  python3 tools/build_buildings.py ways.json rels.json geom.json > js/buildings.js

Map data (c) OpenStreetMap contributors, ODbL.
"""
import json, re, sys

ways_f, rels_f, geom_f = sys.argv[1:4]

# ---- hand-made settings -------------------------------------------------

# Building types that are not part of campus (the box also covers Garneau).
SKIP_TYPES = {'apartments', 'residential', 'commercial', 'church', 'school',
              'hotel', 'industrial', 'service'}
KEEP_ANYWAY = {'Peter Lougheed Hall'}          # campus residence tagged "apartments"
SKIP_NAMES = {
    'Ashbourne Assisted Living', 'Garneau United Church', 'Carpark 79',
    'Jesus Christ of Latter Day Saints 116 St', 'Windsor Park Community League',
    'Sarah McLellan Residence', 'East Parkade', 'West (Staff) Parkade',
    'Materials Management', 'Project Office', 'Remote Control Monitoring Systems',
    'Outpatient Residence', 'RE Phillips Services Building', 'SJC Women\'s Residence',
    'Canadian Blood Services', 'George Harcourt Residence',
}
# Same real building mapped in several pieces, or a clearer name.
RENAME = {
    'HUB International (HUB)': 'HUB Mall',
    'University LRT Entrance': 'University LRT Station',
    'University LRT West Entrance': 'University LRT Station',
    'Centennial Centre for Interdisiplinary Science North Lecture Theatres':
        'Centennial Centre for Interdisciplinary Science',
    'Walter MacKenzie Health Sciences Center': 'University of Alberta Hospital (Walter Mackenzie Centre)',
    'Universiade Pavilion': 'Universiade Pavilion (Butterdome)',
    'National High Field Nuclear Magnetic Resonance Centre (NANUC)': 'NANUC',
    'Ziedler Ledcor Centre': 'Zeidler Ledcor Centre',
}
# Codes students type. OSM has most (short_name); these fill gaps.
CODES = {
    'HUB Mall': 'HUB', 'Cameron Library': 'CAM', 'PAW Centre': 'PAW', 'Corbett Hall': 'COR',
    'Education Centre North': 'ED N', 'Education Centre South': 'ED S',
    'University of Alberta Hospital (Walter Mackenzie Centre)': 'WMC',
    'University LRT Station': 'LRT',
}
# Extra words the search should match (other codes and common nicknames).
ALIASES = {
    'Cameron Library': ['CL'], 'Gunning/Lemieux Chemistry Centre': ['Chem', 'Chemistry'],
    'Arts and Convocation Hall': ['Con Hall'], 'Rutherford Library': ['Ruth'],
    'Universiade Pavilion (Butterdome)': ['Butterdome'], 'Lister Centre': ['Lister Hall'],
    'Law Centre': ['Law'], 'Telus Centre': ['TELUS'],
    'Biological Sciences': ['BioSci', 'Bio Sci'], 'Students\' Union Building': ['Student Union'],
    'Centennial Centre for Interdisciplinary Science': ['Physics'],
    'Alberta School of Business': ['Business'], 'Education Centre North': ['ED', 'Education'],
    'Education Centre South': ['ED', 'Education'], 'Agriculture/Forestry Centre': ['AgFor', 'Ag For'],
    'University of Alberta Hospital (Walter Mackenzie Centre)': ['UAH', 'Hospital'],
    'PAW Centre': ['Physical Activity and Wellness', 'Gym'], 'Van Vliet Complex': ['Gym'],
    'University Commons': ['Dentistry Pharmacy'], 'University LRT Station': ['Train'],
    'Electrical and Computer Engineering Research Facility': ['ECE'],
    'Donadeo Innovation Centre for Engineering': ['ICE'],
}
# Hand-picked: buildings with public washrooms (team should double-check).
WASHROOM_CODES = {
    'SUB', 'HUB', 'CAB', 'CAM', 'ETLC', 'CCIS', 'UCOMM', 'T', 'TL', 'BS', 'ED N', 'ED S',
    'BUS', 'HC', 'FAB', 'LC', 'TEL', 'ECHA', 'VVC', 'PAW', 'LH', 'AF', 'ESB', 'C', 'A',
    'MEC', 'NREF', 'CSC', 'DICE', 'ECERF', 'MSB', 'KATZ', 'GSB', 'SAB', 'WMC', 'CME',
}
WASHROOM_NAMES = {'Rutherford Library'}
# Small separate entrance buildings: where a piece has no mapped door, use its middle.
PIECE_CENTRE_AS_DOOR = {'University LRT Station'}

# ---- load ---------------------------------------------------------------

def load(p):
    return json.load(open(p))['elements']

entr = {}            # node id -> entrance node
way_nodes = {}       # way id -> node ids
for f in (ways_f, rels_f):
    for e in load(f):
        if e['type'] == 'node':
            entr[e['id']] = e
        elif e['type'] == 'way':
            way_nodes[e['id']] = e['nodes']

def usable(node):
    t = node['tags']
    if t.get('entrance') == 'emergency':      # never send people to emergency exits
        return False
    if t.get('access') in ('no', 'private'):
        return False
    return True

buildings = {}       # final name -> dict

for e in load(geom_f):
    tags = e['tags']
    name = tags['name']
    if name in SKIP_NAMES:
        continue
    if tags.get('building') in SKIP_TYPES and name not in KEEP_ANYWAY:
        continue

    # Outline points and node ids of this piece.
    if e['type'] == 'way':
        rings = [[(g['lat'], g['lon']) for g in e['geometry']]]
        node_ids = e['nodes']
    else:
        rings = [[(g['lat'], g['lon']) for g in m['geometry']]
                 for m in e['members'] if m['type'] == 'way' and m.get('role') != 'inner']
        node_ids = [n for m in e['members'] if m['type'] == 'way' for n in way_nodes.get(m['ref'], [])]

    name = RENAME.get(name, name)
    b = buildings.setdefault(name, {'name': name, 'code': None, 'pieces': [], 'entrances': {}})
    b['code'] = b['code'] or tags.get('short_name')
    b['pieces'].append(rings)
    found = False
    for n in node_ids:
        if n in entr and usable(entr[n]):
            t = entr[n]['tags']
            ent = {'lat': round(entr[n]['lat'], 6), 'lon': round(entr[n]['lon'], 6)}
            if t.get('entrance') == 'main':
                ent['main'] = True
            if t.get('wheelchair') == 'yes':
                ent['wheelchair'] = True
            b['entrances'][n] = ent
            found = True
    if name in PIECE_CENTRE_AS_DOOR and not found:
        ring = rings[0]
        b['entrances'][e['id']] = {
            'lat': round((min(p[0] for p in ring) + max(p[0] for p in ring)) / 2, 6),
            'lon': round((min(p[1] for p in ring) + max(p[1] for p in ring)) / 2, 6)}

# ---- write --------------------------------------------------------------

out = []
for name in sorted(buildings, key=str.lower):
    b = buildings[name]
    pts = [p for rings in b['pieces'] for ring in rings for p in ring]
    code = CODES.get(name, b['code'])
    if code and (len(code) > 8 or ' ' in code and name not in CODES):
        code = None                            # OSM short_name that isn't really a code
    rec = {
        'id': re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-'),
        'name': name,
        'code': code,
        'aliases': ALIASES.get(name, []),
        'lat': round((min(p[0] for p in pts) + max(p[0] for p in pts)) / 2, 6),
        'lon': round((min(p[1] for p in pts) + max(p[1] for p in pts)) / 2, 6),
        'washroom': code in WASHROOM_CODES or name in WASHROOM_NAMES,
        'entrances': list(b['entrances'].values()),
    }
    if not rec['entrances']:
        # No doors mapped yet: keep the building outline so the app can guide
        # to the nearest wall instead. Add real doors here when someone maps them.
        rec['outline'] = [[[round(a, 6), round(o, 6)] for a, o in ring]
                          for rings in b['pieces'] for ring in rings]
    out.append(rec)

print('''// js/buildings.js — campus building + entrance data (Distance)
// GENERATED by tools/build_buildings.py from OpenStreetMap. Hand edits are fine,
// but note them here so a re-export doesn't lose them.
//
// Map data (c) OpenStreetMap contributors, ODbL: https://www.openstreetmap.org/copyright
//
// Each building:
//   id, name   unique id and display name
//   code       short code students type (CAB, ETLC...), or null
//   aliases    extra words the search matches
//   lat, lon   middle of the building (for sorting the list by distance)
//   washroom   true = has public washrooms (hand-picked, please double-check)
//   entrances  [{lat, lon, main?, wheelchair?}]  real doors (emergency exits removed)
//   outline    only when no doors are mapped: the building's outline, so the app
//              can guide to the nearest wall. Replace with real entrances when known.
''')
print('const BUILDINGS = [')
for r in out:
    print('  ' + json.dumps(r, ensure_ascii=False, separators=(',', ':')) + ',')
print('];')
