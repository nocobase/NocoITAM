<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/nocoitam-logo-dark.svg">
    <img src="images/nocoitam-logo.svg" width="240" alt="NocoITAM">
  </picture>
</h1>

<p align="center"><strong>Les agents s’en chargent. Votre parc IT en ordre.</strong></p>

<p align="center">Gestion des actifs IT open source · Construit sur NocoBase</p>

<p align="center">
  <a href="../LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0"></a>
  <a href="https://github.com/nocobase/NocoITAM/tags"><img src="https://img.shields.io/github/v/tag/nocobase/NocoITAM?label=version&sort=semver&include_prereleases" alt="version"></a>
  <a href="https://www.nocobase.com"><img src="https://img.shields.io/badge/built%20on-NocoBase-1f6feb" alt="Built on NocoBase"></a>
</p>

<p align="center">
  <a href="https://solutions.nocobase.com/itam/"><strong>Essayer en ligne</strong></a> · <a href="https://www.nocobase.com/fr-FR/solution-itam/">Site web</a>
</p>

<p align="center">
  <a href="../README.MD">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja-JP.md">日本語</a> · <a href="README.ko-KR.md">한국어</a> · <a href="README.de-DE.md">Deutsch</a> · <strong>Français</strong> · <a href="README.es-ES.md">Español</a> · <a href="README.pt-BR.md">Português</a> · <a href="README.ru-RU.md">Русский</a> · <a href="README.id-ID.md">Bahasa Indonesia</a> · <a href="README.vi-VN.md">Tiếng Việt</a>
</p>

