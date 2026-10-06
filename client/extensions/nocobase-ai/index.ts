import './locales/index.js';

export * from './components/index.js';
export * from './providers/index.js';
export * from './services/index.js';
// Application change (ITAM): the chat mark, for the application's own entry
// to the assistant in the header (`AiHeaderButton` in client/layouts/ai-panel.tsx).
export { NocoBaseAIChatIcon } from './shared/icons/nocobase-ai-chat-icon.js';
