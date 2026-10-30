import type { DeviceApprovalLocale } from './en-US.js';

const ruRU: DeviceApprovalLocale = {
  formFeedback: {
    field: 'Это значение отклонено. Проверьте его и повторите попытку.',
    invalid: 'Проверьте отмеченные поля и повторите попытку.',
    failed:
      'Не удалось сохранить. Введённые данные сохранены. Повторите попытку.',
    network:
      'Нет соединения. Проверьте подключение и повторите попытку. Введённые данные сохранены.',
    denied:
      'С текущими правами доступа отправить эту форму нельзя. Введённые данные сохранены.',
  },
  'deviceApproval.title': 'Подтверждение входа с устройства',
  'deviceApproval.description':
    'Командная строка или другое устройство запрашивает вход от вашего имени. Подтверждайте, только если вы сами начали вход.',
  'deviceApproval.enterCode':
    'Введите код, который показывает ваше устройство.',
  'deviceApproval.codeLabel': 'Код',
  'deviceApproval.continue': 'Продолжить',
  'deviceApproval.checking': 'Проверка кода…',
  'deviceApproval.confirm':
    'Убедитесь, что этот код совпадает с кодом на вашем устройстве.',
  'deviceApproval.client': 'Запрос от {{client}}',
  'deviceApproval.approve': 'Подтвердить',
  'deviceApproval.approving': 'Подтверждение…',
  'deviceApproval.deny': 'Отклонить',
  'deviceApproval.denying': 'Отклонение…',
  'deviceApproval.approved':
    'Устройство подтверждено. Вернитесь в терминал, чтобы продолжить; эту страницу можно закрыть.',
  'deviceApproval.denied':
    'Запрос отклонён. Вход на устройстве не выполнен; эту страницу можно закрыть.',
  'deviceApproval.expired':
    'Срок действия кода истёк. Начните вход на устройстве заново.',
  'deviceApproval.invalid':
    'Код недействителен. Сверьте его с кодом на устройстве и повторите попытку.',
  'deviceApproval.notYours':
    'Этот код уже подтверждается другой учётной записью.',
  'deviceApproval.error': 'Что-то пошло не так. Повторите попытку.',
  'deviceApproval.retry': 'Повторить',
  'deviceApproval.otherCode': 'Ввести другой код',
};

export default ruRU;
