const account = () => dzg.users.self()?.id;
const key = id => 'reminders:' + id;
export function entries(id = account()) {
  const value = dzg.storage.get(key(id), []);
  return Array.isArray(value) ? value.filter(x => x && typeof x.text === 'string' && Number.isFinite(x.due) && typeof x.id === 'string') : [];
}
export function add(id, text, minutes, now = Date.now()) {
  if (!id || !text.trim() || !Number.isFinite(minutes) || minutes < 1 || minutes > 525600) return false;
  const list = entries(id);
  if (list.length >= 100) return false;
  list.push({ id: now + ':' + Math.random().toString(36).slice(2), text: text.trim().slice(0, 4000), due: now + minutes * 60000 });
  dzg.storage.set(key(id), list);
  return true;
}
export function check(now = Date.now()) {
  const id = account();
  if (!id) return;
  const list = entries(id);
  const due = list.filter(x => !x.done && x.due <= now);
  if (!due.length) return;
  for (const item of due) item.done = true;
  dzg.storage.set(key(id), list);
  for (const item of due) dzg.ui.notify({ title: 'Напоминание', text: item.text, onClick: open });
}
export function open() {
  const id = account();
  if (!id) return dzg.ui.toast('Войдите в аккаунт');
  const panel = dzg.ui.panel({ title: 'Напоминания' });
  const render = () => {
    panel.clear();
    panel.addLabel('Уведомления приходят, пока клиент открыт и аккаунт активен. Пропущенные появятся после возвращения.');
    panel.addButton('Новое напоминание', async () => {
      const text = await dzg.ui.prompt('О чём напомнить?', { multiline: true });
      if (!text?.trim()) return;
      const minutes = await dzg.ui.prompt('Через сколько минут?', { value: '30' });
      if (minutes === null) return;
      if (!add(id, text, Number(minutes))) dzg.ui.toast('Введите от 1 до 525600 минут. Максимум 100 напоминаний.');
      if (panel.isOpen()) render();
    }, { icon: 'plus' });
    for (const item of entries(id).sort((a, b) => a.due - b.due)) {
      panel.addLabel((item.done ? 'Доставлено · ' : '') + new Date(item.due).toLocaleString() + '\n' + item.text);
      panel.addButton('Удалить напоминание', () => {
        dzg.storage.set(key(id), entries(id).filter(x => x.id !== item.id));
        render();
      }, { icon: 'delete' });
    }
  };
  render();
}
setInterval(check, 15000);
dzg.on('ready', () => check());
dzg.on('session.ready', () => check());
dzg.ui.addMainMenuItem({ title: 'Напоминания', icon: 'bell', onClick: open });
dzg.commands.register('reminders', { description: 'Локальные напоминания', run: open });
