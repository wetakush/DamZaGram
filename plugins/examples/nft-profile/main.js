// NFT Profile — локально вешает NFT-подарки на твой профиль и делает
// накрученные звёзды «юзабельными» (локальная покупка подарка себе).
// Подарки резолвятся по слагу в настоящие объекты, поэтому они живые:
// открываются, со всеми атрибутами и функционалом. Видно только тебе.

const setting = (key, fb) => {
  const v = dzg.settings.get(key);
  return (v === undefined || v === null || v === '') ? fb : v;
};

// Слаг из строки/ссылки: 'xxx', 't.me/nft/xxx', 'https://t.me/nft/xxx?...'.
const toSlug = (s) => String(s || '')
  .trim()
  .replace(/^https?:\/\/[^/]+\//i, '')
  .replace(/.*nft\//i, '')
  .replace(/.*slug=/i, '')
  .split(/[?&/#\s]/)[0]
  .trim();

const configuredSlugs = () => String(setting('gifts', ''))
  .split(/[\n,]+/).map(toSlug).filter(Boolean);

// Привести профиль к списку из настроек: добавить недостающие, убрать лишние.
async function sync() {
  dzg.gifts.localBuy(setting('localBuy', true) !== false);
  const want = configuredSlugs();
  const have = (dzg.gifts.profile.list() || []).map((g) => g.slug).filter(Boolean);
  for (const slug of have) {
    if (!want.includes(slug)) dzg.gifts.profile.remove(slug);
  }
  for (const slug of want) {
    if (!have.includes(slug)) {
      try { await dzg.gifts.profile.add(slug); }
      catch (e) { dzg.ui.toast('NFT не найден: ' + slug, 'NFT Profile'); }
    }
  }
}

function saveSlugs(slugs) {
  dzg.settings.set('gifts', slugs.join('\n'));
}

async function run(ctx, rest) {
  const trigger = setting('trigger', '.нфт');
  const parts = rest.split(/\s+/).filter(Boolean);
  const cmd = (parts[0] || '').toLowerCase();

  if (!rest) {
    const list = (dzg.gifts.profile.list() || []);
    dzg.ui.alert(list.length
      ? 'На профиле: ' + list.map((g) => g.title || g.slug).join(', ')
      : 'Пока пусто. ' + trigger + ' <ссылка на NFT> — повесить подарок.',
      'NFT Profile');
    return;
  }
  if (cmd === 'очистить' || cmd === 'clear') {
    dzg.gifts.profile.clear();
    saveSlugs([]);
    dzg.ui.toast('Профиль очищен', 'NFT Profile');
    return;
  }
  if (cmd === 'убрать' || cmd === 'remove' || cmd === '-') {
    const slug = toSlug(parts.slice(1).join(' '));
    dzg.gifts.profile.remove(slug);
    saveSlugs(configuredSlugs().filter((s) => s !== slug));
    dzg.ui.toast('Убрал: ' + slug, 'NFT Profile');
    return;
  }
  // Иначе — добавить подарок по ссылке/слагу.
  const slug = toSlug(rest);
  if (!slug) { dzg.ui.toast('Не разобрал ссылку', 'NFT Profile'); return; }
  try {
    await dzg.gifts.profile.add(slug);
    const slugs = configuredSlugs();
    if (!slugs.includes(slug)) { slugs.push(slug); saveSlugs(slugs); }
    dzg.ui.toast('Повесил на профиль: ' + slug, 'NFT Profile');
  } catch (e) {
    dzg.ui.toast('NFT не найден: ' + slug, 'NFT Profile');
  }
}

dzg.messages.onBeforeSend((ctx) => {
  const trigger = setting('trigger', '.нфт');
  const text = String(ctx.text || '').trim();
  if (text !== trigger && !text.toLowerCase().startsWith(trigger.toLowerCase() + ' ')) {
    return;
  }
  const rest = text.slice(trigger.length).trim();
  setTimeout(() => run(ctx, rest), 0);
  return { cancel: true };
});

sync();

dzg.on('unload', () => {
  dzg.gifts.localBuy(false);
  dzg.gifts.profile.clear();
});
