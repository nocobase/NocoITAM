import settings from './settings-es-ES.js';
import type { SystemResource } from './en-US.js';
import deviceApprovalEsES from '#extensions/nocobase-device-approval/locales/es-ES';
import inboxEsES from '#extensions/nocobase-inbox/locales/es-ES';

/** The Spanish (Spain) copy of what the template ships; see `./en-US.ts`. */
const systemEsES: SystemResource = {
  flowDiagram: {
    controls: 'Controles del diagrama',
    fitView: 'Ajustar a la vista',
    fullscreen: 'Pantalla completa',
    exitFullscreen: 'Salir de la pantalla completa',
    escapeHint: 'Pulse Escape para salir',
    leavesTo: 'Pasa a',
    arrivesFrom: 'Llega desde',
    otherRoutes: 'Otras transiciones',
    minimap: 'Vista general del diagrama',

    configure: 'Configurar',
    overview: 'Vista general del diagrama',
    actualSize: 'Tamaño real',
    states: 'Estados',
    transitions: 'Transiciones',
    configurable: 'Parámetros',
    current: 'Actual',
    visited: 'Recorrido',
    initial: 'Inicial',
    final: 'Final',
    state: 'Estado',
    zoomOut: 'Alejar',
    zoomIn: 'Acercar',
    fit: 'Ajustar a la vista',

    empty: 'No hay estados que mostrar.',
    loading: 'Distribuyendo el diagrama…',
    failed: 'No se ha podido distribuir este diagrama.',
    nodeHelp: 'Pulse Intro o la barra espaciadora para seleccionar un estado.',
    edgeHelp:
      'Pulse Intro o la barra espaciadora para seleccionar una transición.',
  },
  settings,
  'auth.preparingSession': 'Preparando su sesión…',
  'auth.connectionFailed': 'No se ha podido conectar',
  'auth.connectionFailedDescription':
    'No se ha podido preparar la conexión en tiempo real. Vuelva a intentarlo para entrar en la aplicación, o cierre la sesión.',

  'auth.passwordResetSuccess':
    'Se ha restablecido su contraseña. Inicie sesión con la nueva contraseña.',
  'auth.requestNewResetLink': 'Solicitar un nuevo enlace de restablecimiento',

  // The UI Library block of the `/device` page; the keys below may reword it.
  ...deviceApprovalEsES,
  // The UI Library block of the `/inbox` page; the keys below may reword it.
  ...inboxEsES,
  // The UI Library component of the header's inbox button.
  'inboxButton.title': 'Bandeja de entrada',
  'inboxButton.pending': 'Bandeja de entrada, {{count}} pendientes',
  'inboxButton.unread': 'Bandeja de entrada, {{count}} sin leer',
  'inboxButton.pendingHint':
    '{{count}} pendientes de usted; el número baja a medida que se resuelven.',
  'inboxButton.unreadHint':
    '{{count}} sin leer; el número baja a medida que los lee.',
  'auth.welcome': 'Le damos de nuevo la bienvenida',
  'auth.loginDescription':
    'Inicie sesión con su nombre de usuario o correo electrónico y su contraseña.',
  'auth.registerTitle': 'Crear una cuenta',
  'auth.registerDescription': 'Cree una cuenta para empezar.',
  'auth.forgotTitle': 'Contraseña olvidada',
  'auth.forgotDescription':
    'Introduzca su correo electrónico y, si la cuenta existe, le enviaremos un enlace de restablecimiento.',
  'auth.passwordResetUnavailable':
    'El restablecimiento de contraseña por cuenta propia no está habilitado. Póngase en contacto con un administrador para restablecer su contraseña.',
  'auth.capabilityLoadFailed':
    'No se ha podido comprobar si el restablecimiento de contraseña está disponible.',
  'auth.retry': 'Reintentar',
  'auth.loading': 'Cargando',
  'auth.resetDescription': 'Elija una nueva contraseña para su cuenta.',
  'auth.resetTitle': 'Restablecer la contraseña',
  'auth.identifier': 'Nombre de usuario o correo electrónico',
  'auth.password': 'Contraseña',
  'auth.signIn': 'Iniciar sesión',
  'auth.signingIn': 'Iniciando sesión…',
  'auth.hidePassword': 'Ocultar la contraseña',
  'auth.showPassword': 'Mostrar la contraseña',
  'auth.forgotLink': '¿Ha olvidado su contraseña?',
  'auth.noAccount': '¿No tiene una cuenta?',
  'auth.signUp': 'Registrarse',
  'auth.createAccount': 'Crear la cuenta',
  'auth.creatingAccount': 'Creando la cuenta…',
  'auth.name': 'Nombre',
  'auth.username': 'Nombre de usuario',
  'auth.email': 'Correo electrónico',
  'auth.confirmPassword': 'Confirmar la contraseña',
  'auth.existingAccount': '¿Ya tiene una cuenta?',
  'auth.passwordMismatch': 'Las contraseñas no coinciden.',
  'auth.resetting': 'Restableciendo…',
  'auth.newPassword': 'Nueva contraseña',
  'auth.confirmNewPassword': 'Confirmar la nueva contraseña',
  'auth.invalidResetLink':
    'Este enlace de restablecimiento de contraseña no es válido o ha caducado.',
  'auth.backToSignIn': 'Volver al inicio de sesión',
  'auth.sendResetLink': 'Enviar el enlace de restablecimiento',
  'auth.sending': 'Enviando…',
  'auth.resetSent':
    'Si la cuenta existe, se ha enviado un enlace de restablecimiento.',
  'auth.rememberPassword': '¿Recuerda su contraseña?',
  'auth.methods': 'Métodos de inicio de sesión',
  'auth.or': 'O continúe con',
  'auth.continueWith': 'Continuar con {provider}',
  'auth.about': 'Acerca de esta aplicación',
  'auth.platform': 'Plataforma de aplicaciones nativa de IA',
  'auth.marketingTitleFirst': 'Deje que la IA construya con libertad.',
  'auth.marketingTitleSecond': 'NocoBase lo mantiene',
  'auth.marketingTitleThird': 'fiable.',
  'auth.marketingDescription':
    'Dé a la IA un framework de frontend flexible para dar forma a cada experiencia, mientras NocoBase protege por debajo los datos, los permisos y la gobernanza.',
  'auth.frontend': 'Frontend nativo de IA',
  'auth.frontendDescription':
    'Componga interfaces con libertad sobre un framework flexible.',
  'auth.foundation': 'Base de NocoBase',
  'auth.foundationDescription':
    'Datos, control de acceso y gobernanza fiables.',
  'auth.marketingFooter': 'Libertad arriba. Confianza abajo.',
  'status.loading': 'Cargando',
  'status.loadingPage': 'Cargando la página',
  'status.denied': 'Acceso denegado',
  'status.pageFailed': 'No se ha podido cargar la página',
  'status.retry': 'Reintentar',
  'navigation.brandHome': 'Inicio de NocoBase',
  'navigation.brandApps': 'Aplicaciones de NocoBase',
  'routeOverlay.close': 'Cerrar',
  'status.deniedDescription': 'No tiene permiso para acceder a {{label}}.',
  'status.routeFailedDescription':
    'No se ha podido cargar la ruta {{label}} de {{packageName}}.',
  shell: {
    buildFreely: 'La IA construye con libertad.',
    reliability: '<brand>NocoBase</brand> lo mantiene fiable.',
  },
  home: {
    platform: 'NocoBase · Plataforma de aplicaciones nativa de IA',
    title: 'Descríbalo y su agente lo construye',
    description:
      'Esta aplicación se desarrolla conversando con su agente de programación. Cuéntele con palabras sencillas lo que necesita el negocio y él escribirá las páginas, los modelos de datos, las API y los procesos de negocio de este proyecto.',
    steps: {
      describe: {
        title: 'Describa la necesidad',
        description: 'Diga quién lo usa, qué datos guarda y qué debe ocurrir.',
      },
      build: {
        title: 'Deje que el agente lo construya',
        description:
          'Lee este proyecto y sus capacidades integradas y, después, escribe el código.',
      },
      review: {
        title: 'Compruebe y ajuste',
        description:
          'Actualice la página para probarlo y, después, pida cambios de la misma manera.',
      },
    },
    example: {
      title: 'Pruebe con una petición como esta',
      text: 'Construye una aplicación de órdenes de compra.\n\nUna orden tiene número, artículo, solicitante, importe y estado de aprobación. Los solicitantes crean órdenes y solo ven las suyas; los revisores ven todas las órdenes pendientes y las aprueban o rechazan.\nTras una decisión, avisa al solicitante en la bandeja de entrada con un enlace a la orden.',
      hint: 'Péguela en Claude Code, Codex, Cursor o cualquier agente de programación abierto en este proyecto.',
    },
    capabilitiesTitle: 'Capacidades integradas',
    capabilitiesDescription:
      'Su agente las usa directamente en lugar de construirlas desde cero. Abra una para obtener una indicación que puede editar y copiar.',
    viewPrompts: 'Ver las indicaciones ({{count}})',
    prompt: {
      label: 'Indicación',
      hint: 'Adapte la indicación a su negocio antes de copiarla. Los cambios no se guardan al cerrar el cuadro de diálogo.',
      copy: 'Copiar',
      copiedShort: 'Copiado',
      copied: 'Indicación copiada',
      copyFailed:
        'No se ha podido copiar. Seleccione el texto y cópielo manualmente.',
      reset: 'Restaurar el valor predeterminado',
    },
    capabilities: {
      auth: {
        title: 'Autenticación',
        description:
          'Inicio de sesión, registro, restablecimiento de contraseña e inicio de sesión único de la empresa.',
        prompts: {
          disableSignUp: {
            label: 'Cerrar el registro',
            text: 'Esta aplicación es solo para los empleados de la empresa. Los administradores crean todas las cuentas.\nDesactiva el registro por cuenta propia y quita el enlace de registro de la página de inicio de sesión.\nLos empleados existentes deben poder seguir iniciando sesión con sus cuentas y contraseñas.\nMantén el enlace de contraseña olvidada.',
          },
          companySso: {
            label: 'SSO de la empresa',
            text: 'Permite que los empleados inicien sesión con la plataforma de identidad de la empresa mediante OIDC.\n\nMantén el inicio de sesión con cuenta y contraseña y añade un botón Cuenta de la empresa.\nEl botón abre la plataforma de identidad de la empresa. Tras iniciar sesión correctamente, vuelve a la página de inicio de la aplicación.\n\nPermite que el primer inicio de sesión cree una cuenta en la aplicación, identificada por el identificador de usuario estable de la plataforma.\nNo vincules cuentas automáticamente comparando nombres o correos electrónicos. Las cuentas nuevas usan los permisos predeterminados de la aplicación.\n\nEnumera la información que debe aportar el administrador de la plataforma de identidad y la URL de retorno que debe registrar.',
          },
          apiKeys: {
            label: 'Claves de API',
            text: 'Añade una entrada Claves de integración al menú del usuario, usando la capacidad de claves de API integrada en la aplicación.\nLos empleados gestionan solo las claves que han creado, indicando una finalidad y un periodo de validez en días.\nMuestra la clave completa una sola vez tras crearla, con un aviso para copiarla y guardarla de inmediato.\nEnumera el nombre de cada clave, un fragmento identificable, su estado, su caducidad y su último uso, y permite revocarla tras una confirmación.\nNo muestres nunca la clave completa en la lista, los registros ni los detalles.',
          },
        },
      },
      dataSources: {
        title: 'Fuentes de datos',
        description:
          'Elija la base de datos de la aplicación y use datos de negocio de bases de datos externas existentes.',
        prompts: {
          postgres: {
            label: 'Cambiar de base de datos',
            text: 'Cambia la base de datos de la aplicación de SQLite a PostgreSQL.\nLee los datos de conexión de la configuración de ejecución del servidor, no del código fuente.\nExplica qué controlador de base de datos hay que instalar y qué ajustes hay que rellenar, y recuérdame que los datos existentes no se migran automáticamente.',
          },
          externalDatabase: {
            label: 'Base de datos externa',
            text: 'Conecta la base de datos de finanzas existente de la empresa como fuente de datos externa de solo lectura; no modifiques sus tablas.\nRelaciona los registros por número de proveedor y añade una sección Liquidación a los detalles del proveedor con el ciclo de liquidación, el límite de crédito y el estado de liquidación, indicando su origen.\nSigue leyendo los datos de contacto de los proveedores de la base de datos de la aplicación, y lee los datos de liquidación directamente de la base de datos externa sin importarlos.\nLee las credenciales de conexión de la configuración de ejecución del servidor.',
          },
        },
      },
      authorization: {
        title: 'Permisos',
        description:
          'Controle quién puede abrir qué páginas, ejecutar qué acciones y ver qué registros.',
        prompts: {
          jobs: {
            label: 'Puestos de trabajo',
            text: 'Crea los puestos de trabajo Solicitante de compras y Revisor de órdenes para la aplicación.\nLos solicitantes de compras pueden entrar en la página de órdenes y ver las órdenes que han solicitado.\nLos revisores de órdenes pueden entrar en la página de órdenes, ver las órdenes y aprobar o rechazar las órdenes pendientes.\nSolo los administradores de la aplicación pueden cambiar los permisos y las asignaciones.\nUsa la capacidad de autorización existente de la aplicación para que los administradores puedan ajustar los permisos y asignar personas más adelante.',
          },
          dataScopes: {
            label: 'Ámbitos de datos',
            text: 'Haz que los solicitantes de compras solo puedan ver sus propias órdenes, usando el campo de solicitante de la orden para determinar a quién pertenece.\nLos revisores de órdenes pueden ver todas las órdenes y tramitar las aprobaciones pendientes.\nLos administradores pueden ajustar en el conjunto de permisos de cada puesto qué órdenes puede ver.',
          },
          restrictions: {
            label: 'Restricciones',
            text: 'Bob está ayudando temporalmente a revisar órdenes de compra y solo puede ver órdenes de 2.000 o menos.\nAñade un límite de importe a su acción Ver órdenes, manteniendo su puesto y sus ámbitos de datos actuales.\nAplica el límite a sus propias órdenes y a las órdenes compartidas con él.\nLos administradores pueden cambiar el importe o quitar la regla; antes de quitarla, explica que su alcance visible puede ampliarse.',
          },
        },
      },
      workflow: {
        title: 'Flujos de trabajo',
        description:
          'Haga avanzar los registros de negocio por etapas, con esperas, tiempos de espera, reintentos y un historial de quién hizo qué.',
        prompts: {
          stages: {
            label: 'Etapas',
            text: 'Añade un proceso a las órdenes de compra: Pendiente de aprobación → Pendiente de compra → Recibida → Completada.\nLos revisores aprueban o rechazan; un rechazo exige un motivo y devuelve la orden al solicitante para que la corrija y la vuelva a enviar.\nCuando el comprador realiza la compra, la orden queda pendiente de compra; confirmar la entrega con un albarán firmado la pasa a Recibida, y la confirmación del solicitante la completa.\nLos detalles de la orden ofrecen solo las acciones de la etapa actual, y las ediciones normales no pueden cambiar la etapa.\nComprueba las etapas y la información obligatoria en el servidor, y no sobrescribas nunca un resultado que otra persona ya haya enviado.',
          },
          backgroundExport: {
            label: 'Exportación en segundo plano',
            text: 'Añade una página de informe de órdenes que exporte las órdenes existentes a CSV.\nTras el envío, la exportación espera a ser procesada, se genera en segundo plano y termina con un enlace de descarga.\nMuestra la etapa actual, el nombre del archivo, el número de órdenes exportadas y los registros de envío y de procesamiento del sistema.\nReintenta la generación fallida según unas reglas, y conserva un fallo definitivo para que lo resuelva el responsable; volver a ejecutarla no debe crear archivos de informe duplicados.\nMantén visibles el progreso y el resultado tras actualizar la página, y permite exportar órdenes solo a las personas autorizadas.',
          },
          history: {
            label: 'Historial',
            text: 'Muestra la etapa actual y el historial de tramitación en los detalles de la orden.\nCada entrada muestra quién actuó, cuándo, la acción, la etapa anterior y la posterior, y cualquier motivo de rechazo o albarán firmado.\nMarca las acciones realizadas automáticamente como hechas por el sistema.\nMantén el progreso y el historial tras actualizar la página, para poder revisar todo el proceso una vez completado.',
          },
        },
      },
      scheduler: {
        title: 'Tareas programadas',
        description:
          'Ejecute trabajo de negocio a horas fijas y vea la próxima ejecución y sus resultados.',
        prompts: {
          reminder: {
            label: 'Recordatorio diario',
            text: 'Añade un recordatorio de órdenes pendientes a la aplicación de órdenes existente.\n\nA las 09:00, hora de Pekín, cada día laborable, busca las órdenes pendientes de aprobación, agrúpalas por revisor y envía a cada revisor una notificación en la aplicación.\nIncluye el número de órdenes pendientes y un enlace a la lista de órdenes pendientes. No envíes nada cuando no haya órdenes pendientes.\nLos administradores pueden ver la programación y los registros de ejecución, y pausar o reanudar los recordatorios.',
          },
          weeklyReport: {
            label: 'Informe semanal',
            text: 'A las 08:00, hora de Pekín, cada lunes, genera el resumen de ventas de la semana anterior y avisa al director de ventas.\nIncluye los ingresos por ventas, el número de pedidos y los totales por región. Los administradores pueden ver la tarea y los registros de ejecución.',
          },
        },
      },
      notification: {
        title: 'Notificaciones',
        description:
          'Envíe mensajes en la aplicación, correos electrónicos o mensajes de bots de grupo cuando ocurra algo.',
        prompts: {
          inApp: {
            label: 'Mensaje en la aplicación',
            text: 'Añade la aprobación de órdenes a la aplicación actual y comunica los resultados a los solicitantes mediante mensajes en la aplicación.\n\nLas órdenes incluyen número, nombre, solicitante, importe y estado de aprobación.\nLos solicitantes pueden ver sus propias órdenes. Los revisores pueden ver las órdenes pendientes y aprobarlas o rechazarlas. Reutiliza las funciones de órdenes y aprobación existentes si las hay.\n\nTras la aprobación o el rechazo, envía un único mensaje en la aplicación solo al solicitante de la orden.\nEl título indica si la orden se ha aprobado o rechazado. El cuerpo incluye el número de la orden, su nombre y el resultado de la aprobación.\nAl hacer clic en el mensaje se abren los detalles de la orden correspondiente.\nNo envíes nada mientras la aprobación esté pendiente. Avisa una sola vez por el mismo resultado de aprobación.\nUn fallo de la notificación no afecta al resultado de aprobación guardado.',
          },
          email: {
            label: 'Correo electrónico',
            text: 'Añade el correo electrónico a las notificaciones de aprobación de órdenes existentes, usando el canal de correo configurado en la aplicación.\n\nTras aprobarse o rechazarse una orden, envía el resultado al correo electrónico de la cuenta del solicitante.\nIncluye el número de la orden en el asunto, y el nombre de la orden y el resultado en el cuerpo.\nMantén los mensajes en la aplicación existentes. Si el solicitante no tiene dirección de correo, envía solo el mensaje en la aplicación.\nUn fallo del correo no debe afectar al resultado de la aprobación ni al mensaje en la aplicación.',
          },
        },
      },
      mail: {
        title: 'Correo',
        description:
          'Conecte buzones personales y, después, lea, responda y envíe correo de negocio.',
        prompts: {
          providers: {
            label: 'Proveedor de correo',
            text: 'Configura mailbox.org para la aplicación en mail.providers de la configuración del servidor:\n- Servidor de entrada IMAP: imap.mailbox.org, puerto 993, SSL/TLS.\n- Servidor de salida SMTP: smtp.mailbox.org, puerto 465, SSL/TLS.\nLos usuarios introducen su propia dirección de correo, nombre de usuario y contraseña en la página de cuentas de buzón y eligen la fecha desde la que empieza la primera sincronización; no escribas nunca contraseñas de buzones en la configuración ni en el código fuente.',
          },
          mailCenter: {
            label: 'Centro de correo',
            text: 'El correo está integrado en esta aplicación; reutilízalo en lugar de volver a construirlo o instalar otro plugin.\nAñade a la navegación las páginas Centro de correo y Cuentas de buzón, usando las páginas de espacio de correo y de cuentas de buzón que ofrece la capacidad de correo.\nLos usuarios pueden conectar sus propios buzones, sincronizar los mensajes entrantes, leer mensajes y adjuntos, y responder manteniendo el asunto original y el contexto de la conversación y dirigiendo la respuesta al remitente original.\nCada usuario trabaja con sus propios buzones conectados.',
          },
          correspondence: {
            label: 'Correos de clientes',
            text: 'Añade una sección de correspondencia a los detalles del cliente, reutilizando los componentes integrados de lectura y redacción de correo de la aplicación.\nMuestra los mensajes cuyo remitente o destinatario coincida con las direcciones de correo de contacto del cliente actual. Los comerciales pueden leer los mensajes, ver los adjuntos y responder con sus propios buzones conectados.',
          },
        },
      },
      file: {
        title: 'Archivos',
        description:
          'Suba archivos, adjúntelos a registros y obtenga una vista previa o descárguelos.',
        prompts: {
          attachments: {
            label: 'Adjuntos',
            text: 'Añade adjuntos de compra a mi aplicación de gestión de órdenes existente.\n\nAñade una zona de adjuntos a los detalles de la orden. Cada orden puede tener varios archivos, incluidos PDF, imágenes y DOCX.\nMuestra los nombres y tamaños de los archivos, con acciones para ver una vista previa, descargar y quitar adjuntos.\nTras subirlos, permite que los usuarios guarden los adjuntos en la orden actual. Mantenlos disponibles al volver a abrir la orden.\nCualquiera con acceso a una orden puede ver y descargar sus adjuntos. Los solicitantes y los revisores pueden añadir o quitar adjuntos.\nQuitar un adjunto solo lo desvincula de la orden actual; conserva el archivo.',
          },
          avatar: {
            label: 'Avatar',
            text: 'Añade un avatar a cada empleado, con una imagen por empleado.\nPermite subir y sustituir el avatar, y muéstralo en las listas y los detalles de los empleados.\nUsa el nuevo avatar tras la sustitución y mantenlo visible tras actualizar la página.',
          },
        },
      },
      i18n: {
        title: 'Idiomas',
        description:
          'Cambie el idioma de la interfaz, añada idiomas y defina el predeterminado.',
        prompts: {
          addLanguage: {
            label: 'Añadir un idioma',
            text: 'Añade el español a mi aplicación. Traduce la interfaz y los mensajes del servidor, y añade el español al menú de idiomas.',
          },
          defaultLanguage: {
            label: 'Idioma predeterminado',
            text: 'Haz que el chino simplificado sea el idioma predeterminado de la aplicación para quienes no hayan elegido uno. Mantén el inglés disponible en el menú de idiomas.',
          },
        },
      },
      theme: {
        title: 'Temas',
        description:
          'Ajuste los colores, las fuentes y la densidad, y cambie entre claro y oscuro.',
        prompts: {
          changeTheme: {
            label: 'Cambiar un tema',
            text: 'Actualiza el tema Compacto: usa el azul como color principal y aumenta ligeramente el radio de las esquinas. Mantén las fuentes, los tamaños de texto y el espaciado compacto actuales.',
          },
          newTheme: {
            label: 'Nuevo tema',
            text: 'Crea un tema Bosque con el verde como color principal, fondos suaves, esquinas moderadamente redondeadas y sombras sutiles.',
          },
        },
      },
    },
  },

  appearance: {
    title: 'Apariencia',
    mode: 'Modo de color',
    preset: 'Tema',
    light: 'Claro',
    dark: 'Oscuro',
    system: 'Sistema',
    themes: { default: 'Amplio', compact: 'Compacto' },
  },
  app: {
    title: 'NocoBase',
  },
  actions: {
    close: 'Cerrar',
    save: 'Guardar',
    cancel: 'Cancelar',
    confirm: 'Confirmar',
    language: 'Idioma',
  },
  notices: {
    serverLocaleFallback:
      'El servidor no admite este idioma, así que los mensajes del servidor se mostrarán en inglés.',
    languageChangeFailed:
      'No se ha podido completar el cambio de idioma. Inténtelo de nuevo.',
  },
  account: {
    signOutFailed: 'No se ha podido cerrar la sesión. Inténtelo de nuevo.',
    openMenu: 'Abrir el menú de la cuenta',
    fallback: 'Cuenta',
    signOut: 'Cerrar sesión',
    signingOut: 'Cerrando sesión…',
  },
  navigation: {
    home: 'Inicio',
    open: 'Abrir la navegación',
    close: 'Cerrar la navegación',
    expand: 'Expandir la navegación',
    collapse: 'Contraer la navegación',
    toggle: 'Expandir o contraer la navegación',
    label: 'Navegación de la aplicación',
    description: 'Vaya a una página de esta aplicación.',
    breadcrumb: 'Ruta de navegación',
    breadcrumbMore: 'Mostrar los niveles intermedios',
    back: 'Volver',
  },
  dataTable: {
    noResults: 'Sin resultados.',
    sortAscending: 'Asc.',
    sortDescending: 'Desc.',
    hideColumn: 'Ocultar',
    view: 'Vista',
    toggleColumns: 'Mostrar u ocultar columnas',
    selectedCount: '{{selected}} de {{total}} fila(s) seleccionada(s).',
    rowsPerPage: 'Filas por página',
    pageOf: 'Página {{page}} de {{pageCount}}',
    firstPage: 'Ir a la primera página',
    previousPage: 'Ir a la página anterior',
    nextPage: 'Ir a la página siguiente',
    lastPage: 'Ir a la última página',
  },
  datePicker: {
    placeholder: 'Elija una fecha',
    rangePlaceholder: 'Elija un intervalo de fechas',
  },
};

export default systemEsES;
