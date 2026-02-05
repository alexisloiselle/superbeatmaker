import type { RangeTable, Curse, Mutation, MutationEntry, TargetCurseEntry, MixCurseEntry } from './types';
import { TRACK_TYPES, MUTATIONS, TARGET_CURSES, MIX_CURSES } from './data';
import { getState, updateState, addLogEntry, createTrack } from './state';

export function roll(max = 100): number {
  return Math.floor(Math.random() * max) + 1;
}

export function getFromTable(rollValue: number, table: RangeTable): string {
  for (const [min, max, value] of table) {
    if (rollValue >= min && rollValue <= max) return value;
  }
  return table[table.length - 1][2];
}

function getFromRecord<T>(rollValue: number, record: Record<number, T>): T {
  const keys = Object.keys(record).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < keys.length; i++) {
    const nextKey = keys[i + 1] || 101;
    if (rollValue >= keys[i] && rollValue < nextKey) {
      return record[keys[i]];
    }
  }
  return record[keys[keys.length - 1]];
}

export function getMutationEntry(rollValue: number): MutationEntry {
  return getFromRecord(rollValue, MUTATIONS);
}

export function getTargetCurseEntry(rollValue: number): TargetCurseEntry {
  return getFromRecord(rollValue, TARGET_CURSES);
}

export function getMixCurseEntry(rollValue: number): MixCurseEntry {
  return getFromRecord(rollValue, MIX_CURSES);
}

// Legacy helpers for seeded mode
export function getMutation(rollValue: number): string {
  return getMutationEntry(rollValue).text;
}

export function rollTrackType(): void {
  const state = getState();
  if (!state) return;

  const r = roll();
  const type = getFromTable(r, TRACK_TYPES);
  
  addLogEntry(`Track Type Roll: ${r} → ${type}`);
  
  // No curse check on first room
  const nextPhase = state.room === 1 ? 'mutation' : 'curse-check';
  if (state.room === 1) {
    addLogEntry('Room 1: Skipping curse check');
  }
  
  updateState({
    currentTrack: createTrack(state.room, type),
    phase: nextPhase,
  });
}

export function selectTrackType(type: string): void {
  const state = getState();
  if (!state) return;

  addLogEntry(`Track Type: ${type} (manual)`);
  
  // No curse check on first room
  const nextPhase = state.room === 1 ? 'mutation' : 'curse-check';
  if (state.room === 1) {
    addLogEntry('Room 1: Skipping curse check');
  }
  
  updateState({
    currentTrack: createTrack(state.room, type),
    phase: nextPhase,
  });
}

export function rollCurseCheck(): void {
  const state = getState();
  if (!state) return;

  let r = roll();
  addLogEntry(`Curse Check Roll: ${r}`);

  // Cursed mode: always cursed
  if (state.mode === 'cursed') {
    r = 71;
    addLogEntry('Cursed Mode: Forcing curse');
  }

  // Casual mode: ignore first curse
  if (state.mode === 'casual' && !state.casualFirstCurseIgnored && r >= 71) {
    updateState({ casualFirstCurseIgnored: true });
    addLogEntry('Casual Mode: First curse ignored');
    r = 1;
  }

  if (r <= 70) {
    addLogEntry('No Curse');
    updateState({ phase: 'mutation' });
  } else if (r <= 98) {
    rollTargetCurse();
  } else {
    rollMixCurse();
  }
}

function rollTargetCurse(): void {
  const state = getState();
  if (!state) return;

  const curseRoll = roll();
  const entry = getTargetCurseEntry(curseRoll);

  const curse: Curse = { type: 'Target Curse', roll: curseRoll, effect: entry.text };
  addLogEntry(`Target Curse Roll: ${curseRoll} → ${entry.text}`);
  updateState({ currentCurse: curse, phase: 'curse-result' });
}

