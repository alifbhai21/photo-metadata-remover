export type AnalyticsProps = Record<string, string | number | boolean>;

const analyticsDomain = import.meta.env.PUBLIC_PLAUSIBLE_DOMAIN as string | undefined;

export function isAnalyticsEnabled(): boolean {
  return Boolean(analyticsDomain);
}

type PlausibleFn = (name: string, data?: { props?: AnalyticsProps }) => void;
type PlausibleQueue = Array<string | { props?: AnalyticsProps } | undefined>;

export function trackEvent(event: string, props?: AnalyticsProps): void {
  if (!isAnalyticsEnabled()) return;
  try {
    const w = window as unknown as { plausible?: PlausibleFn | PlausibleQueue };
    const payload = props ? { props } : undefined;
    if (typeof w.plausible === 'function') {
      w.plausible(event, payload);
    } else {
      const queue = Array.isArray(w.plausible) ? w.plausible : [];
      queue.push(event, payload);
      w.plausible = queue;
    }
  } catch {
    // Analytics must never interfere with the core tool.
  }
}