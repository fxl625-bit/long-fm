import type { RadioState } from "./types";

type Listener = () => void;

function shallowEqualState<T extends Record<string, unknown>>(left: T, right: T) {
  const leftKeys = Object.keys(left) as Array<keyof T>;
  const rightKeys = Object.keys(right) as Array<keyof T>;
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (const key of leftKeys) {
    if (!Object.is(left[key], right[key])) {
      return false;
    }
  }

  return true;
}

export class RadioStore {
  private state: RadioState;
  private listeners = new Set<Listener>();

  constructor(initialState: RadioState) {
    this.state = initialState;
  }

  getState() {
    return this.state;
  }

  setState(next: Partial<RadioState>) {
    const nextState = {
      ...this.state,
      ...next,
    };
    if (shallowEqualState(this.state as Record<string, unknown>, nextState as Record<string, unknown>)) {
      return;
    }
    this.state = nextState;
    this.emit();
  }

  update(updater: (state: RadioState) => RadioState) {
    const nextState = updater(this.state);
    if (shallowEqualState(this.state as Record<string, unknown>, nextState as Record<string, unknown>)) {
      return;
    }
    this.state = nextState;
    this.emit();
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
