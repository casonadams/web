interface InFlightOperation<T> {
  promise: Promise<T>;
  controller: AbortController;
  waiters: number;
}

function waitForOperation<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

export function createCoalescedOperation<K, T>() {
  const operations = new Map<K, InFlightOperation<T>>();

  return async function run(
    key: K,
    signal: AbortSignal | undefined,
    start: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    signal?.throwIfAborted();
    let operation = operations.get(key);
    if (!operation) {
      const controller = new AbortController();
      const promise = Promise.resolve().then(() => start(controller.signal));
      operation = { promise, controller, waiters: 0 };
      const created = operation;
      operations.set(key, created);
      const clear = () => {
        if (operations.get(key) === created) operations.delete(key);
      };
      promise.then(clear, clear);
    }

    operation.waiters += 1;
    try {
      return await waitForOperation(operation.promise, signal);
    } finally {
      operation.waiters -= 1;
      if (operation.waiters === 0) {
        if (operations.get(key) === operation) operations.delete(key);
        operation.controller.abort();
      }
    }
  };
}
