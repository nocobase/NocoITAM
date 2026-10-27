# NocoITAM

[English](../README.MD) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | [Deutsch](README.de-DE.md) | Français | [Español](README.es-ES.md) | [Português](README.pt-BR.md) | [Русский](README.ru-RU.md) | [Bahasa Indonesia](README.id-ID.md) | [Tiếng Việt](README.vi-VN.md)

NocoITAM est un système open source de gestion des actifs informatiques, construit sur [NocoBase 3](https://www.nocobase.com). Les outils ITAM traditionnels sont des registres tenus à la main. Dans NocoITAM, les agents démêlent les écarts MDM, équipent les nouveaux collaborateurs, et vérifient le stock et les actifs inutilisés avant chaque achat. Chaque appareil, chaque licence et chaque dépense est tracé.

https://github.com/user-attachments/assets/b084f1c8-0f76-4d5b-84ef-836193c13c12

[Essayer en ligne](https://solutions.nocobase.com/itam/) · [Site web](https://www.nocobase.com/fr-FR/solution-itam/)

## Ce qu’il fait

- **Chaque achat vérifie d’abord le stock.** Quand une commande part en approbation, l’assistant d’approbation regarde si le stock ou des appareils inutilisés peuvent la couvrir, compare les prix passés et les demandes similaires, et rédige une décision et un commentaire pour l’approbateur.
- **Les arrivants équipés dès le premier jour, les partants rendent tout.** Le kit d’arrivée d’un nouveau collaborateur est rapproché en une fois du stock et des licences inutilisées, et les commandes manquantes se créent en un clic. Les appareils, accessoires et licences d’un partant sont suivis jusqu’à leur retour complet, et ses dossiers sont transmis.
- **Les écarts MDM deviennent un plan.** Après chaque synchronisation avec Intune ou Jamf Pro, l’agent trie ce qui ne concorde pas : un mauvais utilisateur va au responsable de l’appareil, un appareil non enregistré aux gestionnaires d’actifs, et les cas incertains à une personne.
- **Un seul registre pour tout ce que possède l’IT.** Appareils, accessoires, consommables, composants et licences logicielles, de l’achat à la réception, l’attribution, le prêt, la réparation et l’inventaire jusqu’à la mise au rebut, chaque fiche avec son historique.
- **Un assistant sur chaque page.** L’Intendant des actifs répond à partir des fiches que vous pouvez consulter et propose des plans que vous confirmez. Quand une tâche arrive avec un devis, une facture ou un bon de livraison, l’IA le lit et remplit le formulaire pour que vous le vérifiiez. Les agents proposent, les personnes décident.
- **Vos règles, votre code.** Écrivez vos kits standard, vos budgets et vos règles d’approbation dans les repères métier, et chaque agent les suit. Demandez à un agent de code de modifier le code source d’ITAM lui-même. Open source, auto-hébergé, et à vous.

## Démarrage rapide

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

## Licence

[Apache License 2.0](../LICENSE)
