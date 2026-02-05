import type { GameMode } from './game/types';
import { setState, createInitialState, getState, addLogEntry } from './game/state';
import { roll, getFromTable, getMutation } from './game/logic';
import { TRACK_TYPES } from './game/data';
import { load, hasSavedGame, importState, save } from './storage';
import { $, onClick, showScreen, setDisabled } from './ui/dom';
import { render, endRun, setupPowerUpButtons, setupExportButton } from './ui/render';

function startRun(): void {
  const modeSelect = $('mode-select') as HTMLSelectElement;
  const manualCheckbox = $('manual-track-type') as HTMLInputElement;
  
  const mode = modeSelect.value as GameMode;
  const manualTrackType = manualCheckbox.checked;
  
  const state = createInitialState(mode, manualTrackType);
  setState(state);

  // Seeded mode setup
  if (mode === 'seeded') {
    const numRooms = roll(10) || 1;
    const seededRooms = [];
    for (let i = 0; i < numRooms; i++) {
      const typeRoll = roll();
      const mutRoll = roll();
      seededRooms.push({
        type: getFromTable(typeRoll, TRACK_TYPES),
        mutation: getMutation(mutRoll),
      });
    }
    setState({ ...state, seededRooms });
    addLogEntry(`Seeded Run: ${numRooms} rooms pre-rolled`);
  }

  save();
  showScreen('game');
  render();
}

function continueRun(): void {
  const savedState = load();
  if (savedState) {
    setState(savedState);
    showScreen('game');
    render();
  }
}

function handleImport(): void {
  const input = $('import-input') as HTMLInputElement;
  input?.click();
}

async function handleFileSelect(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    try {
      await importState(file);
      showScreen('game');
      render();
    } catch (err) {
      alert('Invalid file');
    }
  }
}

function newRun(): void {
  setState(null);
  showScreen('setup');
}

function init(): void {
  // Setup event listeners
  onClick('start-run', startRun);
  onClick('continue-run', continueRun);
  onClick('import-btn', handleImport);
  onClick('end-run', endRun);
  onClick('new-run', newRun);

  const importInput = $('import-input');
  if (importInput) {
    importInput.addEventListener('change', handleFileSelect);
  }

  setupPowerUpButtons();
  setupExportButton();

  // Check for saved game
  if (hasSavedGame()) {
    setDisabled('continue-run', false);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
