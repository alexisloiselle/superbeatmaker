import { getState } from '../game/state';
import { TRACK_TYPES, RUN_TAGS } from '../game/data';
import {
  rollTrackType,
  selectTrackType,
  reselectTrackType,
  rollCurseCheck,
  acceptCurse,
  rollMutation,
  acceptMutation,
  finalizeRoom,
  rollPowerUp,
  nextRoom,
  usePowerUp,
} from '../game/logic';
import { $, setContent, setText, onClick, showScreen } from './dom';
import { save, clear, exportState } from '../storage';

let timerInterval: ReturnType<typeof setInterval> | null = null;

export function render(): void {
  const state = getState();
  if (!state) return;

  setText('room-number', String(state.room));
  setText('current-room', String(state.room));
  setText('powerup-count', String(state.powerUps));
  setText('mode-badge', state.mode.charAt(0).toUpperCase() + state.mode.slice(1));

  renderTracks();
  renderLog();
  renderRoom();
  renderPowerUpPanel();
  renderTimer();
  save();
}

function renderTracks(): void {
  const state = getState();
  if (!state) return;

  const list = $('tracks-list');
  const noTracks = $('no-tracks');
  if (!list || !noTracks) return;

  if (state.tracks.length === 0) {
    list.innerHTML = '';
    noTracks.classList.remove('hidden');
    return;
  }

  noTracks.classList.add('hidden');
  list.innerHTML = state.tracks
    .map(
      (t, i) => `
    <div class="track-item ${t.curses.length ? 'cursed' : ''}${t.deleted ? ' deleted' : ''}">
      <div class="track-header">
        Room ${t.room}: ${t.type}
        ${t.originalType ? `<span class="muted">(was ${t.originalType})</span>` : ''}
        ${t.deleted ? ' [DELETED]' : ''}
      </div>
      <div class="track-effects">
        ${t.mutations.map((m) => `<span class="badge mutation">M: ${m}</span>`).join(' ')}
        ${t.curses.map((c) => `<span class="badge curse">C: ${c}</span>`).join(' ')}
        ${state.roomLockTrack === i ? '<span class="badge powerup">LOCKED</span>' : ''}
        ${state.curseTargetTrackIndex === i ? '<span class="badge curse">CURSE TARGET</span>' : ''}
      </div>
    </div>
  `
    )
    .join('');
}

function renderLog(): void {
  const state = getState();
  if (!state) return;

  setContent(
    'log',
    state.log
      .slice(0, 50)
      .map((l) => `<div class="log-entry"><strong>R${l.room}:</strong> ${l.msg}</div>`)
      .join('')
  );
}

function renderPowerUpPanel(): void {
  const state = getState();
  if (!state) return;

  const panel = $('powerup-panel');
  if (!panel) return;

  const canUse =
    state.powerUps > 0 &&
    !state.usedPowerUpThisRoom &&
    ['curse-check', 'mutation', 'curse-result'].includes(state.phase);

  panel.classList.toggle('hidden', !canUse);

  if (canUse) {
    document.querySelectorAll<HTMLButtonElement>('.powerup-btn').forEach((btn) => {
      const type = btn.dataset.type;
      let disabled = false;

      if (type === 'lock' && state.usedRoomLock) disabled = true;
      if (type === 'painshift' && state.room <= 3) disabled = true;
      if (type === 'breath' && state.usedOneLastBreath) disabled = true;
      if (type === 'redirect' && state.phase !== 'curse-result') disabled = true;
      if (type === 'split' && state.phase !== 'curse-result') disabled = true;

      btn.disabled = disabled;
    });
  }
}

function renderTimer(): void {
  const state = getState();
  if (!state) return;

  const timerEl = $('timer');
  if (!timerEl) return;

  if (state.timerEndTime) {
    timerEl.classList.remove('hidden');
    updateTimerDisplay();
    
    if (timerInterval) clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
      updateTimerDisplay();
    }, 1000);
  } else {
    timerEl.classList.add('hidden');
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }
}

function updateTimerDisplay(): void {
  const state = getState();
  if (!state?.timerEndTime) return;

  const timerEl = $('timer');
  if (!timerEl) return;

  const remaining = Math.max(0, state.timerEndTime - Date.now());
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  
  timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  
  if (remaining <= 0) {
    timerEl.textContent = 'TIME UP!';
    timerEl.classList.add('expired');
  } else if (remaining <= 60000) {
    timerEl.classList.add('warning');
  }
}

