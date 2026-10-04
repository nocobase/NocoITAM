import type { AIEmployeeManager, ToolsManager } from '@nocobase/ai-employee';
import { AIResourceRegistrar } from '@nocobase/app-plugin-ai-employee/server';

import type { SettingsService } from '../server/providers/itam/settings.js';

import itamEmployee, {
  ITAM_SKILLS,
  LOGO_AVATAR_PATH,
} from './employees/itam.js';

export { LOGO_AVATAR_PATH };
import aggregate from './tools/itam/aggregate.js';
import assignDevice from './tools/itam/assign-device.js';
import assignSeat from './tools/itam/assign-seat.js';
import businessContext from './tools/itam/business-context.js';
import checkAvailability from './tools/itam/check-availability.js';
import correctDeviceStatus from './tools/itam/correct-device-status.js';
import createDisposal from './tools/itam/create-disposal.js';
import createRecord from './tools/itam/create-record.js';
import createPurchaseOrder from './tools/itam/create-purchase-order.js';
import getRecord from './tools/itam/get-record.js';
import issueStock from './tools/itam/issue-stock.js';
import loanDevice from './tools/itam/loan-device.js';
import matchModel from './tools/itam/match-model.js';
import receivePurchaseLine from './tools/itam/receive-purchase-line.js';
import reclaimSeats from './tools/itam/reclaim-seats.js';
import returnDevices from './tools/itam/return-devices.js';
import searchRecords from './tools/itam/search-records.js';
import stockIn from './tools/itam/stock-in.js';
import takeBackStock from './tools/itam/take-back-stock.js';
import transferDevice from './tools/itam/transfer-device.js';

/** The ITAM assistant's tools: the read tools, then the ASK write tools. */
export const ITAM_TOOLS = [
  businessContext,
  searchRecords,
  getRecord,
  aggregate,
  checkAvailability,
  matchModel,
  assignDevice,
  loanDevice,
  returnDevices,
  transferDevice,
  correctDeviceStatus,
  assignSeat,
  reclaimSeats,
  createPurchaseOrder,
  createDisposal,
  createRecord,
  stockIn,
  issueStock,
  takeBackStock,
  receivePurchaseLine,
];

/**
 * The application's AI resources, registered with the AI employee plugin
 * from the ITAM provider's boot. The plugin loads only what a registrar
 * hands it — it does not scan this directory — so an employee or tool left
 * out of this list does not exist at runtime. Tools register before the
 * employee that names them, as the plugin expects.
 */
export class ItamAiResources extends AIResourceRegistrar {
  /**
   * Without settings (a test's bare manager) the built-ins are left alone.
   * `avatar` overrides the employee's own root-relative mark with an absolute
   * URL, which the provider builds when a public origin is configured so the
   * plugin's settings pages show it too.
   */
  public constructor(
    private readonly settings?: SettingsService,
    private readonly avatar?: string,
  ) {
    super({ source: 'itam' });
  }

  protected override async registerAIEmployees(
    aiEmployeeManager: AIEmployeeManager,
  ): Promise<void> {
    await aiEmployeeManager.registerEmployee(
      this.avatar ? { ...itamEmployee, avatar: this.avatar } : itamEmployee,
    );
    await this.limitSkills(aiEmployeeManager);
    await this.orderAfterNoco(aiEmployeeManager);
    await this.disableBuiltInEmployees(aiEmployeeManager);
  }

  /**
   * Every general skill of the plugin is open to an employee whose skill
   * selection was never saved, and its data skills would hand the model table
   * queries beside this application's own tools — which would go around the
   * point of those tools, that they run as the signed-in user through the
   * services and see only what that user may see.
   *
   * So the first registration writes a selection of this application's own
   * skills. A selection the administrator has saved is theirs and is left
   * alone; when a second skill is added later it will not reach them, which
   * NocoCRM answers with a marker per skill, and this should too by then.
   */
  private async limitSkills(
    aiEmployeeManager: AIEmployeeManager,
  ): Promise<void> {
    const employee = await aiEmployeeManager.getEmployee(itamEmployee.username);
    if (!employee || employee.skillSettings?.enabledSkills !== undefined)
      return;
    await aiEmployeeManager.upsertEmployee({
      ...employee,
      skillSettings: {
        ...employee.skillSettings,
        enabledSkills: [...ITAM_SKILLS],
      },
    });
  }

  /**
   * The AI employees page lists by `sort`, then name, and SQLite puts an
   * empty sort first — so the plugin's employees, which mostly declare none,
   * would stand ahead of Noco (`sort: -1`). Those with no order get one after
   * her; an order someone already gave is kept.
   */
  private async orderAfterNoco(
    aiEmployeeManager: AIEmployeeManager,
  ): Promise<void> {
    for (const employee of await aiEmployeeManager.listEmployees())
      if (
        employee.username !== itamEmployee.username &&
        (employee.sort === undefined || employee.sort === null)
      )
        await aiEmployeeManager.upsertEmployee({ ...employee, sort: 100 });
  }

  /**
   * The plugin registers its own employees (Dex, Viz, Atlas…) on every
   * start. Noco is the one this application is built around, so the others
   * are switched off once — decided 2026-09-27: not deleted, because the
   * plugin would register them again, and an administrator may turn one
   * back on at 设置 → AI 员工, which registration then keeps. The flag is
   * only set once built-ins were actually found, so a start on which the
   * plugin had not registered them yet does not skip this for good.
   */
  private async disableBuiltInEmployees(
    aiEmployeeManager: AIEmployeeManager,
  ): Promise<void> {
    if (!this.settings) return;
    // Settings live in a table, which a database whose migrations have not
    // run yet does not have; starting is not worth refusing over this.
    let ai;
    try {
      ai = await this.settings.get('ai');
    } catch {
      return;
    }
    if (ai.builtInEmployeesDisabled) return;
    const others = (await aiEmployeeManager.listEmployees()).filter(
      (employee) =>
        employee.builtIn === true &&
        employee.username !== itamEmployee.username,
    );
    if (others.length === 0) return;
    for (const employee of others)
      if (employee.enabled !== false)
        await aiEmployeeManager.upsertEmployee({ ...employee, enabled: false });
    await this.settings.set('ai', { ...ai, builtInEmployeesDisabled: true });
  }

  protected override async registerTools(
    toolsManager: ToolsManager,
  ): Promise<void> {
    await toolsManager.registerTools(ITAM_TOOLS);
  }
}
