import { defineHttpMiddleware } from '@nocobase/app-server/router';
import type { Application } from '@nocobase/app-server/application';

/**
 * The second line against exfiltration through the assistant's Markdown.
 *
 * The model's answers are rendered as Markdown, and the register's own fields
 * reach the conversation, so an instruction planted in a device's notes or an
 * imported row can ask for an image whose URL carries what the model just
 * read. The renderer loads only images on this site
 * (`MarkdownImage` in `client/components/markdown-view.tsx`), and this header
 * holds the same line in the browser should a renderer ever miss it.
 *
 * Only `img-src` is set. A fuller policy would have to account for the
 * client's inline styles and the dev server, and getting one wrong breaks the
 * application rather than an attack; narrowing where the browser will load an
 * image costs nothing and is the whole of this particular path. `'self'`
 * covers the application's own uploads, `data:` and `blob:` the charts a
 * report builds for itself.
 */
export const securityHeadersHttpMiddleware = defineHttpMiddleware<Application>({
  name: 'security-headers',
  register(router) {
    router.use('*', async (context, next) => {
      await next();
      context.header(
        'Content-Security-Policy',
        "img-src 'self' data: blob:",
        // Added to whatever a response set for itself rather than replacing it.
        { append: false },
      );
    });
  },
});
