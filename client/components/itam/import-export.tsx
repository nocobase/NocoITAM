import { useTranslation } from '@nocobase/i18n/client';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Upload } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useApi } from '@/lib/itam/api';
import {
  downloadExport,
  IMPORTABLE,
  useImportStep,
  type ImportPreview,
  type ImportReport,
} from '@/lib/itam/data';
import { errorMessage } from '@/lib/itam/format';
import { useCollectionPermissions } from '@/lib/itam/permissions';

const NONE = '__none__';

/**
 * Import (a three-step wizard: file → mapping → validation and commit) and
 * export (the list's current filter as CSV) for one collection. The export
 * carries only the columns the caller may read; the import goes through
 * the same services as the forms.
 */
export function ImportExport({
  collection,
  exportQuery,
  columns,
}: {
  readonly collection: string;
  /** The current list filter, so the export matches what the user sees. */
  readonly exportQuery: Readonly<Record<string, string | undefined>>;
  readonly columns?: readonly string[];
}): ReactElement | null {
  const { t } = useTranslation();
  const api = useApi();
  const permissions = useCollectionPermissions(collection, [
    'read',
    'create',
    'export',
  ]);
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const importable =
    Boolean(IMPORTABLE[collection]) && Boolean(permissions.create);
  if (!permissions.read) return null;
  const query = Object.fromEntries(
    Object.entries(exportQuery).filter((entry): entry is [string, string] =>
      Boolean(entry[1]),
    ),
  );
  return (
    <>
      <Button
        variant='outline'
        size='icon'
        aria-label={t('data.export')}
        title={t('data.export')}
        disabled={exporting}
        onClick={() => {
          setExporting(true);
          void downloadExport(api, collection, query, columns).finally(() =>
            setExporting(false),
          );
        }}
      >
        <Download />
      </Button>
      {importable ? (
        <>
          <Button
            variant='outline'
            size='icon'
            aria-label={t('data.import')}
            title={t('data.import')}
            onClick={() => setOpen(true)}
          >
            <Upload />
          </Button>
          {open ? (
            <ImportWizard
              collection={collection}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}

function ImportWizard({
  collection,
  onClose,
}: {
  readonly collection: string;
  readonly onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const preview = useImportStep<ImportPreview>(collection, 'preview');
  const validate = useImportStep<ImportReport>(collection, 'validate');
  const commit = useImportStep<ImportReport>(collection, 'commit');
  const [csv, setCsv] = useState<string>();
  const [fileName, setFileName] = useState<string>();
  const [mapping, setMapping] = useState<Record<string, string | undefined>>(
    {},
  );
  const [report, setReport] = useState<ImportReport>();
  const [committed, setCommitted] = useState(false);
  const step = !preview.data ? 1 : !committed ? 2 : 3;
  const busy = preview.isPending || validate.isPending || commit.isPending;
  const error = preview.error ?? validate.error ?? commit.error;

  const load = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      setCsv(content);
      setFileName(file.name);
      setReport(undefined);
      setCommitted(false);
      void preview
        .mutateAsync({ csv: content })
        .then((result) => setMapping({ ...result.mapping }));
    };
    reader.readAsText(file);
  };

  const errorRowsCsv = () => {
    if (!report) return;
    const rows = report.rows.filter((row) => row.status === 'error');
    const lines = [
      'line,errors',
      ...rows.map(
        (row) => `${row.line},"${row.errors.join('; ').replace(/"/g, '""')}"`,
      ),
    ];
    const url = URL.createObjectURL(
      new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${collection}-errors.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className='max-h-[90svh] overflow-y-auto sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>
            {t('data.importTitle', {
              object: t(`references.${collection}`, {
                defaultValue: collection,
              }),
            })}
          </DialogTitle>
          <DialogDescription>{t(`data.step${step}`)}</DialogDescription>
        </DialogHeader>
        <div className='space-y-4'>
          <div className='grid gap-1.5'>
            <Label htmlFor='import-file'>{t('data.file')}</Label>
            <input
              id='import-file'
              type='file'
              accept='.csv,text/csv'
              className='text-sm'
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) load(file);
              }}
            />
            {fileName && preview.data ? (
              <p className='text-xs text-muted-foreground'>
                {t('data.fileLoaded', {
                  name: fileName,
                  rows: preview.data.total,
                })}
              </p>
            ) : null}
          </div>
          {preview.data?.groupBy ? (
            // A document import: the reader has to know that repeating the
            // key is how a second line is added, not a second record.
            <p className='text-xs text-muted-foreground'>
              {t('data.groupedRows', {
                field: t(`fields.${preview.data.groupBy}`, {
                  defaultValue: preview.data.groupBy,
                }),
              })}
            </p>
          ) : null}
          {preview.data ? (
            <div className='space-y-2'>
              <h3 className='text-sm font-medium'>{t('data.mapping')}</h3>
              <div className='grid gap-2 sm:grid-cols-2'>
                {preview.data.fields.map((field) => (
                  <div key={field.key} className='grid min-w-0 gap-1'>
                    <Label htmlFor={`map-${field.key}`} className='text-xs'>
                      {t(`fields.${field.key.replace(/Id$/, '')}`, {
                        defaultValue: field.key,
                      })}
                      {field.required ? (
                        <span className='text-destructive'> *</span>
                      ) : null}
                      {field.reference ? (
                        <span className='text-muted-foreground'>
                          {' '}
                          (
                          {t('data.byName', {
                            collection: t(`references.${field.reference}`, {
                              defaultValue: field.reference,
                            }),
                          })}
                          )
                        </span>
                      ) : null}
                    </Label>
                    <Select
                      items={[
                        { value: NONE, label: t('data.notMapped') },
                        ...preview.data.columns.map((column) => ({
                          value: column,
                          label: column,
                        })),
                      ]}
                      value={mapping[field.key] ?? NONE}
                      onValueChange={(value) =>
                        setMapping((current) => ({
                          ...current,
                          [field.key]:
                            value === NONE ? undefined : String(value),
                        }))
                      }
                    >
                      <SelectTrigger id={`map-${field.key}`} className='w-full'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>
                          {t('data.notMapped')}
                        </SelectItem>
                        {preview.data.columns.map((column) => (
                          <SelectItem key={column} value={column}>
                            {column}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {report ? (
            <div className='space-y-2'>
              <div className='flex flex-wrap items-center gap-2 text-sm'>
                <Badge variant='secondary'>
                  {t('data.creates', { count: report.creates })}
                </Badge>
                <Badge variant='secondary'>
                  {t('data.updates', { count: report.updates })}
                </Badge>
                <Badge variant={report.errors > 0 ? 'destructive' : 'outline'}>
                  {t('data.errors', { count: report.errors })}
                </Badge>
                {report.errors > 0 ? (
                  <Button variant='ghost' onClick={errorRowsCsv}>
                    <Download data-icon='inline-start' />
                    {t('data.downloadErrors')}
                  </Button>
                ) : null}
              </div>
              {report.errors > 0 ? (
                <div className='max-h-60 min-w-0 overflow-auto rounded-md border border-border bg-card'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('data.line')}</TableHead>
                        <TableHead>{t('data.problem')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.rows
                        .filter((row) => row.status === 'error')
                        .map((row) => (
                          <TableRow key={row.line}>
                            <TableCell className='tabular-nums'>
                              {row.line}
                            </TableCell>
                            <TableCell className='whitespace-normal'>
                              {row.errors.join('; ')}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
              {committed ? (
                <p className='text-sm text-muted-foreground'>
                  {t('data.committed')}
                </p>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <p className='text-sm text-destructive'>{errorMessage(error)}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onClose} disabled={busy}>
            {committed ? t('actions.close') : t('actions.cancel')}
          </Button>
          {csv && preview.data && !committed ? (
            <Button
              variant={report ? 'outline' : 'default'}
              disabled={busy}
              onClick={() =>
                void validate.mutateAsync({ csv, mapping }).then(setReport)
              }
            >
              {t('data.validate')}
            </Button>
          ) : null}
          {csv && report && !committed ? (
            <Button
              disabled={busy || report.creates + report.updates === 0}
              onClick={() =>
                void commit.mutateAsync({ csv, mapping }).then((result) => {
                  setReport(result);
                  setCommitted(true);
                  void queryClient.invalidateQueries({ queryKey: ['itam'] });
                })
              }
            >
              {t('data.commit', { count: report.creates + report.updates })}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
