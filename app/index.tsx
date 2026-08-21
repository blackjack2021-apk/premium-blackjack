import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/constants/colors';

type CardSuit = 'spade' | 'heart' | 'diamond' | 'club';
type Phase = 'betting' | 'playing' | 'settled';
type Tab = 'table' | 'profile' | 'settings';
type ThemeKey = 'black' | 'green' | 'blue' | 'burgundy' | 'purple' | 'elite';

type Card = {
  id: string;
  rank: string;
  suit: CardSuit;
  value: number;
};

type StoredGame = {
  bankroll: number;
  rankIndex: number;
  totalWinnings: number;
  totalLosses: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  blackjacks: number;
  history: number[];
  rankStats: Record<string, { games: number; net: number }>;
  soundsEnabled: boolean;
  tableTheme: ThemeKey;
};

const STORAGE_KEY = 'premium-blackjack-state-v1';
const C = colors.dark;

const RANKS = [
  { name: 'White', threshold: 0, color: '#E9ECE8', ink: '#121713' },
  { name: 'Bronze', threshold: 500, color: '#B9805E', ink: '#160E0A' },
  { name: 'Silver', threshold: 1500, color: '#B7C2C0', ink: '#101514' },
  { name: 'Gold', threshold: 4000, color: '#D5B36B', ink: '#1B1408' },
  { name: 'Diamond', threshold: 6500, color: '#A6D7DC', ink: '#081619' },
  { name: 'Dark Green', threshold: 10000, color: '#2F9A66', ink: '#06150D' },
] as const;

const TABLES: Record<
  ThemeKey,
  { label: string; base: string; deep: string; line: string; lockedAt?: number }
> = {
  black: { label: 'Obsidian', base: '#151B19', deep: '#080B0A', line: '#2B3630' },
  green: { label: 'Emerald', base: '#10372A', deep: '#071B15', line: '#2E684E', lockedAt: 1 },
  blue: { label: 'Sapphire', base: '#10273A', deep: '#071522', line: '#2D516B', lockedAt: 2 },
  burgundy: { label: 'Burgundy', base: '#3A1723', deep: '#1C0A10', line: '#71404C', lockedAt: 3 },
  purple: { label: 'Velvet', base: '#2D1A3C', deep: '#160C20', line: '#624B73', lockedAt: 4 },
  elite: { label: 'Elite Table', base: '#301A3A', deep: '#100A18', line: '#C6A15D', lockedAt: 5 },
};

const SUITS: CardSuit[] = ['spade', 'heart', 'diamond', 'club'];
const RANK_NAMES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_SYMBOLS: Record<CardSuit, string> = {
  spade: '♠',
  heart: '♥',
  diamond: '♦',
  club: '♣',
};

const SOUND_ASSETS = {
  deal: require('../assets/sounds/card-deal.mp3'),
  flip: require('../assets/sounds/card-flip.mp3'),
  win: require('../assets/sounds/round-win.mp3'),
  cash: require('../assets/sounds/cash-register.mp3'),
};

function buildDeck(): Card[] {
  return SUITS.flatMap((suit) =>
    RANK_NAMES.map((rank, index) => ({
      id: `${suit}-${rank}-${Date.now()}-${Math.random()}`,
      rank,
      suit,
      value: rank === 'A' ? 11 : index >= 10 ? 10 : index + 1,
    })),
  );
}

