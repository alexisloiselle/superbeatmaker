import type { RangeTable, Curse, Mutation, MutationEntry, TargetCurseEntry, MixCurseEntry, CurseTargetMethod } from './types';
import { TRACK_TYPES, MUTATIONS, TARGET_CURSES, MIX_CURSES, CURSE_TARGETS_FIRST, CURSE_TARGETS_SECOND } from './data';
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

function getTargetCurseEntryByEffect(effectText: string): TargetCurseEntry | null {
  for (const key of Object.keys(TARGET_CURSES)) {
    const entry = TARGET_CURSES[Number(key)];
    if (entry.text === effectText) {
      return entry;
    }
  }
  return null;
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

  // One Last Breath final room: guaranteed Target Curse
  if (state.isLastRoom) {
    addLogEntry('One Last Breath: Guaranteed Target Curse');
    rollTargetCurse();
    return;
  }

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

function getAvailableTrackIndices(): number[] {
  const state = getState();
  if (!state) return [];
  
  return state.tracks
    .map((track, idx) => ({ track, idx }))
    .filter(({ track, idx }) => !track.deleted && idx !== state.roomLockTrack)
    .map(({ idx }) => idx);
}

function getCurseTargetMethod(rollValue: number): CurseTargetMethod {
  const result = getFromTable(rollValue, CURSE_TARGETS_FIRST);
  switch (result) {
    case 'Previous Track': return 'previous';
    case 'Oldest Track': return 'oldest';
    case 'Loudest Track': return 'loudest';
    case 'Quietest Track': return 'quietest';
    case "Player's Choice": return 'player-choice';
    case 'Roll again for two Targets': return 'two-targets';
    default: return 'previous';
  }
}

function getSecondRollOffset(rollValue: number): -1 | 0 | 1 {
  const result = getFromTable(rollValue, CURSE_TARGETS_SECOND);
  switch (result) {
    case 'Track Before': return -1;
    case 'That Track': return 0;
    case 'Track After': return 1;
    default: return 0;
  }
}

function applyOffsetToTarget(anchorIndex: number, offset: -1 | 0 | 1): number {
  const state = getState();
  if (!state) return anchorIndex;
  
  const available = getAvailableTrackIndices();
  if (available.length === 0) return anchorIndex;
  
  const targetIndex = anchorIndex + offset;
  
  if (targetIndex < 0 || targetIndex >= state.tracks.length) {
    return anchorIndex;
  }
  
  if (state.tracks[targetIndex].deleted || targetIndex === state.roomLockTrack) {
    return anchorIndex;
  }
  
  return targetIndex;
}

function resolveAutomaticTarget(method: CurseTargetMethod): number | null {
  const state = getState();
  if (!state) return null;
  
  const available = getAvailableTrackIndices();
  if (available.length === 0) return null;
  
  let anchorIndex: number;
  switch (method) {
    case 'previous':
      anchorIndex = available[available.length - 1];
      break;
    case 'oldest':
      anchorIndex = available[0];
      break;
    default:
      return null;
  }
  
  const secondRoll = roll();
  const offset = getSecondRollOffset(secondRoll);
  const offsetLabel = offset === -1 ? 'Track Before' : offset === 1 ? 'Track After' : 'That Track';
  addLogEntry(`Second Roll: ${secondRoll} → ${offsetLabel}`);
  
  return applyOffsetToTarget(anchorIndex, offset);
}

function rollTargetCurse(depth = 0): void {
  const state = getState();
  if (!state) return;

  if (depth > 10) {
    addLogEntry('Max curse depth reached, stopping');
    updateState({ phase: 'mutation' });
    return;
  }

  const curseRoll = roll();
  const entry = getTargetCurseEntry(curseRoll);

  addLogEntry(`Target Curse Roll: ${curseRoll} → ${entry.text}`);

  if (entry.mechanics?.rerollTwice) {
    addLogEntry('Re-rolling twice for two curses');
    rollTargetCurse(depth + 1);
    rollTargetCurse(depth + 1);
    return;
  }

  if (entry.mechanics?.applyLastCurse) {
    if (state.curses.length === 0) {
      addLogEntry('First curse - ignoring apply last curse');
      updateState({ phase: 'mutation' });
      return;
    }
    
    const lastCurse = state.curses[state.curses.length - 1];
    addLogEntry(`Apply last curse: ${lastCurse.effect}`);
    
    const curse: Curse = { type: 'Target Curse', roll: curseRoll, effect: lastCurse.effect };
    updateState({
      currentCurse: curse,
      phase: 'curse-apply-last-select',
      pendingCurseTargets: [],
    });
    return;
  }

  const curse: Curse = { type: 'Target Curse', roll: curseRoll, effect: entry.text };

  const available = getAvailableTrackIndices();
  
  if (available.length === 0) {
    addLogEntry('No available tracks to curse');
    updateState({ currentCurse: curse, phase: 'curse-result', pendingCurseTargets: [] });
    return;
  }

  if (state.curseTargetTrackIndex !== null) {
    const targetIdx = state.curseTargetTrackIndex;
    if (!state.tracks[targetIdx]?.deleted && targetIdx !== state.roomLockTrack) {
      addLogEntry(`Curse Target: Track ${targetIdx + 1} (permanent target)`);
      updateState({ currentCurse: curse, phase: 'curse-result', pendingCurseTargets: [targetIdx] });
      return;
    }
  }

  const targetRoll = roll();
  const method = getCurseTargetMethod(targetRoll);
  addLogEntry(`Curse Target Roll: ${targetRoll} → ${method}`);

  if (method === 'two-targets') {
    addLogEntry('Rolling for two targets');
    const targets: number[] = [];
    
    for (let i = 0; i < 2; i++) {
      const subRoll = roll();
      const subMethod = getCurseTargetMethod(subRoll);
      addLogEntry(`Target ${i + 1} Roll: ${subRoll} → ${subMethod}`);
      
      if (subMethod === 'two-targets') {
        addLogEntry('Nested two-targets, defaulting to previous');
        const fallbackTarget = resolveAutomaticTarget('previous');
        if (fallbackTarget !== null) {
          targets.push(fallbackTarget);
        }
      } else if (subMethod === 'loudest' || subMethod === 'quietest' || subMethod === 'player-choice') {
        updateState({
          currentCurse: curse,
          phase: 'curse-target-select',
          curseTargetMethod: subMethod,
          curseTargetRoll: targetRoll,
          pendingCurseTargets: targets,
        });
        return;
      } else {
        const autoTarget = resolveAutomaticTarget(subMethod);
        if (autoTarget !== null) {
          targets.push(autoTarget);
          addLogEntry(`Target ${i + 1}: Track ${autoTarget + 1}`);
        }
      }
    }
    
    updateState({ currentCurse: curse, phase: 'curse-result', pendingCurseTargets: [...new Set(targets)] });
    return;
  }

  if (method === 'loudest' || method === 'quietest' || method === 'player-choice') {
    updateState({
      currentCurse: curse,
      phase: 'curse-target-select',
      curseTargetMethod: method,
      curseTargetRoll: targetRoll,
      pendingCurseTargets: [],
    });
    return;
  }

  const autoTarget = resolveAutomaticTarget(method);
  if (autoTarget !== null) {
    addLogEntry(`Curse Target: Track ${autoTarget + 1}`);
  }
  
  updateState({
    currentCurse: curse,
    phase: 'curse-result',
    pendingCurseTargets: autoTarget !== null ? [autoTarget] : [],
  });
}

export function selectCurseTarget(trackIndex: number): void {
  const state = getState();
  if (!state?.currentCurse) return;

  let finalTarget = trackIndex;
  
  if (state.curseTargetMethod === 'loudest' || state.curseTargetMethod === 'quietest') {
    const secondRoll = roll();
    const offset = getSecondRollOffset(secondRoll);
    const offsetLabel = offset === -1 ? 'Track Before' : offset === 1 ? 'Track After' : 'That Track';
    addLogEntry(`Second Roll: ${secondRoll} → ${offsetLabel}`);
    finalTarget = applyOffsetToTarget(trackIndex, offset);
  }

  addLogEntry(`Curse Target: Track ${finalTarget + 1}`);
  const targets = [...state.pendingCurseTargets, finalTarget];

  updateState({
    phase: 'curse-result',
    pendingCurseTargets: [...new Set(targets)],
    curseTargetMethod: null,
    curseTargetRoll: null,
  });
}

export function selectApplyLastCurseTarget(trackIndex: number): void {
  const state = getState();
  if (!state?.currentCurse) return;

  addLogEntry(`Applying last curse to Track ${trackIndex + 1}`);

  updateState({
    phase: 'curse-result',
    pendingCurseTargets: [trackIndex],
  });
}

export function selectSplitWoundTarget(trackIndex: number): void {
  const state = getState();
  if (!state?.currentCurse) return;

  addLogEntry(`Split the Wound: Also applying half-strength curse to Track ${trackIndex + 1}`);

  updateState({
    phase: 'curse-result',
    pendingCurseTargets: [...state.pendingCurseTargets, trackIndex],
  });
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

  let curseEntry = state.currentCurse.type === 'Target Curse'
    ? getTargetCurseEntry(state.currentCurse.roll)
    : getMixCurseEntry(state.currentCurse.roll);

  if (state.currentCurse.type === 'Target Curse' && (curseEntry as TargetCurseEntry).mechanics?.applyLastCurse) {
    const originalEntry = getTargetCurseEntryByEffect(state.currentCurse.effect);
    if (originalEntry && !originalEntry.mechanics?.applyLastCurse && !originalEntry.mechanics?.rerollTwice) {
      curseEntry = originalEntry;
    }
  }

  const curses = [...state.curses, state.currentCurse];
  let tracks = [...state.tracks];
  let forcedRooms = state.forcedRooms;
  let doubleMutationNextRoom = state.doubleMutationNextRoom;
  let curseTargetTrackIndex = state.curseTargetTrackIndex;

  if (state.currentCurse.type === 'Target Curse') {
    const targetEntry = curseEntry as TargetCurseEntry;
    const isHalfStrength = state.splitWoundActive;
    const curseText = isHalfStrength 
      ? `${state.currentCurse.effect} (Half Strength)`
      : state.currentCurse.effect;
    
    for (const targetIdx of state.pendingCurseTargets) {
      if (targetIdx >= 0 && targetIdx < tracks.length) {
        // Half strength curses don't delete tracks
        const shouldDelete = targetEntry.mechanics?.deleteTrack && !isHalfStrength;
        
        tracks[targetIdx] = {
          ...tracks[targetIdx],
          curses: [...tracks[targetIdx].curses, curseText],
          deleted: shouldDelete ? true : tracks[targetIdx].deleted,
        };
        addLogEntry(`Curse applied to Track ${targetIdx + 1}${isHalfStrength ? ' (Half Strength)' : ''}`);
        
        if (targetEntry.mechanics?.becomesCurseTarget && !isHalfStrength) {
          curseTargetTrackIndex = targetIdx;
          addLogEntry(`Track ${targetIdx + 1} is now the target of all future curses`);
        }
      }
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
  } else {
    const mixEntry = curseEntry as MixCurseEntry;
    if (mixEntry.mechanics?.rollTargetCurses) {
      addLogEntry(`Rolling ${mixEntry.mechanics.rollTargetCurses} Target Curses`);
      updateState({
        curses,
        tracks,
        forcedRooms,
        doubleMutationNextRoom,
        curseTargetTrackIndex,
        currentCurse: null,
        pendingCurseTargets: [],
        pendingTargetCurseRolls: mixEntry.mechanics.rollTargetCurses,
      });
      rollTargetCurse();
      return;
    }
  }

  const remainingRolls = state.pendingTargetCurseRolls > 0 ? state.pendingTargetCurseRolls - 1 : 0;
  
  let nextPhase: typeof state.phase | undefined;
  if (remainingRolls > 0) {
    nextPhase = undefined;
  } else if (state.painShiftActive) {
    nextPhase = 'compose';
    addLogEntry('Pain Shift: Skipping mutation');
  } else {
    nextPhase = 'mutation';
  }

  updateState({
    curses,
    tracks,
    forcedRooms,
    doubleMutationNextRoom,
    curseTargetTrackIndex,
    currentCurse: null,
    pendingCurseTargets: [],
    pendingTargetCurseRolls: remainingRolls,
    painShiftActive: remainingRolls > 0 ? state.painShiftActive : false,
    splitWoundActive: false,
    ...(nextPhase ? { phase: nextPhase } : {}),
  });

  if (remainingRolls > 0) {
    addLogEntry(`${remainingRolls} Target Curse(s) remaining`);
    rollTargetCurse();
  }
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
      addLogEntry(`Mutation Roll: ${r} → ${entry.text}`);
      addLogEntry('Room 1: Re-rolling mutation');
      return rollSingleMutation(mode, room, isSecondMutation);
    }
    if (entry.mechanics.roomOneRule === 'no-mutation') {
      addLogEntry(`Mutation Roll: ${r} → ${entry.text}`);
      addLogEntry('Room 1: No mutation applies');
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

  if (entry.mechanics?.takeCurseInstead) {
    addLogEntry('Taking a Target Curse instead of mutation');
    return { roll: r, effect: '__TAKE_CURSE_INSTEAD__' };
  }

  if (entry.mechanics?.deleteIfHighRoll) {
    const deleteRoll = roll();
    addLogEntry(`Delete check roll: ${deleteRoll} (need ${entry.mechanics.deleteIfHighRoll}+)`);
    if (deleteRoll >= entry.mechanics.deleteIfHighRoll) {
      addLogEntry('Track will be deleted!');
      return { roll: r, effect: '__DELETE_TRACK__' };
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
  
  if (result.effect === '__TAKE_CURSE_INSTEAD__') {
    updateState({ doubleMutationNextRoom: false });
    rollTargetCurse();
    return;
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

  if (state.currentMutation.effect.includes('__DELETE_TRACK__')) {
    currentTrack.deleted = true;
    addLogEntry('Track marked for deletion');
  }

  const isNoEffect = state.currentMutation.effect === 'No Mutation.' || 
                     state.currentMutation.effect.startsWith('No Mutation') ||
                     state.currentMutation.effect.includes('__DELETE_TRACK__');
  
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

  if (state.powerUpBlockedThisRoom) {
    addLogEntry('Power-Up earning blocked (lost conditional last room)');
    updateState({ phase: 'next-room', powerUpBlockedThisRoom: false });
    return;
  }

  const r = roll();
  addLogEntry(`Power-Up Roll: ${r}`);

  let powerUps = state.powerUps;
  let pendingConditionalPowerUp = false;
  
  if (r >= 98) {
    powerUps += 2;
    addLogEntry('Gained 2 Power-Ups!');
  } else if (r >= 86) {
    powerUps += 1;
    pendingConditionalPowerUp = true;
    addLogEntry('Gained 1 Conditional Power-Up (must use next room or lose it)');
  } else if (r >= 76) {
    powerUps += 1;
    addLogEntry('Gained 1 Power-Up');
  } else {
    addLogEntry('No Power-Up gained');
  }

  updateState({ powerUps, pendingConditionalPowerUp, phase: 'next-room' });
}

export function nextRoom(): void {
  const state = getState();
  if (!state) return;

  let powerUps = state.powerUps;
  let powerUpBlockedThisRoom = false;
  let isLastRoom = state.isLastRoom;
  let oneLastBreathPending = state.oneLastBreathPending;

  // Check if conditional power-up from PREVIOUS room was not used
  if (state.conditionalPowerUp && !state.usedPowerUpThisRoom) {
    powerUps = Math.max(0, powerUps - 1);
    powerUpBlockedThisRoom = true;
    addLogEntry('Conditional Power-Up lost (not used this room)');
  }

  // Convert pending conditional (just earned) to active conditional for next room
  const conditionalPowerUp = state.pendingConditionalPowerUp;

  if (state.oneLastBreathPending) {
    isLastRoom = true;
    oneLastBreathPending = false;
    addLogEntry('One Last Breath: This is the final room (guaranteed Target Curse)');
  }

  updateState({
    room: state.room + 1,
    phase: 'track-type',
    usedPowerUpThisRoom: false,
    currentTrack: null,
    currentMutation: null,
    currentCurse: null,
    timerEndTime: null,
    pendingTrackTypeReselect: false,
    pendingCurseTargets: [],
    curseTargetMethod: null,
    curseTargetRoll: null,
    pendingTargetCurseRolls: 0,
    painShiftActive: false,
    conditionalPowerUp,
    pendingConditionalPowerUp: false,
    powerUps,
    powerUpBlockedThisRoom,
    isLastRoom,
    oneLastBreathPending,
  });
}

export function selectRoomLockTarget(trackIndex: number): void {
  const state = getState();
  if (!state) return;

  addLogEntry(`Room Lock: Track ${trackIndex + 1} is now protected`);
  
  updateState({
    roomLockTrack: trackIndex,
    usedRoomLock: true,
    phase: state.currentCurse ? 'curse-result' : 
           state.currentMutation ? 'mutation-result' : 
           state.currentTrack ? 'compose' : 'track-type',
  });
}

export function usePowerUp(type: string): void {
  const state = getState();
  if (!state || state.powerUps <= 0 || state.usedPowerUpThisRoom) return;

  const updates: Partial<typeof state> = {
    powerUps: state.powerUps - 1,
    usedPowerUpThisRoom: true,
    conditionalPowerUp: false,
  };

  switch (type) {
    case 'redirect':
      addLogEntry('Power-Up: Curse Redirect - Re-rolling curse target');
      updates.currentCurse = null;
      updates.phase = 'curse-check';
      break;
    case 'lock':
      if (!state.usedRoomLock && state.tracks.length > 0) {
        addLogEntry('Power-Up: Room Lock - Select a track to protect');
        updates.phase = 'room-lock-select';
        updateState(updates);
        return;
      }
      break;
    case 'painshift':
      addLogEntry('Power-Up: Pain Shift - No mutation, guaranteed Target Curse');
      updates.painShiftActive = true;
      updateState(updates);
      rollTargetCurse();
      return;
    case 'split':
      if (state.currentCurse?.type === 'Target Curse' && state.pendingCurseTargets.length > 0) {
        const availableTracks = state.tracks
          .map((t, i) => i)
          .filter(i => !state.tracks[i].deleted && i !== state.roomLockTrack && !state.pendingCurseTargets.includes(i));
        
        if (availableTracks.length > 0) {
          addLogEntry('Power-Up: Split the Wound - Select second track for half-strength curse');
          updates.splitWoundActive = true;
          updates.phase = 'split-wound-select';
          updateState(updates);
          return;
        } else {
          addLogEntry('Power-Up: Split the Wound - No other tracks available, curse applied at half strength to original target');
        }
      } else {
        addLogEntry('Power-Up: Split the Wound - Curse applied at half strength');
      }
      break;
    case 'breath':
      if (!state.usedOneLastBreath) {
        updates.usedOneLastBreath = true;
        updates.curses = state.curses.slice(0, -1);
        updates.oneLastBreathPending = true;
        addLogEntry('Power-Up: One Last Breath - Reversing last curse, next room is the final room (Target Cursed)');
      }
      break;
  }

  updateState(updates);
}
