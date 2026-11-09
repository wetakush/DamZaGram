const setting = (key, fallback) => {
  const value = dzg.settings.get(key);
  return value === undefined || value === null ? fallback : value;
};

const enabled = () => !!setting('enabled', true);
const infinite = () => !!setting('infinite', true);
const target = () => Math.max(0, Number(setting('stars', 999999)) || 0);
const same = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-9;

let applying = false;
let watchdog = null;

function syncHooks() {
  const active = enabled();
  dzg.wallet.forceStarsBalance(active);
  dzg.wallet.spoofStarsForms(active && !!setting('spoofPayments', true));
}

function apply() {
  if (!enabled() || applying) return;
  const current = dzg.wallet.get();
  if (!current || same(current.stars, target())) return;
  applying = true;
  try {
    dzg.wallet.setLocal({ stars: target() });
  } finally {
    applying = false;
  }
}

function startWatchdog() {
  if (watchdog === null) {
    watchdog = setInterval(apply, 1500);
  }
}

function stopWatchdog() {
  if (watchdog !== null) {
    clearInterval(watchdog);
    watchdog = null;
  }
}

function activate() {
  syncHooks();
  if (!enabled()) {
    stopWatchdog();
    return;
  }
  apply();
  startWatchdog();
}

dzg.on('ready', activate);
dzg.on('session.ready', activate);
dzg.on('wallet.changed', () => {
  if (enabled()) setTimeout(apply, 0);
});
dzg.on('gifts.spent', (event) => {
  if (!enabled() || infinite() || !event || event.currency !== 'stars') return;
  const spent = Math.max(0, Number(event.amount) || 0);
  dzg.settings.set('stars', Math.max(0, target() - spent));
});
dzg.on('settings.changed', () => {
  activate();
  if (!enabled()) dzg.wallet.refresh();
});
dzg.on('unload', () => {
  stopWatchdog();
  dzg.wallet.forceStarsBalance(false);
  dzg.wallet.spoofStarsForms(false);
  dzg.wallet.refresh();
});

activate();
