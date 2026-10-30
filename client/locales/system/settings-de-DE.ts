import type { LocaleResource } from '@nocobase/i18n';
import type settingsEnUS from './settings-en-US.js';

// The template's Settings copy (client/locales/system/settings-en-US.ts): the
// prepared Users and Roles pages and the permission editor, in de-DE.
const settings: LocaleResource<typeof settingsEnUS> = {
  listChanged: 'Die Liste hat sich geändert. Bitte erneut versuchen.',
  setup: {
    title: 'Voraussetzungen der Funktion',
    checking: 'Aktuelle Konfiguration wird geprüft…',
    checkAgain: 'Erneut prüfen',
    ready: 'Die geprüften Voraussetzungen sind erfüllt.',
    missing: 'Prüfen Sie die folgenden Konfigurationspunkte.',
    manageMembers: 'Mitglieder verwalten',
    manageMembersFor: 'Mitglieder von {{role}} verwalten',
    unavailable:
      'Die Prüfung ist gerade nicht möglich. Versuchen Sie es erneut.',
    signIn:
      'Ihre Sitzung ist abgelaufen. Melden Sie sich erneut an, um die Konfiguration zu prüfen.',
    forbidden:
      'Sie haben keinen Zugriff, um diese Konfiguration zu prüfen. Wenden Sie sich an einen Administrator.',
    invalid:
      'Diese Voraussetzung konnte nicht überprüft werden. Bitten Sie die Betreuer der Anwendung, ihre Konfiguration zu prüfen.',
  },
  permissionManagement: 'Berechtigungsverwaltung',
  defaultAccess: {
    noResourcesShort: 'Keine konfigurierbaren Objekte verfügbar',
    scopeInvalid:
      'Wählen Sie einen gültigen Datenbereich oder vervollständigen Sie seine Filterbedingungen.',

    deleteChanged:
      'Diese Regel wurde geändert oder entfernt. Die Liste wurde aktualisiert; prüfen Sie sie vor dem Löschen.',
    filterDescription:
      'Übernehmen Sie die Bedingungen in den Regelentwurf und speichern Sie dann die Regel, damit sie wirksam werden.',
    fieldLabels: { name: 'Name', id: 'ID' },
    delete: 'Löschen',
    title: 'Standard-Datenbereiche',
    description:
      'Gewährt Benutzern mit Vorgangsberechtigung zusätzlichen Datenzugriff, kombiniert mit den durch Rollen gewährten Bereichen und vorbehaltlich der Einschränkungsregeln.',
    manage: 'Standard-Datenbereiche verwalten',
    new: 'Neuer Standardbereich',
    edit: 'Details zum Standardbereich',
    resource: 'Geschäftsobjekt',
    chooseResource: 'Geschäftsobjekt wählen',
    action: 'Vorgang',
    scope: 'Datenbereich',
    scopes: 'Vorgänge und Datenbereiche',
    none: 'Kein Standardbereich',
    all: 'Alle Datensätze',
    custom: 'Benutzerdefinierter Filter',
    records: 'Ausgewählte Datensätze ({{count}})',
    retained: 'Bestehende Konfiguration beibehalten',
    search: 'Geschäftsobjekte oder Schlüssel suchen',
    empty: 'Keine Standard-Datenbereiche',
    emptyHint:
      'Erstellen Sie eine Regel, um den Grundzugriff für ein Geschäftsobjekt festzulegen.',
    readOnlyEmpty:
      'Bitten Sie einen Administrator, den grundlegenden Datenzugriff einzurichten.',
    noResources:
      'Jedes verfügbare Geschäftsobjekt hat bereits eine Standardregel, oder es sind keine konfigurierbaren Objekte registriert.',
    unsupported:
      'Diese Regel enthält Konfigurationen, die im aktuellen Plugin-Katalog fehlen. Sie bleibt erhalten und wird schreibgeschützt angezeigt.',
    changed:
      'Diese Regel wurde während Ihrer Bearbeitung geändert oder entfernt. Laden Sie sie vor dem Speichern neu. Ihr Entwurf wurde nicht gespeichert.',
    duplicate:
      'Für diesen Schlüssel oder dieses Geschäftsobjekt gibt es bereits eine Standardregel. Verwenden Sie einen anderen Schlüssel oder bearbeiten Sie die bestehende Regel.',
    invalid:
      'Die Konfiguration wird nicht akzeptiert. Prüfen Sie Geschäftsobjekt, Vorgang und Datenbereich.',
    keyRequired:
      'Geben Sie einen anderen Schlüssel als options, subjects oder records ein.',
    resourceRequired: 'Wählen Sie ein Geschäftsobjekt.',
    reload: 'Regel neu laden',
    saved: 'Standardbereich „{{name}}“ gespeichert',
    deleted: 'Standardbereich „{{name}}“ gelöscht',
    deleteTitle: 'Standardbereich „{{name}}“ löschen?',
    deleteHint:
      'Dadurch wird der Grundzugriff dieser Regel entfernt. Bestehende Rollenberechtigungen und andere Regeln bleiben erhalten. Dies kann nicht rückgängig gemacht werden.',
    back: 'Zurück zu den Standardbereichen',
    open: 'Ansehen / bearbeiten',
  },
  scopeHintFor: 'Zum Datenbereich von {{name}}',
  scopeExplanation:
    'Jeder Bereich gilt für die zugehörigen Daten. Der Vorgang muss außerdem seine Berechtigungsprüfungen bestehen.',
  noAdditionalScopeHint:
    'Diese Rolle fügt keine Datensätze hinzu. Der tatsächliche Zugriff hängt auch von anderen Rollen sowie von Standard-, Freigabe- und Einschränkungsregeln ab.',
  systemToolsHint:
    'Systemkonfiguration und Werkzeuge verwalten. Prüfen Sie vor dem Gewähren, welche Funktionen jede Aktion umfasst.',
  userAccountsHint:
    'Benutzerdaten, Kontosicherheit und Rollenzuweisungen verwalten. Prüfen Sie jede Berechtigung einzeln.',
  businessOperationsHint:
    'Wählen Sie die Vorgänge, die diese Rolle ausführen darf, und die Daten, die jeder Vorgang verwenden darf.',
  pageAccessHint:
    'Wählen Sie die Geschäftsseiten, die diese Rolle öffnen kann. Alle Systemeinstellungen, einschließlich Benutzerverwaltung und Geschäftskonfiguration, werden unter Konfigurationsberechtigungen gesteuert. Daten und Geschäftsaktionen erfordern eigene Berechtigungen.',
  roleAssignment: 'Rollenzuweisung',
  accountSecurity: 'Kontosicherheit',
  userInformation: 'Benutzerdaten',
  unnamedPage: 'Unbenannte Seite ({{path}})',
  revokeRoles: 'Rollen entziehen',
  keyConflict: 'Dieser Rollenschlüssel wird bereits verwendet.',
  userPermissions: 'Benutzer und Konten',
  readUsers: 'Benutzer ansehen',
  createUsers: 'Benutzer erstellen',
  updateUsers: 'Benutzer bearbeiten',
  inviteUsers: 'Benutzer einladen',
  deleteUsers: 'Benutzer löschen',
  resetUserPassword: 'Passwort zurücksetzen',
  assignRole: 'Rollen zuweisen',

  assignedRoles: 'Zugewiesene Rollen',
  actionSaved: 'Zugriff für „{{name}}“ aktualisiert',

  identityConflict:
    'Diese E-Mail-Adresse oder dieser Benutzername wird bereits verwendet.',
  signInAgain: 'Erneut anmelden',
  passwordPolicy:
    'Das Passwort entspricht nicht der aktuellen Passwortrichtlinie.',

  reload: 'Rolle neu laden',
  title: 'Systemeinstellungen',
  users: 'Benutzer',
  roles: 'Rollen und Berechtigungen',
  usersDescription: 'Konten, Zugriff und aktive Sitzungen verwalten.',
  rolesDescription:
    'Festlegen, worauf jede Rolle zugreifen und was sie tun darf.',
  userSearch: 'Nach Name, Benutzername oder E-Mail suchen',
  roleSearch: 'Nach Rollennamen suchen',
  newUser: 'Neuer Benutzer',
  editUser: 'Benutzer bearbeiten',
  newRole: 'Neue Rolle',
  editRole: 'Rolle bearbeiten',
  name: 'Name',
  username: 'Benutzername',
  email: 'E-Mail',
  password: 'Anfangspasswort',
  roleType: 'Rollentyp',
  roleName: 'Rollenname',
  key: 'Schlüssel',
  status: 'Status',
  actions: 'Aktionen',
  actionsFor: 'Aktionen für {{name}}',
  all: 'Alle Status',
  enabled: 'Aktiviert',
  disabled: 'Deaktiviert',
  clear: 'Filter zurücksetzen',
  noResults: 'Keine passenden Ergebnisse',
  clearHint:
    'Versuchen Sie eine andere Suche oder setzen Sie die Filter zurück.',
  noUsers: 'Noch keine Benutzer',
  noRoleAccess:
    'Dieser Benutzer kann sich weiterhin anmelden und grundlegende Kontofunktionen nutzen. Rollen gewähren keinen Zugriff auf Geschäftsfunktionen.',
  noAssignedRoles: 'Keine Rollen zugewiesen',
  noRoles: 'Noch keine Rollen',
  create: 'Erstellen',
  edit: 'Bearbeiten',
  save: 'Speichern',
  cancel: 'Abbrechen',
  saving: 'Wird gespeichert…',
  confirm: 'Bestätigen',
  enable: 'Aktivieren',
  disable: 'Deaktivieren',
  revokeSessions: 'Sitzungen beenden',
  disableTitle: 'Benutzer „{{name}}“ deaktivieren?',
  disableHint:
    'Dieser Benutzer kann sich nicht mehr anmelden, und bestehende Sitzungen werden beendet.',
  enableTitle: 'Benutzer „{{name}}“ aktivieren?',
  enableHint: 'Dieser Benutzer kann sich wieder anmelden.',
  revokeTitle: 'Sitzungen von „{{name}}“ beenden?',
  revokeHint: 'Dieser Benutzer muss sich erneut anmelden.',
  revokeRoleTitle: 'Rollen von „{{name}}“ entziehen?',
  revokeRoleHint:
    'Der durch die aufgeführten Rollen gewährte Zugriff wird entfernt.',
  created: 'Benutzer „{{name}}“ erstellt',
  saved: '„{{name}}“ gespeichert',
  rolesSaved: 'Rollen von „{{name}}“ aktualisiert',
  required: 'Geben Sie einen Wert für dieses Feld ein',
  invalidEmail: 'Geben Sie eine gültige E-Mail-Adresse ein',
  protected: 'Geschützt',
  custom: 'Benutzerdefiniert',
  protectedHint:
    'Diese Rolle ist geschützt. Nur ausdrücklich erlaubte Änderungen sind möglich.',
  unsaved: 'Ungespeicherte Änderungen',
  discardTitle: 'Änderungen verwerfen?',
  discardHint: 'Ihre ungespeicherten Änderungen gehen verloren.',
  failed:
    'Die Anfrage konnte nicht abgeschlossen werden. Versuchen Sie es erneut.',
  retry: 'Erneut versuchen',
  loading: 'Wird geladen',
  denied: 'Sie haben keinen Zugriff. Wenden Sie sich an einen Administrator.',
  missing: 'Dieser Datensatz existiert nicht oder wurde gelöscht.',
  conflict:
    'Die Anfrage steht im Konflikt mit den aktuellen Daten. Prüfen Sie den neuesten Stand, bevor Sie es erneut versuchen.',
  sessionEnded: 'Ihre Sitzung ist abgelaufen. Melden Sie sich erneut an.',
  previous: 'Zurück',
  next: 'Weiter',
  total_one: '{{count}} Benutzer',
  total_other: '{{count}} Benutzer',
  access: 'Zugriff',
  permissionSearch: 'Kategorien, Gruppen oder Berechtigungen suchen',
  enabledOnly: 'Nur aktivierte',
  noPermissions: 'Keine Berechtigungen zu konfigurieren',
  permissionCategories: 'Berechtigungskategorien',
  selectAllPermissions: 'Alle',
  dataRanges: 'Datenbereiche ({{count}})',
  selectVisiblePermissions: 'Sichtbare Berechtigungen in {{name}} auswählen',
  permissionSummary: '{{enabled}} von {{total}} aktiviert',
  preservedRecordScope: 'Bestehende Konfiguration beibehalten',
  noRecordScope: 'Standardregeln verwenden',
  permissionFilter: {
    limit: 'Bis zu 20 Bedingungen',
    configure: 'Bedingungen',
    title: 'Datensatzfilter konfigurieren',
    description:
      'Übernehmen Sie die Bedingungen in den Rollenentwurf und speichern Sie dann die Rolle, damit sie wirksam werden.',
    all: 'Alle Bedingungen erfüllen',
    any: 'Eine beliebige Bedingung erfüllen',
    field: 'Feld',
    operator: 'Operator',
    valueType: 'Werttyp',
    value: 'Wert',
    text: 'Text',
    number: 'Zahl',
    boolean: 'Boolescher Wert',
    true: 'Ja',
    false: 'Nein',
    add: 'Bedingung hinzufügen',
    remove: 'Entfernen',
    cancel: 'Abbrechen',
    apply: 'Übernehmen',
    invalid:
      'Wählen Sie gültige Felder und füllen Sie alle Werte aus. Fügen Sie mindestens eine Bedingung hinzu.',
    advanced:
      'Dieser bestehende Filter verwendet erweiterte Bedingungen. Er bleibt erhalten, sofern Sie ihn nicht ausdrücklich neu konfigurieren.',
    reconfigure: 'Neu konfigurieren',
    operators: {
      $eq: 'Ist gleich',
      $ne: 'Ist ungleich',
      $includes: 'Enthält',
      $gt: 'Größer als',
      $gte: 'Mindestens',
      $lt: 'Kleiner als',
      $lte: 'Höchstens',
      $empty: 'Ist leer',
      $notEmpty: 'Ist nicht leer',
    },
  },
  recordScope: 'Datensatzbereich',
  levelFor: 'Bereich für {{name}}',
  userActionSaved: {
    disable: 'Benutzer „{{name}}“ deaktiviert',
    enable: 'Benutzer „{{name}}“ aktiviert',
    revokeSessions: 'Aktive Sitzungen von „{{name}}“ beendet',
  },
  roleFilterIncomplete:
    'Wählen Sie sowohl einen Rollenbereich als auch eine Rolle aus, oder setzen Sie die Filter zurück.',
  backToSource: 'Zurück zur vorherigen Seite',
  roleFilter: 'Nach Rolle filtern',
  allRoles: 'Alle Rollen',
  editUserFor: '{{name}} bearbeiten',
  usersReadOnlyEmpty:
    'Wenden Sie sich an einen Administrator, um Benutzer hinzuzufügen oder die Berechtigungen zum Anlegen von Benutzern und Zuweisen von Rollen zu erhalten.',
  rolesReadOnlyEmpty:
    'Wenden Sie sich an einen Administrator, um eine Rolle anzulegen oder die Berechtigung zum Anlegen von Rollen zu erhalten.',
  selectRoles: 'Rollen auswählen',
  searchRoles: 'Rollen suchen',
  noRolesFound: 'Keine Rollen gefunden.',
  invalidRequest:
    'Einige Werte sind ungültig. Prüfen Sie Ihre Eingaben oder Filter und versuchen Sie es erneut.',
  expandPermissionGroup: '{{name}} aufklappen',
  collapsePermissionGroup: '{{name}} zuklappen',
  pagesOutsideNavigation: 'Seiten außerhalb der Navigation',
  configurationPermissions: 'Konfigurationsberechtigungen',
  configurationPermissionsHint:
    'Steuert Zugriff und Aktionen für Systemeinstellungen, Benutzerverwaltung und Geschäftskonfiguration. Es werden nur tatsächlich vorhandene Funktionen der Anwendung angezeigt.',
  permissionEmptyHint:
    'Bitten Sie die Entwickler der Anwendung, die Berechtigungen freizugeben, die diese Rolle konfigurieren kann.',
  permissionReadOnlyHint: 'Diese Berechtigungen sind schreibgeschützt.',
  permissionManagedHint: 'Diese Berechtigung wird von der Anwendung verwaltet.',
  permissionSaveHint: 'Änderungen an Berechtigungen gelten nach dem Speichern.',
  permissionAll: 'Alle',
  permissionGranted: 'Erteilt',
  permissionUngranted: 'Nicht erteilt',
  permissionStatus: 'Berechtigungsstatus',
  permissionClearSearch: 'Suche löschen',
  permissionCollapseAll: 'Alle einklappen',
  permissionExpandAll: 'Alle ausklappen',
};
export default settings;