function renderRoom(): void {
  const state = getState();
  if (!state) return;

  const content = $('room-content');
  if (!content) return;

  switch (state.phase) {
    case 'track-type':
      if (state.manualTrackType) {
        content.innerHTML = `
          <h3>Select Track Type</h3>
          <select id="track-type-select">
            ${TRACK_TYPES.map(([, , name]) => `<option value="${name}">${name}</option>`).join('')}
          </select>
          <button id="confirm-track-type" style="margin-top: 0.5rem;">Confirm</button>
        `;
        onClick('confirm-track-type', () => {
          const select = $('track-type-select') as HTMLSelectElement;
          selectTrackType(select.value);
          render();
        });
      } else {
        content.innerHTML = `
          <h3>Roll Track Type</h3>
          <button id="roll-track-type">Roll d100</button>
        `;
        onClick('roll-track-type', () => {
          rollTrackType();
          render();
        });
      }
      break;

    case 'track-type-reselect':
      const currentType = state.currentTrack?.type;
      const otherTypes = TRACK_TYPES.filter(([, , name]) => name !== currentType);
      content.innerHTML = `
        <h3>Abandon Track Type</h3>
        <p style="color: var(--muted); margin-bottom: 0.5rem;">
          Original type: <strong>${currentType}</strong><br>
          Select a different type:
        </p>
        <select id="track-type-reselect">
          ${otherTypes.map(([, , name]) => `<option value="${name}">${name}</option>`).join('')}
        </select>
        <button id="confirm-reselect" style="margin-top: 0.5rem;">Confirm New Type</button>
      `;
      onClick('confirm-reselect', () => {
        const select = $('track-type-reselect') as HTMLSelectElement;
        reselectTrackType(select.value);
        render();
      });
      break;

    case 'curse-check':
      content.innerHTML = `
        <h3>Track: ${state.currentTrack?.type}</h3>
        <p>Roll for Curse Check</p>
        <button id="roll-curse-check">Roll d100</button>
      `;
      onClick('roll-curse-check', () => {
        rollCurseCheck();
        render();
      });
      break;

    case 'curse-result':
      content.innerHTML = `
        <div class="roll-result">
          <div class="roll-number">${state.currentCurse?.roll}</div>
          <div class="roll-text">${state.currentCurse?.type}: ${state.currentCurse?.effect}</div>
        </div>
        <button id="accept-curse">Accept Curse</button>
      `;
      onClick('accept-curse', () => {
        acceptCurse();
        render();
      });
      break;

    case 'mutation':
      const doubleMutationWarning = state.doubleMutationNextRoom 
        ? '<p class="badge curse" style="margin-bottom: 0.5rem;">Double Mutation Room!</p>' 
        : '';
      content.innerHTML = `
        <h3>Track: ${state.currentTrack?.type}</h3>
        ${doubleMutationWarning}
        <p>Roll for Mutation</p>
        <button id="roll-mutation">Roll d100</button>
      `;
      onClick('roll-mutation', () => {
        rollMutation();
        render();
      });
      break;

    case 'mutation-result':
      content.innerHTML = `
        <div class="roll-result">
          <div class="roll-number">${state.currentMutation?.roll || '-'}</div>
          <div class="roll-text">${state.currentMutation?.effect}</div>
        </div>
        <button id="accept-mutation">Accept & Compose</button>
      `;
      onClick('accept-mutation', () => {
        acceptMutation();
        render();
      });
      break;

    case 'compose':
      const mutations = state.currentTrack?.mutations || [];
      const mutationDisplay = mutations.length > 0
        ? mutations.map(m => `<p class="badge mutation" style="margin-bottom: 0.25rem;">Mutation: ${m}</p>`).join('')
        : '';
      
      content.innerHTML = `
        <h3>Composing: ${state.currentTrack?.type}</h3>
        ${state.currentTrack?.originalType ? `<p class="muted">Originally: ${state.currentTrack.originalType}</p>` : ''}
        ${mutationDisplay}
        <p style="margin-top: 0.5rem; color: var(--muted);">Create your track following the constraints above.</p>
        <button id="finalize-room" style="margin-top: 0.5rem;">Finalize Room</button>
      `;
      onClick('finalize-room', () => {
        finalizeRoom();
        render();
      });
      break;

    case 'powerup-roll':
      content.innerHTML = `
        <h3>Room Finalized!</h3>
        <p>Roll for Power-Up (didn't use one this room)</p>
        <button id="roll-powerup">Roll d100</button>
      `;
      onClick('roll-powerup', () => {
        rollPowerUp();
        checkEndConditions();
        render();
      });
      break;

    case 'next-room':
      content.innerHTML = `
        <h3>Room ${state.room} Complete</h3>
        <div class="flex" style="margin-top: 0.5rem;">
          <button id="next-room-btn">Next Room</button>
          <button id="end-run-early" class="secondary">End Run</button>
        </div>
      `;
      onClick('next-room-btn', () => {
        nextRoom();
        render();
      });
      onClick('end-run-early', endRun);
      break;
  }
}

function checkEndConditions(): void {
  const state = getState();
  if (!state) return;

  if (state.mode === 'quick' || state.isLastRoom) {
    endRun();
  }
}

export function endRun(): void {
  const state = getState();
  if (!state) return;

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  showScreen('end');

  setContent(
    'run-summary',
    `
    <p><strong>Rooms:</strong> ${state.room}</p>
    <p><strong>Tracks:</strong> ${state.tracks.length}</p>
    <p><strong>Curses:</strong> ${state.curses.length}</p>
    <p><strong>Mode:</strong> ${state.mode}</p>
  `
  );

  setContent(
    'run-tags',
    RUN_TAGS.map(([name, desc]) => `<span class="tag" title="${desc}">${name}</span>`).join('')
  );

  document.querySelectorAll('#run-tags .tag').forEach((tag) => {
    (tag as HTMLElement).style.cursor = 'pointer';
    tag.addEventListener('click', () => tag.classList.toggle('active'));
  });

  clear();
}

export function setupPowerUpButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('.powerup-btn').forEach((btn) => {
    btn.onclick = () => {
      const type = btn.dataset.type;
      if (type) {
        usePowerUp(type);
        render();
      }
    };
  });

  onClick('skip-powerup', () => renderPowerUpPanel());
}

export function setupExportButton(): void {
  onClick('export-btn', exportState);
  onClick('export-final', exportState);
}
