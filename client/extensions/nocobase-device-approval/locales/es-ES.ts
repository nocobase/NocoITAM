import type { DeviceApprovalLocale } from './en-US.js';

const esES: DeviceApprovalLocale = {
  'deviceApproval.title': 'Autorizar un dispositivo',
  'deviceApproval.description':
    'Una línea de comandos u otro dispositivo ha pedido iniciar sesión en su nombre. Apruébelo solo si ha iniciado usted mismo el inicio de sesión.',
  'deviceApproval.enterCode':
    'Introduzca el código que muestra su dispositivo.',
  'deviceApproval.codeLabel': 'Código',
  'deviceApproval.continue': 'Continuar',
  'deviceApproval.checking': 'Comprobando el código…',
  'deviceApproval.confirm':
    'Compruebe que este código coincide con el que muestra su dispositivo.',
  'deviceApproval.client': 'Solicitado por {{client}}',
  'deviceApproval.approve': 'Aprobar',
  'deviceApproval.approving': 'Aprobando…',
  'deviceApproval.deny': 'Denegar',
  'deviceApproval.denying': 'Denegando…',
  'deviceApproval.approved':
    'Dispositivo aprobado. Vuelva a su terminal para continuar; puede cerrar esta página.',
  'deviceApproval.denied':
    'Solicitud denegada. El dispositivo no ha iniciado sesión; puede cerrar esta página.',
  'deviceApproval.expired':
    'Este código ha caducado. Vuelva a iniciar el inicio de sesión en su dispositivo.',
  'deviceApproval.invalid':
    'Este código no es válido. Compárelo con el de su dispositivo e inténtelo de nuevo.',
  'deviceApproval.notYours': 'Otra cuenta ya está aprobando este código.',
  'deviceApproval.error': 'Algo ha salido mal. Inténtelo de nuevo.',
  'deviceApproval.retry': 'Intentar de nuevo',
  'deviceApproval.otherCode': 'Introducir otro código',
};

export default esES;
