export type GameMode = 'normal' | 'hard' | 'casual' | 'cursed' | 'seeded' | 'quick';

export type Phase = 
  | 'track-type'
  | 'track-type-reselect'
  | 'curse-check'
  | 'curse-target-select'
  | 'curse-apply-last-select'
  | 'curse-result'
  | 'mutation'
  | 'mutation-result'
  | 'compose'
  | 'powerup-roll'
  | 'next-room'
  | 'room-lock-select';

export type CurseTargetMethod = 
  | 'previous'
  | 'oldest'
  | 'loudest'
  | 'quietest'
  | 'player-choice'
  | 'two-targets';

export interface Track {
  room: number;
  type: string;
  originalType?: string;
  mutations: string[];
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
  doubleMutationNextRoom: boolean;
  curseTargetTrackIndex: number | null;
  timerEndTime: number | null;
  pendingTrackTypeReselect: boolean;
  pendingCurseTargets: number[];
  curseTargetMethod: CurseTargetMethod | null;
  curseTargetRoll: number | null;
  pendingTargetCurseRolls: number;
  painShiftActive: boolean;
  conditionalPowerUp: boolean;
  powerUpBlockedThisRoom: boolean;
}

export type PowerUpType = 'redirect' | 'lock' | 'painshift' | 'split' | 'breath';

export type RangeTable = [number, number, string][];

export type RoomOneRule = 'reroll' | 'no-mutation';

export interface MutationMechanics {
  rollTwice?: boolean;
  roomOneRule?: RoomOneRule;
  noEffect?: boolean;
  takeCurseInstead?: boolean;
  abandonTrackType?: boolean;
  copyPreviousTrackType?: boolean;
  repeatLastMutation?: boolean;
  timerMinutes?: number;
  deleteIfHighRoll?: number;
}

export interface MutationEntry {
  text: string;
  mechanics?: MutationMechanics;
}

export interface TargetCurseMechanics {
  forceRoom?: boolean;
  forceRoomChance?: number;
  deleteTrack?: boolean;
  rerollTwice?: boolean;
  applyLastCurse?: boolean;
  doubleMutationNextRoom?: boolean;
  becomesCurseTarget?: boolean;
}

export interface TargetCurseEntry {
  text: string;
  mechanics?: TargetCurseMechanics;
}

export interface MixCurseMechanics {
  isLastRoom?: boolean;
  minRoom?: number;
  rollTargetCurses?: number;
}

export interface MixCurseEntry {
  text: string;
  mechanics?: MixCurseMechanics;
}