function rollMixCurse(): void {
  const state = getState();
  if (!state) return;

  let curseRoll = roll();
  let entry = getMixCurseEntry(curseRoll);

  // Re-roll "last room" if room 1 or 2
  if (entry.mechanics?.isLastRoom && state.room <= 2) {
    curseRoll = roll();
    entry = getMixCurseEntry(curseRoll);
    addLogEntry('Re-rolling Mix Curse (Room 1/2)');
  }

  const curse: Curse = { type: 'Mix Curse', roll: curseRoll, effect: entry.text };
  addLogEntry(`Mix Curse Roll: ${curseRoll} → ${entry.text}`);

  updateState({
    currentCurse: curse,
    phase: 'curse-result',
    isLastRoom: entry.mechanics?.isLastRoom ? true : state.isLastRoom,
  });
}

export function acceptCurse(): void {
  const state = getState();
  if (!state?.currentCurse) return;

  // Find the curse entry to check mechanics
  const curseEntry = state.currentCurse.type === 'Target Curse'
    ? getTargetCurseEntry(state.currentCurse.roll)
    : getMixCurseEntry(state.currentCurse.roll);

  const curses = [...state.curses, state.currentCurse];
  let tracks = [...state.tracks];
  let currentTrack = state.currentTrack ? { ...state.currentTrack } : null;
  let forcedRooms = state.forcedRooms;

  if (state.currentCurse.type === 'Target Curse') {
    const targetEntry = curseEntry as TargetCurseEntry;
    
    if (state.roomLockTrack !== null && tracks.length > 0) {
      addLogEntry('Room Lock prevented curse on protected track');
    } else if (tracks.length > 0) {
      const targetIdx = tracks.length - 1;
      tracks[targetIdx] = {
        ...tracks[targetIdx],
        curses: [...tracks[targetIdx].curses, state.currentCurse.effect],
        deleted: targetEntry.mechanics?.deleteTrack ? true : tracks[targetIdx].deleted,
      };
    }
    if (currentTrack) {
      currentTrack.curses = [...currentTrack.curses, state.currentCurse.effect];
    }
    
    if (targetEntry.mechanics?.forceRoom) {
      forcedRooms++;
    }
  } else {
    const mixEntry = curseEntry as MixCurseEntry;
    if (mixEntry.mechanics?.rollTargetCurses) {
      // TODO: Handle rolling multiple target curses
      addLogEntry(`Rolling ${mixEntry.mechanics.rollTargetCurses} Target Curses`);
    }
  }

  updateState({
    curses,
    tracks,
    currentTrack,
    forcedRooms,
    currentCurse: null,
    phase: 'mutation',
  });
}

function rollSingleMutation(mode: string, room: number): string {
  const r = roll();
  let entry = getMutationEntry(r);

  // Casual mode: re-roll 90-100
  if (mode === 'casual' && r >= 90) {
    const newRoll = roll(89);
    entry = getMutationEntry(newRoll);
    addLogEntry('Casual Mode: Re-rolling high mutation');
  }

  // Hard mode: re-roll no-effect mutations
  if (mode === 'hard' && entry.mechanics?.noEffect) {
    const newRoll = roll();
    entry = getMutationEntry(newRoll);
    addLogEntry('Hard Mode: Re-rolling no-effect mutation');
  }

  // Handle room one rules
  if (entry.mechanics?.roomOneRule && room === 1) {
    if (entry.mechanics.roomOneRule === 'reroll') {
      addLogEntry('Room 1: Re-rolling mutation');
      return rollSingleMutation(mode, room);
    }
    if (entry.mechanics.roomOneRule === 'no-mutation') {
      addLogEntry('Room 1: No mutation');
      return 'No Mutation.';
    }
  }

  // Recursive handling of "Roll twice"
  if (entry.mechanics?.rollTwice) {
    addLogEntry('Rolling twice for mutations');
    const effect1 = rollSingleMutation(mode, room);
    const effect2 = rollSingleMutation(mode, room);
    return `[${effect1}] AND [${effect2}]`;
  }

  // Handle "Take Curse Instead"
  if (entry.mechanics?.takeCurseInstead) {
    addLogEntry('Mutation: Taking a Target Curse instead');
    // This will be handled in the UI by transitioning to curse
  }

  addLogEntry(`Mutation Roll: ${r} → ${entry.text}`);
  return entry.text;
}

