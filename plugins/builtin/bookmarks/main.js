const account = () => dzg.users.self()?.id;
const key = (id) => 'bookmarks:' + id;
export function entries(id = account()) {
  const value = dzg.storage.get(key(id), []);
  return Array.isArray(value) ? value.filter(x => x && typeof x.peerId === 'string' && Number.isInteger(x.id)) : [];
}
export function save(message) {
  const id = account();
  if (!id || (message.selfId && message.selfId !== id)) return;
  const list = entries(id).filter(x => x.peerId !== message.peerId || x.id !== message.id);
  list.unshift({ peerId: message.peerId, id: message.id, text: String(message.text || '').slice(0, 4000), name: message.chat?.name || '', date: message.date });
  dzg.storage.set(key(id), list.slice(0, 1000));
  dzg.ui.toast('Закладка сохранена');
}
export function open() {
  const id = account();
  if (!id) return dzg.ui.toast('Войдите в аккаунт');
  const panel = dzg.ui.panel({ title: 'Закладки' });
  const render = (query = '') => {
    panel.clear();
    panel.addInput({ placeholder: 'Поиск · Enter', value: query, onSubmit: render });
    const list = entries(id).filter(x => (x.name + ' ' + x.text).toLowerCase().includes(query.toLowerCase()));
    panel.addLabel(`${list.length} закладок · максимум 1000`);
    for (const item of list.slice(0, 100)) {
      panel.addLabel(item.name + '\n' + (item.text || '[Медиа]'));
      panel.addButton('Открыть сообщение', () => {
        if (account() !== id) return dzg.ui.toast('Переключитесь на исходный аккаунт');
        dzg.chats.open(item.peerId, item.id);
      }, { icon: 'reply' });
      panel.addButton('Удалить закладку', () => {
        dzg.storage.set(key(id), entries(id).filter(x => x.peerId !== item.peerId || x.id !== item.id));
        render(query);
      }, { icon: 'delete' });
    }
    if (list.length > 100) panel.addLabel('Уточните поиск для остальных результатов');
  };
  render();
}
dzg.ui.addMessageMenuItem({ title: 'В локальные закладки', onClick: save });
dzg.ui.addMainMenuItem({ title: 'Закладки', icon: 'saved', onClick: open });
dzg.commands.register('bookmarks', { description: 'Локальные закладки', run: open });
