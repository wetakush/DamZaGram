const account = () => dzg.users.self()?.id;
const key = id => 'snippets:' + id;
export function entries(id = account()) {
  const value = dzg.storage.get(key(id), []);
  return Array.isArray(value) ? value.filter(x => x && typeof x.title === 'string' && typeof x.text === 'string') : [];
}
export function open() {
  const id = account();
  if (!id) return dzg.ui.toast('Войдите в аккаунт');
  const panel = dzg.ui.panel({ title: 'Шаблоны ответов' });
  const render = () => {
    panel.clear();
    panel.addLabel('Вставка в черновик без отправки. До 100 шаблонов.');
    panel.addButton('Создать из черновика', async () => {
      const text = dzg.ui.compose.get()?.text;
      if (!text) return dzg.ui.toast('Сначала напишите текст в поле ввода');
      if (text.length > 16000) return dzg.ui.toast('Максимум 16 000 символов');
      const title = await dzg.ui.prompt('Название шаблона');
      if (!title?.trim()) return;
      const list = entries(id);
      if (list.length >= 100) return dzg.ui.toast('Удалите один из 100 шаблонов');
      list.push({ title: title.trim().slice(0, 100), text });
      dzg.storage.set(key(id), list);
      if (panel.isOpen()) render();
    }, { icon: 'plus' });
    entries(id).forEach((item, index) => {
      panel.addButton(item.title, () => {
        if (account() !== id) return dzg.ui.toast('Переключитесь на исходный аккаунт');
        if (!dzg.ui.compose.insert(item.text)) return dzg.ui.toast('Откройте поле ввода');
        dzg.ui.compose.focus();
      }, { icon: 'reply' });
      panel.addButton('Удалить: ' + item.title, () => {
        const list = entries(id);
        list.splice(index, 1);
        dzg.storage.set(key(id), list);
        render();
      }, { icon: 'delete' });
    });
  };
  render();
}
dzg.ui.compose.addButton({ icon: 'reply', tooltip: 'Шаблоны ответов', onClick: open });
dzg.commands.register('snippets', { description: 'Шаблоны ответов', run: open });
