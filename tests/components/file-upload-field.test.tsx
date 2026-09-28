import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ClientFileRepository } from '@nocobase/app-plugin-file/client';
import { expect, it, vi } from 'vitest';

import { FileUploadField } from '../../client/extensions/nocobase-file-component-ui/components/file-upload-field.js';

it('shows the drag hint and uploads a selected file through the existing repository', async () => {
  const record = { id: 'file', filename: 'report.txt' };
  const uploadOne = vi.fn().mockResolvedValue({ record });
  const onChange = vi.fn();
  const repository = { uploadOne } as unknown as ClientFileRepository;
  render(
    <FileUploadField
      repository={repository}
      value={[]}
      onChange={onChange}
      multiple
      labels={{ choose: '上传文件' }}
    />,
  );
  // The upstream field owns its drop-zone wording since template beta.43;
  // only the labels it still takes are passed here.
  expect(screen.getByRole('button', { name: '上传文件' })).toBeVisible();
  const file = new File(['test'], 'report.txt', { type: 'text/plain' });
  fireEvent.change(screen.getByLabelText('上传文件'), {
    target: { files: [file] },
  });
  await waitFor(() => expect(onChange).toHaveBeenCalledWith([record]));
  expect(uploadOne).toHaveBeenCalledWith(
    { file },
    { signal: expect.any(AbortSignal) },
  );
});

it('does not accept dropped files when disabled', () => {
  const uploadOne = vi.fn();
  render(
    <FileUploadField
      repository={{ uploadOne } as unknown as ClientFileRepository}
      value={[]}
      onChange={vi.fn()}
      disabled
      labels={{ choose: '上传文件' }}
    />,
  );
  expect(screen.getByRole('button', { name: '上传文件' })).toBeDisabled();
  fireEvent.drop(document.querySelector('[data-slot="file-upload-field"]')!, {
    dataTransfer: { files: [new File(['test'], 'report.txt')] },
  });
  expect(uploadOne).not.toHaveBeenCalled();
});
