import type { DeviceApprovalLocale } from './en-US.js';

const frFR: DeviceApprovalLocale = {
  'deviceApproval.title': 'Autoriser un appareil',
  'deviceApproval.description':
    'Une ligne de commande ou un autre appareil a demandé à se connecter en votre nom. Ne l’approuvez que si vous avez vous-même lancé la connexion.',
  'deviceApproval.enterCode': 'Saisissez le code affiché par votre appareil.',
  'deviceApproval.codeLabel': 'Code',
  'deviceApproval.continue': 'Continuer',
  'deviceApproval.checking': 'Vérification du code…',
  'deviceApproval.confirm':
    'Vérifiez que ce code correspond à celui affiché par votre appareil.',
  'deviceApproval.client': 'Demandé par {{client}}',
  'deviceApproval.approve': 'Approuver',
  'deviceApproval.approving': 'Approbation…',
  'deviceApproval.deny': 'Refuser',
  'deviceApproval.denying': 'Refus…',
  'deviceApproval.approved':
    'Appareil approuvé. Revenez à votre terminal pour continuer ; vous pouvez fermer cette page.',
  'deviceApproval.denied':
    'Demande refusée. L’appareil n’a pas été connecté ; vous pouvez fermer cette page.',
  'deviceApproval.expired':
    'Ce code a expiré. Relancez la connexion sur votre appareil.',
  'deviceApproval.invalid':
    'Ce code n’est pas valide. Comparez-le à celui de votre appareil et réessayez.',
  'deviceApproval.notYours':
    'Ce code est déjà en cours d’approbation par un autre compte.',
  'deviceApproval.error': 'Une erreur est survenue. Réessayez.',
  'deviceApproval.retry': 'Réessayer',
  'deviceApproval.otherCode': 'Saisir un autre code',
};

export default frFR;
