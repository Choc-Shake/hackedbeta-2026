import pygame
from sprites import *
from config import *
import sys

class Game:
    def __init__(self):
        pygame.init()
        self.screen = pygame.display.set_mode((WIN_WIDTH, WIN_HEIGHT))
        self.clock = pygame.time.Clock()
        self.running = True

    def New(self):
        self.playing = True

        self.all_sprites = pygame.sprite.LayeredUpdates()
        self.blocks = pygame.sprite.LayeredUpdates()
        self.enemies = pygame.sprite.LayeredUpdates()
        self.attacks = pygame.sprite.LayeredUpdates()

        self.player = Player(self, 1, 2)


    def Events(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self.playing = False
                self.running - False


    def update(self):
        self.all_sprites.update()
        

    
    def Draw(self):
        self.screen.fill(BLACK)
        self.all_sprites.draw(self.screen)
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
sys.exit