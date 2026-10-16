import {
  AppWindow,
  ArrowLeftRight,
  Backpack,
  Boxes,
  FileText,
  GitBranch,
  History,
  KeyRound,
  Link2,
  ListChecks,
  ListTree,
  MonitorSmartphone,
  Package,
  PackageCheck,
  Paperclip,
  Recycle,
  ShoppingCart,
  UserCheck,
  UserPlus,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

/**
 * The icon that leads a detail page's tab, by the tab's key, as NocoCRM's
 * record pages lead theirs. A tab that lists another collection wears that
 * collection's menu icon (`client/routes.ts`), so the two read as one place.
 * Keys are shared across pages — every page's history is `history` — so the
 * domains name none; a key missing here draws its tab without an icon.
 */
export const TAB_ICONS: Readonly<Record<string, LucideIcon>> = {
  history: History,
  attachments: Paperclip,
  // The device page's own tabs.
  related: Link2,
  documents: FileText,
  // Lists of another collection.
  devices: MonitorSmartphone,
  stock: Boxes,
  accessories: Boxes,
  entitlements: KeyRound,
  models: Package,
  softwareProducts: AppWindow,
  people: Users,
  purchaseOrders: ShoppingCart,
  purchases: ShoppingCart,
  repairs: Wrench,
  disposals: Recycle,
  children: ListTree,
  // Tabs of one kind of record.
  items: ListChecks,
  seats: UserCheck,
  holders: ArrowLeftRight,
  generated: PackageCheck,
  holdings: Backpack,
  onboarding: UserPlus,
  // A record's lifecycle drawn (2026-10-18).
  flow: GitBranch,
};
