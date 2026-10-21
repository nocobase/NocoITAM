import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { RecordImage } from '../../client/components/itam/record-image.js';

const uploaded = vi.hoisted(() => ({ files: [] as File[] }));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@nocobase/app-client', () => ({
  useService: () => ({
    repository: () => ({
      uploadOne: ({ file }: { file: File }) => {
        uploaded.files.push(file);
        return Promise.resolve({ record: { id: 'f1' } });
      },
    }),
  }),
}));
vi.mock('@nocobase/app-plugin-file/client', () => ({
  clientFileRepositoryManagerToken: Symbol('files'),
}));
vi.mock('../../client/lib/itam/images.js', () => ({
  IMAGE_REPOSITORY: 'itamFiles',
  useRecordImageUrl: () => undefined,
}));

// No picture (2026-10-21): nothing for a reader; for whoever may edit, a
// frame that takes a chosen or a dropped image.
it('shows nothing to a reader when there is no picture', () => {
  const { container } = render(<RecordImage fileId={null} alt='Mouse' />);
  expect(container).toBeEmptyDOMElement();
});

it('uploads an image dropped on the empty frame', async () => {
  const onChange = vi.fn(() => Promise.resolve());
  render(
    <RecordImage fileId={null} alt='Mouse' editable onChange={onChange} />,
  );
  const frame = screen.getByRole('button', { name: /image\.upload/ });
  const picture = new File(['x'], 'mouse.png', { type: 'image/png' });
  await act(async () => {
    fireEvent.drop(frame, {
      dataTransfer: { files: [picture], types: ['Files'] },
    });
  });
  expect(uploaded.files).toEqual([picture]);
  expect(onChange).toHaveBeenCalledWith({ id: 'f1' });
});
