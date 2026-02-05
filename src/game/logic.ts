import type { RangeTable, Curse, Mutation } from './types';
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

function getFromRecord(rollValue: number, record: Record<number, string>, fallback: string): string {
  const keys = Object.keys(record).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < keys.length; i++) {
    const nextKey = keys[i + 1] || 101;
    if (rollValue >= keys[i] && rollValue < nextKey) {
      return record[keys[i]];
    }
  }
  return fallback;
}

export function getMutation(rollValue: number): string {
  return getFromRecord(rollValue, MUTATIONS, 'No Mutation.');
}

export function getTargetCurse(rollValue: number): string {
  return getFromRecord(rollValue, TARGET_CURSES, TARGET_CURSES[97]);
}

export function getMixCurse(rollValue: number): string {
  return getFromRecord(rollValue, MIX_CURSES, MIX_CURSES[92]);
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
  let effect = getTargetCurse(curseRoll);

  // Hard mode: re-roll no-effect curses
  if (state.mode === 'hard' && effect.includes('ignore')) {
    const reroll = roll();
    effect = getTargetCurse(reroll);
    addLogEntry(`Hard Mode re-roll: ${reroll}`);
  }

  const curse: Curse = { type: 'Target Curse', roll: curseRoll, effect };
  addLogEntry(`Target Curse Roll: ${curseRoll} → ${effect}`);
  updateState({ currentCurse: curse, phase: 'curse-result' });
}

function rollMixCurse(): void {
  const state = getState();
  if (!state) return;

  let curseRoll = roll();
  let effect = getMixCurse(curseRoll);

  // Re-roll "last room" if room 1 or 2
  if (effect.includes('last Room') && state.room <= 2) {
    curseRoll = roll();
    effect = getMixCurse(curseRoll);
    addLogEntry('Re-rolling Mix Curse (Room 1/2)');
  }

  const curse: Curse = { type: 'Mix Curse', roll: curseRoll, effect };
  addLogEntry(`Mix Curse Roll: ${curseRoll} → ${effect}`);

  updateState({
    currentCurse: curse,
    phase: 'curse-result',
    isLastRoom: effect.includes('last Room') ? true : state.isLastRoom,
  });
}

export function acceptCurse(): void {
  const state = getState();
  if (!state?.currentCurse) return;

  const curses = [...state.curses, state.currentCurse];
  let tracks = [...state.tracks];
  let currentTrack = state.currentTrack ? { ...state.currentTrack } : null;
  let forcedRooms = state.forcedRooms;

  if (state.currentCurse.type === 'Target Curse') {
    if (state.roomLockTrack !== null && tracks.length > 0) {
      addLogEntry('Room Lock prevented curse on protected track');
    } else if (tracks.length > 0) {
      const targetIdx = tracks.length - 1;
      tracks[targetIdx] = {
        ...tracks[targetIdx],
        curses: [...tracks[targetIdx].curses, state.currentCurse.effect],
        deleted: state.currentCurse.effect.includes('Delete Track') ? true : tracks[targetIdx].deleted,
      };
    }
    if (currentTrack) {
      currentTrack.curses = [...currentTrack.curses, state.currentCurse.effect];
    }
  }

  if (state.currentCurse.effect.includes('Force a Room') || 
      state.currentCurse.effect.includes('force another Room')) {
    forcedRooms++;
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

export function rollMutation(): void {
  const state = getState();
  if (!state) return;

  let r = roll();
  let effect = getMutation(r);

  // Casual mode: re-roll 90-100
  if (state.mode === 'casual' && r >= 90) {
    r = roll(89);
    effect = getMutation(r);
    addLogEntry('Casual Mode: Re-rolling high mutation');
  }

  // Hard mode: re-roll no-effect mutations
  if (state.mode === 'hard' && effect.includes('No Mutation')) {
    r = roll();
    effect = getMutation(r);
    addLogEntry('Hard Mode: Re-rolling no-effect mutation');
  }

  // Handle special mutations
  if (effect.includes('Room One') && state.room === 1) {
    effect = 'No Mutation.';
  }

  if (effect.includes('Roll twice')) {
    const r2 = roll();
    const effect2 = getMutation(r2);
    effect = `${effect} (${r}: ${getMutation(r)}) AND (${r2}: ${effect2})`;
  }

  const mutation: Mutation = { roll: r, effect };
  addLogEntry(`Mutation Roll: ${r} → ${effect}`);
  
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
  if (!state.currentMutation.effect.includes('No Mutation')) {
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
