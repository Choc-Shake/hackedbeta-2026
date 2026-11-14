import heapq
import math

DIRS = [(1, 0), (-1, 0), (0, 1), (0, -1)]
COMPASS = {(1, 0): 'EAST', (-1, 0): 'WEST', (0, 1): 'SOUTH', (0, -1): 'NORTH'}


def build_walkable(tilemap, path_chars):
    """Set of (col, row) tiles that are grey path."""
    return {(c, r) for r, row in enumerate(tilemap) for c, ch in enumerate(row) if ch in path_chars}


def tile_center(tile, tilesize):
    return (tile[0] * tilesize + tilesize / 2, tile[1] * tilesize + tilesize / 2)


def nearest_walkable(walkable, px, py, tilesize):
    return min(walkable, key=lambda t: math.dist(tile_center(t, tilesize), (px, py)))


def find_route(walkable, start, goal, turn_penalty=0.3):
    """Shortest route over path tiles only. The small turn penalty makes ties
    prefer straight lines, so directions have few turns."""
    if start == goal:
        return [start]
    heap = [(0.0, 0, start, None)]
    best = {(start, None): 0.0}
    prev = {}
    counter = 0
    while heap:
        cost, _, tile, heading = heapq.heappop(heap)
        if cost > best.get((tile, heading), float('inf')):
            continue
        if tile == goal:
            key = (tile, heading)
            route = [tile]
            while key in prev:
                key = prev[key]
                route.append(key[0])
            return route[::-1]
        for d in DIRS:
            nxt = (tile[0] + d[0], tile[1] + d[1])
            if nxt not in walkable:
                continue
            step = 1.0 + (turn_penalty if heading is not None and d != heading else 0.0)
            new_cost = cost + step
            key = (nxt, d)
            if new_cost < best.get(key, float('inf')):
                best[key] = new_cost
                prev[key] = (tile, heading)
                counter += 1
                heapq.heappush(heap, (new_cost, counter, nxt, d))
    return None


def build_legs(route, tilesize):
    """Group a tile route into straight legs: heading name, end point, turn direction."""
    legs = []
    for a, b in zip(route, route[1:]):
        d = (b[0] - a[0], b[1] - a[1])
        if legs and legs[-1]['dir'] == d:
            legs[-1]['end'] = b
            legs[-1]['tiles'] += 1
        else:
            legs.append({'dir': d, 'end': b, 'tiles': 1})
    for i, leg in enumerate(legs):
        leg['name'] = COMPASS[leg['dir']]
        leg['end_px'] = tile_center(leg['end'], tilesize)
        if i == 0:
            leg['turn'] = None
        else:
            p = legs[i - 1]['dir']
            d = leg['dir']
            cross = p[0] * d[1] - p[1] * d[0]  
            leg['turn'] = 'RIGHT' if cross > 0 else 'LEFT'
    return legs


def polyline_length(points):
    return sum(math.dist(a, b) for a, b in zip(points, points[1:]))


class Navigator:
    """All the direction maths, with no drawing code."""

    def __init__(self, tilemap, path_chars, destinations, tilesize, meters_per_pixel,
                 arrive_radius, walk_speed):
        self.walkable = build_walkable(tilemap, path_chars)
        self.destinations = destinations
        self.ts = tilesize
        self.mpp = meters_per_pixel
        self.arrive_radius = arrive_radius
        self.walk_speed = walk_speed
        self.clear()

    def clear(self):
        self.active = False
        self.arrived = False
        self.target = None
        self.last_tile = None
        self.route = []
        self.legs = []
        self.polyline = []
        self.remaining_m = 0
        self.minutes = 0
        self.instruction = ''
        self.next_instruction = ''
        self.off_path = False

    def door_tile(self, dest):
        col, row = dest['tile']
        return (col, row + 1)         

    def door_center(self, dest=None):
        return tile_center(self.door_tile(dest or self.target), self.ts)

    def set_target(self, index):
        self.clear()
        self.target = self.destinations[index]
        self.active = True

    def update(self, px, py):
        if not self.active:
            return
        door = self.door_center()
        self.arrived = math.dist((px, py), door) <= self.arrive_radius
        tile = (int(px // self.ts), int(py // self.ts))
        if tile != self.last_tile:
            self.last_tile = tile
            self.off_path = tile not in self.walkable
            start = tile if not self.off_path else nearest_walkable(self.walkable, px, py, self.ts)
            self.route = find_route(self.walkable, start, self.door_tile(self.target)) or [start]
            self.legs = build_legs(self.route, self.ts)
        self.measure(px, py)

    def measure(self, px, py):
        centers = [tile_center(t, self.ts) for t in self.route]
        skip = 0
        if len(centers) >= 2 and math.dist((px, py), centers[1]) < math.dist(centers[0], centers[1]):
            skip = 1
        self.polyline = [(px, py)] + centers[skip:]
        self.remaining_m = polyline_length(self.polyline) * self.mpp
        self.minutes = max(1, round(self.remaining_m / self.walk_speed / 60))

        name = self.target['name']
        legs = self.legs
        if self.off_path:
            d = math.dist((px, py), centers[0]) * self.mpp
            self.instruction = f"Walk to the nearest path ({round(d)} m)"
            self.next_instruction = (f"Then head {legs[0]['name']}" if legs
                                     else f"Then arrive at {name}")
        elif legs:
            d = math.dist((px, py), legs[0]['end_px']) * self.mpp
            self.instruction = f"Walk {legs[0]['name']} for {round(d)} m"
            if len(legs) > 1:
                self.next_instruction = f"Then turn {legs[1]['turn']} ({legs[1]['name']})"
            else:
                self.next_instruction = f"Then arrive at {name}"
        else:
            self.instruction = "Almost there!"
            self.next_instruction = ""
