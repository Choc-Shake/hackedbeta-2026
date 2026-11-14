import os
import math
import pygame
from config import *

ASSET_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
_image_cache = {}
_variant_counter = {}


def load_image(*parts, scale=1.0):
    key = (parts, scale)
    if key not in _image_cache:
        img = pygame.image.load(os.path.join(ASSET_DIR, *parts)).convert_alpha()
        if scale != 1.0:
            w, h = img.get_size()
            img = pygame.transform.scale(img, (max(1, int(w * scale)), max(1, int(h * scale))))
        _image_cache[key] = img
    return _image_cache[key]


def next_variant(name, count):
    n = _variant_counter.get(name, 0)
    _variant_counter[name] = n + 1
    return n % count


class Obstacle(pygame.sprite.Sprite):
    """Anything solid: buildings, trees, bushes and props.
    rect    = where the picture is drawn.
    hitbox  = the solid part at the base (the roof/leaves can be walked behind)."""

    def __init__(self, game, image, tile_x, tile_y, hit_w, hit_h):
        self.game = game
        self._layer = (tile_y + 1) * TILESIZE 
        self.groups = self.game.all_sprites, self.game.blocks
        pygame.sprite.Sprite.__init__(self, self.groups)

        self.image = image
        self.rect = self.image.get_rect()
        self.rect.midbottom = (tile_x * TILESIZE + TILESIZE // 2, (tile_y + 1) * TILESIZE)

        self.hitbox = pygame.Rect(0, 0, hit_w, hit_h)
        self.hitbox.midbottom = self.rect.midbottom


def make_building(game, tile_x, tile_y, index):
    img = load_image("buildings", f"building_{index:02d}.png")
    w, h = img.get_size()
    return Obstacle(game, img, tile_x, tile_y, w - 4, max(16, int(h * 0.6)))


def make_object(game, char, tile_x, tile_y):
    kind = OBJECTS[char]
    if kind == 'tree':
        img = load_image("trees", f"tree_{next_variant('tree', 3)}.png", scale=TREE_SCALE)
        return Obstacle(game, img, tile_x, tile_y, 12, 8)
    if kind == 'bush':
        img = load_image("bushes", f"bush_{next_variant('bush', 4)}.png")
        w, h = img.get_size()
        return Obstacle(game, img, tile_x, tile_y, int(w * 0.8), int(h * 0.5))
    if kind == 'sign':
        img = load_image("props", f"sign_{next_variant('sign', 2)}.png")
    else:
        img = load_image("props", f"{kind}.png")
    w, h = img.get_size()
    return Obstacle(game, img, tile_x, tile_y, w - 4, int(h * 0.6))


class Player(pygame.sprite.Sprite):
    _frames = None

    @classmethod
    def load_frames(cls):
        if cls._frames is None:
            sheet = load_image("player_sheet.png")
            cls._frames = {}
            for name, (idle_row, walk_row) in SHEET_ROWS.items():
                def row(r, count):
                    return [sheet.subsurface((i * FRAME_SIZE, r * FRAME_SIZE,
                                              FRAME_SIZE, FRAME_SIZE)).copy()
                            for i in range(count)]
                cls._frames[name] = {
                    'idle': row(idle_row, IDLE_FRAMES),
                    'walk': row(walk_row, WALK_FRAMES),
                }
        return cls._frames

    def __init__(self, game, x, y):
        self.game = game

        self.hitbox = pygame.Rect(0, 0, HITBOX_W, HITBOX_H)
        self.hitbox.centerx = x * TILESIZE + TILESIZE // 2
        self.hitbox.bottom = (y + 1) * TILESIZE - 2
        self.pos_x = float(self.hitbox.x)
        self.pos_y = float(self.hitbox.y)

        self._layer = self.hitbox.bottom
        self.groups = self.game.all_sprites
        pygame.sprite.Sprite.__init__(self, self.groups)

        self.frames = Player.load_frames()
        self.facing = 'down'
        self.moving = False
        self.anim_timer = 0
        self.screen_rect = pygame.Rect(0, 0, WIN_WIDTH, WIN_HEIGHT)

        self.image = self.frames['down']['idle'][0]
        self.rect = self.image.get_rect()
        self.sync_rect()

    def sync_rect(self):
        self.rect.centerx = self.hitbox.centerx
        self.rect.bottom = self.hitbox.bottom

    def get_input(self):
        # Stand still while the directions menu is open
        ui = getattr(self.game, 'ui', None)
        if ui is not None and ui.state == 'menu':
            return 0, 0
        keys = pygame.key.get_pressed()
        dx = (keys[pygame.K_RIGHT] or keys[pygame.K_d]) - (keys[pygame.K_LEFT] or keys[pygame.K_a])
        dy = (keys[pygame.K_DOWN] or keys[pygame.K_s]) - (keys[pygame.K_UP] or keys[pygame.K_w])
        return int(dx), int(dy)

    @staticmethod
    def direction_name(dx, dy):
        vertical = 'up' if dy < 0 else 'down' if dy > 0 else ''
        horizontal = 'left' if dx < 0 else 'right' if dx > 0 else ''
        return '_'.join(p for p in (vertical, horizontal) if p)

    def update(self):
        dx, dy = self.get_input()
        was_moving = self.moving
        self.moving = (dx != 0 or dy != 0)

        if self.moving:
            self.facing = self.direction_name(dx, dy)
            speed = PLAYER_SPEED
            if dx != 0 and dy != 0:
                speed *= math.sqrt(0.5)
            self.pos_x += dx * speed
            self.hitbox.x = round(self.pos_x)
            self.collide_blocks('x', dx)

            self.pos_y += dy * speed
            self.hitbox.y = round(self.pos_y)
            self.collide_blocks('y', dy)

        if self.moving != was_moving:
            self.anim_timer = 0
        else:
            self.anim_timer += 1

        self.animate()
        self.sync_rect()
        
        self.game.all_sprites.change_layer(self, self.hitbox.bottom)

    def collide_blocks(self, axis, direction):
        for block in self.game.blocks:
            if not self.hitbox.colliderect(block.hitbox):
                continue
            if axis == 'x':
                if direction > 0:
                    self.hitbox.right = block.hitbox.left
                elif direction < 0:
                    self.hitbox.left = block.hitbox.right
                self.pos_x = float(self.hitbox.x)
            else:
                if direction > 0:
                    self.hitbox.bottom = block.hitbox.top
                elif direction < 0:
                    self.hitbox.top = block.hitbox.bottom
                self.pos_y = float(self.hitbox.y)

        
        self.hitbox.clamp_ip(self.screen_rect)
        self.pos_x = float(self.hitbox.x)
        self.pos_y = float(self.hitbox.y)

    def animate(self):
        sheet_dir = FACING_TO_SHEET[self.facing]
        if self.moving:
            frames = self.frames[sheet_dir]['walk']
            index = (self.anim_timer // WALK_ANIM_TICKS) % len(frames)
        else:
            frames = self.frames[sheet_dir]['idle']
            index = (self.anim_timer // IDLE_ANIM_TICKS) % len(frames)
        self.image = frames[index]
