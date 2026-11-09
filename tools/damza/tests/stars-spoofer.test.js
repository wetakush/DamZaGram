// tools/damza/sandbox.py plugins/examples/stars-spoofer/main.js tools/damza/tests/stars-spoofer.test.js
const { eq, assert } = sandbox;

sandbox.native.setSetting = (key, value) => { sandbox.settings[key] = value; };
sandbox.native.wallet_get = () => ({ stars: 0, ton: 0, starsLoaded: true, tonLoaded: true });

eq(sandbox.last('wallet_forceStarsBalance').args, [true]);
eq(sandbox.last('wallet_spoofStarsForms').args, [true]);

sandbox.event('session.ready', {});
eq(sandbox.last('wallet_setLocal').args, [{ stars: 999999 }]);

sandbox.settings.stars = 500;
sandbox.settings.spoofPayments = false;
sandbox.event('settings.changed', { key: 'spoofPayments', value: false });
eq(sandbox.last('wallet_setLocal').args, [{ stars: 500 }]);
eq(sandbox.last('wallet_spoofStarsForms').args, [false]);
eq(sandbox.last('wallet_forceStarsBalance').args, [true]);

sandbox.event('gifts.spent', { currency: 'stars', amount: 100 });
eq(sandbox.settings.stars, 500, 'infinite balance ignores local spending');

sandbox.settings.infinite = false;
sandbox.event('settings.changed', { key: 'infinite', value: false });
sandbox.event('gifts.spent', { currency: 'stars', amount: 100 });
eq(sandbox.settings.stars, 400, 'finite balance decreases after local spending');

sandbox.settings.enabled = false;
sandbox.event('settings.changed', { key: 'enabled', value: false });
eq(sandbox.last('wallet_forceStarsBalance').args, [false]);
eq(sandbox.last('wallet_spoofStarsForms').args, [false]);
eq(sandbox.last('wallet_refresh').args, []);

sandbox.event('unload', {});
assert(sandbox.called('wallet_refresh').length >= 2, 'real balance restored');
print('stars-spoofer.test.js: all good');