export function rollMutation(): void {
  const state = getState();
  if (!state) return;

  const effect = rollSingleMutation(state.mode, state.room);
  const mutation: Mutation = { roll: 0, effect };
  
  updateState({
    currentMutation: mutation,
    mutations: [...state.mutations, mutation],
    phase: 'mutation-result',
  });
}

export function acceptMutation(): void {
  const state = getState();
  if (!state?.currentMutation || !state.currentTrack) return;

  const currentTrack = { ...state.currentTrack };
  
  // Check if this is a no-effect mutation
  const isNoEffect = state.currentMutation.effect === 'No Mutation.' || 
                     state.currentMutation.effect.startsWith('No Mutation');
  
  if (!isNoEffect) {
    currentTrack.mutation = state.currentMutation.effect;
  }

  updateState({
    currentTrack,
    currentMutation: null,
    phase: 'compose',
  });
}

export function finalizeRoom(): void {
  const state = getState();
  if (!state?.currentTrack) return;

  addLogEntry(`Track finalized: ${state.currentTrack.type}`);
  
  updateState({
    tracks: [...state.tracks, state.currentTrack],
    phase: state.usedPowerUpThisRoom ? 'next-room' : 'powerup-roll',
  });
}

export function rollPowerUp(): void {
  const state = getState();
  if (!state) return;

  const r = roll();
  addLogEntry(`Power-Up Roll: ${r}`);

  let powerUps = state.powerUps;
  if (r >= 98) {
    powerUps += 2;
    addLogEntry('Gained 2 Power-Ups!');
  } else if (r >= 76) {
    powerUps += 1;
    addLogEntry('Gained 1 Power-Up');
  } else {
    addLogEntry('No Power-Up gained');
  }

  updateState({ powerUps, phase: 'next-room' });
}

export function nextRoom(): void {
  const state = getState();
  if (!state) return;

  updateState({
    room: state.room + 1,
    phase: 'track-type',
    usedPowerUpThisRoom: false,
    currentTrack: null,
    currentMutation: null,
    currentCurse: null,
  });
}

export function usePowerUp(type: string): void {
  const state = getState();
  if (!state || state.powerUps <= 0 || state.usedPowerUpThisRoom) return;

  const updates: Partial<typeof state> = {
    powerUps: state.powerUps - 1,
    usedPowerUpThisRoom: true,
  };

  switch (type) {
    case 'redirect':
      addLogEntry('Power-Up: Curse Redirect - Re-rolling curse target');
      updates.currentCurse = null;
      updates.phase = 'curse-check';
      break;
    case 'lock':
      if (!state.usedRoomLock && state.tracks.length > 0) {
        updates.roomLockTrack = state.tracks.length - 1;
        updates.usedRoomLock = true;
        addLogEntry(`Power-Up: Room Lock - Protected track ${state.tracks.length}`);
      }
      break;
    case 'painshift':
      addLogEntry('Power-Up: Pain Shift - No mutation, guaranteed curse');
      updates.currentMutation = { roll: 0, effect: 'No Mutation (Pain Shift)' };
      updates.phase = 'mutation-result';
      break;
    case 'split':
      addLogEntry('Power-Up: Split the Wound - Curse applied at half strength');
      break;
    case 'breath':
      if (!state.usedOneLastBreath) {
        updates.usedOneLastBreath = true;
        updates.curses = state.curses.slice(0, -1);
        updates.forcedRooms = state.forcedRooms + 1;
        updates.isLastRoom = true;
        addLogEntry('Power-Up: One Last Breath - Reversing last curse, forcing final room');
      }
      break;
  }

  updateState(updates);
}
