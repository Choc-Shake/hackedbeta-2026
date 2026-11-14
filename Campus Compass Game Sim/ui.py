import math
import pygame
from config import *
from navigation import Navigator


def load_font(size):
    return pygame.font.SysFont("couriernew,consolas,lucidaconsole,monospace", size, bold=True)


class DirectionsUI:
    """Retro dropdown menu, route markers, HUD panel and arrival message."""

    ROW_H = 24

    def __init__(self, game):
        self.game = game
        self.nav = Navigator(tilemap, PATH_CHARS, DESTINATIONS, TILESIZE,
                             METERS_PER_PIXEL, ARRIVE_RADIUS, WALK_SPEED_MPS)
        self.font = load_font(16)
        self.mid = load_font(14)
        self.small = load_font(11)

        self.state = 'idle'        # idle / menu / navigating / arrived
        self.prev_state = 'idle'
        self.cursor = 0
        self.arrived_timer = 0

        n = len(DESTINATIONS)
        self.header_rect = pygame.Rect(6, 6, 224, 28)
        self.list_rect = pygame.Rect(6, 36, 224, n * self.ROW_H + 12)
        self.row_rects = [pygame.Rect(self.list_rect.x + 6, self.list_rect.y + 6 + i * self.ROW_H,
                                      self.list_rect.w - 12, self.ROW_H) for i in range(n)]
        self.tag_surfs = [self.small.render(d['name'], False, UI_TEXT) for d in DESTINATIONS]

    # ------------------------------------------------------------ input
    def handle_event(self, event):
        if event.type == pygame.KEYDOWN:
            self.handle_key(event.key)
        elif event.type == pygame.MOUSEMOTION and self.state == 'menu':
            for i, r in enumerate(self.row_rects):
                if r.collidepoint(event.pos):
                    self.cursor = i
        elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            self.handle_click(event.pos)

    def handle_key(self, key):
        enter = key in (pygame.K_RETURN, pygame.K_KP_ENTER)
        if self.state == 'menu':
            if key in (pygame.K_UP, pygame.K_w):
                self.cursor = (self.cursor - 1) % len(DESTINATIONS)
            elif key in (pygame.K_DOWN, pygame.K_s):
                self.cursor = (self.cursor + 1) % len(DESTINATIONS)
            elif enter or key == pygame.K_SPACE:
                self.choose(self.cursor)
            elif key == pygame.K_ESCAPE:
                self.close_menu()
        elif enter:
            if self.state == 'arrived':
                self.dismiss_arrival()
            else:
                self.open_menu()
        elif key == pygame.K_ESCAPE and self.state in ('navigating', 'arrived'):
            self.cancel()

    def handle_click(self, pos):
        if self.state == 'menu':
            for i, r in enumerate(self.row_rects):
                if r.collidepoint(pos):
                    self.choose(i)
                    return
            if self.header_rect.collidepoint(pos) or not self.list_rect.collidepoint(pos):
                self.close_menu()
        elif self.header_rect.collidepoint(pos):
            self.open_menu()

    # ------------------------------------------------------------ state
    def open_menu(self):
        self.prev_state = self.state
        self.state = 'menu'

    def close_menu(self):
        self.state = self.prev_state if self.prev_state != 'menu' else 'idle'

    def choose(self, index):
        self.nav.set_target(index)
        self.state = 'navigating'
        self.update()

    def cancel(self):
        self.nav.clear()
        self.state = 'idle'

    def dismiss_arrival(self):
        self.nav.clear()
        self.state = 'idle'

    def update(self):
        if self.state == 'navigating':
            px, py = self.game.player.hitbox.center
            self.nav.update(px, py)
            if self.nav.arrived:
                self.state = 'arrived'
                self.arrived_timer = 0
        elif self.state == 'arrived':
            self.arrived_timer += 1
            if self.arrived_timer >= ARRIVAL_DISPLAY_TICKS:
                self.dismiss_arrival()

    # ------------------------------------------------------------ drawing helpers
    def text(self, screen, font, s, x, y, color=UI_TEXT, align='left'):
        surf = font.render(s, False, color)
        w = surf.get_width()
        if align == 'right':
            x -= w
        elif align == 'center':
            x -= w // 2
        screen.blit(surf, (x, y))

    def box(self, screen, rect, fill=UI_FILL):
        pygame.draw.rect(screen, UI_DARK, rect, border_radius=6)
        inner = pygame.Rect(rect.x + 3, rect.y + 3, rect.w - 6, rect.h - 6)
        pygame.draw.rect(screen, fill, inner, border_radius=4)
        trim = pygame.Rect(rect.x + 6, rect.y + 6, rect.w - 12, rect.h - 12)
        pygame.draw.rect(screen, UI_TRIM, trim, 2, border_radius=3)

    def tri_down(self, screen, cx, cy, s, color):
        pygame.draw.polygon(screen, color, [(cx - s, cy - s // 2), (cx + s, cy - s // 2), (cx, cy + s // 2 + 1)])

    def tri_up(self, screen, cx, cy, s, color):
        pygame.draw.polygon(screen, color, [(cx - s, cy + s // 2), (cx + s, cy + s // 2), (cx, cy - s // 2 - 1)])

    def tri_right(self, screen, cx, cy, s, color):
        pygame.draw.polygon(screen, color, [(cx - s // 2, cy - s), (cx - s // 2, cy + s), (cx + s // 2 + 1, cy)])

    # ------------------------------------------------------------ drawing: ground layer
    def draw_ground(self, screen):
        """Dotted route on the path and a pulsing ring at the door (under the sprites)."""
        if not self.nav.active or not self.nav.polyline:
            return
        ticks = pygame.time.get_ticks()
        spacing = 14
        next_dot = (ticks // 60) % spacing
        travelled = 0.0
        pts = self.nav.polyline
        for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
            seg = math.hypot(x2 - x1, y2 - y1)
            if seg == 0:
                continue
            while next_dot <= travelled + seg:
                t = (next_dot - travelled) / seg
                x = int(x1 + (x2 - x1) * t)
                y = int(y1 + (y2 - y1) * t)
                pygame.draw.rect(screen, UI_DARK, (x - 3, y - 3, 6, 6))
                pygame.draw.rect(screen, UI_GOLD, (x - 2, y - 2, 4, 4))
                next_dot += spacing
            travelled += seg

        dx, dy = self.nav.door_center()
        radius = 9 + int(3 * math.sin(ticks / 200))
        color = UI_GREEN if self.state == 'arrived' else UI_ACCENT
        pygame.draw.circle(screen, UI_DARK, (int(dx), int(dy)), radius + 2, 4)
        pygame.draw.circle(screen, color, (int(dx), int(dy)), radius, 2)

    # ------------------------------------------------------------ drawing: overlay
    def draw_overlay(self, screen):
        self.draw_tags(screen)
        if self.state in ('navigating', 'menu') and self.nav.active:
            self.draw_nav_panel(screen)
        elif self.state == 'arrived':
            self.draw_arrival(screen)
        self.draw_header(screen)
        if self.state == 'menu':
            self.draw_dropdown(screen)

    def draw_tags(self, screen):
        ticks = pygame.time.get_ticks()
        for i, dest in enumerate(DESTINATIONS):
            building = self.game.buildings.get(dest['tile'])
            if building is None:
                continue
            surf = self.tag_surfs[i]
            w, h = surf.get_width() + 10, surf.get_height() + 4
            x = min(max(2, building.rect.centerx - w // 2), WIN_WIDTH - w - 2)
            y = max(2, building.rect.top - h - 2)

            is_target = self.nav.active and self.nav.target is dest
            fill = UI_FILL
            if is_target:
                fill = UI_GREEN if (self.state == 'arrived' and (ticks // 250) % 2 == 0) else UI_GOLD
            pygame.draw.rect(screen, UI_DARK, (x, y, w, h), border_radius=3)
            pygame.draw.rect(screen, fill, (x + 2, y + 2, w - 4, h - 4), border_radius=2)
            screen.blit(surf, (x + 5, y + 2))

            if is_target and self.state != 'arrived' and y > 14:
                bounce = int(3 * math.sin(ticks / 150))
                cx, cy = x + w // 2, y - 7 + bounce
                self.tri_down(screen, cx, cy, 7, UI_DARK)
                self.tri_down(screen, cx, cy, 5, UI_ACCENT)

    def panel_rect(self, x, w, h):
        player_y = self.game.player.hitbox.centery
        y = 4 if player_y > WIN_HEIGHT // 2 else WIN_HEIGHT - h - 4
        return pygame.Rect(x, y, w, h)

    def draw_nav_panel(self, screen):
        nav = self.nav
        r = self.panel_rect(236, 398, 72)
        self.box(screen, r)
        x, y = r.x + 14, r.y + 10
        self.text(screen, self.mid, "TO: " + nav.target['name'], x, y)
        self.text(screen, self.mid, f"{round(nav.remaining_m)} m  ~{nav.minutes} min",
                  r.right - 14, y, UI_ACCENT, 'right')
        self.text(screen, self.mid, nav.instruction, x, y + 18)
        self.text(screen, self.mid, nav.next_instruction, x, y + 34, UI_GREY)
        self.text(screen, self.small, "ENTER: change   ESC: cancel", x, r.bottom - 17, UI_GREY)

    def draw_arrival(self, screen):
        ticks = pygame.time.get_ticks()
        r = self.panel_rect(120, 400, 64)
        self.box(screen, r)
        name = self.nav.target['name'] if self.nav.target else ''
        self.text(screen, self.font, f"You have arrived at {name}!", r.centerx, r.y + 13,
                  UI_TEXT, 'center')
        self.text(screen, self.small, "Press ENTER to continue", r.centerx, r.y + 38, UI_GREY, 'center')
        if (ticks // 400) % 2 == 0:
            self.tri_down(screen, r.right - 22, r.bottom - 20, 6, UI_ACCENT)

    def draw_header(self, screen):
        r = self.header_rect
        self.box(screen, r)
        self.text(screen, self.mid, "ENTER: DIRECTIONS", r.x + 12, r.y + 6)
        if self.state == 'menu':
            self.tri_up(screen, r.right - 16, r.centery, 5, UI_DARK)
        else:
            self.tri_down(screen, r.right - 16, r.centery, 5, UI_DARK)

    def draw_dropdown(self, screen):
        self.box(screen, self.list_rect)
        for i, (r, dest) in enumerate(zip(self.row_rects, DESTINATIONS)):
            if i == self.cursor:
                pygame.draw.rect(screen, UI_HILITE, r, border_radius=3)
                self.tri_right(screen, r.x + 10, r.centery, 5, UI_ACCENT)
            self.text(screen, self.mid, dest['name'], r.x + 24, r.y + 4)
