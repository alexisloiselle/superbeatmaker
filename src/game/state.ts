import type { GameState, GameMode, Track, LogEntry } from './types';

let state: GameState | null = null;
const listeners: Set<() => void> = new Set();

export function getState(): GameState | null {
  return state;
}

export function setState(newState: GameState | null): void {
  state = newState;
  notifyListeners();
}

export function updateState(updates: Partial<GameState>): void {
  if (state) {
    state = { ...state, ...updates };
    notifyListeners();
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners(): void {
  listeners.forEach(listener => listener());
}

export function createInitialState(mode: GameMode, manualTrackType: boolean): GameState {
  return {
    mode,
    manualTrackType,
    room: 1,
    phase: 'track-type',
    powerUps: 0,
    usedPowerUpThisRoom: false,
    roomLockTrack: null,
    usedRoomLock: false,
    usedOneLastBreath: false,
    forcedRooms: 0,
    tracks: [],
    curses: [],
    mutations: [],
    log: [],
    currentTrack: null,
    currentMutation: null,
    currentCurse: null,
    seededRooms: null,
    casualFirstCurseIgnored: false,
    isLastRoom: false,
    // New state for mechanics
    doubleMutationNextRoom: false,
    curseTargetTrackIndex: null,
    timerEndTime: null,
    pendingTrackTypeReselect: false,
  };
}

export function createTrack(room: number, type: string): Track {
  return {
    room,
    type,
    mutations: [],  // Changed to array
    curses: [],
    deleted: false,
  };
}

export function addLogEntry(msg: string): void {
  if (!state) return;
  
  const entry: LogEntry = {
    room: state.room,
    msg,
    time: Date.now(),
  };
  
  state.log = [entry, ...state.log];
  notifyListeners();
}
