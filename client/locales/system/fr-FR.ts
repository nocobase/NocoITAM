import settings from './settings-fr-FR.js';
import type { SystemResource } from './en-US.js';
import deviceApprovalFrFR from '#extensions/nocobase-device-approval/locales/fr-FR';
import inboxFrFR from '#extensions/nocobase-inbox/locales/fr-FR';

/** The French copy of what the template ships; see `./en-US.ts`. */
const systemFrFR: SystemResource = {
  flowDiagram: {
    controls: 'Commandes du diagramme',
    fitView: 'Ajuster à la vue',
    fullscreen: 'Plein écran',
    exitFullscreen: 'Quitter le plein écran',
    escapeHint: 'Appuyez sur Échap pour quitter',
    leavesTo: 'Mène à',
    arrivesFrom: 'Vient de',
    otherRoutes: 'Autres transitions',
    minimap: 'Vue d’ensemble du diagramme',

    configure: 'Configurer',
    overview: 'Vue d’ensemble du diagramme',
    actualSize: 'Taille réelle',
    states: 'États',
    transitions: 'Transitions',
    configurable: 'Paramètres',
    current: 'Actuel',
    visited: 'Parcouru',
    initial: 'Initial',
    final: 'Final',
    state: 'État',
    zoomOut: 'Zoom arrière',
    zoomIn: 'Zoom avant',
    fit: 'Ajuster à la vue',

    empty: 'Aucun état à afficher.',
    loading: 'Mise en page du diagramme…',
    failed: 'Impossible de mettre en page ce diagramme.',
    nodeHelp: 'Appuyez sur Entrée ou Espace pour sélectionner un état.',
    edgeHelp: 'Appuyez sur Entrée ou Espace pour sélectionner une transition.',
  },
  settings,
  'auth.preparingSession': 'Préparation de votre session…',
  'auth.connectionFailed': 'Connexion impossible',
  'auth.connectionFailedDescription':
    'La connexion en temps réel n’a pas pu être préparée. Réessayez pour entrer dans l’application, ou déconnectez-vous.',

  'auth.passwordResetSuccess':
    'Votre mot de passe a été réinitialisé. Connectez-vous avec votre nouveau mot de passe.',
  'auth.requestNewResetLink': 'Demander un nouveau lien de réinitialisation',

  // The UI Library block of the `/device` page; the keys below may reword it.
  ...deviceApprovalFrFR,
  // The UI Library block of the `/inbox` page; the keys below may reword it.
  ...inboxFrFR,
  // The UI Library component of the header's inbox button.
  'inboxButton.title': 'Boîte de réception',
  'inboxButton.pending': 'Boîte de réception, {{count}} en attente',
  'inboxButton.unread': 'Boîte de réception, {{count}} non lu(s)',
  'inboxButton.pendingHint':
    '{{count}} en attente de vous ; le nombre baisse une fois les éléments traités.',
  'inboxButton.unreadHint':
    '{{count}} non lu(s) ; le nombre baisse à mesure que vous les lisez.',
  'auth.welcome': 'Bon retour parmi nous',
  'auth.loginDescription':
    'Connectez-vous avec votre identifiant ou votre e-mail et votre mot de passe.',
  'auth.registerTitle': 'Créer un compte',
  'auth.registerDescription': 'Créez un compte pour commencer.',
  'auth.forgotTitle': 'Mot de passe oublié',
  'auth.forgotDescription':
    'Saisissez votre e-mail ; nous vous enverrons un lien de réinitialisation si le compte existe.',
  'auth.passwordResetUnavailable':
    'La réinitialisation du mot de passe en libre-service n’est pas activée. Contactez un administrateur pour réinitialiser votre mot de passe.',
  'auth.capabilityLoadFailed':
    'Impossible de vérifier si la réinitialisation du mot de passe est disponible.',
  'auth.retry': 'Réessayer',
  'auth.loading': 'Chargement',
  'auth.resetDescription':
    'Choisissez un nouveau mot de passe pour votre compte.',
  'auth.resetTitle': 'Réinitialiser le mot de passe',
  'auth.identifier': 'Identifiant ou e-mail',
  'auth.password': 'Mot de passe',
  'auth.signIn': 'Se connecter',
  'auth.signingIn': 'Connexion…',
  'auth.hidePassword': 'Masquer le mot de passe',
  'auth.showPassword': 'Afficher le mot de passe',
  'auth.forgotLink': 'Mot de passe oublié ?',
  'auth.noAccount': 'Vous n’avez pas de compte ?',
  'auth.signUp': 'S’inscrire',
  'auth.createAccount': 'Créer le compte',
  'auth.creatingAccount': 'Création du compte…',
  'auth.name': 'Nom',
  'auth.username': 'Identifiant',
  'auth.email': 'E-mail',
  'auth.confirmPassword': 'Confirmer le mot de passe',
  'auth.existingAccount': 'Vous avez déjà un compte ?',
  'auth.passwordMismatch': 'Les mots de passe ne correspondent pas.',
  'auth.resetting': 'Réinitialisation…',
  'auth.newPassword': 'Nouveau mot de passe',
  'auth.confirmNewPassword': 'Confirmer le nouveau mot de passe',
  'auth.invalidResetLink':
    'Ce lien de réinitialisation est invalide ou a expiré.',
  'auth.backToSignIn': 'Retour à la connexion',
  'auth.sendResetLink': 'Envoyer le lien de réinitialisation',
  'auth.sending': 'Envoi…',
  'auth.resetSent':
    'Si le compte existe, un lien de réinitialisation a été envoyé.',
  'auth.rememberPassword': 'Vous vous souvenez de votre mot de passe ?',
  'auth.methods': 'Méthodes d’authentification',
  'auth.or': 'Ou continuer avec',
  'auth.continueWith': 'Continuer avec {provider}',
  'auth.about': 'À propos de cette application',
  'auth.platform': 'Plateforme d’applications nativement IA',
  'auth.marketingTitleFirst': 'Laissez l’IA construire librement.',
  'auth.marketingTitleSecond': 'NocoBase en garantit',
  'auth.marketingTitleThird': 'la fiabilité.',
  'auth.marketingDescription':
    'Donnez à l’IA un framework frontend flexible pour façonner chaque expérience, pendant que NocoBase sécurise en dessous les données, les permissions et la gouvernance.',
  'auth.frontend': 'Frontend nativement IA',
  'auth.frontendDescription':
    'Composez librement des interfaces sur un framework flexible.',
  'auth.foundation': 'Socle NocoBase',
  'auth.foundationDescription':
    'Données fiables, contrôle d’accès et gouvernance.',
  'auth.marketingFooter': 'Liberté au-dessus. Confiance en dessous.',
  'status.loading': 'Chargement',
  'status.loadingPage': 'Chargement de la page',
  'status.denied': 'Accès refusé',
  'status.pageFailed': 'Impossible de charger la page',
  'status.retry': 'Réessayer',
  'navigation.brandHome': 'Accueil NocoBase',
  'navigation.brandApps': 'Applications NocoBase',
  'routeOverlay.close': 'Fermer',
  'status.deniedDescription':
    'Vous n’avez pas la permission d’accéder à {{label}}.',
  'status.routeFailedDescription':
    'La route {{label}} de {{packageName}} n’a pas pu être chargée.',
  shell: {
    buildFreely: 'L’IA construit librement.',
    reliability: '<brand>NocoBase</brand> en garantit la fiabilité.',
  },
  home: {
    platform: 'NocoBase · Plateforme d’applications nativement IA',
    title: 'Décrivez-le, votre agent le construit',
    description:
      'Cette application se développe en dialoguant avec votre agent de code. Dites-lui avec des mots simples ce dont le métier a besoin, et il écrit les pages, les modèles de données, les API et les processus métier de ce projet.',
    steps: {
      describe: {
        title: 'Décrivez le besoin',
        description:
          'Dites qui l’utilise, quelles données il conservez et ce qui doit se passer.',
      },
      build: {
        title: 'Laissez l’agent construire',
        description:
          'Il lit ce projet et ses capacités intégrées, puis écrit le code.',
      },
      review: {
        title: 'Vérifiez et affinez',
        description:
          'Actualisez la page pour l’essayer, puis demandez des modifications de la même manière.',
      },
    },
    example: {
      title: 'Essayez une demande comme celle-ci',
      text: 'Construisez une application de bons de commande.\n\nUn bon de commande a un numéro, un article, un demandeur, un montant et un statut d’approbation. Les demandeurs créent des bons de commande et ne voient que les leurs ; les vérificateurs voient tous les bons en attente et les approuvent ou les rejettent.\nAprès une décision, notifiez le demandeur dans la boîte de réception avec un lien vers le bon de commande.',
      hint: 'Collez-la dans Claude Code, Codex, Cursor ou tout agent de code ouvert dans ce projet.',
    },
    capabilitiesTitle: 'Capacités intégrées',
    capabilitiesDescription:
      'Votre agent les utilise directement au lieu de les construire de zéro. Ouvrez-en une pour obtenir une invite que vous pouvez modifier et copier.',
    viewPrompts: 'Voir les invites ({{count}})',
    prompt: {
      label: 'Invite',
      hint: 'Adaptez l’invite à votre métier avant de la copier. Les modifications ne sont pas conservées après la fermeture de la boîte de dialogue.',
      copy: 'Copier',
      copiedShort: 'Copié',
      copied: 'Invite copiée',
      copyFailed:
        'Copie impossible. Sélectionnez le texte et copiez-le manuellement.',
      reset: 'Rétablir la valeur par défaut',
    },
    capabilities: {
      auth: {
        title: 'Authentification',
        description:
          'Connexion, inscription, réinitialisation du mot de passe et authentification unique de l’entreprise.',
        prompts: {
          disableSignUp: {
            label: 'Fermer l’inscription',
            text: 'Cette application est réservée aux employés de l’entreprise. Les administrateurs créent tous les comptes.\nDésactivez l’inscription libre et retirez le lien d’inscription de la page de connexion.\nLes employés existants doivent toujours pouvoir se connecter avec leur compte et leur mot de passe.\nConservez le lien « Mot de passe oublié ».',
          },
          companySso: {
            label: 'SSO de l’entreprise',
            text: 'Permettez aux employés de se connecter avec la plateforme d’identité de l’entreprise via OIDC.\n\nConservez la connexion par compte et mot de passe et ajoutez un bouton « Compte de l’entreprise ».\nLe bouton ouvre la plateforme d’identité de l’entreprise. Après une connexion réussie, revenez à la page d’accueil de l’application.\n\nAutorisez la première connexion à créer un compte dans l’application, identifié par l’identifiant utilisateur stable de la plateforme.\nNe reliez pas automatiquement les comptes en comparant les noms ou les e-mails. Les nouveaux comptes reçoivent les permissions par défaut de l’application.\n\nListez les informations que l’administrateur de la plateforme d’identité doit fournir et l’URL de rappel qu’il doit enregistrer.',
          },
          apiKeys: {
            label: 'Clés API',
            text: 'Ajoutez une entrée « Clés d’intégration » au menu utilisateur, en utilisant la capacité de clés API intégrée à l’application.\nLes employés ne gèrent que les clés qu’ils ont créées, en saisissant un objet et une durée de validité en jours.\nN’affichez la clé complète qu’une seule fois après sa création, avec une invitation à la copier et à la conserver immédiatement.\nListez pour chaque clé son nom, un fragment identifiable, son statut, son expiration et sa dernière utilisation, et permettez de la révoquer après confirmation.\nN’affichez jamais la clé complète dans la liste, les journaux ou les détails.',
          },
        },
      },
      dataSources: {
        title: 'Sources de données',
        description:
          'Choisissez la base de données de l’application et utilisez les données métier de bases de données externes existantes.',
        prompts: {
          postgres: {
            label: 'Changer de base de données',
            text: 'Passez la base de données de l’application de SQLite à PostgreSQL.\nLisez les informations de connexion dans la configuration d’exécution du serveur, pas dans le code source.\nExpliquez quel pilote de base de données installer et quels paramètres renseigner, et rappelez-moi que les données existantes ne sont pas migrées automatiquement.',
          },
          externalDatabase: {
            label: 'Base de données externe',
            text: 'Connectez la base de données financière existante de l’entreprise comme source de données externe en lecture seule ; ne modifiez pas ses tables.\nFaites correspondre les fiches par numéro de fournisseur et ajoutez aux détails du fournisseur une section « Règlement » affichant le cycle de règlement, la limite de crédit et le statut de règlement, avec sa source indiquée.\nContinuez de lire les coordonnées des fournisseurs dans la base de données de l’application, et lisez les données de règlement directement dans la base externe sans les importer.\nLisez les identifiants de connexion dans la configuration d’exécution du serveur.',
          },
        },
      },
      authorization: {
        title: 'Permissions',
        description:
          'Déterminez qui peut ouvrir quelles pages, exécuter quelles actions et voir quelles fiches.',
        prompts: {
          jobs: {
            label: 'Fonctions',
            text: 'Créez les fonctions « Demandeur d’achat » et « Vérificateur de commandes » pour l’application.\nLes demandeurs d’achat peuvent accéder à la page des commandes et voir les commandes qu’ils ont demandées.\nLes vérificateurs de commandes peuvent accéder à la page des commandes, voir les commandes, et approuver ou rejeter les commandes en attente.\nSeuls les administrateurs de l’application peuvent modifier les permissions et les attributions.\nUtilisez la capacité d’autorisation existante de l’application afin que les administrateurs puissent ajuster les permissions et affecter des personnes plus tard.',
          },
          dataScopes: {
            label: 'Portées des données',
            text: 'Permettez aux demandeurs d’achat de ne voir que leurs propres commandes, en utilisant le champ demandeur de la commande pour en déterminer la propriété.\nLes vérificateurs de commandes peuvent voir toutes les commandes et traiter les approbations en attente.\nLes administrateurs peuvent ajuster la portée de consultation des commandes de chaque fonction dans son jeu de permissions.',
          },
          restrictions: {
            label: 'Restrictions',
            text: 'Bob aide temporairement à vérifier les bons de commande et ne peut voir que les commandes de 2 000 ou moins.\nAjoutez une limite de montant à son action « Voir les commandes », en conservant sa fonction et ses portées de données existantes.\nAppliquez la limite à ses propres commandes et aux commandes partagées avec lui.\nLes administrateurs peuvent modifier le montant ou supprimer la règle ; avant la suppression, expliquez que sa portée visible peut s’élargir.',
          },
        },
      },
      workflow: {
        title: 'Workflows',
        description:
          'Faites passer les fiches métier par des étapes, avec attente, délais, nouvelles tentatives et un historique de qui a fait quoi.',
        prompts: {
          stages: {
            label: 'Étapes',
            text: 'Ajoutez un processus aux bons de commande : En attente d’approbation → En attente d’achat → Réceptionné → Terminé.\nLes vérificateurs approuvent ou rejettent ; un rejet exige un motif et renvoie la commande au demandeur pour qu’il la révise et la soumette à nouveau.\nUne fois l’achat passé par l’acheteur, la commande est en attente d’achat ; la confirmation de la livraison avec un accusé de réception signé la fait passer à Réceptionné, et la confirmation du demandeur la termine.\nLes détails de la commande ne proposent que les actions de l’étape en cours, et les modifications ordinaires ne peuvent pas changer l’étape.\nVérifiez les étapes et les informations requises sur le serveur, et n’écrasez jamais un résultat déjà soumis par quelqu’un d’autre.',
          },
          backgroundExport: {
            label: 'Export en arrière-plan',
            text: 'Ajoutez une page de rapport des commandes qui exporte les commandes existantes en CSV.\nAprès la soumission, l’export attend d’être traité, est généré en arrière-plan et se termine avec un lien de téléchargement.\nAffichez l’étape en cours, le nom du fichier, le nombre de commandes exportées, ainsi que la soumission et les traces de traitement du système.\nRelancez la génération en échec selon des règles, et conservez un échec définitif pour que le responsable le traite ; une nouvelle exécution ne doit pas créer de fichiers de rapport en double.\nGardez la progression et le résultat visibles après une actualisation de la page, et n’autorisez que les personnes habilitées à exporter les commandes.',
          },
          history: {
            label: 'Historique',
            text: 'Affichez l’étape en cours et l’historique de traitement dans les détails de la commande.\nChaque entrée indique qui a agi, quand, l’action, l’étape avant et après, ainsi que l’éventuel motif de rejet ou l’accusé de réception signé.\nIndiquez les actions effectuées automatiquement comme réalisées par le système.\nConservez la progression et l’historique après une actualisation de la page, afin que tout le processus puisse être relu une fois terminé.',
          },
        },
      },
      scheduler: {
        title: 'Tâches planifiées',
        description:
          'Exécutez des travaux métier à heures fixes, et voyez la prochaine exécution et ses résultats.',
        prompts: {
          reminder: {
            label: 'Rappel quotidien',
            text: 'Ajoutez un rappel des commandes en attente à l’application de commandes existante.\n\nÀ 09:00, heure de Pékin, chaque jour ouvré, trouvez les commandes en attente d’approbation, regroupez-les par vérificateur et envoyez à chaque vérificateur une notification dans l’application.\nIndiquez le nombre de commandes en attente et un lien vers la liste des commandes en attente. N’envoyez rien lorsqu’il n’y a aucune commande en attente.\nLes administrateurs peuvent voir la planification et les traces d’exécution, et suspendre ou reprendre les rappels.',
          },
          weeklyReport: {
            label: 'Rapport hebdomadaire',
            text: 'À 08:00, heure de Pékin, chaque lundi, générez la synthèse des ventes de la semaine précédente et notifiez le responsable des ventes.\nIncluez le chiffre d’affaires, le nombre de commandes et les totaux par région. Les administrateurs peuvent voir la tâche et les traces d’exécution.',
          },
        },
      },
      notification: {
        title: 'Notifications',
        description:
          'Envoyez des messages dans l’application, des e-mails ou des messages de bot de groupe lorsqu’un événement survient.',
        prompts: {
          inApp: {
            label: 'Message dans l’application',
            text: 'Ajoutez l’approbation des commandes à l’application actuelle et notifiez les demandeurs du résultat par des messages dans l’application.\n\nLes commandes comportent un numéro, un nom, un demandeur, un montant et un statut d’approbation.\nLes demandeurs peuvent voir leurs propres commandes. Les vérificateurs peuvent voir les commandes en attente et les approuver ou les rejeter. Réutilisez les fonctionnalités de commande et d’approbation existantes si elles sont disponibles.\n\nAprès une approbation ou un rejet, envoyez un seul message dans l’application, uniquement au demandeur de la commande.\nLe titre indique si la commande a été approuvée ou rejetée. Le corps comprend le numéro de commande, son nom et le résultat de l’approbation.\nCliquer sur le message ouvre les détails de la commande correspondante.\nN’envoyez rien tant que l’approbation est en attente. Ne notifiez qu’une seule fois pour un même résultat d’approbation.\nUn échec de notification n’affecte pas le résultat d’approbation enregistré.',
          },
          email: {
            label: 'E-mail',
            text: 'Ajoutez l’e-mail aux notifications d’approbation de commande existantes, en utilisant le canal e-mail configuré dans l’application.\n\nAprès l’approbation ou le rejet d’une commande, envoyez le résultat à l’adresse e-mail du compte du demandeur.\nIndiquez le numéro de commande dans l’objet, et le nom de la commande et le résultat dans le corps.\nConservez les messages existants dans l’application. Si le demandeur n’a pas d’adresse e-mail, envoyez uniquement le message dans l’application.\nUn échec d’e-mail ne doit affecter ni le résultat de l’approbation ni le message dans l’application.',
          },
        },
      },
      mail: {
        title: 'Messagerie',
        description:
          'Connectez des boîtes aux lettres personnelles, puis lisez, répondez à et envoyez des e-mails professionnels.',
        prompts: {
          providers: {
            label: 'Fournisseur de messagerie',
            text: 'Configurez mailbox.org pour l’application dans mail.providers de la configuration du serveur :\n- Serveur entrant IMAP : imap.mailbox.org, port 993, SSL/TLS.\n- Serveur sortant SMTP : smtp.mailbox.org, port 465, SSL/TLS.\nLes utilisateurs saisissent leur propre adresse e-mail, leur identifiant et leur mot de passe sur la page des comptes de messagerie et choisissent la date à partir de laquelle démarre la première synchronisation ; n’écrivez jamais de mots de passe de messagerie dans la configuration ou le code source.',
          },
          mailCenter: {
            label: 'Centre de messagerie',
            text: 'La messagerie est intégrée à cette application ; réutilisez-la au lieu de la reconstruire ou d’installer une autre extension.\nAjoutez les pages « Centre de messagerie » et « Comptes de messagerie » à la navigation, en utilisant l’espace de messagerie et les pages de comptes de messagerie fournis par la capacité de messagerie.\nLes utilisateurs peuvent connecter leurs propres boîtes aux lettres, synchroniser les messages entrants, lire les messages et les pièces jointes, et répondre en conservant l’objet d’origine et le contexte de la conversation, la réponse étant adressée à l’expéditeur d’origine.\nChaque utilisateur travaille avec ses propres boîtes aux lettres connectées.',
          },
          correspondence: {
            label: 'E-mails des clients',
            text: 'Ajoutez une section « Correspondance » aux détails du client, en réutilisant les composants de lecture et de rédaction d’e-mails intégrés à l’application.\nAffichez les messages dont l’expéditeur ou le destinataire correspond aux adresses e-mail de contact du client actuel. Les commerciaux peuvent lire les messages, voir les pièces jointes et répondre avec leurs propres boîtes aux lettres connectées.',
          },
        },
      },
      file: {
        title: 'Fichiers',
        description:
          'Téléversez des fichiers, joignez-les à des fiches, et prévisualisez-les ou téléchargez-les.',
        prompts: {
          attachments: {
            label: 'Pièces jointes',
            text: 'Ajoutez des pièces jointes d’achat à mon application de gestion des commandes existante.\n\nAjoutez une zone de pièces jointes aux détails de la commande. Chaque commande peut avoir plusieurs fichiers, dont des PDF, des images et des DOCX.\nAffichez les noms et tailles des fichiers, avec des actions pour prévisualiser, télécharger et retirer les pièces jointes.\nAprès le téléversement, permettez aux utilisateurs d’enregistrer les pièces jointes dans la commande en cours. Gardez-les disponibles lorsque la commande est rouverte.\nToute personne ayant accès à une commande peut voir et télécharger ses pièces jointes. Les demandeurs et les vérificateurs peuvent ajouter ou retirer des pièces jointes.\nRetirer une pièce jointe la détache seulement de la commande en cours ; conservez le fichier.',
          },
          avatar: {
            label: 'Avatar',
            text: 'Ajoutez un avatar à chaque employé, avec une image par employé.\nPermettez de téléverser et de remplacer l’avatar, et affichez-le dans les listes et les détails des employés.\nUtilisez le nouvel avatar après remplacement et gardez-le visible après actualisation de la page.',
          },
        },
      },
      i18n: {
        title: 'Langues',
        description:
          'Changez la langue de l’interface, ajoutez des langues et définissez celle par défaut.',
        prompts: {
          addLanguage: {
            label: 'Ajouter une langue',
            text: 'Ajoutez l’espagnol à mon application. Traduisez l’interface et les messages du serveur, et ajoutez l’espagnol au menu des langues.',
          },
          defaultLanguage: {
            label: 'Langue par défaut',
            text: 'Faites du chinois simplifié la langue par défaut de l’application pour les personnes qui n’en ont pas choisi. Gardez l’anglais disponible dans le menu des langues.',
          },
        },
      },
      theme: {
        title: 'Thèmes',
        description:
          'Ajustez les couleurs, les polices et la densité, et passez du clair au sombre.',
        prompts: {
          changeTheme: {
            label: 'Modifier un thème',
            text: 'Mettez à jour le thème Compact : utilisez le bleu comme couleur principale et augmentez légèrement le rayon des angles. Conservez les polices, les tailles de texte et l’espacement compact actuels.',
          },
          newTheme: {
            label: 'Nouveau thème',
            text: 'Créez un thème Forêt avec le vert comme couleur principale, des arrière-plans doux, des angles modérément arrondis et des ombres subtiles.',
          },
        },
      },
    },
  },

  appearance: {
    title: 'Apparence',
    mode: 'Mode de couleur',
    preset: 'Thème',
    light: 'Clair',
    dark: 'Sombre',
    system: 'Système',
    themes: { default: 'Aéré', compact: 'Compact' },
  },
  app: {
    title: 'NocoBase',
  },
  actions: {
    close: 'Fermer',
    save: 'Enregistrer',
    cancel: 'Annuler',
    confirm: 'Confirmer',
    language: 'Langue',
  },
  notices: {
    serverLocaleFallback:
      'Le serveur ne prend pas en charge cette langue ; les messages du serveur seront en anglais.',
    languageChangeFailed:
      'Impossible de changer de langue. Veuillez réessayer.',
  },
  account: {
    signOutFailed: 'Impossible de se déconnecter. Veuillez réessayer.',
    openMenu: 'Ouvrir le menu du compte',
    fallback: 'Compte',
    signOut: 'Se déconnecter',
    signingOut: 'Déconnexion…',
  },
  navigation: {
    home: 'Accueil',
    open: 'Ouvrir la navigation',
    close: 'Fermer la navigation',
    expand: 'Déplier la navigation',
    collapse: 'Replier la navigation',
    toggle: 'Déplier ou replier la navigation',
    label: 'Navigation de l’application',
    description: 'Aller à une page de cette application.',
    breadcrumb: 'Fil d’Ariane',
    breadcrumbMore: 'Afficher les niveaux intermédiaires',
    back: 'Retour',
  },
  dataTable: {
    noResults: 'Aucun résultat.',
    sortAscending: 'Croissant',
    sortDescending: 'Décroissant',
    hideColumn: 'Masquer',
    view: 'Affichage',
    toggleColumns: 'Afficher/masquer les colonnes',
    selectedCount: '{{selected}} ligne(s) sélectionnée(s) sur {{total}}.',
    rowsPerPage: 'Lignes par page',
    pageOf: 'Page {{page}} sur {{pageCount}}',
    firstPage: 'Aller à la première page',
    previousPage: 'Aller à la page précédente',
    nextPage: 'Aller à la page suivante',
    lastPage: 'Aller à la dernière page',
  },
  datePicker: {
    placeholder: 'Choisir une date',
    rangePlaceholder: 'Choisir une période',
  },
};

export default systemFrFR;
