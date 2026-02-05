export type GameMode = 'normal' | 'hard' | 'casual' | 'cursed' | 'seeded' | 'quick';

export type Phase = 
  | 'track-type'
  | 'track-type-reselect'  // For "abandon track type" mutation
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
  originalType?: string;  // If track type was changed
  mutations: string[];    // Changed to array for multiple mutations
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
  // New state for mechanics
  doubleMutationNextRoom: boolean;
  curseTargetTrackIndex: number | null;  // Track that receives all future curses
  timerEndTime: number | null;           // Timestamp when timer expires
  pendingTrackTypeReselect: boolean;     // For "abandon track type"
}

export type PowerUpType = 'redirect' | 'lock' | 'painshift' | 'split' | 'breath';

export type RangeTable = [number, number, string][];

// Mechanics for data-driven game rules

export type RoomOneRule = 'reroll' | 'no-mutation';

export interface MutationMechanics {
  rollTwice?: boolean;
  roomOneRule?: RoomOneRule;
  noEffect?: boolean;
  takeCurseInstead?: boolean;
  abandonTrackType?: boolean;           // Track must abandon its intended Track Type
  copyPreviousTrackType?: boolean;      // Purpose changes to match previous Room
  repeatLastMutation?: boolean;         // Repeat last Room's Mutation
  timerMinutes?: number;                // Room finalizes in X minutes
  deleteIfHighRoll?: number;            // Roll >= X = delete Track (e.g., 80)
}

export interface MutationEntry {
  text: string;
  mechanics?: MutationMechanics;
}

export interface TargetCurseMechanics {
  forceRoom?: boolean;                  // Always forces a room
  forceRoomChance?: number;             // Percentage chance to force room (0-100)
  deleteTrack?: boolean;
  rerollTwice?: boolean;
  applyLastCurse?: boolean;
  doubleMutationNextRoom?: boolean;     // Next Room will have two Mutations
  becomesCurseTarget?: boolean;         // This Track is now target of all future Curses
}

export interface TargetCurseEntry {
  text: string;
  mechanics?: TargetCurseMechanics;
}

export interface MixCurseMechanics {
  isLastRoom?: boolean;
  minRoom?: number;                     // Minimum room to apply (re-roll if below)
  rollTargetCurses?: number;
}

export interface MixCurseEntry {
  text: string;
  mechanics?: MixCurseMechanics;
}
