import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { resolveAppClientContributions } from '@nocobase/app-client/plugins';
import type {
  NotificationTemplatePreview,
  NotificationTemplateText,
  NotificationTemplateView,
} from '@nocobase/app-plugin-notification/client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';
import { expect, it } from 'vitest';
import metadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import zhCN from '../../client/locales/zh-CN.js';
import NotificationTemplateDrawer from '../../client/pages/settings/notification-template-detail.js';
import NotificationTemplatesPage from '../../client/pages/settings/notification-templates.js';
import { createApplicationRoutes } from '../../client/routes.js';
import { RouteTreeProvider } from '../../client/routing/route-context.js';

// 系统设置 → 通知管理 → 通知模板 (client/pages/settings/notification-templates.tsx,
// 2026-11-10, as NocoCRM has it): ITAM's page over the Notification plugin's
// API, in the reader's language, grouped by category, a template opening in
// a drawer with its preview in the interface language.

// The namespace of a plugin that registers its template's words as
// translation keys (below), in the reader's language.
const acme = {
  category: '键入类别',
  name: '键入名称',
  trigger: '键入触发',
  recipients: '键入收件人',
  rule: '键入规则',
  language: '键入语言策略',
  thing: '键入变量',
};

const namespaces = {
  [metadata.name]: {
    'en-US': async () => ({ default: enUS }),
    'zh-CN': async () => ({ default: zhCN }),
  },
  acme: {
    'en-US': async () => ({ default: {} }),
    'zh-CN': async () => ({ default: acme }),
  },
};

const { routes } = resolveAppClientContributions([
  {
    packageName: metadata.name,
    source: 'application',
    routes: createApplicationRoutes(),
  },
]);

const LOCALES = ['zh-CN', 'en-US'];
const view = (
  id: string,
  category: NotificationTemplateText,
  type = 'in-app',
): NotificationTemplateView => ({
  id,
  contributor: id.startsWith('itam.')
    ? 'NocoITAM'
    : id.startsWith('users.')
      ? '@nocobase/app-plugin-users'
      : 'acme',
  category,
  name: `Registered ${id}`,
  trigger: `Registered trigger of ${id}`,
  recipients: 'Registered recipients',
  businessRule: 'Registered rule',
  locales: LOCALES,
  localeMode: 'separate',
  languagePolicy: 'Registered language policy',
  variables: [
    { name: 'deviceNo', description: 'Registered variable' },
    { name: 'other', description: 'Registered other variable' },
  ],
  channels: [
    {
      name: type === 'email' ? 'system-email' : 'in-app',
      type,
      configured: true,
      enabled: type === 'email' ? true : null,
    },
  ],
});
// Since Notification 2.0.0-beta.8 a registration may give its words as
// translation keys, as the Users plugin's invitation does from 2.0.0-beta.19.
const key = (ns: string, name: string, defaultValue: string) => ({
  ns,
  key: name,
  defaultValue,
});
const keyed: NotificationTemplateView = {
  ...view('acme.keyed', key('acme', 'category', 'Keyed category')),
  name: key('acme', 'name', 'Keyed name'),
  trigger: key('acme', 'trigger', 'Keyed trigger'),
  recipients: key('acme', 'recipients', 'Keyed recipients'),
  businessRule: key('acme', 'rule', 'Keyed rule'),
  languagePolicy: key('acme', 'language', 'Keyed language policy'),
  variables: [
    { name: 'thing', description: key('acme', 'thing', 'Keyed variable') },
  ],
};
const TEMPLATES = [
  view(
    'users.invitation',
    key(
      '@nocobase/app-plugin-users',
      'notificationTemplates.category',
      'Accounts',
    ),
    'email',
  ),
  view('itam.loan-overdue', 'Devices'),
  view('itam.leaver-recovery', 'People'),
  view('itam.comment-mentioned', 'Comments'),
  view('acme.unknown', 'Elsewhere'),
  keyed,
];

function Where() {
  return <output aria-label='Route'>{useLocation().pathname}</output>;
}

async function mount(route = '/settings/notifications/templates') {
  const previews: string[] = [];
  const result = await renderWithApp(
    <RouteTreeProvider
      routes={routes}
      access={{ denied: new Set(), loading: false }}
    >
      <Routes>
        <Route
          path='/settings/notifications/templates'
          element={<NotificationTemplatesPage />}
        >
          <Route path=':templateId' element={<NotificationTemplateDrawer />} />
        </Route>
        <Route path='*' element={<Where />} />
      </Routes>
    </RouteTreeProvider>,
    {
      route,
      locale: 'zh-CN',
      namespace: metadata.name,
      namespaces,
      fetch: answerApi(({ path, json }) => {
        if (path === 'notifications/templates') return { data: TEMPLATES };
        const preview = /^notifications\/templates\/(.+)\/preview$/.exec(path);
        if (preview) {
          const locale = (json as { locale: string }).locale;
          previews.push(locale);
          const data: NotificationTemplatePreview = {
            synthetic: true,
            requestedLocale: locale,
            effectiveLocale: locale,
            content: { title: `Example in ${locale}`, body: 'DE-000123' },
            definition: {
              title: `Template in ${locale}`,
              body: '{{deviceNo}}',
            },
          };
          return { data };
        }
        const one = /^notifications\/templates\/(.+)$/.exec(path);
        if (one)
          return {
            data: TEMPLATES.find(
              (item) => item.id === decodeURIComponent(one[1]!),
            ),
          };
        return { data: [] };
      }),
    },
  );
  return { ...result, previews };
}

