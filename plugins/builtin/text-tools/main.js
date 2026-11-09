export function transform(text, mode) {
  switch (mode) {
    case 'upper': return text.toUpperCase();
    case 'lower': return text.toLowerCase();
    case 'spaces': return text.split('\n').map(x => x.trim().replace(/[\t ]+/g, ' ')).join('\n').trim();
    case 'unique': return [...new Set(text.split('\n'))].join('\n');
    case 'sort': return text.split('\n').sort((a, b) => a.localeCompare(b)).join('\n');
    default: return text;
  }
}
export function open() {
  const panel = dzg.ui.panel({ title: 'Инструменты текста' });
  panel.clear();
  const initial = dzg.ui.compose.get();
  if (!initial) {
    panel.addLabel('Откройте поле ввода');
    return;
  }
  const self = dzg.users.self()?.id;
  let previous = initial.text;
  let changed = false;
  panel.addLabel(`${[...initial.text].length} символов · ${initial.text.trim().split(/\s+/).filter(Boolean).length} слов`);
  panel.addLabel('Изменяется текущий черновик. Сообщения не отправляются.');
  const apply = fn => {
    const current = dzg.ui.compose.get();
    if (!current || current.chat?.id !== initial.chat?.id || dzg.users.self()?.id !== self) return dzg.ui.toast('Вернитесь в исходный чат');
    const next = fn(current.text);
    if (next === null) return;
    previous = current.text;
    changed = true;
    dzg.ui.compose.set(next);
  };
  for (const [mode, title] of [['upper', 'ВЕРХНИЙ РЕГИСТР'], ['lower', 'нижний регистр'], ['spaces', 'Убрать лишние пробелы'], ['unique', 'Убрать повторные строки'], ['sort', 'Сортировать строки']]) {
    panel.addButton(title, () => apply(text => transform(text, mode)));
  }
  panel.addButton('Отменить последнее изменение', () => apply(() => changed ? previous : null), { icon: 'restore' });
}
dzg.ui.compose.addButton({ text: 'Aa', tooltip: 'Инструменты текста', onClick: open });
dzg.commands.register('texttools', { description: 'Обработка черновика', run: open });
