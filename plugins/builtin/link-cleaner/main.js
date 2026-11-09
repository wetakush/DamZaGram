export function clean(text) {
  return text.replace(/https?:\/\/[^\s<>"']+/gi, url => {
    const punctuation = url.match(/[.,!;:)]+$/)?.[0] || '';
    const address = punctuation ? url.slice(0, -punctuation.length) : url;
    const hash = address.indexOf('#');
    const suffix = hash < 0 ? '' : address.slice(hash);
    const base = hash < 0 ? address : address.slice(0, hash);
    const q = base.indexOf('?');
    if (q < 0) return url;
    const parts = base.slice(q + 1).split('&');
    const kept = parts.filter(part => {
      let name = part.split('=')[0];
      try { name = decodeURIComponent(name); } catch (_) { return true; }
      return !/^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid)$/i.test(name);
    });
    return base.slice(0, q) + (kept.length ? '?' + kept.join('&') : '') + suffix + punctuation;
  });
}
export function run() {
  const current = dzg.ui.compose.get();
  if (!current) return dzg.ui.toast('Откройте поле ввода');
  const text = clean(current.text);
  if (text === current.text) return dzg.ui.toast('Рекламных меток не найдено');
  dzg.ui.compose.set(text);
  dzg.ui.toast('Ссылки в черновике очищены');
}
dzg.ui.compose.addButton({ icon: 'link', tooltip: 'Убрать рекламные метки', onClick: run });
dzg.ui.addMessageMenuItem({ title: 'Скопировать без рекламных меток', when: m => /https?:\/\//i.test(m.text), onClick: m => { dzg.clipboard.set(clean(m.text)); dzg.ui.toast('Скопировано'); } });
dzg.commands.register('cleanlinks', { description: 'Очистить ссылки в черновике', run });