function shuffledDeck(): Card[] {
  const next = buildDeck();
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function scoreHand(hand: Card[]) {
  let score = hand.reduce((sum, card) => sum + card.value, 0);
  let aces = hand.filter((card) => card.rank === 'A').length;
  while (score > 21 && aces > 0) {
    score -= 10;
    aces -= 1;
  }
  return score;
}

function formatMoney(value: number) {
  return `€ ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function freshGame(): StoredGame {
  return {
    bankroll: 100,
    rankIndex: 0,
    totalWinnings: 0,
    totalLosses: 0,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    blackjacks: 0,
    history: [],
    rankStats: {},
    soundsEnabled: true,
    tableTheme: 'black',
  };
}

function GlassButton({
  label,
  icon,
  onPress,
  disabled,
  primary,
  compact,
}: {
  label?: string;
  icon?: keyof typeof Feather.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  compact?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 24, bounciness: 8 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 8 }).start();
  return (
    <Animated.View style={[{ transform: [{ scale }] }, compact ? styles.compactButton : styles.actionButton]}>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPressIn={pressIn}
        onPressOut={pressOut}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        style={({ pressed }) => [styles.buttonPressable, primary && styles.primaryButton, disabled && styles.disabledButton, pressed && styles.pressedButton]}
      >
        <BlurView intensity={primary ? 8 : 22} tint="dark" style={StyleSheet.absoluteFill} />
        {icon ? <Feather name={icon} size={compact ? 16 : 15} color={primary ? C.primaryForeground : C.secondaryForeground} /> : null}
        {label ? <Text style={[styles.buttonLabel, primary && styles.primaryButtonLabel]}>{label}</Text> : null}
      </Pressable>
    </Animated.View>
  );
}

function CardView({ card, index, hidden, animateKey }: { card: Card; index: number; hidden?: boolean; animateKey: string }) {
  const entrance = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    entrance.setValue(0);
    const timeout = setTimeout(() => {
      Animated.spring(entrance, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 7 }).start();
    }, index * 105);
    return () => clearTimeout(timeout);
  }, [animateKey, entrance, index]);

  const isRed = card.suit === 'heart' || card.suit === 'diamond';
  return (
    <Animated.View
      style={[
        styles.card,
        {
          opacity: entrance,
          transform: [
            { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [-70, 0] }) },
            { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) },
            { rotate: `${index % 2 === 0 ? -1.5 : 1.5}deg` },
          ],
        },
      ]}
    >
      {hidden ? (
        <LinearGradient colors={['#1A211E', '#080B0A']} style={styles.cardBack}>
          <View style={styles.cardBackInner}>
            <View style={styles.cardBackDiamond} />
            <View style={styles.cardBackDiamondSmall} />
          </View>
        </LinearGradient>
      ) : (
        <View style={styles.cardFront}>
          <Text style={[styles.cardCorner, isRed && styles.redSuit]}>{card.rank}</Text>
          <Text style={[styles.cardSuit, isRed && styles.redSuit]}>{SUIT_SYMBOLS[card.suit]}</Text>
          <Text style={[styles.cardCenterSuit, isRed && styles.redSuit]}>{SUIT_SYMBOLS[card.suit]}</Text>
          <View style={styles.cardCornerBottom}>
            <Text style={[styles.cardCorner, isRed && styles.redSuit]}>{card.rank}</Text>
            <Text style={[styles.cardSuitSmall, isRed && styles.redSuit]}>{SUIT_SYMBOLS[card.suit]}</Text>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

function Hand({ hand, hiddenDealer, label, value, animateKey }: { hand: Card[]; hiddenDealer?: boolean; label: string; value: string; animateKey: string }) {
  return (
    <View style={styles.handBlock}>
      <View style={styles.handHeader}>
        <Text style={styles.handLabel}>{label}</Text>
        <Text style={styles.handValue}>{value}</Text>
      </View>
      <View style={styles.cardsRow}>
        {hand.map((card, index) => (
          <CardView key={`${card.id}-${index}`} card={card} index={index} hidden={hiddenDealer && index === 1} animateKey={animateKey} />
        ))}
      </View>
    </View>
  );
}

function MiniChart({ values }: { values: number[] }) {
  const max = Math.max(1, ...values.map((value) => Math.abs(value)));
  return (
    <View style={styles.chart}>
      {values.length === 0 ? (
        <View style={styles.emptyChart}><Text style={styles.mutedText}>Your earnings line will appear after the first hand.</Text></View>
      ) : (
        values.map((value, index) => (
          <View key={`${value}-${index}`} style={styles.chartColumn}>
            <View style={[styles.chartBar, value < 0 && styles.chartBarLoss, { height: Math.max(4, (Math.abs(value) / max) * 58) }]} />
          </View>
        ))
      )}
    </View>
  );
}

function ResultFeedback({ tone, amount }: { tone: 'win' | 'loss'; amount: number }) {
  const glow = useRef(new Animated.Value(0)).current;
  const banner = useRef(new Animated.Value(0)).current;
  const notes = useRef(Array.from({ length: 28 }, () => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    ).start();
    Animated.spring(banner, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 8 }).start();
    notes.forEach((note, index) => {
      note.setValue(0);
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 34),
          Animated.timing(note, { toValue: 1, duration: 1450 + (index % 5) * 110, useNativeDriver: true }),
          Animated.delay(140 + (index % 4) * 80),
          Animated.timing(note, { toValue: 0, duration: 1, useNativeDriver: true }),
        ]),
        { iterations: 2 },
      ).start();
    });
  }, [banner, glow, notes]);

  const isWin = tone === 'win';
  const accent = isWin ? C.emerald : C.destructive;
  const delta = `${amount >= 0 ? '+' : '−'}€${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(Math.abs(amount)) ? 0 : 2, maximumFractionDigits: 2 })}`;

  return (
    <View pointerEvents="none" style={styles.resultLayer}>
      <Animated.View style={[styles.resultWash, { backgroundColor: isWin ? '#087A45' : '#A52835', opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.23] }) }]} />
      {isWin ? (
        <Animated.View style={[styles.cashGlow, { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.62] }), transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1.24] }) }] }]} />
      ) : (
        <Animated.View style={[styles.lossPulse, { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.34] }), transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.1] }) }] }]} />
      )}
      {isWin ? notes.map((note, index) => (
        <Animated.View
          key={index}
          style={[
            styles.cashNote,
            {
              borderColor: accent,
              backgroundColor: index % 3 === 0 ? '#167346' : index % 3 === 1 ? '#29935C' : '#3BAE70',
              width: 38 + (index % 4) * 6,
              height: 24 + (index % 3) * 4,
              left: `${5 + ((index * 17) % 88)}%`,
              top: `${9 + ((index * 23) % 59)}%`,
              opacity: note.interpolate({ inputRange: [0, 0.12, 0.78, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateY: note.interpolate({ inputRange: [0, 1], outputRange: [210 + (index % 4) * 26, -120 - (index % 3) * 24] }) },
                { translateX: note.interpolate({ inputRange: [0, 1], outputRange: [(index % 2 === 0 ? -1 : 1) * (18 + index * 2), (index - 14) * 21] }) },
                { rotate: `${index % 2 === 0 ? -32 : 26}deg` },
                { scale: note.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.56, 1.08, 0.82] }) },
              ],
            },
          ]}
        >
          <Text style={styles.cashNoteSymbol}>€</Text>
        </Animated.View>
      )) : null}
      <Animated.View style={[styles.resultBanner, { borderColor: accent, transform: [{ translateY: banner.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }, { scale: banner.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }]}>
        <View style={[styles.resultDot, { backgroundColor: accent }]} />
        <View style={styles.resultCopy}>
          <Text style={[styles.resultTitle, { color: accent }]}>{isWin ? 'MONEY MADE' : 'ROUND LOSS'}</Text>
          <Text style={styles.resultDelta}>{delta}</Text>
        </View>
        <Feather name={isWin ? 'trending-up' : 'trending-down'} size={20} color={accent} />
      </Animated.View>
    </View>
  );
}

export default function BlackjackScreen() {
  const insets = useSafeAreaInsets();
  const [stored, setStored] = useState<StoredGame>(freshGame);
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<Tab>('table');
  const [phase, setPhase] = useState<Phase>('betting');
  const [betText, setBetText] = useState('25');
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [dealerHand, setDealerHand] = useState<Card[]>([]);
  const [deck, setDeck] = useState<Card[]>([]);
  const [activeBet, setActiveBet] = useState(0);
  const [message, setMessage] = useState('Place your bet to begin');
  const [error, setError] = useState('');
  const [resultFeedback, setResultFeedback] = useState<{ tone: 'win' | 'loss'; amount: number } | null>(null);
  const [showRankModal, setShowRankModal] = useState(false);
  const shake = useRef(new Animated.Value(0)).current;

  const table = TABLES[stored.tableTheme];
  const currentRank = RANKS[stored.rankIndex];
  const nextRank = RANKS[Math.min(stored.rankIndex + 1, RANKS.length - 1)];
  const playerScore = scoreHand(playerHand);
  const dealerScore = scoreHand(dealerHand);
  const progress = stored.rankIndex === RANKS.length - 1
    ? 1
    : Math.min(1, Math.max(0, (stored.bankroll - 100) / Math.max(1, nextRank.threshold - 100)));

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value) setStored({ ...freshGame(), ...JSON.parse(value) } as StoredGame);
      })
      .catch(() => undefined)
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (hydrated) void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }, [hydrated, stored]);

  const playCardFeedback = (sound: keyof typeof SOUND_ASSETS = 'deal', heavy = false) => {
    if (stored.soundsEnabled) {
      void Haptics.impactAsync(heavy ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
      void Audio.Sound.createAsync(SOUND_ASSETS[sound], { shouldPlay: true, volume: 0.42 }).then(({ sound: playback }) => {
        playback.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) void playback.unloadAsync();
        });
      }).catch(() => undefined);
    }
  };

  const invalidBet = (reason: string) => {
    setError(reason);
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 65, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 65, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 1, duration: 65, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 65, useNativeDriver: true }),
    ]).start();
    playCardFeedback();
  };

  const startRound = () => {
    Keyboard.dismiss();
    const amount = Number.parseFloat(betText.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) return invalidBet('Enter an amount above €0');
    if (amount > stored.bankroll) return invalidBet('Your bet cannot exceed your balance');
    const freshDeck = shuffledDeck();
    const firstPlayer = [freshDeck[0], freshDeck[2]];
    const firstDealer = [freshDeck[1], freshDeck[3]];
    setDeck(freshDeck.slice(4));
    setActiveBet(Number(amount.toFixed(2)));
    setPlayerHand(firstPlayer);
    setDealerHand(firstDealer);
    setPhase('playing');
    setMessage('Your move');
    setError('');
    playCardFeedback('deal', true);
  };

  const dealerDraw = (baseDeck: Card[], baseDealer: Card[]) => {
    const nextDeck = [...baseDeck];
    const nextDealer = [...baseDealer];
    while (scoreHand(nextDealer) < 17 && nextDeck.length > 0) nextDealer.push(nextDeck.shift() as Card);
    setDeck(nextDeck);
    setDealerHand(nextDealer);
    return nextDealer;
  };

  const settle = (outcome: 'win' | 'loss' | 'push' | 'blackjack', finalDealer: Card[], finalPlayer = playerHand, wager = activeBet) => {
    const profit = outcome === 'blackjack' ? wager * 1.5 : outcome === 'win' ? wager : outcome === 'push' ? 0 : -wager;
    let nextBankroll = Math.max(0, Number((stored.bankroll + profit).toFixed(2)));
    let nextRankIndex = stored.rankIndex;
    let rankMessage = '';
    if (nextRankIndex < RANKS.length - 1 && nextBankroll >= RANKS[nextRankIndex + 1].threshold) {
      nextRankIndex += 1;
      nextBankroll = 100;
      rankMessage = `${RANKS[nextRankIndex].name} rank unlocked`;
    } else if (nextBankroll <= 0) {
      nextBankroll = 50;
      if (nextRankIndex > 0) {
        nextRankIndex -= 1;
        rankMessage = `Back to ${RANKS[nextRankIndex].name} · balance reset to €50`;
      } else {
        rankMessage = 'Balance reset to €50';
      }
    } else if (nextRankIndex > 0 && nextBankroll < 10) {
      nextRankIndex -= 1;
      nextBankroll = 100;
      rankMessage = `Back to ${RANKS[nextRankIndex].name}`;
    }
    const rankKey = RANKS[stored.rankIndex].name;
    const previousRankStats = stored.rankStats[rankKey] ?? { games: 0, net: 0 };
    setStored((current) => ({
      ...current,
      bankroll: nextBankroll,
      rankIndex: nextRankIndex,
      totalWinnings: current.totalWinnings + Math.max(0, profit),
      totalLosses: current.totalLosses + Math.max(0, -profit),
      gamesPlayed: current.gamesPlayed + 1,
      wins: current.wins + (outcome === 'win' || outcome === 'blackjack' ? 1 : 0),
      losses: current.losses + (outcome === 'loss' ? 1 : 0),
      blackjacks: current.blackjacks + (outcome === 'blackjack' ? 1 : 0),
      history: [...current.history, Number(profit.toFixed(2))].slice(-18),
      rankStats: { ...current.rankStats, [rankKey]: { games: previousRankStats.games + 1, net: previousRankStats.net + profit } },
    }));
    setPhase('settled');
    if (outcome === 'win' || outcome === 'blackjack' || outcome === 'loss') {
      setResultFeedback({ tone: outcome === 'loss' ? 'loss' : 'win', amount: profit });
    } else {
      setResultFeedback(null);
    }
    setMessage(rankMessage || (outcome === 'blackjack' ? 'Blackjack' : outcome === 'win' ? 'You win' : outcome === 'push' ? 'Push' : 'Dealer wins'));
    playCardFeedback(outcome === 'win' || outcome === 'blackjack' ? 'cash' : 'flip', outcome === 'win' || outcome === 'blackjack');
    void finalDealer;
    void finalPlayer;
  };

  const finishDealer = (wager = activeBet, finalPlayer = playerHand) => {
    const finalDealer = dealerDraw(deck, dealerHand);
    const pScore = scoreHand(finalPlayer);
    const dScore = scoreHand(finalDealer);
    const isBlackjack = pScore === 21 && finalPlayer.length === 2;
    const outcome = isBlackjack ? 'blackjack' : pScore > 21 ? 'loss' : dScore > 21 || pScore > dScore ? 'win' : dScore > pScore ? 'loss' : 'push';
    settle(outcome, finalDealer, finalPlayer, wager);
  };

  const hit = () => {
    if (phase !== 'playing' || deck.length === 0) return;
    const nextCard = deck[0];
    const nextPlayer = [...playerHand, nextCard];
    setDeck(deck.slice(1));
    setPlayerHand(nextPlayer);
    playCardFeedback();
    if (scoreHand(nextPlayer) > 21) {
      const finalDealer = dealerDraw(deck.slice(1), dealerHand);
      settle('loss', finalDealer, nextPlayer);
    }
  };

  const stand = () => {
    if (phase !== 'playing') return;
    finishDealer();
  };

  const doubleDown = () => {
    if (phase !== 'playing') return;
    if (stored.bankroll < activeBet * 2) return invalidBet('Not enough balance to double');
    const nextCard = deck[0];
    const nextPlayer = [...playerHand, nextCard];
    const doubled = activeBet * 2;
    setDeck(deck.slice(1));
    setPlayerHand(nextPlayer);
    setActiveBet(doubled);
    playCardFeedback('deal', true);
    if (scoreHand(nextPlayer) > 21) {
      const finalDealer = dealerDraw(deck.slice(1), dealerHand);
      settle('loss', finalDealer, nextPlayer, doubled);
    } else {
      finishDealer(doubled, nextPlayer);
    }
  };

  const newRound = () => {
    setPlayerHand([]);
    setDealerHand([]);
    setDeck([]);
    setActiveBet(0);
    setPhase('betting');
    setMessage('Place your bet to begin');
    setError('');
    setResultFeedback(null);
  };

  const toggleSound = () => {
    setStored((current) => ({ ...current, soundsEnabled: !current.soundsEnabled }));
    if (!stored.soundsEnabled) playCardFeedback();
  };

  const selectTheme = (theme: ThemeKey) => {
    const locked = TABLES[theme].lockedAt !== undefined && (TABLES[theme].lockedAt as number) > stored.rankIndex;
    if (locked) {
      setShowRankModal(true);
      return;
    }
    setStored((current) => ({ ...current, tableTheme: theme }));
    playCardFeedback();
  };

  const renderTable = () => (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.eyebrow}>BALANCE</Text>
          <Text style={styles.balance}>{formatMoney(stored.bankroll)}</Text>
        </View>
        <Pressable onPress={() => setShowRankModal(true)} style={styles.rankPill}>
          <View style={[styles.rankMark, { backgroundColor: currentRank.color }]}>
            <Text style={[styles.rankMarkText, { color: currentRank.ink }]}>{currentRank.name[0]}</Text>
          </View>
          <View>
            <Text style={styles.rankName}>{currentRank.name}</Text>
            <Text style={styles.rankMeta}>{formatMoney(stored.bankroll)} / {formatMoney(nextRank.threshold)}</Text>
          </View>
          <Feather name="chevron-down" size={14} color={C.mutedForeground} />
        </Pressable>
      </View>

      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress * 100}%` }]} /></View>
      <View style={styles.progressCaption}>
        <Text style={styles.mutedText}>{stored.rankIndex === RANKS.length - 1 ? 'Elite status' : `${formatMoney(Math.max(0, nextRank.threshold - stored.bankroll))} to ${nextRank.name}`}</Text>
        <Text style={styles.mutedText}>{RANKS[stored.rankIndex].name} table access</Text>
      </View>

      <LinearGradient colors={[table.base, table.deep]} style={[styles.table, { borderColor: table.line }]}>
        <View pointerEvents="none" style={styles.tablePattern}>
          {Array.from({ length: 12 }).map((_, index) => <View key={index} style={[styles.patternLine, { transform: [{ rotate: '45deg' }, { translateX: index * 50 - 280 }] }]} />)}
        </View>
        <View style={[styles.tableEdge, { borderColor: table.line }]} />
        <View style={styles.tableContent}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableLabel}>DEALER</Text>
            <View style={styles.shoeStack}>
              <View style={[styles.shoeCard, { top: -5, left: -5 }]} />
              <View style={styles.shoeCard}><View style={styles.shoeStripe} /></View>
            </View>
          </View>
          <Hand hand={dealerHand} hiddenDealer={phase === 'playing'} label="DEALER" value={dealerHand.length === 0 ? '—' : phase === 'playing' ? '?' : String(dealerScore)} animateKey={`dealer-${dealerHand.length}-${phase}`} />
          <View style={styles.tableMessage}><Text style={styles.tableMessageText}>{message}</Text>{activeBet > 0 && <Text style={styles.tableBet}>{formatMoney(activeBet)} in play</Text>}</View>
          <Hand hand={playerHand} label="PLAYER" value={playerHand.length === 0 ? '—' : String(playerScore)} animateKey={`player-${playerHand.length}-${phase}`} />
        </View>
      </LinearGradient>

      {error ? <Animated.Text style={[styles.errorText, { transform: [{ translateX: shake.interpolate({ inputRange: [-1, 0, 1], outputRange: [-5, 0, 5] }) }] }]}>{error}</Animated.Text> : null}
      {phase === 'betting' || phase === 'settled' ? (
        <View style={styles.betRow}>
          <Animated.View style={[styles.betInputWrap, { transform: [{ translateX: shake.interpolate({ inputRange: [-1, 0, 1], outputRange: [-5, 0, 5] }) }] }]}>
            <Feather name="droplet" size={16} color={C.emerald} />
            <TextInput
              testID="bet-input"
              value={betText}
              onChangeText={(value) => { setBetText(value.replace(/[^0-9.,]/g, '')); setError(''); }}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={C.mutedForeground}
              style={styles.betInput}
              maxLength={9}
            />
            <Text style={styles.euroLabel}>EUR</Text>
          </Animated.View>
          <GlassButton label={phase === 'settled' ? 'New round' : 'Bet'} onPress={phase === 'settled' ? newRound : startRound} primary />
        </View>
      ) : (
        <View style={styles.actionsRow}>
          <GlassButton label="Stand" icon="pause" onPress={stand} />
          <GlassButton label="Double" icon="chevrons-up" onPress={doubleDown} disabled={stored.bankroll < activeBet * 2} />
          <GlassButton label="Hit" icon="plus" onPress={hit} primary />
        </View>
      )}
      <Text style={styles.helperText}>{phase === 'betting' ? 'Choose your own stake · minimum €0.01' : phase === 'playing' ? 'Cards are dealt from a fresh shoe' : 'Your history is saved automatically'}</Text>
    </ScrollView>
  );

  const renderProfile = () => {
    const net = stored.totalWinnings - stored.totalLosses;
    const winRate = stored.gamesPlayed ? Math.round((stored.wins / stored.gamesPlayed) * 100) : 0;
    return (
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.pageHeading}><Text style={styles.pageTitle}>Profile</Text><Text style={styles.pageSubtitle}>Your table history, kept across every rank.</Text></View>
        <View style={styles.profileRankCard}>
          <View style={[styles.rankCardIcon, { backgroundColor: currentRank.color }]}><Text style={[styles.rankCardIconText, { color: currentRank.ink }]}>{currentRank.name[0]}</Text></View>
          <View style={styles.profileRankCopy}><Text style={styles.eyebrow}>CURRENT RANK</Text><Text style={styles.profileRankName}>{currentRank.name}</Text><Text style={styles.profileRankBalance}>{formatMoney(stored.bankroll)} available</Text></View>
          <Pressable onPress={() => setShowRankModal(true)}><Feather name="chevron-right" size={18} color={C.mutedForeground} /></Pressable>
        </View>
        <View style={styles.netCard}><Text style={styles.eyebrow}>NET RESULT</Text><Text style={[styles.netValue, { color: net >= 0 ? C.emerald : C.destructive }]}>{net >= 0 ? '+' : '-'}{formatMoney(Math.abs(net))}</Text><Text style={styles.netCaption}>all time · across {stored.gamesPlayed} games</Text></View>
        <View style={styles.statsGrid}>
          <Stat label="Total Winnings" value={formatMoney(stored.totalWinnings)} positive />
          <Stat label="Total Losses" value={formatMoney(stored.totalLosses)} />
          <Stat label="Wins / Losses" value={`${stored.wins} / ${stored.losses}`} />
          <Stat label="Blackjacks" value={String(stored.blackjacks)} />
          <Stat label="Win Rate" value={`${winRate}%`} positive />
          <Stat label="Games Played" value={String(stored.gamesPlayed)} />
        </View>
        <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Earnings</Text><Text style={styles.sectionHint}>historical net by hand</Text></View>
        <View style={styles.chartCard}><MiniChart values={stored.history} /><View style={styles.chartLegend}><View style={styles.legendDot} /><Text style={styles.mutedText}>positive rounds</Text><View style={[styles.legendDot, styles.legendDotLoss]} /><Text style={styles.mutedText}>losses</Text></View></View>
        <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>By rank</Text><Text style={styles.sectionHint}>preserved after resets</Text></View>
        {Object.keys(stored.rankStats).length === 0 ? <View style={styles.emptyRank}><Text style={styles.mutedText}>Rank history will appear after your first hand.</Text></View> : Object.entries(stored.rankStats).reverse().map(([rank, stats]) => (
          <View key={rank} style={styles.rankHistoryRow}><View style={styles.rankHistoryDot} /><Text style={styles.rankHistoryName}>{rank}</Text><Text style={styles.rankHistoryGames}>{stats.games} games</Text><Text style={[styles.rankHistoryNet, { color: stats.net >= 0 ? C.emerald : C.destructive }]}>{stats.net >= 0 ? '+' : '-'}{formatMoney(Math.abs(stats.net))}</Text></View>
        ))}
      </ScrollView>
    );
  };

  const renderSettings = () => (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.pageHeading}><Text style={styles.pageTitle}>Table</Text><Text style={styles.pageSubtitle}>Personalize the atmosphere around your game.</Text></View>
      <View style={styles.settingRow}><View><Text style={styles.settingTitle}>Realistic Card Sounds</Text><Text style={styles.settingSubtitle}>{stored.soundsEnabled ? 'Tactile card feedback is on' : 'Silent play'}</Text></View><Pressable onPress={toggleSound} style={[styles.switch, stored.soundsEnabled && styles.switchOn]}><View style={[styles.switchThumb, stored.soundsEnabled && styles.switchThumbOn]} /></Pressable></View>
      <Text style={styles.settingSectionLabel}>TABLE STYLES</Text>
      <View style={styles.themeGrid}>{(Object.keys(TABLES) as ThemeKey[]).map((key) => { const theme = TABLES[key]; const locked = theme.lockedAt !== undefined && (theme.lockedAt as number) > stored.rankIndex; return <Pressable key={key} onPress={() => selectTheme(key)} style={[styles.themeTile, stored.tableTheme === key && styles.themeTileSelected, locked && styles.themeTileLocked]}><LinearGradient colors={[theme.base, theme.deep]} style={styles.themePreview}><View style={[styles.themePreviewLine, { borderColor: theme.line }]} />{locked ? <Feather name="lock" size={15} color={C.mutedForeground} /> : null}</LinearGradient><Text style={styles.themeName}>{theme.label}</Text><Text style={styles.themeMeta}>{locked ? `Rank ${RANKS[theme.lockedAt as number].name}` : stored.tableTheme === key ? 'Selected' : 'Available'}</Text></Pressable>; })}</View>
      <View style={styles.infoCard}><Feather name="shield" size={17} color={C.emerald} /><View style={styles.infoCopy}><Text style={styles.infoTitle}>Private by design</Text><Text style={styles.infoText}>Your balance and lifetime stats stay on this device. A rank reset never erases your history.</Text></View></View>
      <Text style={styles.version}>PREMIUM BLACKJACK · 1.0</Text>
    </ScrollView>
  );

  if (!hydrated) return <View style={styles.loading}><StatusBar style="light" /><Text style={styles.loadingMark}>BJ</Text></View>;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <View style={styles.header}><Text style={styles.wordmark}>BLACKJACK <Text style={styles.wordmarkAccent}>/</Text> PRIVATE TABLE</Text><View style={styles.headerActions}><Pressable onPress={() => setShowRankModal(true)} style={styles.headerIcon}><Feather name="award" size={17} color={C.mutedForeground} /></Pressable><Pressable onPress={() => setTab('settings')} style={styles.headerIcon}><Feather name="sliders" size={17} color={C.mutedForeground} /></Pressable></View></View>
      <View style={styles.content}>{tab === 'table' ? renderTable() : tab === 'profile' ? renderProfile() : renderSettings()}</View>
      {resultFeedback ? <ResultFeedback tone={resultFeedback.tone} amount={resultFeedback.amount} /> : null}
      <View style={[styles.navBar, { paddingBottom: Math.max(insets.bottom, 12) }]}><NavItem active={tab === 'table'} icon="layers" label="Table" onPress={() => setTab('table')} /><NavItem active={tab === 'profile'} icon="activity" label="Profile" onPress={() => setTab('profile')} /><NavItem active={tab === 'settings'} icon="sliders" label="Settings" onPress={() => setTab('settings')} /></View>
      <Modal transparent visible={showRankModal} animationType="fade" onRequestClose={() => setShowRankModal(false)}><Pressable style={styles.modalBackdrop} onPress={() => setShowRankModal(false)}><Pressable style={styles.rankModal} onPress={(event) => event.stopPropagation()}><View style={styles.modalTop}><Text style={styles.modalTitle}>Ranks</Text><Pressable onPress={() => setShowRankModal(false)}><Feather name="x" size={19} color={C.mutedForeground} /></Pressable></View>{RANKS.map((rank, index) => <View key={rank.name} style={[styles.rankRow, index === stored.rankIndex && styles.rankRowCurrent]}><View style={[styles.rankRowMark, { backgroundColor: rank.color }]}><Text style={[styles.rankRowMarkText, { color: rank.ink }]}>{rank.name[0]}</Text></View><View style={styles.rankRowCopy}><Text style={styles.rankRowName}>{rank.name}</Text><Text style={styles.rankRowRequirement}>{index === 0 ? 'Starting table' : `${formatMoney(rank.threshold)} lifetime balance`}</Text></View>{index <= stored.rankIndex ? <Feather name="check" size={16} color={C.emerald} /> : null}</View>)}<Text style={styles.modalNote}>Reach a new rank to restart at €100 with its physical premium card. Falling below €10 moves you down one rank.</Text></Pressable></Pressable></Modal>
    </View>
  );
}

