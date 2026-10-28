import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { games, getGame } from '@/games/registry';

// Statik web çıktısında her oyun için ayrı sayfa üretir.
export function generateStaticParams() {
  return games.map((g) => ({ id: g.id }));
}

export default function GameRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const game = getGame(id);

  if (!game) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' }}>
        <Text style={{ color: '#fff' }}>Oyun bulunamadı.</Text>
      </View>
    );
  }

  const { Component } = game;
  return <Component onExit={() => router.back()} />;
}
