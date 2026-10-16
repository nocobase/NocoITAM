import { useTranslation } from '@nocobase/i18n/client';
import {
  ArrowRightLeft,
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
  RefreshCw,
  Router,
  Server,
  Smartphone,
  Tablet,
  Trash2,
  Usb,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';

// The sign-in page's right side (2026-10-16): where the company's devices
// are, as a floor plan — the warehouse and the third floor inside, the
// supplier, the repair shop and the recycler outside — and devices moving
// between them as ITAM records it: a delivery comes into the warehouse, a
// laptop goes to a joiner's desk, one leaves for repair and comes back, a
// printer goes to the recycler. An MDM sync sweeps the desks and a stocktake
// ticks every room. Its own look rather than NocoCRM's story card, over a
// backdrop of the kinds of things IT looks after. Sample content: every name
// is in the locale files.

type Zone = 'warehouse' | 'floor' | 'supplier' | 'repair' | 'recycler';
type Status = 'inUse' | 'inStock' | 'ordered' | 'inRepair' | 'disposal';

interface ZoneBox {
  /** Where it sits on the plan, in percent of the plan's width and height. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** How many devices it lines up in a row. */
  readonly cols: number;
  /** Inside the company, which a stocktake counts. */
  readonly inside: boolean;
}

const ZONES: Readonly<Record<Zone, ZoneBox>> = {
  warehouse: { x: 0, y: 0, w: 36, h: 56, cols: 3, inside: true },
  floor: { x: 40, y: 0, w: 60, h: 56, cols: 5, inside: true },
  supplier: { x: 0, y: 68, w: 31, h: 32, cols: 3, inside: false },
  repair: { x: 34.5, y: 68, w: 31, h: 32, cols: 3, inside: false },
  recycler: { x: 69, y: 68, w: 31, h: 32, cols: 3, inside: false },
};
const ZONE_KEYS = Object.keys(ZONES) as Zone[];

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
  inUse: 'bg-primary/12 text-primary',
  inStock: 'bg-card text-muted-foreground shadow-xs',
  ordered:
    'border border-dashed border-muted-foreground/40 text-muted-foreground',
  inRepair: 'bg-warning text-warning-foreground',
  disposal: 'bg-destructive/10 text-destructive',
};

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

const STEP_MS = 2400;
// The last event stays a while before the plan starts again.
const HOLD_MS = 4000;

// The backdrop: the kinds of things IT looks after, scattered faintly.
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

function Backdrop(): ReactElement {
  return (
    <div
      aria-hidden='true'
      className='pointer-events-none absolute inset-0 -z-10 overflow-hidden text-foreground/[0.06] [mask-image:radial-gradient(ellipse_at_center,transparent_30%,black_75%)]'
    >
      {BACKDROP.map(({ id, Icon, left, top, rotate }) => (
        <Icon
          className='absolute size-9'
          key={id}
          strokeWidth={1.25}
          style={{
            left: `${String(left)}%`,
            top: `${String(top)}%`,
            transform: `rotate(${String(rotate)}deg)`,
          }}
        />
      ))}
    </div>
  );
}

