import type { DeviceApprovalLocale } from './en-US.js';

const deDE: DeviceApprovalLocale = {
  formFeedback: {
    field:
      'Dieser Wert wurde abgelehnt. Prüfen Sie ihn und versuchen Sie es erneut.',
    invalid: 'Prüfen Sie die markierten Felder und versuchen Sie es erneut.',
    failed:
      'Speichern nicht möglich. Ihre Eingaben bleiben erhalten. Versuchen Sie es erneut.',
    network:
      'Keine Verbindung. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut. Ihre Eingaben bleiben erhalten.',
    denied:
      'Mit Ihren aktuellen Berechtigungen können Sie dieses Formular nicht absenden. Ihre Eingaben bleiben erhalten.',
  },
  'deviceApproval.title': 'Gerät autorisieren',
  'deviceApproval.description':
    'Eine Befehlszeile oder ein anderes Gerät möchte sich in Ihrem Namen anmelden. Bestätigen Sie nur, wenn Sie die Anmeldung selbst gestartet haben.',
  'deviceApproval.enterCode': 'Geben Sie den Code ein, den Ihr Gerät anzeigt.',
  'deviceApproval.codeLabel': 'Code',
  'deviceApproval.continue': 'Weiter',
  'deviceApproval.checking': 'Code wird geprüft…',
  'deviceApproval.confirm':
    'Prüfen Sie, ob dieser Code mit dem auf Ihrem Gerät übereinstimmt.',
  'deviceApproval.client': 'Angefordert von {{client}}',
  'deviceApproval.approve': 'Bestätigen',
  'deviceApproval.approving': 'Wird bestätigt…',
  'deviceApproval.deny': 'Ablehnen',
  'deviceApproval.denying': 'Wird abgelehnt…',
  'deviceApproval.approved':
    'Gerät bestätigt. Kehren Sie zum Terminal zurück, um fortzufahren; Sie können diese Seite schließen.',
  'deviceApproval.denied':
    'Anfrage abgelehnt. Das Gerät wurde nicht angemeldet; Sie können diese Seite schließen.',
  'deviceApproval.expired':
    'Dieser Code ist abgelaufen. Starten Sie die Anmeldung auf Ihrem Gerät erneut.',
  'deviceApproval.invalid':
    'Dieser Code ist ungültig. Vergleichen Sie ihn mit Ihrem Gerät und versuchen Sie es erneut.',
  'deviceApproval.notYours':
    'Dieser Code wird bereits von einem anderen Konto bestätigt.',
  'deviceApproval.error': 'Etwas ist schiefgelaufen. Versuchen Sie es erneut.',
  'deviceApproval.retry': 'Erneut versuchen',
  'deviceApproval.otherCode': 'Anderen Code eingeben',
};

export default deDE;
