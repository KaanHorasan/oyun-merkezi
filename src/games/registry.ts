import type { GameDefinition } from './types';
import MinesweeperScreen from './minesweeper/MinesweeperScreen';
import TetrisScreen from './tetris/TetrisScreen';

export const games: GameDefinition[] = [
  {
    id: 'tetris',
    name: 'Tetris',
    description: 'Blokları diz, satırları temizle.',
    icon: '🧱',
    Component: TetrisScreen,
  },
  {
    id: 'minesweeper',
    name: 'Mayın Tarlası',
    description: 'Mayınlara basmadan tahtayı aç.',
    icon: '💣',
    Component: MinesweeperScreen,
  },
];

export const getGame = (id: string) => games.find((g) => g.id === id);
