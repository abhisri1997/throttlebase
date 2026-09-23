/** Wall-clock time as a port, so use cases can be tested at a fixed instant. */
export interface Clock {
  now(): Date;
}
