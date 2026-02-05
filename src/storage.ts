import type { GameState } from './game/types';
import { getState, setState } from './game/state';

const STORAGE_KEY = 'superbeatmaker';

export function save(): void {
  const state = getState();
  if (state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

export function load(): GameState | null {
  const data = localStorage.getItem(STORAGE_KEY);
  if (data) {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  return null;
}

export function clear(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasSavedGame(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

export function exportState(): void {
  const state = getState();
  if (!state) return;

  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `superbeatmaker-run-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importState(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const state = JSON.parse(e.target?.result as string);
        setState(state);
        save();
        resolve();
      } catch {
        reject(new Error('Invalid file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
