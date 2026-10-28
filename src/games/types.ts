import type { ComponentType } from 'react';

export type GameProps = {
  onExit: () => void;
};

export type GameDefinition = {
  id: string;
  name: string;
  description: string;
  icon: string; // şimdilik emoji
  Component: ComponentType<GameProps>;
};
