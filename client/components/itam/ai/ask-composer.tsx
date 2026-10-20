import { ArrowUp, Paperclip, Sparkles, X } from 'lucide-react';
import {
  Fragment,
  useRef,
  type KeyboardEvent,
  type ReactElement,
  type RefObject,
} from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '#components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#components/ui/tooltip';
import { modelKey, type AskFile, type AskModel } from '@/lib/itam/ask';
import { useFileDrag } from '@/lib/itam/file-drag';

import type { AskDraft } from './ask-draft.js';

// Ported from NocoCRM (assistant-ask-composer.tsx, 2026-10-16). The ask
// box's composer at the bottom of pages: the
// question grows past one line (Enter sends, Shift+Enter breaks the line),
// files are attached with the paperclip, dropped or pasted and uploaded at
// once, and the model the conversation runs on is picked beside them.
// Collapsed (the dock until it is clicked), it is one line: the AI mark,
// the question and the send button, without the files and the model. The
// question's textarea keeps its place in the tree between the two, so the
// focus that expands the box stays in it. Inside a TooltipProvider.
export function AskComposer({
  draft,
  placeholder,
  disabled,
  expanded,
  inputRef,
  className,
  inputClassName,
  onKeyDown,
  onModelMenu,
}: {
  draft: AskDraft;
  placeholder: string;
  // Not ready to send (the chat still loading, or unable to start): the box
  // is drawn faded and takes no input.
  disabled: boolean;
  expanded: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  // The box's shape and size, by where it sits.
  className: string;
  // The question's padding and type size in the expanded box.
  inputClassName: string;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  // The model menu opening or closing: it lies outside the box, so the dock
  // keeps itself expanded while it is open.
  onModelMenu?: (open: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const drag = useFileDrag(!disabled);
  const fileRef = useRef<HTMLInputElement>(null);
  const { files, model } = draft;
  // The models by service, as the select groups them.
  const groups = [...draft.models].reduce<
    { key: string; label: string; models: AskModel[] }[]
  >((list, item) => {
    const group = list.find((entry) => entry.key === item.modelService);
    if (group) group.models.push(item);
    else
      list.push({
        key: item.modelService,
        label: item.serviceTitle,
        models: [item],
      });
    return list;
  }, []);
  const attachLabel = t('ai.dock.attach');
  const sendLabel = t('ai.dock.send');

  const sendButton = (
    <Tooltip>
      <TooltipTrigger
        render={
          <InputGroupButton
            size='icon-sm'
            aria-label={sendLabel}
            disabled={!draft.canSend}
            className='rounded-full bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground disabled:bg-muted disabled:text-muted-foreground'
            onClick={() => draft.send()}
          />
        }
      >
        <ArrowUp />
      </TooltipTrigger>
      <TooltipContent>{sendLabel}</TooltipContent>
    </Tooltip>
  );

  return (
    <>
      <InputGroup
        // In the ask boxes' AI border (client/styles.css). The primitive
        // fades the whole group while any control in it is disabled, and
        // the send button is whenever the box is empty: only a box that
        // cannot send yet fades here.
        className={`itam-ai-border has-disabled:bg-card dark:bg-card dark:has-disabled:bg-card ${
          disabled ? 'opacity-60' : 'has-disabled:opacity-100'
        } ${drag.over ? 'ring-2 ring-ring/30' : ''} ${className}`}
        {...drag.bind}
        onDragOver={(event) => {
          if (!disabled && event.dataTransfer.types.includes('Files'))
            event.preventDefault();
        }}
        onDrop={(event) => {
          if (disabled || !event.dataTransfer.files.length) return;
          event.preventDefault();
          files.upload(Array.from(event.dataTransfer.files));
        }}
      >
        {expanded && files.files.length > 0 ? (
          <InputGroupAddon align='block-start' className='px-4 pt-3'>
            <ul className='flex flex-wrap gap-1.5'>
              {files.files.map((file) => (
                <FileChip
                  key={file.uid}
                  file={file}
                  onRemove={() => files.remove(file.uid)}
                />
              ))}
            </ul>
          </InputGroupAddon>
        ) : null}
        {expanded ? null : (
          <InputGroupAddon className='pl-4'>
            <Sparkles className='text-primary' />
          </InputGroupAddon>
        )}
        <InputGroupTextarea
          ref={inputRef}
          value={draft.value}
          rows={1}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={placeholder}
          // Expanded, one line high until more is written, then growing with
          // the text up to a third of the window, past which it scrolls;
          // collapsed, the one line of the dock.
          className={
            expanded
              ? `max-h-[33vh] min-h-0 ${inputClassName}`
              : 'h-11 min-h-0 overflow-hidden py-3 text-sm leading-5'
          }
          onChange={(event) => draft.setValue(event.target.value)}
          onKeyDown={(event) => {
            onKeyDown?.(event);
            if (event.defaultPrevented) return;
            // Enter while an input method is composing only confirms the
            // composition; Shift+Enter breaks the line.
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              draft.send();
            }
          }}
          onPaste={(event) => {
            const pasted = Array.from(event.clipboardData.items)
              .filter((item) => item.kind === 'file')
              .map((item) => item.getAsFile())
              .filter((file): file is File => file !== null);
            if (!pasted.length || disabled) return;
            event.preventDefault();
            files.upload(pasted);
          }}
        />
        {expanded ? null : (
          // Clear of the round end, rather than following its curve (the
          // primitive pulls a button outward, `has-[>button]:mr-*`).
          <InputGroupAddon
            align='inline-end'
            className='pr-2.5 has-[>button]:mr-0'
          >
            {sendButton}
          </InputGroupAddon>
        )}
        {expanded ? (
          <InputGroupAddon
            align='block-end'
            className='justify-between gap-2 px-3 pb-2.5'
          >
            <div className='flex min-w-0 items-center gap-1.5'>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <InputGroupButton
                      size='icon-sm'
                      aria-label={attachLabel}
                      disabled={disabled}
                      className='rounded-full'
                      onClick={() => fileRef.current?.click()}
                    />
                  }
                >
                  <Paperclip />
                </TooltipTrigger>
                <TooltipContent>{attachLabel}</TooltipContent>
              </Tooltip>
              {model && draft.models.length > 1 && (
                <Select
                  value={modelKey(model)}
                  disabled={disabled}
                  onOpenChange={(open) => onModelMenu?.(open)}
                  onValueChange={(next) => {
                    if (typeof next === 'string') draft.selectModel(next);
                  }}
                >
                  <SelectTrigger
                    size='sm'
                    aria-label={t('ai.dock.model')}
                    title={model.modelLabel}
                    className='max-w-48 min-w-0 rounded-full border-0 bg-muted/60 shadow-none'
                  >
                    <SelectValue>
                      <span className='truncate'>{model.modelLabel}</span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className='max-h-96 min-w-56'>
                    {groups.map((group, index) => (
                      <Fragment key={group.key}>
                        {index > 0 && <SelectSeparator />}
                        <SelectGroup>
                          <SelectLabel>{group.label}</SelectLabel>
                          {group.models.map((item) => (
                            <SelectItem
                              key={modelKey(item)}
                              value={modelKey(item)}
                            >
                              <span className='block max-w-64 truncate'>
                                {item.modelLabel}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </Fragment>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {sendButton}
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      <input
        ref={fileRef}
        type='file'
        multiple
        hidden
        tabIndex={-1}
        aria-hidden='true'
        data-testid='ask-files'
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);
          if (picked.length) files.upload(picked);
          event.target.value = '';
        }}
      />
    </>
  );
}

/** A file the question carries, removable; faded while it uploads, red when refused. */
export function FileChip({
  file,
  onRemove,
}: {
  readonly file: AskFile;
  readonly onRemove: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <li
      className={`inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 text-xs ${
        file.status === 'error'
          ? 'bg-destructive/10 text-destructive'
          : 'bg-muted'
      } ${file.status === 'uploading' ? 'opacity-60' : ''}`}
    >
      <Paperclip className='size-3 shrink-0' aria-hidden />
      <span className='truncate' title={file.filename}>
        {file.filename}
      </span>
      <button
        type='button'
        className='rounded-sm text-muted-foreground hover:text-foreground'
        aria-label={t('ai.dock.removeFile', { name: file.filename })}
        onClick={onRemove}
      >
        <X className='size-3' />
      </button>
    </li>
  );
}
