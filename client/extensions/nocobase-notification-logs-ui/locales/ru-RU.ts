import type { NotificationResource } from './en-US.js';

// Application addition: Russian, which the block does not ship (as NocoCRM has it).
const ruRU: NotificationResource = {
  logs: {
    deliveryOperations: 'Операции доставки',
    recipeDescription:
      'Отслеживайте передачу в каждый канал и каждую попытку провайдера.',
    redacted: 'Тексты сообщений, получатели и токены аренды скрыты.',
    providerAttempts: 'Попытки провайдера',

    eyebrow: 'Уведомления',
    title: 'Журнал уведомлений',
    description:
      'Отслеживайте доставку уведомлений и каждую попытку провайдера. Тексты сообщений, получатели и токены аренды скрыты.',
    refreshing: 'Обновление…',
    retryRead: 'Повторить',
    deliveriesShown: 'Показано доставок',
    needAttention: 'Требуют внимания',
    unavailable: 'Журнал недоступен',
    recent: 'Последние уведомления',
    loading: 'Загрузка истории доставки…',
    emptyTitle: 'Доставок пока нет',
    emptyDescription:
      'Записи о доставке появятся здесь после отправки уведомлений.',
    expand: 'Развернуть уведомление',
    collapse: 'Свернуть уведомление',
    noDeliveries: 'Доставок не зафиксировано.',
    noAttempts: 'Попыток не зафиксировано.',
    columns: {
      source: 'Источник',
      notificationId: 'ID уведомления',
      status: 'Статус',
      deliveries: 'Доставки',
      created: 'Создано',
      channel: 'Канал',
      provider: 'Провайдер',
      attempts: 'Попытки',
      updated: 'Обновлено',
    },
  },
  status: {
    pending: 'ожидает',
    processing: 'обрабатывается',
    completed: 'выполнено',
    partial: 'частично',
    failed: 'ошибка',
    unknown: 'неизвестно',
    preparing: 'подготовка',
    submitting: 'отправка',
    retrying: 'повтор',
    accepted: 'принято',
  },
  errors: {
    requestFailed: 'Не удалось выполнить запрос уведомления.',
    inAppRecipientNotFound:
      'Получатель уведомления в приложении не существует.',
  },
};

const resource: { notificationLogs: NotificationResource } = {
  notificationLogs: ruRU,
};
export default resource;
