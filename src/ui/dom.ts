export function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

export function show(id: string): void {
  $(id)?.classList.remove('hidden');
}

export function hide(id: string): void {
  $(id)?.classList.add('hidden');
}

export function showScreen(name: 'setup' | 'game' | 'end'): void {
  $('setup-screen')?.classList.toggle('hidden', name !== 'setup');
  $('game-screen')?.classList.toggle('hidden', name !== 'game');
  $('end-screen')?.classList.toggle('hidden', name !== 'end');
}

export function onClick(id: string, handler: () => void): void {
  const el = $(id);
  if (el) el.onclick = handler;
}

export function setContent(id: string, html: string): void {
  const el = $(id);
  if (el) el.innerHTML = html;
}

export function setText(id: string, text: string): void {
  const el = $(id);
  if (el) el.textContent = text;
}

export function setDisabled(id: string, disabled: boolean): void {
  const el = $(id) as HTMLButtonElement | null;
  if (el) el.disabled = disabled;
}
