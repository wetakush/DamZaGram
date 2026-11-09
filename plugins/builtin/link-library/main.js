export function extract(messages) {
  const links = new Map();
  for (const message of messages) {
    const entities = (message.entities || []).filter(e => e.type === 'url');
    const urls = entities.length
      ? entities.map(e => String(message.text || '').slice(e.offset, e.offset + e.length)).filter(url => /^https?:\/\//i.test(url))
      : ((message.text || '').match(/https?:\/\/[^\s<>"']+/gi) || []).map(url => url.replace(/[.,!;:)]+$/, ''));
    for (const entity of message.entities || []) {
      if (entity.url && /^https?:\/\//i.test(entity.url)) urls.push(entity.url);
    }
    for (const url of urls) {
      if (!links.has(url)) links.set(url, { url, id: message.id, text: String(message.text || '').slice(0, 300) });
    }
  }
  return [...links.values()];
}
let generation = 0;
export async function open(chat = dzg.chats.current()) {
  const self = dzg.users.self()?.id;
  if (!chat || !self) return dzg.ui.toast('Откройте чат');
  const token = ++generation;
  const panel = dzg.ui.panel({ title: 'Ссылки · ' + chat.name });
  panel.clear();
  panel.addLabel('Загрузка последних 500 сообщений…');
  panel.on('close', () => { if (token === generation) ++generation; });
  try {
    const messages = [];
    let offsetId = 0;
    while (messages.length < 500) {
      if (token !== generation || dzg.users.self()?.id !== self) return;
      const page = await dzg.messages.history(chat.id, { limit: Math.min(100, 500 - messages.length), offsetId });
      if (token !== generation || dzg.users.self()?.id !== self) return;
      if (!page.length) break;
      messages.push(...page);
      const next = Math.min(...page.map(m => m.id));
      if (next <= 0 || (offsetId && next >= offsetId)) break;
      offsetId = next;
    }
    const links = extract(messages);
    const render = (query = '') => {
      panel.clear();
      panel.addInput({ placeholder: 'Поиск ссылок · Enter', value: query, onSubmit: render });
      const found = links.filter(x => (x.url + ' ' + x.text).toLowerCase().includes(query.toLowerCase()));
      panel.addLabel(`${found.length} ссылок из ${messages.length} сообщений`);
      for (const item of found.slice(0, 100)) {
        panel.addLabel(item.url);
        panel.addButton('Скопировать ссылку', () => dzg.clipboard.set(item.url), { icon: 'copy' });
        panel.addButton('К сообщению', () => {
          if (dzg.users.self()?.id !== self) return dzg.ui.toast('Переключитесь на исходный аккаунт');
          dzg.chats.open(chat.id, item.id);
        }, { icon: 'reply' });
      }
      if (found.length > 100) panel.addLabel('Уточните поиск для остальных результатов');
    };
    render();
  } catch (error) {
    if (token === generation && panel.isOpen()) {
      panel.clear();
      panel.addLabel('Не удалось загрузить ссылки: ' + String(error));
      panel.addButton('Повторить', () => open(chat));
    }
  }
}
dzg.ui.addChatMenuItem({ title: 'Ссылки чата', onClick: open });
dzg.commands.register('links', { description: 'Найти ссылки в чате', run: ctx => open(ctx.chat) });
