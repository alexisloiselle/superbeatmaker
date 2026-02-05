export type GameMode = 'normal' | 'hard' | 'casual' | 'cursed' | 'seeded' | 'quick';

export type Phase = 
  | 'track-type'
  | 'curse-check'
  | 'curse-result'
  | 'mutation'
  | 'mutation-result'
  | 'compose'
  | 'powerup-roll'
  | 'next-room';

export interface Track {
  room: number;
  type: string;
  mutation: string | null;
  curses: string[];
  deleted: boolean;
}

export interface Curse {
  type: 'Target Curse' | 'Mix Curse';
  roll: number;
  effect: string;
}

export interface Mutation {
  roll: number;
  effect: string;
}

export interface LogEntry {
  room: number;
  msg: string;
  time: number;
}

export interface SeededRoom {
  type: string;
  mutation: string;
}

export interface GameState {
  mode: GameMode;
  manualTrackType: boolean;
  room: number;
  phase: Phase;
  powerUps: number;
  usedPowerUpThisRoom: boolean;
  roomLockTrack: number | null;
  usedRoomLock: boolean;
  usedOneLastBreath: boolean;
  forcedRooms: number;
  tracks: Track[];
  curses: Curse[];
  mutations: Mutation[];
  log: LogEntry[];
  currentTrack: Track | null;
  currentMutation: Mutation | null;
  currentCurse: Curse | null;
  seededRooms: SeededRoom[] | null;
  casualFirstCurseIgnored: boolean;
  isLastRoom: boolean;
}

export type PowerUpType = 'redirect' | 'lock' | 'painshift' | 'split' | 'breath';

export type RangeTable = [number, number, string][];