function Stat({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return <View style={styles.statCell}><Text style={styles.statLabel}>{label}</Text><Text style={[styles.statValue, positive && { color: C.emerald }]}>{value}</Text></View>;
}

function NavItem({ active, icon, label, onPress }: { active: boolean; icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.navItem}><Feather name={icon} size={19} color={active ? C.emerald : C.mutedForeground} /><Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  loading: { flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' },
  loadingMark: { color: C.emerald, fontSize: 18, fontWeight: '700', letterSpacing: 5 },
  header: { height: 58, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  wordmark: { color: C.mutedForeground, fontSize: 10, fontWeight: '600', letterSpacing: 1.7 },
  wordmarkAccent: { color: C.emerald },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerIcon: { width: 33, height: 33, borderRadius: 18, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 28 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  eyebrow: { color: C.mutedForeground, fontSize: 10, fontWeight: '600', letterSpacing: 1.4 },
  balance: { color: C.emerald, fontSize: 25, fontWeight: '700', letterSpacing: -0.7, marginTop: 4 },
  rankPill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingLeft: 6, paddingRight: 2 },
  rankMark: { width: 34, height: 24, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rankMarkText: { fontSize: 11, fontWeight: '800' },
  rankName: { color: C.foreground, fontSize: 12, fontWeight: '600' },
  rankMeta: { color: C.mutedForeground, fontSize: 9, marginTop: 2 },
  progressTrack: { height: 2, borderRadius: 2, backgroundColor: C.secondary, overflow: 'hidden' },
  progressFill: { height: 2, backgroundColor: C.emerald, borderRadius: 2 },
  progressCaption: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7, marginBottom: 16 },
  mutedText: { color: C.mutedForeground, fontSize: 11 },
  table: { minHeight: 485, borderRadius: 27, borderWidth: 1, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.42, shadowRadius: 20, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  tableEdge: { position: 'absolute', left: 10, right: 10, top: 10, bottom: 10, borderRadius: 21, borderWidth: StyleSheet.hairlineWidth },
  tablePattern: { ...StyleSheet.absoluteFillObject, opacity: 0.18, overflow: 'hidden' },
  patternLine: { position: 'absolute', width: 1, height: 700, backgroundColor: tableLinePlaceholder(), left: '50%', top: -120 },
  tableContent: { flex: 1, padding: 20 },
  tableHeader: { height: 36, alignItems: 'center', justifyContent: 'center' },
  tableLabel: { color: C.mutedForeground, fontSize: 10, letterSpacing: 1.7 },
  shoeStack: { position: 'absolute', top: 0, right: 0, width: 42, height: 48 },
  shoeCard: { position: 'absolute', width: 42, height: 48, borderRadius: 7, borderWidth: 1, borderColor: C.border, backgroundColor: '#0F1412', alignItems: 'center', justifyContent: 'center' },
  shoeStripe: { width: 24, height: 18, borderWidth: 1, borderColor: '#36443B', transform: [{ rotate: '45deg' }] },
  handBlock: { minHeight: 104, alignItems: 'center' },
  handHeader: { width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 7, alignItems: 'center', marginBottom: 9 },
  handLabel: { color: C.mutedForeground, fontSize: 9, letterSpacing: 1.3 },
  handValue: { color: C.foreground, fontSize: 10, fontWeight: '700' },
  cardsRow: { flexDirection: 'row', justifyContent: 'center', minHeight: 86, gap: 7 },
  card: { width: 66, height: 94, borderRadius: 10, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  cardFront: { flex: 1, backgroundColor: '#F2F3EE', borderRadius: 9, padding: 6, borderWidth: 1, borderColor: '#D5D8D0', overflow: 'hidden' },
  cardCorner: { color: '#121713', fontSize: 13, fontWeight: '700', lineHeight: 14 },
  cardSuit: { color: '#121713', fontSize: 10, lineHeight: 11 },
  cardCenterSuit: { color: '#121713', position: 'absolute', alignSelf: 'center', top: 31, fontSize: 30 },
  cardCornerBottom: { position: 'absolute', bottom: 5, right: 6, alignItems: 'center', transform: [{ rotate: '180deg' }] },
  cardSuitSmall: { color: '#121713', fontSize: 8 },
  redSuit: { color: '#AA4A4B' },
  cardBack: { flex: 1, borderRadius: 9, borderWidth: 1, borderColor: '#3A4840', padding: 5 },
  cardBackInner: { flex: 1, borderRadius: 5, borderWidth: 1, borderColor: '#3A4840', alignItems: 'center', justifyContent: 'center' },
  cardBackDiamond: { width: 25, height: 25, borderWidth: 1, borderColor: '#597064', transform: [{ rotate: '45deg' }] },
  cardBackDiamondSmall: { position: 'absolute', width: 15, height: 15, borderWidth: 1, borderColor: '#597064', transform: [{ rotate: '45deg' }] },
  tableMessage: { flex: 1, minHeight: 145, alignItems: 'center', justifyContent: 'center' },
  tableMessageText: { color: C.mutedForeground, fontSize: 14, fontWeight: '500', letterSpacing: -0.1 },
  tableBet: { color: C.emerald, fontSize: 11, marginTop: 6 },
  errorText: { color: C.destructive, textAlign: 'center', fontSize: 11, marginTop: 9 },
  betRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  betInputWrap: { flex: 1, height: 56, borderRadius: 17, borderWidth: 1, borderColor: C.border, backgroundColor: 'rgba(32,42,36,0.42)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 9, overflow: 'hidden' },
  betInput: { flex: 1, color: C.foreground, fontSize: 18, fontWeight: '600', padding: 0 },
  euroLabel: { color: C.mutedForeground, fontSize: 10, letterSpacing: 0.8 },
  actionButton: { flex: 1, height: 56, borderRadius: 17, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  compactButton: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden' },
  buttonPressable: { flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, overflow: 'hidden', backgroundColor: 'rgba(23,31,26,0.52)' },
  primaryButton: { backgroundColor: C.primary, borderColor: C.primary },
  buttonLabel: { color: C.secondaryForeground, fontSize: 13, fontWeight: '600' },
  primaryButtonLabel: { color: C.primaryForeground },
  pressedButton: { opacity: 0.86 },
  disabledButton: { opacity: 0.35 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  helperText: { textAlign: 'center', color: '#637067', fontSize: 10, marginTop: 11 },
  navBar: { height: 76, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, backgroundColor: 'rgba(7,9,7,0.96)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  navItem: { alignItems: 'center', justifyContent: 'center', gap: 5, minWidth: 74 },
  navLabel: { color: C.mutedForeground, fontSize: 10 },
  navLabelActive: { color: C.emerald, fontWeight: '600' },
  pageHeading: { marginBottom: 19 },
  pageTitle: { color: C.foreground, fontSize: 29, fontWeight: '700', letterSpacing: -0.8 },
  pageSubtitle: { color: C.mutedForeground, fontSize: 13, marginTop: 5 },
  profileRankCard: { borderWidth: 1, borderColor: C.border, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 12, backgroundColor: C.card },
  rankCardIcon: { width: 49, height: 49, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  rankCardIconText: { fontSize: 19, fontWeight: '800' },
  profileRankCopy: { flex: 1, marginLeft: 12 },
  profileRankName: { color: C.foreground, fontSize: 19, fontWeight: '700', marginTop: 2 },
  profileRankBalance: { color: C.emerald, fontSize: 11, marginTop: 3 },
  netCard: { borderWidth: 1, borderColor: '#244534', borderRadius: 20, padding: 17, backgroundColor: '#0C1A13', marginBottom: 12 },
  netValue: { fontSize: 30, fontWeight: '700', letterSpacing: -1, marginTop: 4 },
  netCaption: { color: C.mutedForeground, fontSize: 11, marginTop: 4 },
  statsGrid: { borderWidth: 1, borderColor: C.border, borderRadius: 20, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap', marginBottom: 22 },
  statCell: { width: '50%', padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  statLabel: { color: C.mutedForeground, fontSize: 10 },
  statValue: { color: C.foreground, fontSize: 15, fontWeight: '600', marginTop: 5 },
  sectionHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 9 },
  sectionTitle: { color: C.foreground, fontSize: 16, fontWeight: '600' },
  sectionHint: { color: C.mutedForeground, fontSize: 10 },
  chartCard: { borderWidth: 1, borderColor: C.border, borderRadius: 20, padding: 14, marginBottom: 21 },
  chart: { height: 76, flexDirection: 'row', alignItems: 'center', gap: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  chartColumn: { flex: 1, height: 68, justifyContent: 'flex-end', alignItems: 'center' },
  chartBar: { width: '72%', minWidth: 3, borderRadius: 4, backgroundColor: C.emerald, opacity: 0.82 },
  chartBarLoss: { backgroundColor: C.destructive },
  emptyChart: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  chartLegend: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 11 },
  legendDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.emerald, marginLeft: 2 },
  legendDotLoss: { backgroundColor: C.destructive, marginLeft: 9 },
  emptyRank: { padding: 20, borderRadius: 16, backgroundColor: C.card, alignItems: 'center' },
  rankHistoryRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, paddingVertical: 13 },
  rankHistoryDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.emerald, marginRight: 9 },
  rankHistoryName: { color: C.foreground, fontSize: 13, fontWeight: '600', flex: 1 },
  rankHistoryGames: { color: C.mutedForeground, fontSize: 11, marginRight: 10 },
  rankHistoryNet: { fontSize: 12, fontWeight: '600' },
  settingRow: { borderWidth: 1, borderColor: C.border, borderRadius: 19, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.card, marginBottom: 26 },
  settingTitle: { color: C.foreground, fontSize: 14, fontWeight: '600' },
  settingSubtitle: { color: C.mutedForeground, fontSize: 11, marginTop: 5 },
  switch: { width: 45, height: 27, borderRadius: 15, padding: 3, backgroundColor: C.secondary },
  switchOn: { backgroundColor: C.emerald },
  switchThumb: { width: 21, height: 21, borderRadius: 11, backgroundColor: '#B9C1BB' },
  switchThumbOn: { backgroundColor: '#071009', alignSelf: 'flex-end' },
  settingSectionLabel: { color: C.mutedForeground, fontSize: 10, letterSpacing: 1.4, marginBottom: 10 },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 },
  themeTile: { width: '47.5%', borderWidth: 1, borderColor: C.border, borderRadius: 17, padding: 7, backgroundColor: C.card },
  themeTileSelected: { borderColor: C.emerald },
  themeTileLocked: { opacity: 0.55 },
  themePreview: { height: 72, borderRadius: 11, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  themePreviewLine: { width: 49, height: 38, borderRadius: 8, borderWidth: 1 },
  themeName: { color: C.foreground, fontSize: 12, fontWeight: '600', marginTop: 8, marginHorizontal: 3 },
  themeMeta: { color: C.mutedForeground, fontSize: 10, marginTop: 3, marginHorizontal: 3, marginBottom: 3 },
  infoCard: { flexDirection: 'row', gap: 11, padding: 15, borderRadius: 18, backgroundColor: '#0C1A13', borderWidth: 1, borderColor: '#244534' },
  infoCopy: { flex: 1 },
  infoTitle: { color: C.emerald, fontSize: 13, fontWeight: '600' },
  infoText: { color: C.mutedForeground, fontSize: 11, lineHeight: 17, marginTop: 4 },
  version: { color: '#48534C', textAlign: 'center', fontSize: 9, letterSpacing: 1.3, marginTop: 28 },
  resultLayer: { ...StyleSheet.absoluteFillObject, zIndex: 20, alignItems: 'center', justifyContent: 'center' },
  resultWash: { ...StyleSheet.absoluteFillObject },
  cashGlow: { position: 'absolute', width: 330, height: 330, borderRadius: 165, backgroundColor: '#2FD87E', shadowColor: '#4BFF9A', shadowOpacity: 0.95, shadowRadius: 70, shadowOffset: { width: 0, height: 0 }, elevation: 22 },
  lossPulse: { position: 'absolute', width: 360, height: 360, borderRadius: 180, backgroundColor: '#B83C42', shadowColor: '#E5575F', shadowOpacity: 0.65, shadowRadius: 48, shadowOffset: { width: 0, height: 0 }, elevation: 15 },
  cashNote: { position: 'absolute', width: 42, height: 25, borderRadius: 5, borderWidth: 1, alignItems: 'center', justifyContent: 'center', shadowColor: '#03180C', shadowOpacity: 0.6, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
  cashNoteSymbol: { color: '#D8F7E3', fontSize: 14, fontWeight: '800' },
  resultBanner: { minWidth: 178, paddingVertical: 13, paddingHorizontal: 15, borderRadius: 17, borderWidth: 1, backgroundColor: 'rgba(7, 13, 9, 0.94)', flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.42, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 10 },
  resultDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  resultCopy: { flex: 1 },
  resultTitle: { fontSize: 9, fontWeight: '700', letterSpacing: 1.3 },
  resultDelta: { color: C.foreground, fontSize: 22, fontWeight: '700', letterSpacing: -0.5, marginTop: 2 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.68)', justifyContent: 'flex-end' },
  rankModal: { backgroundColor: '#111612', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 19, paddingBottom: 34, borderWidth: 1, borderColor: C.border },
  modalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 },
  modalTitle: { color: C.foreground, fontSize: 20, fontWeight: '700' },
  rankRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 8, borderRadius: 14 },
  rankRowCurrent: { backgroundColor: '#1A2B21' },
  rankRowMark: { width: 32, height: 24, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  rankRowMarkText: { fontSize: 11, fontWeight: '800' },
  rankRowCopy: { flex: 1 },
  rankRowName: { color: C.foreground, fontSize: 13, fontWeight: '600' },
  rankRowRequirement: { color: C.mutedForeground, fontSize: 10, marginTop: 2 },
  modalNote: { color: C.mutedForeground, fontSize: 11, lineHeight: 17, marginTop: 14, paddingTop: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
});

function tableLinePlaceholder() {
  return '#6C8979';
}