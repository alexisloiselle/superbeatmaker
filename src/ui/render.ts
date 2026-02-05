import { getState } from '../game/state';
import { TRACK_TYPES, RUN_TAGS } from '../game/data';
import {
  rollTrackType,
  selectTrackType,
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
    <div class="track-item ${t.curses.length ? 'cursed' : ''}">
      <div class="track-header">Room ${t.room}: ${t.type}${t.deleted ? ' [DELETED]' : ''}</div>
      <div class="track-effects">
        ${t.mutation ? `<span class="badge mutation">M: ${t.mutation}</span>` : ''}
        ${t.curses.map((c) => `<span class="badge curse">C: ${c}</span>`).join(' ')}
        ${state.roomLockTrack === i ? '<span class="badge powerup">LOCKED</span>' : ''}
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
      content.innerHTML = `
        <h3>Track: ${state.currentTrack?.type}</h3>
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
          <div class="roll-number">${state.currentMutation?.roll}</div>
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
      content.innerHTML = `
        <h3>Composing: ${state.currentTrack?.type}</h3>
        ${state.currentTrack?.mutation ? `<p class="badge mutation">Mutation: ${state.currentTrack.mutation}</p>` : ''}
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
