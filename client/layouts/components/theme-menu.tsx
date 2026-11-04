import { useTranslation } from '@nocobase/i18n/client';
import { Monitor, Moon, Palette, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useContext, type ReactElement } from 'react';

import {
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '#components/ui/dropdown-menu';

import { PresetContext } from '../../theme/theme-context.js';
import { themePresets } from '../../theme/theme-presets.js';

const COLOR_MODES = [
  { id: 'light', icon: Sun },
  { id: 'dark', icon: Moon },
  { id: 'system', icon: Monitor },
] as const;

/**
 * Application change (ITAM, 2026-11-03): 外观 in the account menu, beside
 * 语言, rather than a palette button of its own in the header — on a phone
 * the header had no room for it, and on a desktop it is set once. The same
 * choices as the template's `ThemeSettings` popover (colour mode, then the
 * preset), as menu radio items; the sign-in pages keep the popover.
 */
export function ThemeMenu(): ReactElement | null {
  const { theme, setTheme } = useTheme();
  // Outside the theme provider (a menu rendered on its own) there is no
  // preset to choose.
  const presets = useContext(PresetContext);
  const { t } = useTranslation();
  if (!presets) return null;
  const { preset, setPreset } = presets;
  const mode = COLOR_MODES.find((item) => item.id === theme) ?? COLOR_MODES[2];
  const presetItem = themePresets.find((item) => item.id === preset);
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className='gap-2'>
        <Palette aria-hidden='true' className='size-4' />
        <span className='flex-1'>
          {t('appearance.title', { defaultValue: 'Appearance' })}
        </span>
        <span className='text-muted-foreground'>
          {t('appearance.' + mode.id)}
          {presetItem ? ` · ${t(presetItem.labelKey)}` : null}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {t('appearance.mode', { defaultValue: 'Color mode' })}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={mode.id}
            onValueChange={(value) => setTheme(String(value))}
          >
            {COLOR_MODES.map(({ id, icon: Icon }) => (
              <DropdownMenuRadioItem key={id} value={id} className='gap-2'>
                <Icon aria-hidden='true' className='size-4' />
                {t('appearance.' + id)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {t('appearance.preset', { defaultValue: 'Theme' })}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={preset}
            onValueChange={(value) => {
              const selected = themePresets.find((item) => item.id === value);
              if (selected) setPreset(selected.id);
            }}
          >
            {themePresets.map((item) => (
              <DropdownMenuRadioItem key={item.id} value={item.id}>
                {t(item.labelKey)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
