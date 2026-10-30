import type { DeviceApprovalLocale } from './en-US.js';

const ptBR: DeviceApprovalLocale = {
  formFeedback: {
    field: 'Este valor foi recusado. Verifique e tente novamente.',
    invalid: 'Verifique os campos destacados e tente novamente.',
    failed: 'Não foi possível salvar. Seus dados foram mantidos. Tente novamente.',
    network: 'Não foi possível conectar. Verifique sua conexão e tente novamente. Seus dados foram mantidos.',
    denied: 'Com seu acesso atual, você não pode enviar este formulário. Seus dados foram mantidos.',
  },
  'deviceApproval.title': 'Autorizar um dispositivo',
  'deviceApproval.description':
    'Uma linha de comando ou outro dispositivo pediu para entrar com a sua conta. Aprove apenas se foi você quem iniciou o acesso.',
  'deviceApproval.enterCode': 'Informe o código que o seu dispositivo mostra.',
  'deviceApproval.codeLabel': 'Código',
  'deviceApproval.continue': 'Continuar',
  'deviceApproval.checking': 'Verificando o código…',
  'deviceApproval.confirm':
    'Confira se este código é igual ao que o seu dispositivo mostra.',
  'deviceApproval.client': 'Solicitado por {{client}}',
  'deviceApproval.approve': 'Aprovar',
  'deviceApproval.approving': 'Aprovando…',
  'deviceApproval.deny': 'Negar',
  'deviceApproval.denying': 'Negando…',
  'deviceApproval.approved':
    'Dispositivo aprovado. Volte ao terminal para continuar; você pode fechar esta página.',
  'deviceApproval.denied':
    'Solicitação negada. O dispositivo não foi conectado; você pode fechar esta página.',
  'deviceApproval.expired':
    'Este código expirou. Inicie o acesso no seu dispositivo novamente.',
  'deviceApproval.invalid':
    'Este código não é válido. Confira-o no seu dispositivo e tente novamente.',
  'deviceApproval.notYours':
    'Este código já está sendo aprovado por outra conta.',
  'deviceApproval.error': 'Algo deu errado. Tente novamente.',
  'deviceApproval.retry': 'Tentar novamente',
  'deviceApproval.otherCode': 'Informar outro código',
};

export default ptBR;
