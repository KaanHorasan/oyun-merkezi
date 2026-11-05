import type { GameDefinition } from './types';
import MinesweeperScreen from './minesweeper/MinesweeperScreen';
import TetrisScreen from './tetris/TetrisScreen';
import ChessScreen from './chess/ChessScreen';

export const games: GameDefinition[] = [
  {
    id: 'chess',
    name: 'Satranç',
    description: 'Aynı cihazda iki kişi, tam kurallarla.',
    icon: '♟️',
    Component: ChessScreen,
  },
  {
    id: 'tetris',
    name: 'Tetris',
    description: 'Blokları diz, satırları temizle.',
    icon: '🧱',
    Component: TetrisScreen,
  },
  {
    id: 'minesweeper',
    name: 'Sonsuz Mayın Tarlası',
    description: 'Sınırsız bir dünyada mayınlara basmadan ilerle.',
    icon: '💣',
    Component: MinesweeperScreen,
  },
];

export const getGame = (id: string) => games.find((g) => g.id === id);
