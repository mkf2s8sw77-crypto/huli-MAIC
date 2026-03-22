'use client';

import { useLayoutEffect, type ReactNode } from 'react';
import { BASE_PATH, withBasePath } from '@/lib/utils/base-path';

function patchRequestInput(input: RequestInfo | URL): RequestInfo | URL {
  if (!BASE_PATH) {
    return input;
  }

  if (typeof input === 'string') {
    return withBasePath(input);
  }

  if (input instanceof URL) {
    if (input.origin !== window.location.origin) {
      return input;
    }

    return new URL(withBasePath(`${input.pathname}${input.search}${input.hash}`), input.origin);
  }

  const url = new URL(input.url);
  if (url.origin !== window.location.origin) {
    return input;
  }

  return new Request(
    new URL(withBasePath(`${url.pathname}${url.search}${url.hash}`), url.origin),
    input,
  );
}

export function BasePathProvider({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    if (!BASE_PATH) {
      return;
    }

    const nativeFetch = window.fetch.bind(window);

    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      return nativeFetch(patchRequestInput(input), init);
    }) as typeof window.fetch;

    return () => {
      window.fetch = nativeFetch;
    };
  }, []);

  return <>{children}</>;
}
