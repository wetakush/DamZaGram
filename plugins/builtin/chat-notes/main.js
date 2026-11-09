export function open(chat = dzg.chats.current()) {
  const self = dzg.users.self()?.id;
  if (!self || !chat) return dzg.ui.toast('Откройте чат');
  const key = 'note:' + self + ':' + chat.id;
  const panel = dzg.ui.panel({ title: 'Заметки · ' + chat.name });
  panel.clear();
  panel.addLabel('Личная заметка. Сохраняется кнопкой, в чат не отправляется.');
  const input = panel.addInput({ multiline: true, value: String(dzg.storage.get(key, '')), placeholder: 'Заметка к этому чату' });
  if (!input) return dzg.ui.toast('Не удалось открыть редактор заметки');
  panel.addButton('Сохранить заметку', () => {
    const text = input.text();
    if (text.length > 32000) return dzg.ui.toast('Максимум 32 000 символов');
    dzg.storage.set(key, text);
    dzg.ui.toast('Заметка сохранена');
  }, { icon: 'check' });
  panel.addButton('Скопировать', () => dzg.clipboard.set(input.text()), { icon: 'copy' });
}
dzg.ui.addChatMenuItem({ title: 'Личная заметка', onClick: open });
dzg.ui.addTopBarButton({ icon: 'edit', tooltip: 'Заметка чата', onClick: open });
dzg.commands.register('notes', { description: 'Личная заметка чата', run: ctx => open(ctx.chat) });
