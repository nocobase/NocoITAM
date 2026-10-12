import { useEffect, useRef, type ReactElement } from 'react';
import { Button } from '../ui/button.js';
import { Spinner } from '../ui/spinner.js';
import { useTranslation } from '@nocobase/i18n/client';

// The end of a list that pages: the next page loads as this scrolls into
// view (within any scrolling column or popover, which clip what the
// viewport sees), a spinner showing while it does, so there is no button to
// press. Where the browser cannot tell (no IntersectionObserver), it is a
// button after all. Lists that expand what they hold (a calendar day, an
// attachment list) keep their own button; tables keep their pages.
export function AutoLoadMore({
  hasMore,
  loading,
  onLoad,
  className = '',
}: {
  hasMore: boolean;
  loading: boolean;
  onLoad: () => void;
  className?: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const endRef = useRef<HTMLDivElement>(null);
  // The latest callback, so the observer need not restart when it changes.
  const loadRef = useRef(onLoad);
  useEffect(() => {
    loadRef.current = onLoad;
  });
  const observed = typeof IntersectionObserver !== 'undefined';
  useEffect(() => {
    const node = endRef.current;
    if (!node || !hasMore || loading || !observed) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadRef.current();
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, observed]);
  if (!hasMore && !loading) return null;
  return (
    <div ref={endRef} className={`flex justify-center py-2 ${className}`}>
      {loading ? (
        <Spinner aria-label={t('admin.common.loadMore')} />
      ) : (
        !observed && (
          <Button variant='ghost' size='sm' onClick={onLoad}>
            {t('admin.common.loadMore')}
          </Button>
        )
      )}
    </div>
  );
}