it('lists the templates by category in the reader’s language, registered English for one it does not know', async () => {
  await mount();
  const devices = await screen.findByRole('region', { name: '设备' });
  expect(within(devices).getByText('借出逾期')).toBeTruthy();
  expect(within(devices).getByText('站内信')).toBeTruthy();
  expect(
    within(screen.getByRole('region', { name: '人员' })).getByText('离职回收'),
  ).toBeTruthy();
  expect(
    within(screen.getByRole('region', { name: '评论' })).getByText(
      '评论中提到你',
    ),
  ).toBeTruthy();
  const accounts = screen.getByRole('region', { name: '账号' });
  expect(within(accounts).getByText('用户邀请')).toBeTruthy();
  expect(within(accounts).getByText('邮件')).toBeTruthy();
  const elsewhere = screen.getByRole('region', { name: 'Elsewhere' });
  expect(within(elsewhere).getByText('Registered acme.unknown')).toBeTruthy();
  // A registration's translation keys, in the reader's language.
  const keyedCategory = await screen.findByRole('region', {
    name: '键入类别',
  });
  expect(within(keyedCategory).getByText('键入名称')).toBeTruthy();
  expect(within(keyedCategory).getByText('键入触发')).toBeTruthy();
});

it('opens a template registered with translation keys in the reader’s language', async () => {
  const user = userEvent.setup();
  await mount();
  await user.click(await screen.findByText('键入名称'));
  const drawer = await screen.findByRole('dialog');
  expect(
    await within(drawer).findByRole('heading', { name: '键入名称' }),
  ).toBeTruthy();
  expect(within(drawer).getByText('键入收件人')).toBeTruthy();
  expect(within(drawer).getByText('键入规则')).toBeTruthy();
  expect(within(drawer).getByText(/键入语言策略/u)).toBeTruthy();
  expect(within(drawer).getByText('键入变量')).toBeTruthy();
});

it('searches the translated words and filters by channel', async () => {
  const user = userEvent.setup();
  await mount();
  await screen.findByRole('region', { name: '设备' });
  await user.type(screen.getByRole('textbox', { name: '搜索' }), '离职');
  await waitFor(() =>
    expect(screen.queryByRole('region', { name: '设备' })).toBeNull(),
  );
  expect(screen.getByText('离职回收')).toBeTruthy();
  await user.clear(screen.getByRole('textbox', { name: '搜索' }));
  await user.click(screen.getByRole('combobox', { name: '渠道' }));
  await user.click(await screen.findByRole('option', { name: '邮件' }));
  await waitFor(() =>
    expect(screen.queryByRole('region', { name: '设备' })).toBeNull(),
  );
  expect(screen.getByRole('region', { name: '账号' })).toBeTruthy();
});

it('opens a template from anywhere on its card in a drawer, its preview in the interface language', async () => {
  const user = userEvent.setup();
  const { previews } = await mount();
  await user.click(await screen.findByText('借出逾期'));
  const drawer = await screen.findByRole('dialog');
  expect(
    await within(drawer).findByRole('heading', { name: '借出逾期' }),
  ).toBeTruthy();
  expect(within(drawer).getByText('设备负责人。')).toBeTruthy();
  // Its own rule, then what every one of ITAM's keeps to; no switch.
  expect(
    within(drawer).getByText(
      '同一设备、同一预计归还日期只通知一次，持续逾期不会重复提醒。',
    ),
  ).toBeTruthy();
  expect(
    within(drawer).getByText('不会发给操作者本人，每位收件人只收到一次。'),
  ).toBeTruthy();
  expect(within(drawer).getByText(/使用应用的默认语言/u)).toBeTruthy();
  // Its variables worded by template, an unknown one as registered.
  expect(within(drawer).getByText('设备编号。')).toBeTruthy();
  expect(within(drawer).getByText('Registered other variable')).toBeTruthy();
  expect(await within(drawer).findByText('Example in zh-CN')).toBeTruthy();
  expect(previews).toEqual(['zh-CN']);
  expect(
    within(drawer).getByRole('combobox', { name: '预览语言' }),
  ).toBeTruthy();
  expect(within(drawer).getByText('NocoITAM')).toBeTruthy();
});

it('opens the drawer from a link of the plugin’s, ?template=<id>', async () => {
  await mount('/settings/notifications/templates?template=users.invitation');
  const drawer = await screen.findByRole('dialog');
  expect(
    await within(drawer).findByRole('heading', { name: '用户邀请' }),
  ).toBeTruthy();
  expect(
    within(drawer).getByText('通过邮件发送的邀请都会发出，没有关闭的开关。'),
  ).toBeTruthy();
  // One email in every language: no preview language to pick.
  expect(
    await within(drawer).findByText(
      '这封邮件一次包含所有语言，每位收件人收到的内容都相同。',
    ),
  ).toBeTruthy();
  expect(
    within(drawer).queryByRole('combobox', { name: '预览语言' }),
  ).toBeNull();
});
