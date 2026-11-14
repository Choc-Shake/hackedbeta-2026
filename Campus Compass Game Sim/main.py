import random
import pygame
from sprites import *
from config import *
from ui import DirectionsUI
import sys


class Game:
    def __init__(self):
        pygame.init()
        self.screen = pygame.display.set_mode((WIN_WIDTH, WIN_HEIGHT))
        pygame.display.set_caption("UofA Campus Compass")
        self.clock = pygame.time.Clock()
        self.running = True

    def createTilemap(self):
        rng = random.Random(MAP_SEED)
        self.background = pygame.Surface((WIN_WIDTH, WIN_HEIGHT))
        grass = [load_image("tiles", f"grass_{i}.png") for i in range(4)]
        path = [load_image("tiles", f"path_{i}.png") for i in range(2)]

        for i, row in enumerate(tilemap):
            for j, ch in enumerate(row):
                if ch in PATH_CHARS:
                    tile = path[0] if rng.random() < 0.8 else path[1]
                elif rng.random() < GRASS_VARIANT_CHANCE:
                    tile = rng.choice(grass[1:])
                else:
                    tile = grass[0]
                self.background.blit(tile, (j * TILESIZE, i * TILESIZE))

                if ch == "P":
                    self.player = Player(self, j, i)
                elif ch.isdigit():
                    self.buildings[(j, i)] = make_building(self, j, i, int(ch))
                elif ch in OBJECTS:
                    make_object(self, ch, j, i)

    def New(self):
        self.playing = True

        self.all_sprites = pygame.sprite.LayeredUpdates()
        self.blocks = pygame.sprite.LayeredUpdates()
        self.enemies = pygame.sprite.LayeredUpdates()
        self.attacks = pygame.sprite.LayeredUpdates()
        self.buildings = {}

        self.createTilemap()
        self.ui = DirectionsUI(self)

    def Events(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self.playing = False
                self.running = False
            else:
                self.ui.handle_event(event)

    def update(self):
        self.all_sprites.update()
        self.ui.update()

    def Draw(self):
        self.screen.blit(self.background, (0, 0))
        self.ui.draw_ground(self.screen)
        self.all_sprites.draw(self.screen)
        self.ui.draw_overlay(self.screen)
        self.clock.tick(FPS)
        pygame.display.update()

    def Main(self):
        while self.playing:
            self.Events()
            self.update()
            self.Draw()
        self.running = False

    def game_Over(self):
        pass

    def intro_Screen(self):
        pass


g = Game()
g.intro_Screen()
g.New()
while g.running:
    g.Main()
    g.game_Over()

pygame.quit()
sys.exit()
