// Sync classes
import type { QuickJSWASMModule } from "./module"
import type { QuickJSRuntime, InterruptHandler } from "./runtime"
import type { QuickJSContext } from "./context"
export type { QuickJSWASMModule, QuickJSContext, QuickJSRuntime }

// Async classes
import type { QuickJSAsyncWASMModule } from "./module-asyncify"
import type { QuickJSAsyncRuntime } from "./runtime-asyncify"
import type { QuickJSAsyncContext } from "./context-asyncify"
import { AsyncRuntimeOptions, ContextOptions } from "./types"
export type { QuickJSAsyncContext, QuickJSAsyncRuntime, QuickJSAsyncWASMModule }

// Export helpers
export * from "./vm-interface"
export * from "./lifetime"
export * from "./errors"
export * from "./deferred-promise"
export type {
  StaticJSValue,
  JSValueConst,
  JSValue,
  QuickJSHandle,
  ContextOptions,
  ContextEvalOptions,
  RuntimeOptions,
  JSModuleLoader,
  JSModuleLoadResult,
} from "./types"
export type { ModuleEvalOptions } from "./module"
export type { InterruptHandler, ExecutePendingJobsResult } from "./runtime"
export type { QuickJSPropertyKey } from "./context"

let singleton: QuickJSWASMModule | undefined = undefined
let singletonPromise: Promise<QuickJSWASMModule> | undefined = undefined

/**
 * Get a shared singleton {@link QuickJSWASMModule}. Use this to evaluate code
 * or create Javascript environments.
 *
 * This is the top-level entrypoint for the quickjs-emscripten library.
 *
 * If you need strictest possible isolation guarantees, you may create a
 * separate {@link QuickJSWASMModule} via {@link newQuickJSWASMModule}.
 *
 * To work with the asyncified version of this library, see these functions:
 *
 * - {@link newAsyncRuntime}.
 * - {@link newAsyncContext}.
 * - {@link newQuickJSAsyncWASMModule}.
 */
export async function getQuickJS(): Promise<QuickJSWASMModule> {
  singletonPromise ??= newQuickJSWASMModule().then((instance) => {
    singleton = instance
    return instance
  })
  return await singletonPromise
}

/**
 * Provides synchronous access to the shared {@link QuickJSWASMModule} instance returned by {@link getQuickJS}, as long as
 * least once.
 * @throws If called before `getQuickJS` resolves.
 */
export function getQuickJSSync(): QuickJSWASMModule {
  if (!singleton) {
    throw new Error("QuickJS not initialized. Await getQuickJS() at least once.")
  }
  return singleton
}

/**
 * Create a new, completely isolated WebAssembly module containing the QuickJS library.
 * See the documentation on [[QuickJSWASMModule]].
 *
 * Note that there is a hard limit on the number of WebAssembly modules in older
 * versions of v8:
 * https://bugs.chromium.org/p/v8/issues/detail?id=12076
 */
export async function newQuickJSWASMModule(): Promise<QuickJSWASMModule> {
  const [{ default: wasmModuleLoader }, { QuickJSWASMModule }, { QuickJSFFI }] = await Promise.all([
    import("./quickjs.emscripten-module"),
    import("./module"),
    import("./ffi"),
  ])
  const wasmModule = await wasmModuleLoader()
  wasmModule.type = "sync"
  const ffi = new QuickJSFFI(wasmModule)
  return new QuickJSWASMModule(wasmModule, ffi)
}

/**
 * Create a new, completely isolated WebAssembly module containing a version of the QuickJS library
 * compiled with Emscripten's [ASYNCIFY](https://emscripten.org/docs/porting/asyncify.html) transform.
 *
 * This version of the library offers features that enable synchronous code
 * inside the VM to interact with asynchronous code in the host environment.
 * See the documentation on [[QuickJSAsyncWASMModule]], [[QuickJSAsyncRuntime]],
 * and [[QuickJSAsyncContext]].
 *
 * Note that there is a hard limit on the number of WebAssembly modules in older
 * versions of v8:
 * https://bugs.chromium.org/p/v8/issues/detail?id=12076
 */
export async function newQuickJSAsyncWASMModule(): Promise<QuickJSAsyncWASMModule> {
  const [{ default: wasmModuleLoader }, { QuickJSAsyncWASMModule }, { QuickJSAsyncFFI }] =
    await Promise.all([
      import("./quickjs-asyncify.emscripten-module"),
      import("./module-asyncify"),
      import("./ffi-asyncify"),
    ])
  const wasmModule = await wasmModuleLoader()
  wasmModule.type = "async"
  const ffi = new QuickJSAsyncFFI(wasmModule)
  return new QuickJSAsyncWASMModule(wasmModule, ffi)
}

/**
 * Create a new [[QuickJSAsyncRuntime]] in a separate WebAssembly module.
 *
 * Each runtime is isolated in a separate WebAssembly module, so that errors in
 * one runtime cannot contaminate another runtime, and each runtime can execute
 * an asynchronous action without conflicts.
 *
 * Note that there is a hard limit on the number of WebAssembly modules in older
 * versions of v8:
 * https://bugs.chromium.org/p/v8/issues/detail?id=12076
 */
export async function newAsyncRuntime(options?: AsyncRuntimeOptions): Promise<QuickJSAsyncRuntime> {
  const module = await newQuickJSAsyncWASMModule()
  return module.newRuntime(options)
}

/**
 * Create a new [[QuickJSAsyncContext]] (with an associated runtime) in an
 * separate WebAssembly module.
 *
 * Each context is isolated in a separate WebAssembly module, so that errors in
 * one runtime cannot contaminate another runtime, and each runtime can execute
 * an asynchronous action without conflicts.
 *
 * Note that there is a hard limit on the number of WebAssembly modules in older
 * versions of v8:
 * https://bugs.chromium.org/p/v8/issues/detail?id=12076
 */
export async function newAsyncContext(options?: ContextOptions): Promise<QuickJSAsyncContext> {
  const module = await newQuickJSAsyncWASMModule()
  return module.newContext(options)
}

/**
 * Returns an interrupt handler that interrupts Javascript execution after a deadline time.
 *
 * @param deadline - Interrupt execution if it's still running after this time.
 *   Number values are compared against `Date.now()`
 */
export function shouldInterruptAfterDeadline(deadline: Date | number): InterruptHandler {
  const deadlineAsNumber = typeof deadline === "number" ? deadline : deadline.getTime()

  return function () {
    return Date.now() > deadlineAsNumber
  }
}