// Types come from ../openapi.json (npm run api-types), so the client is
// written against the published contract, not the server's code.
import { useEffect, useState } from 'react';
import type { operations } from './api-types';

type Ok<K extends keyof operations> = operations[K]['responses'][200]['content']['application/json'];

export type MeterPage = Ok<'listMeters'>;
export type Meter = MeterPage['items'][number];
export type Status = Meter['status'];
export type Readings = Ok<'getMeterReadings'>;
export type Reading = Readings['readings'][number];
export type HierarchyResponse = Ok<'getHierarchy'>;
export type Repair = HierarchyResponse['dataQuality']['repairs'][number];
export type ReusedCode = HierarchyResponse['dataQuality']['reusedCodes'][number];
export type Transformer = Ok<'listTransformers'>['items'][number];
export type Health = Ok<'getHealth'>;

export const LEVELS = ['zone', 'circle', 'division', 'subdivision', 'substation', 'feeder', 'transformer'] as const;
export type Level = (typeof LEVELS)[number];

/** The tree is typed level by level in the spec; for rendering, one recursive shape is enough. */
export interface TreeNode {
  level: Level;
  code: string;
  name: string;
  path: string;
  meters: { total: number; installed: number; faulty: number; decommissioned: number };
  children: TreeNode[];
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api${path}`, { signal });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.code ?? 'unknown', body?.error?.message ?? `HTTP ${res.status}`);
  }
  return body as T;
}

/** Fetches `path` whenever it changes. Keeps the previous data while the next request loads. */
export function useApi<T>(path: string | null, refreshMs?: number) {
  const [state, setState] = useState<{ data: T | null; error: ApiError | null; loading: boolean }>({
    data: null,
    error: null,
    loading: path !== null,
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!refreshMs) return;
    const id = setInterval(() => setTick((t) => t + 1), refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    api<T>(path, controller.signal).then(
      (data) => setState({ data, error: null, loading: false }),
      (err: unknown) => {
        if (controller.signal.aborted) return;
        const error = err instanceof ApiError ? err : new ApiError(0, 'network', 'The API could not be reached.');
        setState((s) => ({ data: s.data, error, loading: false }));
      },
    );
    return () => controller.abort();
  }, [path, tick]);

  return { ...state, retry: () => setTick((t) => t + 1) };
}

export const pathOf = (m: Meter) => LEVELS.map((level) => m.hierarchy[level].code).join('/');
