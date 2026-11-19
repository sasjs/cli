import 'jsdom'
import type { Dispatcher } from 'undici-types'

// @types/jsdom 21 predates the resource interceptor API in jsdom 31.
declare module 'jsdom' {
  export function requestInterceptor(
    callback: (
      request: Request,
      context: { element: Element | null }
    ) => Response | void | Promise<Response | void>
  ): Dispatcher.DispatcherComposeInterceptor
}
