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

export function getMutation(rollValue: number): string {
  return getMutationEntry(rollValue).text;
}

export function rollTrackType(): void {
  const state = getState();
  if (!state) return;

  const r = roll();
  const type = getFromTable(r, TRACK_TYPES);
  
  addLogEntry(`Track Type Roll: ${r} → ${type}`);
  
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
  
  const nextPhase = state.room === 1 ? 'mutation' : 'curse-check';
  if (state.room === 1) {
    addLogEntry('Room 1: Skipping curse check');
  }
  
  updateState({
    currentTrack: createTrack(state.room, type),
    phase: nextPhase,
  });
}

export function reselectTrackType(newType: string): void {
  const state = getState();
  if (!state?.currentTrack) return;

  const originalType = state.currentTrack.type;
  addLogEntry(`Track Type changed: ${originalType} → ${newType}`);
  
  updateState({
    currentTrack: {
      ...state.currentTrack,
      originalType,
      type: newType,
    },
    pendingTrackTypeReselect: false,
    phase: 'compose',
  });
}

export function rollCurseCheck(): void {
  const state = getState();
  if (!state) return;

  let r = roll();
  addLogEntry(`Curse Check Roll: ${r}`);

  if (state.mode === 'cursed') {
    r = 71;
    addLogEntry('Cursed Mode: Forcing curse');
  }

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

  if (entry.mechanics?.minRoom && state.room < entry.mechanics.minRoom) {
    addLogEntry(`Re-rolling Mix Curse (requires Room ${entry.mechanics.minRoom}+)`);
    curseRoll = roll();
    entry = getMixCurseEntry(curseRoll);
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

  const curseEntry = state.currentCurse.type === 'Target Curse'
    ? getTargetCurseEntry(state.currentCurse.roll)
    : getMixCurseEntry(state.currentCurse.roll);

  const curses = [...state.curses, state.currentCurse];
  let tracks = [...state.tracks];
  let currentTrack = state.currentTrack ? { ...state.currentTrack } : null;
  let forcedRooms = state.forcedRooms;
  let doubleMutationNextRoom = state.doubleMutationNextRoom;
  let curseTargetTrackIndex = state.curseTargetTrackIndex;

  if (state.currentCurse.type === 'Target Curse') {
    const targetEntry = curseEntry as TargetCurseEntry;
    
    let targetIdx = curseTargetTrackIndex !== null 
      ? curseTargetTrackIndex 
      : (tracks.length > 0 ? tracks.length - 1 : -1);
    
    if (state.roomLockTrack !== null && targetIdx === state.roomLockTrack) {
      addLogEntry('Room Lock prevented curse on protected track');
    } else if (targetIdx >= 0) {
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
      addLogEntry('Forced Room added');
    }
    
    if (targetEntry.mechanics?.forceRoomChance) {
      const chanceRoll = roll();
      if (chanceRoll > (100 - targetEntry.mechanics.forceRoomChance)) {
        forcedRooms++;
        addLogEntry(`Force Room chance: ${chanceRoll} - Forced Room added`);
      } else {
        addLogEntry(`Force Room chance: ${chanceRoll} - No forced room`);
      }
    }
    
    if (targetEntry.mechanics?.doubleMutationNextRoom) {
      doubleMutationNextRoom = true;
      addLogEntry('Next room will have two mutations');
    }
    
    if (targetEntry.mechanics?.becomesCurseTarget && targetIdx >= 0) {
      curseTargetTrackIndex = targetIdx;
      addLogEntry(`Track ${targetIdx + 1} is now the target of all future curses`);
    }
  } else {
    const mixEntry = curseEntry as MixCurseEntry;
    if (mixEntry.mechanics?.rollTargetCurses) {
      addLogEntry(`Rolling ${mixEntry.mechanics.rollTargetCurses} Target Curses`);
    }
  }

  updateState({
    curses,
    tracks,
    currentTrack,
    forcedRooms,
    doubleMutationNextRoom,
    curseTargetTrackIndex,
    currentCurse: null,
    phase: 'mutation',
  });
}

interface MutationRollResult {
  roll: number;
  effect: string;
}

function rollSingleMutation(mode: string, room: number, isSecondMutation = false): MutationRollResult {
  const state = getState();
  let r = roll();
  let entry = getMutationEntry(r);

  if (mode === 'casual' && r >= 90) {
    r = roll(89);
    entry = getMutationEntry(r);
    addLogEntry('Casual Mode: Re-rolling high mutation');
  }

  if (mode === 'hard' && entry.mechanics?.noEffect) {
    r = roll();
    entry = getMutationEntry(r);
    addLogEntry('Hard Mode: Re-rolling no-effect mutation');
  }

  if (entry.mechanics?.roomOneRule && room === 1) {
    if (entry.mechanics.roomOneRule === 'reroll') {
      addLogEntry('Room 1: Re-rolling mutation');
      return rollSingleMutation(mode, room, isSecondMutation);
    }
    if (entry.mechanics.roomOneRule === 'no-mutation') {
      addLogEntry('Room 1: No mutation');
      return { roll: r, effect: 'No Mutation.' };
    }
  }

  if (entry.mechanics?.rollTwice) {
    addLogEntry('Rolling twice for mutations');
    const result1 = rollSingleMutation(mode, room, false);
    const result2 = rollSingleMutation(mode, room, true);
    return { roll: r, effect: `[${result1.effect}] AND [${result2.effect}]` };
  }

  if (entry.mechanics?.copyPreviousTrackType && state) {
    if (state.tracks.length > 0) {
      const previousTrack = state.tracks[state.tracks.length - 1];
      addLogEntry(`Track type changes to: ${previousTrack.type}`);
    }
  }

  if (entry.mechanics?.repeatLastMutation && state) {
    if (state.tracks.length > 0) {
      const previousTrack = state.tracks[state.tracks.length - 1];
      if (previousTrack.mutations.length > 0) {
        const lastMutation = previousTrack.mutations[previousTrack.mutations.length - 1];
        addLogEntry(`Repeating last mutation: ${lastMutation}`);
        return { roll: r, effect: lastMutation };
      }
    }
    addLogEntry('No previous mutation to repeat');
    return { roll: r, effect: 'No Mutation.' };
  }

  if (entry.mechanics?.deleteIfHighRoll) {
    const deleteRoll = roll();
    addLogEntry(`Delete check roll: ${deleteRoll} (need ${entry.mechanics.deleteIfHighRoll}+)`);
    if (deleteRoll >= entry.mechanics.deleteIfHighRoll) {
      addLogEntry('Track will be deleted!');
    }
  }

  addLogEntry(`Mutation Roll: ${r} → ${entry.text}`);
  return { roll: r, effect: entry.text };
}

export function rollMutation(): void {
  const state = getState();
  if (!state) return;

  const needsDoubleMutation = state.doubleMutationNextRoom;
  
  let result: MutationRollResult;
  if (needsDoubleMutation) {
    addLogEntry('Double mutation room!');
    const result1 = rollSingleMutation(state.mode, state.room, false);
    const result2 = rollSingleMutation(state.mode, state.room, true);
    result = { roll: result1.roll, effect: `[${result1.effect}] AND [${result2.effect}]` };
  } else {
    result = rollSingleMutation(state.mode, state.room);
  }
  
  const mutation: Mutation = { roll: result.roll, effect: result.effect };
  
  updateState({
    currentMutation: mutation,
    mutations: [...state.mutations, mutation],
    phase: 'mutation-result',
    doubleMutationNextRoom: false,
  });
}

export function acceptMutation(): void {
  const state = getState();
  if (!state?.currentMutation || !state.currentTrack) return;

  let currentTrack = { ...state.currentTrack };
  let phase: typeof state.phase = 'compose';
  let timerEndTime: number | null = null;
  let pendingTrackTypeReselect = false;

  const isNoEffect = state.currentMutation.effect === 'No Mutation.' || 
                     state.currentMutation.effect.startsWith('No Mutation');
  
  if (!isNoEffect) {
    const mutationText = state.currentMutation.effect;
    currentTrack.mutations = [...currentTrack.mutations, mutationText];
    
    for (const key of Object.keys(MUTATIONS)) {
      const entry = MUTATIONS[Number(key)];
      if (mutationText.includes(entry.text)) {
        if (entry.mechanics?.abandonTrackType) {
          pendingTrackTypeReselect = true;
          phase = 'track-type-reselect';
          addLogEntry('Must select a new track type');
        }
        
        if (entry.mechanics?.copyPreviousTrackType && state.tracks.length > 0) {
          const previousTrack = state.tracks[state.tracks.length - 1];
          currentTrack.originalType = currentTrack.type;
          currentTrack.type = previousTrack.type;
          addLogEntry(`Track type changed to: ${previousTrack.type}`);
        }
        
        if (entry.mechanics?.timerMinutes) {
          timerEndTime = Date.now() + entry.mechanics.timerMinutes * 60 * 1000;
          addLogEntry(`Timer started: ${entry.mechanics.timerMinutes} minutes`);
        }
        
        break;
      }
    }
  }

  updateState({
    currentTrack,
    currentMutation: null,
    phase,
    timerEndTime,
    pendingTrackTypeReselect,
  });
}

export function finalizeRoom(): void {
  const state = getState();
  if (!state?.currentTrack) return;

  addLogEntry(`Track finalized: ${state.currentTrack.type}`);
  
  updateState({
    tracks: [...state.tracks, state.currentTrack],
    phase: state.usedPowerUpThisRoom ? 'next-room' : 'powerup-roll',
    timerEndTime: null,
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
    timerEndTime: null,
    pendingTrackTypeReselect: false,
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
