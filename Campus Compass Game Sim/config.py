WIN_WIDTH = 640
WIN_HEIGHT = 480
TILESIZE = 32

PLAYER_LAYER = 2
BLOCK_LAYER = 1
PLAYER_SPEED = 3

RED = (255, 0, 0)
BLUE = (0, 0, 255)
BLACK = (0, 0, 0)
FPS = 60


SHEET_ROWS = {
    'down':  (0, 1),
    'up':    (2, 3),
    'right': (4, 5),
    'left':  (6, 7),   
}
IDLE_FRAMES = 2
WALK_FRAMES = 6
FRAME_SIZE = 32

# 8 movement directions 
FACING_TO_SHEET = {
    'down': 'down',
    'up': 'up',
    'left': 'left',
    'right': 'right',
    'up_left': 'left',
    'up_right': 'right',
    'down_left': 'left',
    'down_right': 'right',
}

WALK_ANIM_TICKS = 5    
IDLE_ANIM_TICKS = 30   


HITBOX_W = 14
HITBOX_H = 10

# ---- Campus Compass: destinations ----
# 'tile' is the (column, row) of the building on the map (where its digit sits in tilemap).

DESTINATIONS = [
    {'name': 'CAB',             'tile': (3, 4)},
    {'name': 'SUB',             'tile': (9, 4)},
    {'name': 'ETLC',            'tile': (15, 4)},
    {'name': 'The Daily Grind', 'tile': (5, 11)},
    {'name': 'UCOMM',           'tile': (12, 11)},
    {'name': 'Tim Hortons',     'tile': (16, 11)},
]
METERS_PER_PIXEL = 0.8       # 1 pixel = 0.8 m, so one 32 px tile = 25.6 m
WALK_SPEED_MPS = 1.4         # average walking speed, used for the time estimate
ARRIVE_RADIUS = 36           # pixels from the door that count as "arrived"
ARRIVAL_DISPLAY_TICKS = 300  # how long the arrival message stays (60 ticks = 1 second)

# ---- Retro UI colours (Game Boy Advance style) ----
UI_DARK = (32, 32, 48)
UI_FILL = (248, 248, 240)
UI_TRIM = (120, 136, 184)
UI_TEXT = (40, 40, 56)
UI_HILITE = (200, 216, 248)
UI_ACCENT = (216, 56, 48)
UI_GOLD = (248, 208, 48)
UI_GREEN = (72, 184, 96)
UI_GREY = (112, 112, 128)

# ---- Map legend ----
# .  grass            =  stone path          P  player start (on path)
# 0-9 building (number = assets/buildings/building_0X.png)
# T  tree   b  bush   n  bench   c  crate   r  barrel   s  signpost
# Objects stand with their bottom-centre on the bottom-centre of their tile.
PATH_CHARS = '=P'
OBJECTS = {
    'T': 'tree',
    'b': 'bush',
    'n': 'bench',
    'c': 'crate',
    'r': 'barrel',
    's': 'sign',
}
TREE_SCALE = 0.55            
GRASS_VARIANT_CHANCE = 0.12  
MAP_SEED = 7                 

tilemap = [
    '....................',
    '....................',
    'T.....b.....T......T',
    '....................',
    '...0..6..8..r..2....',
    '.==================.',
    '.========P=========.',
    '.=s......=.......s=.',
    '.=.b...b.=.n.b.n..=.',
    '.=.......=........=.',
    '.=.......=........=.',
    '.=...9..c=..4...5.=.',
    '.==================.',
    '.==================.',
    '...b....b...b...b...',
]
