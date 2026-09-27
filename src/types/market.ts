/**
 * A market candle as Dukascopy returns it: `time` in **seconds**.
 *
 * Distinct from the store's `Candle`, which uses **milliseconds**. Both exist and
 * the two units have already caused one bug in this codebase (`getBucketStart`
 * returned seconds where milliseconds were expected, putting a weekly bucket in
 * 1970), so the unit is called out in the field comment and the type is imported
 * under an alias (`MarketCandle`) by its one consumer.
 */
export interface Candle {
  /** Unix timestamp in seconds. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