NocoITAM est un système open source de gestion des actifs informatiques, construit sur [NocoBase](https://www.nocobase.com). Les outils ITAM traditionnels sont des registres tenus à la main. Dans NocoITAM, les agents démêlent les écarts MDM, équipent les nouveaux collaborateurs, et vérifient le stock et les actifs inutilisés avant chaque achat. Chaque appareil, chaque licence et chaque dépense est tracé.

https://github.com/user-attachments/assets/b084f1c8-0f76-4d5b-84ef-836193c13c12

## Fonctionnalités

- **Chaque achat vérifie d’abord le stock.** Quand une commande part en approbation, l’assistant d’approbation regarde si le stock ou des appareils inutilisés peuvent la couvrir, compare les prix passés et les demandes similaires, et rédige une décision et un commentaire pour l’approbateur.
- **Les arrivants équipés dès le premier jour.** Chaque service et chaque poste a son kit d’arrivée. Le plan d’un arrivant puise dans le stock, les licences inutilisées, les commandes en route et les retours des partants ; l’IA choisit les appareils en donnant ses raisons, et les commandes manquantes se créent en un clic.
- **Les partants rendent tout.** Les appareils, accessoires et licences d’un partant sont suivis jusqu’à leur retour complet, ses dossiers sont transmis, et sa connexion est désactivée à son dernier jour.
- **Les écarts MDM deviennent un plan.** Microsoft Intune et Jamf Pro sont synchronisés chaque nuit et rapprochés par numéro de série. L’agent trie ce qui ne concorde pas : un mauvais utilisateur va au responsable de l’appareil, un appareil non enregistré aux gestionnaires d’actifs, et les cas incertains à une personne.
- **Saisie intelligente.** Collez ou déposez un devis, une facture ou un bon de livraison : l’IA remplit la commande en rattachant ses lignes à vos modèles, contrôle une livraison par rapport à la commande (quantités, numéros de série, garantie) et lit les rapports de réparation et les certificats de mise au rebut. Les caractéristiques d’un nouveau modèle sont complétées depuis le web.
- **3 agents, et l’IA là où le travail se fait.** L’Intendant des actifs répond sur chaque page à partir des fiches que vous pouvez consulter, et propose des plans que vous confirmez sur une carte. L’assistant d’approbation et le suivi MDM travaillent en arrière-plan, et l’IA aide à 11 endroits, de la réception à la comparaison d’un devis de réparation avec le remplacement de l’appareil. Les agents proposent, les personnes décident.
- **Licences et abonnements maîtrisés.** Par utilisateur, par appareil, site ou gratuit, avec sièges, clés et dates de renouvellement. La conformité est recalculée à chaque changement, et les sièges en surnombre ou inutilisés sont signalés avant le renouvellement.
- **Rien ne passe entre les mailles.** Les tâches commencent par 14 contrôles de risque (garanties et abonnements qui arrivent à échéance, sièges inutilisés, stock sous le minimum, appareils non inventoriés depuis un an), puis le travail de l’équipe en colonnes : approbations, arrivées et départs, commandes, réparations, mises au rebut et inventaires.
- **Un seul registre pour tout ce que possède l’IT.** Appareils, accessoires, consommables, composants et licences logicielles, de l’achat à la réception, l’attribution, le prêt, la réparation et l’inventaire jusqu’à la mise au rebut, chaque fiche avec son historique. 10 rapports, import et export CSV, et une recherche sur toutes les fiches (⌘K / Ctrl+K).
- **Personnalisable.** Écrivez vos kits standard, vos budgets et vos règles d’approbation en langage courant dans les repères métier, et chaque agent les suit ; la méthode de chaque agent est une compétence modifiable. Le code source est ouvert, un agent de code peut changer le reste.
- **Auto-hébergé.** Vos données restent sur vos serveurs, avec les modèles de votre choix : DeepSeek, OpenAI, Claude, Gemini, Qwen et d’autres. 12 langues d’interface. Apache-2.0.

## Démarrage rapide

Envie de jeter un œil ? [Essayer en ligne](https://solutions.nocobase.com/itam/) : vous êtes connecté à un compte de démonstration, et toutes les données sont fictives.

### 1. Installer

**Avec un agent de code.** Le plus simple. Ouvrez Claude Code, Codex ou Cursor dans le dossier qui doit accueillir NocoITAM, et donnez-lui ceci :

```text
Installe NocoITAM depuis https://github.com/nocobase/NocoITAM et démarre-le, en suivant le AGENTS.md et le README du dépôt.
```

**À la main.** Il vous faut Node.js 24 ou plus récent et pnpm 10 (`corepack enable`). Les données vont par défaut dans un fichier SQLite ; PostgreSQL et MySQL fonctionnent aussi.

```bash
git clone https://github.com/nocobase/NocoITAM.git
cd NocoITAM
pnpm install
pnpm nocobase config init --dialect sqlite
pnpm dev
```

### 2. Se connecter

Ouvrez l’adresse `Local:` qu’affiche `pnpm dev`, en général `http://127.0.0.1:13000/main/`, et connectez-vous avec `nocobase` et le mot de passe `admin123`.

### 3. Importer les données de démonstration

La bannière en haut les propose, ou ouvrez **Paramètres → Données de démonstration**. Elles apportent une entreprise d’une quarantaine de personnes avec ses appareils, son stock et ses licences, des commandes, des réparations, des inventaires et des mises au rebut, ainsi que des plateformes Intune et Jamf de démonstration ; supprimez-les au même endroit quand vous démarrez pour de bon.

### 4. Configurer un modèle d’IA

Ajoutez un service de modèle avec sa clé dans **Équipe d’agents → Modèles**, par exemple DeepSeek, OpenAI, Claude, Gemini ou Qwen. L’Intendant des actifs et les agents en ont besoin ; tout le reste fonctionne sans.

Le [guide](guide.md) (en anglais) couvre les étapes suivantes, les comptes de démonstration, les rôles, les agents, la configuration (IA, MDM, bases de données), le déploiement et le développement.

Pour la mise en production, voir [Déploiement](guide.md#deployment) ; pour PostgreSQL et MySQL, voir [Configuration](guide.md#configuration).

## Licence

NocoITAM est construit sur NocoBase et publié sous la licence [Apache-2.0](../LICENSE).