/** The sign-in page's aside: the devices moving round the floor plan. */
export function ActivityPanel(): ReactElement {
  const { t } = useTranslation();
  const count = useEvents();
  const happened = EVENTS.slice(0, count);
  const latest = happened.at(-1);
  // Where every device is now, and what it is.
  const now = new Map(DEVICES.map((device) => [device.id, device]));
  for (const event of happened)
    for (const [id, zone, status] of event.moves) {
      const device = now.get(id);
      if (device) now.set(id, { ...device, zone, status });
    }
  const moved = new Set(latest?.moves.map(([id]) => id) ?? []);
  // Each device's place in its zone, in the order the list gives them.
  const filled: Partial<Record<Zone, number>> = {};
  const placed = DEVICES.map((device) => {
    const current = now.get(device.id) ?? device;
    const zone = ZONES[current.zone];
    const slot = filled[current.zone] ?? 0;
    filled[current.zone] = slot + 1;
    const column = slot % zone.cols;
    const row = Math.floor(slot / zone.cols);
    return {
      ...current,
      left: zone.x + 4 + column * ((zone.w - 8) / zone.cols),
      top: zone.y + (zone.inside ? 16 : 13) + row * 16,
    };
  });
  const tally = (status: Status) =>
    [...now.values()].filter((device) => device.status === status).length;
  const LatestIcon = latest?.icon;
  return (
    <>
      <Backdrop />
      {/* Laid over the aside rather than in its flow, so the page keeps the
          form's height whatever the plan holds. */}
      <div className='absolute inset-0 flex flex-col justify-center gap-8 p-12'>
        <header className='max-w-md space-y-2'>
          <h2 className='text-2xl leading-tight font-semibold tracking-tight'>
            {t('loginActivity.heading')}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {t('loginActivity.description')}
          </p>
        </header>
        {/* The plan is decoration: the heading above says what it shows. */}
        <div aria-hidden='true' className='grid w-full max-w-md gap-5'>
          <div className='relative aspect-[4/3] w-full'>
            {ZONE_KEYS.map((key) => {
              const zone = ZONES[key];
              const counted = latest?.pass === 'count' && zone.inside;
              return (
                <div
                  className={`absolute overflow-hidden rounded-xl border transition-colors duration-500 ${
                    zone.inside
                      ? 'border-border bg-card/80 shadow-xs'
                      : 'border-dashed border-muted-foreground/30 bg-background/40'
                  } ${counted ? 'border-success-foreground/40 bg-success' : ''}`}
                  key={key}
                  style={{
                    left: `${String(zone.x)}%`,
                    top: `${String(zone.y)}%`,
                    width: `${String(zone.w)}%`,
                    height: `${String(zone.h)}%`,
                  }}
                >
                  <span className='absolute top-2 left-2.5 inline-flex items-center gap-1 text-[0.6875rem] font-medium text-muted-foreground'>
                    {t(`loginActivity.zones.${key}`)}
                    {counted ? (
                      <Check className='size-3 animate-in text-success-foreground duration-300 zoom-in-50 motion-reduce:animate-none' />
                    ) : null}
                  </span>
                  {latest?.pass === 'sync' && key === 'floor' ? (
                    // The MDM's sweep across the desks.
                    <span className='auth-sync-sweep pointer-events-none absolute inset-y-0 w-1/3' />
                  ) : null}
                </div>
              );
            })}
            {/* The company's wall: inside above, outside below. */}
            <span className='absolute top-[62%] right-0 left-0 border-t border-dashed border-muted-foreground/30' />
            <span className='absolute top-[62%] right-1 -translate-y-1/2 bg-muted px-1 text-[0.625rem] text-muted-foreground'>
              {t('loginActivity.outside')}
            </span>
            {placed.map((device) => {
              const DeviceIcon = KINDS[device.kind];
              const lit =
                moved.has(device.id) ||
                (latest?.pass === 'sync' &&
                  device.zone === 'floor' &&
                  device.status === 'inUse');
              return (
                <span
                  className={`absolute grid size-6 place-items-center rounded-md transition-all duration-1000 ease-in-out ${STATUS_STYLE[device.status]} ${
                    lit
                      ? moved.has(device.id)
                        ? 'z-10 scale-125 ring-2 ring-primary'
                        : 'ring-1 ring-primary/50'
                      : ''
                  }`}
                  key={device.id}
                  style={{
                    left: `${String(device.left)}%`,
                    top: `${String(device.top)}%`,
                  }}
                >
                  <DeviceIcon className='size-3.5' />
                </span>
              );
            })}
          </div>
          {/* What just happened, in one line, and where things stand. */}
          <div className='grid gap-3'>
            <p
              className='flex h-7 animate-in items-center gap-2.5 text-sm duration-500 fade-in slide-in-from-bottom-1 motion-reduce:animate-none'
              key={latest?.id ?? 'start'}
            >
              {LatestIcon && latest ? (
                <>
                  <span className='grid size-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground'>
                    <LatestIcon className='size-3.5' />
                  </span>
                  <span className='shrink-0 font-mono text-xs text-muted-foreground'>
                    {t(`loginActivity.events.${latest.id}.device`)}
                  </span>
                  <span className='min-w-0 truncate font-medium'>
                    {t(`loginActivity.events.${latest.id}.what`)}
                  </span>
                </>
              ) : (
                <span className='text-muted-foreground'>
                  {t('loginActivity.idle')}
                </span>
              )}
            </p>
            <ul className='flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground'>
              {(['inUse', 'inStock', 'inRepair', 'disposal'] as const).map(
                (status) => (
                  <li className='inline-flex items-center gap-1.5' key={status}>
                    <span
                      className={`size-2.5 rounded-sm ${STATUS_STYLE[status]}`}
                    />
                    {t(`loginActivity.statuses.${status}`)}
                    <span className='font-medium text-foreground tabular-nums'>
                      {tally(status)}
                    </span>
                  </li>
                ),
              )}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
