import { useTranslation } from '@nocobase/i18n/client';
import {
  ArrowRightLeft,
  Building2,
  Check,
  ClipboardCheck,
  Cpu,
  HardDrive,
  Headphones,
  Keyboard,
  Laptop,
  Monitor,
  Mouse,
  PackageCheck,
  Printer,
  Recycle,
  RefreshCw,
  Router,
  Server,
  Smartphone,
  Tablet,
  Trash2,
  Truck,
  Usb,
  Warehouse,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';

// The sign-in page's right side (2026-10-16): the office as a floor plan —
// the warehouse's shelves and the third floor's desks inside, the supplier,
// the repair shop and the recycler outside — and devices moving between them
// as ITAM records it: a delivery comes into the warehouse, a laptop goes to
// a joiner's desk, one leaves for repair and comes back, a printer goes to
// the recycler, each move drawn as a trail with the device's tag. An MDM
// sync sweeps the desks and a stocktake ticks every room. Its own look rather
// than NocoCRM's story card, over a backdrop of the things IT looks after.
// Sample content: every name is in the locale files.

type Zone = 'warehouse' | 'floor' | 'supplier' | 'repair' | 'recycler';
type Status = 'inUse' | 'inStock' | 'ordered' | 'inRepair' | 'disposal';

interface ZoneBox {
  /** Where it sits on the plan, in percent of the plan's width and height. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** How many places it has in a row, and how many rows. */
  readonly cols: number;
  readonly rows: number;
  /** Inside the company, which a stocktake counts. */
  readonly inside: boolean;
  readonly icon: LucideIcon;
}

const ZONES: Readonly<Record<Zone, ZoneBox>> = {
  warehouse: {
    x: 0,
    y: 0,
    w: 35,
    h: 62,
    cols: 3,
    rows: 3,
    inside: true,
    icon: Warehouse,
  },
  floor: {
    x: 38,
    y: 0,
    w: 62,
    h: 62,
    cols: 5,
    rows: 3,
    inside: true,
    icon: Building2,
  },
  supplier: {
    x: 0,
    y: 72,
    w: 32,
    h: 28,
    cols: 3,
    rows: 1,
    inside: false,
    icon: Truck,
  },
  repair: {
    x: 34,
    y: 72,
    w: 32,
    h: 28,
    cols: 3,
    rows: 1,
    inside: false,
    icon: Wrench,
  },
  recycler: {
    x: 68,
    y: 72,
    w: 32,
    h: 28,
    cols: 3,
    rows: 1,
    inside: false,
    icon: Recycle,
  },
};
const ZONE_KEYS = Object.keys(ZONES) as Zone[];

/** The centre of a zone's place, in percent of the plan. */
function placeOf(zone: Zone, slot: number): { x: number; y: number } {
  const box = ZONES[zone];
  const column = slot % box.cols;
  const row = Math.floor(slot / box.cols);
  const step = (box.w - 6) / box.cols;
  return {
    x: box.x + 3 + step * (column + 0.5),
    y: box.y + (box.inside ? 24 : 16) + row * 15,
  };
}

const KINDS = { L: Laptop, M: Monitor, S: Smartphone, P: Printer } as const;
type Kind = keyof typeof KINDS;

interface Device {
  readonly id: string;
  readonly kind: Kind;
  readonly zone: Zone;
  readonly status: Status;
}

// The devices as the story starts.
const DEVICES: readonly Device[] = [
  ...(['L', 'M', 'L', 'S', 'L', 'M', 'L', 'L', 'M', 'S'] as const).map(
    (kind, index): Device => ({
      id: `desk-${String(index)}`,
      kind,
      zone: 'floor',
      status: 'inUse',
    }),
  ),
  { id: 'spare-laptop', kind: 'L', zone: 'warehouse', status: 'inStock' },
  { id: 'spare-phone', kind: 'S', zone: 'warehouse', status: 'inStock' },
  { id: 'old-printer', kind: 'P', zone: 'warehouse', status: 'disposal' },
  { id: 'new-monitor-1', kind: 'M', zone: 'supplier', status: 'ordered' },
  { id: 'new-monitor-2', kind: 'M', zone: 'supplier', status: 'ordered' },
];

const STATUS_STYLE: Readonly<Record<Status, string>> = {
  inUse: 'bg-primary text-primary-foreground shadow-sm',
  inStock: 'bg-card text-foreground shadow-sm ring-1 ring-border',
  ordered:
    'border border-dashed border-muted-foreground/50 bg-background text-muted-foreground',
  inRepair: 'bg-warning text-warning-foreground shadow-sm',
  disposal: 'bg-destructive text-destructive-foreground shadow-sm',
};

const TALLY: readonly {
  readonly status: Status;
  readonly tone: string;
}[] = [
  { status: 'inUse', tone: 'text-primary' },
  { status: 'inStock', tone: 'text-foreground' },
  { status: 'inRepair', tone: 'text-warning-foreground' },
  { status: 'disposal', tone: 'text-destructive' },
];

interface Event {
  readonly id: string;
  readonly icon: LucideIcon;
  /** The devices it moves, where to, and what they become. */
  readonly moves: readonly (readonly [string, Zone, Status])[];
  /** A sync sweeping the desks, or a stocktake ticking the rooms. */
  readonly pass?: 'sync' | 'count';
}

const EVENTS: readonly Event[] = [
  {
    id: 'received',
    icon: PackageCheck,
    moves: [
      ['new-monitor-1', 'warehouse', 'inStock'],
      ['new-monitor-2', 'warehouse', 'inStock'],
    ],
  },
  {
    id: 'assigned',
    icon: ArrowRightLeft,
    moves: [['spare-laptop', 'floor', 'inUse']],
  },
  { id: 'repair', icon: Wrench, moves: [['desk-2', 'repair', 'inRepair']] },
  { id: 'synced', icon: RefreshCw, moves: [], pass: 'sync' },
  { id: 'repaired', icon: Wrench, moves: [['desk-2', 'floor', 'inUse']] },
  {
    id: 'disposed',
    icon: Trash2,
    moves: [['old-printer', 'recycler', 'disposal']],
  },
  { id: 'counted', icon: ClipboardCheck, moves: [], pass: 'count' },
];

const STEP_MS = 2600;
// The last event stays a while before the plan starts again.
const HOLD_MS = 4000;

// The backdrop: the things IT looks after, scattered faintly and drifting.
const BACKDROP_ICONS: readonly LucideIcon[] = [
  Laptop,
  Server,
  Monitor,
  Router,
  Smartphone,
  Printer,
  Keyboard,
  HardDrive,
  Headphones,
  Tablet,
  Mouse,
  Cpu,
  Usb,
];
const BACKDROP = Array.from({ length: 42 }, (_, index) => ({
  id: `backdrop-${String(index)}`,
  Icon: BACKDROP_ICONS[(index * 5) % BACKDROP_ICONS.length] ?? Laptop,
  // Rows of seven, every other row shifted half a step.
  left: (index % 7) * 15 + (Math.floor(index / 7) % 2 ? 7.5 : 0) - 3,
  top: Math.floor(index / 7) * 17 + 2,
  rotate: ((index * 37) % 31) - 15,
  delay: (index * 0.7) % 6,
}));

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

// How many events have happened: one more every STEP_MS, held after the
// last, then none. Under reduced motion, all of them at once.
function useEvents(): number {
  const [count, setCount] = useState(() =>
    reducedMotion() ? EVENTS.length : 0,
  );
  useEffect(() => {
    if (reducedMotion()) return;
    const timer = setTimeout(
      () => setCount((current) => (current >= EVENTS.length ? 0 : current + 1)),
      count >= EVENTS.length ? HOLD_MS : STEP_MS,
    );
    return () => clearTimeout(timer);
  }, [count]);
  return count;
}

interface Placed extends Device {
  readonly x: number;
  readonly y: number;
}

/** Every device where it stands after the first `count` events. */
function placeAll(count: number): readonly Placed[] {
  const now = new Map(DEVICES.map((device) => [device.id, device]));
  for (const event of EVENTS.slice(0, count))
    for (const [id, zone, status] of event.moves) {
      const device = now.get(id);
      if (device) now.set(id, { ...device, zone, status });
    }
  const filled: Partial<Record<Zone, number>> = {};
  return DEVICES.map((device) => {
    const current = now.get(device.id) ?? device;
    const slot = filled[current.zone] ?? 0;
    filled[current.zone] = slot + 1;
    return { ...current, ...placeOf(current.zone, slot) };
  });
}

function Backdrop(): ReactElement {
  return (
    <div
      aria-hidden='true'
      className='pointer-events-none absolute inset-0 -z-10 overflow-hidden text-foreground/[0.07] [mask-image:radial-gradient(ellipse_at_center,transparent_25%,black_70%)]'
    >
      {BACKDROP.map(({ id, Icon, left, top, rotate, delay }) => (
        <span
          className='auth-backdrop-drift absolute'
          key={id}
          style={{
            left: `${String(left)}%`,
            top: `${String(top)}%`,
            animationDelay: `-${String(delay)}s`,
          }}
        >
          <Icon
            className='size-9'
            strokeWidth={1.25}
            style={{ transform: `rotate(${String(rotate)}deg)` }}
          />
        </span>
      ))}
    </div>
  );
}

// A room or a place outside: its name and icon, and inside, what it is made
// of — the warehouse's shelves, the floor's desks.
function ZoneArea({
  zone,
  counted,
  syncing,
}: {
  readonly zone: Zone;
  readonly counted: boolean;
  readonly syncing: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const box = ZONES[zone];
  const Icon = box.icon;
  const places = Array.from({ length: box.cols * box.rows }, (_, slot) => slot);
  return (
    <div
      className={`absolute overflow-hidden rounded-xl border transition-colors duration-700 ${
        box.inside
          ? 'border-border bg-background/80'
          : 'border-dashed border-muted-foreground/30 bg-muted/40'
      } ${counted ? 'border-success-foreground/40 bg-success' : ''}`}
      style={{
        left: `${String(box.x)}%`,
        top: `${String(box.y)}%`,
        width: `${String(box.w)}%`,
        height: `${String(box.h)}%`,
      }}
    >
      <span className='absolute top-2 left-2.5 inline-flex items-center gap-1.5 text-[0.6875rem] font-medium text-muted-foreground'>
        <Icon className='size-3.5' />
        {t(`loginActivity.zones.${zone}`)}
        {counted ? (
          <Check className='size-3.5 animate-in text-success-foreground duration-300 zoom-in-50 motion-reduce:animate-none' />
        ) : null}
      </span>
      {zone === 'warehouse'
        ? // Shelves under each row of stock.
          [0, 1, 2].map((row) => (
            <span
              className='absolute right-3 left-3 h-1 rounded-full bg-muted-foreground/15'
              key={row}
              style={{ top: `${String(((24 + row * 15 + 6) / box.h) * 100)}%` }}
            />
          ))
        : null}
      {zone === 'floor'
        ? // A desk at every place, taken or not.
          places.map((slot) => {
            const at = placeOf('floor', slot);
            return (
              <span
                className='absolute h-[22%] w-[15%] -translate-x-1/2 -translate-y-1/2 rounded-md border border-dashed border-muted-foreground/20'
                key={slot}
                style={{
                  left: `${String(((at.x - box.x) / box.w) * 100)}%`,
                  top: `${String(((at.y - box.y) / box.h) * 100)}%`,
                }}
              />
            );
          })
        : null}
      {syncing ? (
        // The MDM's sweep across the desks.
        <span className='auth-sync-sweep pointer-events-none absolute inset-y-0 w-1/3' />
      ) : null}
    </div>
  );
}

/** The sign-in page's aside: the devices moving round the floor plan. */
export function ActivityPanel(): ReactElement {
  const { t } = useTranslation();
  const count = useEvents();
  const latest = count > 0 ? EVENTS[count - 1] : undefined;
  const placed = placeAll(count);
  const before = new Map(
    placeAll(Math.max(0, count - 1)).map((d) => [d.id, d]),
  );
  const moved = new Set(latest?.moves.map(([id]) => id) ?? []);
  // One tag per move, over the first device it moves.
  const tagged = latest?.moves[0]?.[0];
  const tally = (status: Status) =>
    placed.filter((device) => device.status === status).length;
  const LatestIcon = latest?.icon;
  return (
    <>
      <Backdrop />
      {/* Laid over the aside rather than in its flow, so the page keeps the
          form's height whatever the plan holds. */}
      <div className='absolute inset-0 flex flex-col justify-center gap-7 p-12'>
        <header className='max-w-lg space-y-2'>
          <h2 className='text-2xl leading-tight font-semibold tracking-tight'>
            {t('loginActivity.heading')}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {t('loginActivity.description')}
          </p>
        </header>
        {/* The plan is decoration: the heading above says what it shows. */}
        <div aria-hidden='true' className='grid w-full max-w-lg gap-4'>
          <div className='overflow-hidden rounded-2xl border border-border bg-card shadow-lg shadow-foreground/5'>
            <div className='flex items-center justify-between gap-3 border-b border-border px-4 py-2.5'>
              <span className='inline-flex items-center gap-2 text-sm font-medium'>
                <Building2 className='size-4 text-muted-foreground' />
                {t('loginActivity.site')}
              </span>
              <span className='inline-flex items-center gap-1.5 text-xs text-muted-foreground'>
                <span className='relative flex size-2'>
                  <span className='absolute inline-flex size-full animate-ping rounded-full bg-success-foreground/60 motion-reduce:animate-none' />
                  <span className='relative inline-flex size-2 rounded-full bg-success-foreground' />
                </span>
                {t('loginActivity.live')}
              </span>
            </div>
            <div className='p-4'>
              <div className='relative aspect-[16/11] w-full'>
                {ZONE_KEYS.map((key) => (
                  <ZoneArea
                    counted={latest?.pass === 'count' && ZONES[key].inside}
                    key={key}
                    syncing={latest?.pass === 'sync' && key === 'floor'}
                    zone={key}
                  />
                ))}
                {/* The company's wall: inside above, outside below. */}
                <span className='absolute top-[67%] right-0 left-0 border-t border-dashed border-muted-foreground/30' />
                <span className='absolute top-[67%] left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-[0.625rem] tracking-wider text-muted-foreground uppercase'>
                  {t('loginActivity.outside')}
                </span>
                {/* Each move's trail, from where the device was. */}
                <svg
                  className='pointer-events-none absolute inset-0 size-full overflow-visible'
                  preserveAspectRatio='none'
                  viewBox='0 0 100 100'
                >
                  {placed
                    .filter((device) => moved.has(device.id))
                    .map((device) => {
                      const from = before.get(device.id);
                      if (!from) return null;
                      const lift = Math.min(from.y, device.y) - 14;
                      return (
                        <path
                          className='auth-move-trail text-primary'
                          d={`M ${String(from.x)} ${String(from.y)} Q ${String(
                            (from.x + device.x) / 2,
                          )} ${String(lift)} ${String(device.x)} ${String(device.y)}`}
                          fill='none'
                          key={`${latest?.id ?? ''}-${device.id}`}
                          stroke='currentColor'
                          strokeDasharray='4 4'
                          strokeLinecap='round'
                          strokeWidth='1.5'
                          vectorEffect='non-scaling-stroke'
                        />
                      );
                    })}
                </svg>
                {placed.map((device) => {
                  const DeviceIcon = KINDS[device.kind];
                  const isMoved = moved.has(device.id);
                  const lit =
                    latest?.pass === 'sync' &&
                    device.zone === 'floor' &&
                    device.status === 'inUse';
                  return (
                    <span
                      className={`absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-lg transition-all duration-1000 ease-in-out ${STATUS_STYLE[device.status]} ${
                        isMoved
                          ? 'z-10 scale-110 ring-2 ring-primary ring-offset-2 ring-offset-card'
                          : lit
                            ? 'ring-2 ring-success-foreground/60'
                            : ''
                      }`}
                      key={device.id}
                      style={{
                        left: `${String(device.x)}%`,
                        top: `${String(device.y)}%`,
                      }}
                    >
                      <DeviceIcon className='size-4' />
                      {device.id === tagged && latest ? (
                        // The device's tag, floating over it while it moves.
                        <span className='absolute -top-6 left-1/2 -translate-x-1/2 animate-in rounded bg-foreground px-1.5 py-0.5 font-mono text-[0.625rem] whitespace-nowrap text-background duration-300 fade-in slide-in-from-bottom-1 motion-reduce:animate-none'>
                          {t(`loginActivity.events.${latest.id}.device`)}
                        </span>
                      ) : null}
                    </span>
                  );
                })}
              </div>
            </div>
            {/* What just happened, and who did it. */}
            <div className='flex h-14 items-center gap-3 border-t border-border bg-muted/40 px-4'>
              {LatestIcon && latest ? (
                <div
                  className='flex min-w-0 flex-1 animate-in items-center gap-3 duration-500 fade-in slide-in-from-bottom-1 motion-reduce:animate-none'
                  key={latest.id}
                >
                  <span className='grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary'>
                    <LatestIcon className='size-4' />
                  </span>
                  <span className='min-w-0 flex-1'>
                    <span className='block truncate text-sm font-medium'>
                      {t(`loginActivity.events.${latest.id}.what`)}
                    </span>
                    <span className='block truncate text-xs text-muted-foreground'>
                      {t(`loginActivity.events.${latest.id}.by`)}
                    </span>
                  </span>
                  <span className='shrink-0 text-xs text-muted-foreground'>
                    {t('loginActivity.justNow')}
                  </span>
                </div>
              ) : (
                <span className='text-sm text-muted-foreground'>
                  {t('loginActivity.idle')}
                </span>
              )}
            </div>
          </div>
          {/* Where things stand. */}
          <ul className='grid grid-cols-4 gap-2'>
            {TALLY.map(({ status, tone }) => (
              <li
                className='rounded-xl border border-border bg-card/80 px-3 py-2.5 shadow-xs'
                key={status}
              >
                <span
                  className={`block text-xl font-semibold tabular-nums transition-colors ${tone}`}
                >
                  {tally(status)}
                </span>
                <span className='mt-0.5 block truncate text-xs text-muted-foreground'>
                  {t(`loginActivity.statuses.${status}`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
