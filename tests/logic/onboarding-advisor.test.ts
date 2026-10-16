// @vitest-environment node
import { databaseManagerToken } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { addDays, today } from '../../server/providers/itam/dates.js';
import {
  createOnboardingAdvisor,
  type AdviceAnswer,
  type AgentRunner,
  type OnboardingAdvisor,
} from '../../server/providers/itam/onboarding-advisor.js';
import {
  onboardingServiceToken,
  type OnboardingPlan,
} from '../../server/providers/itam/onboarding.js';
import { settingsServiceToken } from '../../server/providers/itam/settings.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const manager = { user: 'mia', role: 'manager' as const };
const MACBOOK = 'model-macbook-pro-14-m3';
const LINE = `model:${MACBOOK}`;

/**
 * Asset Steward choosing a joiner's equipment when their 入职负责人 asks
 * (`onboarding-advisor.ts`): when a run may start, what is kept of its answer,
 * and how the plan puts its picks first. The model is a stand-in that
 * answers what each test tells it to.
 */
describe('onboarding advisor', () => {
  let app: TestApp;
  let locationId = '';
  let advisor: OnboardingAdvisor;
  let available = true;
  let answer: (prompt: string) => AdviceAnswer | Promise<AdviceAnswer>;
  let prompts: { actorId: string; prompt: string }[] = [];

  const post = (path: string, body: Record<string, unknown> = {}) =>
    app.request(`/api/itam/${path}`, { ...json(body), ...manager });
  const data = async <T>(response: Response): Promise<T> =>
    ((await response.json()) as { data: T }).data;
  const create = async (path: string, body: Record<string, unknown>) => {
    const response = await post(path, body);
    if (response.status !== 201)
      throw new Error(`${path}: ${await response.text()}`);
    return data<{ id: string }>(response);
  };
  const laptop = (serialNo: string, warrantyEndDate: string) =>
    create('devices', {
      modelId: MACBOOK,
      serialNo,
      locationId,
      warrantyEndDate,
    });
  const joiner = (body: Record<string, unknown> = {}) =>
    create('master/people', {
      name: 'Sun Hao',
      departmentId: 'dept-rd',
      position: 'Frontend Engineer',
      locationId,
      hireDate: addDays(today(), 5),
      ...body,
    });
  const plan = async (id: string) =>
    (await app.container
      .resolve(onboardingServiceToken)
      .plan(id)) as OnboardingPlan | null;
  const macbook = async (id: string) =>
    (await plan(id))!.lines.find((line) => line.key === LINE)!;

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    for (const routes of [masterDataRoutes, deviceRoutes])
      await app.mount(routes);
    locationId = (
      await create('master/locations', { name: 'Test HQ', type: 'company' })
    ).id;
    available = true;
    prompts = [];
    answer = () => ({ items: [], summary: '' });
    const runner: AgentRunner = {
      available: async () => available,
      async run(input) {
        prompts.push({ actorId: input.actorId, prompt: input.prompt });
        return answer(input.prompt);
      },
    };
    advisor = createOnboardingAdvisor({
      database: app.container.resolve(databaseManagerToken),
      onboarding: app.container.resolve(onboardingServiceToken),
      settings: app.container.resolve(settingsServiceToken),
      runner,
      locale: () => 'en-US',
    });
  });

  afterEach(async () => {
    await advisor.idle();
    await app.destroy();
  });

  it('puts Asset Steward’s pick first, with its reason', async () => {
    // The rule would take the longer warranty; Asset Steward takes the other.
    const longer = await laptop('C02ADV0001', '2030-01-01');
    const other = await laptop('C02ADV0002', '2028-01-01');
    const person = await joiner();
    expect((await macbook(person.id)).proposals[0]?.id).toBe(longer.id);

    answer = () => ({
      items: [
        { line: LINE, picks: [{ id: other.id, reason: 'Never repaired' }] },
      ],
      summary: 'One laptop chosen.',
    });
    expect(await advisor.advise(person.id)).toMatchObject({
      started: true,
    });
    await advisor.idle();

    // Run as the 入职负责人 — whoever entered the person — and shown the
    // candidates with their facts.
    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.actorId).toBe('mia');
    expect(prompts[0]?.prompt).toContain(longer.id);
    expect(prompts[0]?.prompt).toContain('warrantyEndDate');

    const line = await macbook(person.id);
    expect(line.proposals[0]).toMatchObject({
      id: other.id,
      source: 'noco',
      reason: 'Never repaired',
    });
    // The plan carries no candidates unless asked.
    expect(line.candidates).toBeUndefined();
    expect((await plan(person.id))!.advice).toMatchObject({
      status: 'ready',
      summary: 'One laptop chosen.',
      // One call to the model's gateway: there is no conversation.
      sessionId: null,
      actorId: 'mia',
    });

    // Taken since by somebody else: the rule's choice again, unexplained.
    const other2 = await joiner({ name: 'Lin Xue' });
    expect(
      (
        await post(`devices/${other.id}/reserve`, {
          reservedForType: 'person',
          reservedForId: other2.id,
          reservedUntil: addDays(today(), 5),
        })
      ).status,
    ).toBe(200);
    const after = await macbook(person.id);
    expect(after.proposals[0]?.id).toBe(longer.id);
    expect(after.proposals[0]?.reason).toBeUndefined();
  });

  it('holds a device it picked for one joiner back from the others', async () => {
    const longer = await laptop('C02ADV0041', '2030-01-01');
    const picked = await laptop('C02ADV0042', '2029-06-01');
    const third = await laptop('C02ADV0043', '2029-01-01');
    const first = await joiner();
    const second = await joiner({ name: 'Lin Xue' });
    answer = () => ({
      items: [{ line: LINE, picks: [{ id: picked.id, reason: 'Clean' }] }],
      summary: 'Chosen.',
    });
    await advisor.advise(first.id);
    await advisor.idle();

    // The second joiner is neither offered it nor shown it to choose from.
    const line = await macbook(second.id);
    expect(line.proposals.map((thing) => thing.id)).toEqual([longer.id]);
    const withCandidates = await app.container
      .resolve(onboardingServiceToken)
      .plan(second.id, { candidates: true });
    expect(
      withCandidates!.lines
        .find((entry) => entry.key === LINE)!
        .candidates!.map((candidate) => candidate.id),
    ).toEqual([longer.id, third.id]);
    // The first still has it.
    expect((await macbook(first.id)).proposals[0]?.id).toBe(picked.id);
  });

  it('keeps only picks that are candidates of their own item, as many as needed', async () => {
    const first = await laptop('C02ADV0011', '2030-01-01');
    const second = await laptop('C02ADV0012', '2029-01-01');
    const person = await joiner();
    answer = () => ({
      items: [
        {
          line: LINE,
          picks: [
            { id: 'not-a-device', reason: 'Invented' },
            { id: second.id, reason: 'Good' },
            // The kit asks for one laptop.
            { id: first.id, reason: 'Also good' },
          ],
        },
        { line: 'model:nothing', picks: [{ id: first.id, reason: 'No' }] },
      ],
      summary: 'Done.',
    });
    await advisor.advise(person.id);
    await advisor.idle();
    const line = await macbook(person.id);
    expect(line.proposals).toEqual([
      expect.objectContaining({ id: second.id, reason: 'Good' }),
    ]);
  });

  it('runs for a joiner with an owner and something to choose', async () => {
    await laptop('C02ADV0021', '2030-01-01');
    // One candidate for one laptop: nothing to choose.
    const person = await joiner();
    expect(await advisor.advise(person.id)).toEqual({
      started: false,
      reason: 'nothingToChoose',
    });
    await laptop('C02ADV0022', '2029-01-01');

    // Not a joiner: entered two months after starting.
    const staff = await joiner({ hireDate: addDays(today(), -60) });
    expect(await advisor.advise(staff.id)).toMatchObject({
      reason: 'notJoiner',
    });
    // A joiner a month out is chosen for too; one with nobody to run as
    // is not.
    const later = await joiner({ hireDate: addDays(today(), 30) });
    await app.container
      .resolve(databaseManagerToken)
      .query()
      .updateTable('people')
      .set({ onboardingOwnerId: null })
      .where('id', '=', later.id)
      .execute();
    expect(await advisor.advise(later.id)).toMatchObject({
      reason: 'noOwner',
    });

    // Switched off, or no model.
    const settings = app.container.resolve(settingsServiceToken);
    await settings.set('ai', {
      ...(await settings.get('ai')),
      onboardingAdvice: false,
    });
    expect(await advisor.advise(person.id)).toMatchObject({
      reason: 'disabled',
    });
    await settings.set('ai', {
      ...(await settings.get('ai')),
      onboardingAdvice: true,
    });
    available = false;
    expect(await advisor.advise(person.id)).toMatchObject({
      reason: 'unavailable',
    });
    available = true;

    // One run at a time; asked again once it is over, it runs again.
    expect((await advisor.advise(person.id)).started).toBe(true);
    expect(await advisor.advise(person.id)).toMatchObject({
      reason: 'running',
    });
    await advisor.idle();
    expect((await advisor.advise(person.id)).started).toBe(true);
    await advisor.idle();
    expect(prompts).toHaveLength(2);
  });

  it('records a failed run, and runs again when asked', async () => {
    await laptop('C02ADV0031', '2030-01-01');
    const second = await laptop('C02ADV0032', '2029-01-01');
    // Six weeks out: however far off the first day.
    const person = await joiner({ hireDate: addDays(today(), 40) });
    answer = () => {
      throw new Error('PROVIDER_ERROR: rate limited');
    };
    await advisor.advise(person.id);
    await advisor.idle();
    expect((await plan(person.id))!.advice).toMatchObject({
      status: 'failed',
      failure: 'PROVIDER_ERROR: rate limited',
    });
    // An answer that names none of the candidates is no advice either.
    answer = () => ({
      items: [{ line: LINE, picks: [{ id: 'model-thinkpad', reason: 'No' }] }],
      summary: 'Buy a ThinkPad instead.',
    });
    expect((await advisor.advise(person.id)).started).toBe(true);
    await advisor.idle();
    expect((await plan(person.id))!.advice).toMatchObject({
      status: 'failed',
      failure: 'The answer named none of the candidates',
      summary: null,
    });
    answer = () => ({
      items: [{ line: LINE, picks: [{ id: second.id, reason: 'Fine' }] }],
      summary: 'Chosen.',
    });
    expect((await advisor.advise(person.id)).started).toBe(true);
    await advisor.idle();
    expect((await plan(person.id))!.advice?.status).toBe('ready');
  });

  it('lets only the onboarding owner ask again', async () => {
    const person = await joiner();
    const other = await app.request(
      `/api/itam/master/people/${person.id}/onboarding/advise`,
      { ...json({}), user: 'ann', role: 'manager' },
    );
    expect(other.status).toBe(422);
    expect(await other.json()).toMatchObject({ rule: 'NOT_OWNER' });
    // The application's own advisor: no AI plugin in a test application.
    const owner = await post(`master/people/${person.id}/onboarding/advise`);
    expect(owner.status).toBe(200);
    expect(await data(owner)).toEqual({
      started: false,
      reason: 'unavailable',
    });
  });
});
