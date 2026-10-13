const KEY = 'pos.sessionLocked';
let locked = false;
let generation = 0;
export function sessionVersion() {
  try {
    return `${generation}:${localStorage.getItem('pos.sessionVersion') ?? ''}`;
  } catch {
    return `${generation}`;
  }
}
function changed() {
  generation++;
  try {
    localStorage.setItem('pos.sessionVersion', crypto.randomUUID());
  } catch {}
  window.dispatchEvent(new Event('pos-session-change'));
}

export function sessionLocked() {
  try {
    return locked || localStorage.getItem(KEY) === '1';
  } catch {
    return true;
  }
}

export function lockSession() {
  locked = true;
  try {
    localStorage.setItem(KEY, '1');
  } catch {}
  changed();
}

/** Called only after the server confirms a fresh authentication. */
export function unlockSession() {
  locked = false;
  try {
    localStorage.removeItem(KEY);
  } catch {}
  changed();
}
