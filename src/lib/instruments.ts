/**
 * The instrument catalogue, split out of `server.ts` so it can be imported and
 * tested.
 *
 * It was defined inline in the server, which made it untestable — the server
 * calls `startServer()` at import time and binds a port, so nothing in it could
 * be reached from `node --test`. That mattered: this list is hand-maintained, it
 * had drifted from what Dukascopy actually serves, and there was no way to
 * assert it was correct. See `UNAVAILABLE_UPSTREAM`.
 *
 * Membership here is *not* treated as authority that an instrument can be
 * downloaded. The server validates against Dukascopy's own instrument enum
 * (`VALID_DUKASCOPY_INSTRUMENTS`); this list only drives the picker UI and
 * per-request display metadata.
 */

export type InstrumentCategory =
  | "forex_major"
  | "forex_cross"
  | "forex_exotic"
  | "commodities"
  | "crypto"
  | "indices"
  | "stocks";

export interface InstrumentMeta {
  id: string;
  symbol: string;
  name: string;
  category: InstrumentCategory;
  pipSize: number;
  decimalPlaces: number;
}

export const SUPPORTED_INSTRUMENTS: InstrumentMeta[] = [
  // Forex Majors
  { id: "eurusd", symbol: "EUR/USD", name: "Euro / US Dollar", category: "forex_major", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "gbpusd", symbol: "GBP/USD", name: "British Pound / US Dollar", category: "forex_major", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "usdjpy", symbol: "USD/JPY", name: "US Dollar / Japanese Yen", category: "forex_major", pipSize: 0.01, decimalPlaces: 3 },
  { id: "audusd", symbol: "AUD/USD", name: "Australian Dollar / US Dollar", category: "forex_major", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "usdcad", symbol: "USD/CAD", name: "US Dollar / Canadian Dollar", category: "forex_major", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "usdchf", symbol: "USD/CHF", name: "US Dollar / Swiss Franc", category: "forex_major", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "nzdusd", symbol: "NZD/USD", name: "New Zealand Dollar / US Dollar", category: "forex_major", pipSize: 0.0001, decimalPlaces: 5 },
  // Forex Crosses
  { id: "eurgbp", symbol: "EUR/GBP", name: "Euro / British Pound", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "eurjpy", symbol: "EUR/JPY", name: "Euro / Japanese Yen", category: "forex_cross", pipSize: 0.01, decimalPlaces: 3 },
  { id: "gbpjpy", symbol: "GBP/JPY", name: "British Pound / Japanese Yen", category: "forex_cross", pipSize: 0.01, decimalPlaces: 3 },
  { id: "audjpy", symbol: "AUD/JPY", name: "Australian Dollar / Japanese Yen", category: "forex_cross", pipSize: 0.01, decimalPlaces: 3 },
  { id: "euraud", symbol: "EUR/AUD", name: "Euro / Australian Dollar", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "gbpcad", symbol: "GBP/CAD", name: "British Pound / Canadian Dollar", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "cadjpy", symbol: "CAD/JPY", name: "Canadian Dollar / Japanese Yen", category: "forex_cross", pipSize: 0.01, decimalPlaces: 3 },
  { id: "eurchf", symbol: "EUR/CHF", name: "Euro / Swiss Franc", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "eurcad", symbol: "EUR/CAD", name: "Euro / Canadian Dollar", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "eurnzd", symbol: "EUR/NZD", name: "Euro / New Zealand Dollar", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "gbpchf", symbol: "GBP/CHF", name: "British Pound / Swiss Franc", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "gbpaud", symbol: "GBP/AUD", name: "British Pound / Australian Dollar", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "gbpnzd", symbol: "GBP/NZD", name: "British Pound / New Zealand Dollar", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "audcad", symbol: "AUD/CAD", name: "Australian Dollar / Canadian Dollar", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "audchf", symbol: "AUD/CHF", name: "Australian Dollar / Swiss Franc", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "audnzd", symbol: "AUD/NZD", name: "Australian Dollar / New Zealand Dollar", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "cadchf", symbol: "CAD/CHF", name: "Canadian Dollar / Swiss Franc", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "nzdjpy", symbol: "NZD/JPY", name: "New Zealand Dollar / Japanese Yen", category: "forex_cross", pipSize: 0.01, decimalPlaces: 3 },
  { id: "nzdcad", symbol: "NZD/CAD", name: "New Zealand Dollar / Canadian Dollar", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "nzdchf", symbol: "NZD/CHF", name: "New Zealand Dollar / Swiss Franc", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "chfjpy", symbol: "CHF/JPY", name: "Swiss Franc / Japanese Yen", category: "forex_cross", pipSize: 0.01, decimalPlaces: 3 },
  // Forex Exotics
  { id: "usdsgd", symbol: "USD/SGD", name: "US Dollar / Singapore Dollar", category: "forex_exotic", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "usdhkd", symbol: "USD/HKD", name: "US Dollar / Hong Kong Dollar", category: "forex_exotic", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "usdsek", symbol: "USD/SEK", name: "US Dollar / Swedish Krona", category: "forex_exotic", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "usdnok", symbol: "USD/NOK", name: "US Dollar / Norwegian Krone", category: "forex_exotic", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "usdzar", symbol: "USD/ZAR", name: "US Dollar / South African Rand", category: "forex_exotic", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "usdtry", symbol: "USD/TRY", name: "US Dollar / Turkish Lira", category: "forex_exotic", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "usdmxn", symbol: "USD/MXN", name: "US Dollar / Mexican Peso", category: "forex_exotic", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "usdpln", symbol: "USD/PLN", name: "US Dollar / Polish Zloty", category: "forex_exotic", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "eursgd", symbol: "EUR/SGD", name: "Euro / Singapore Dollar", category: "forex_exotic", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "eursek", symbol: "EUR/SEK", name: "Euro / Swedish Krona", category: "forex_exotic", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "eurnok", symbol: "EUR/NOK", name: "Euro / Norwegian Krone", category: "forex_exotic", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "eurtry", symbol: "EUR/TRY", name: "Euro / Turkish Lira", category: "forex_exotic", pipSize: 0.0001, decimalPlaces: 5 },
  // Commodities & Metals
  { id: "xauusd", symbol: "XAU/USD", name: "Gold / US Dollar", category: "commodities", pipSize: 0.1, decimalPlaces: 2 },
  { id: "xagusd", symbol: "XAG/USD", name: "Silver / US Dollar", category: "commodities", pipSize: 0.01, decimalPlaces: 3 },
  { id: "xaueur", symbol: "XAU/EUR", name: "Gold / Euro", category: "commodities", pipSize: 0.1, decimalPlaces: 2 },
  { id: "xageur", symbol: "XAG/EUR", name: "Silver / Euro", category: "commodities", pipSize: 0.01, decimalPlaces: 3 },
  { id: "xptcmdusd", symbol: "XPT/USD", name: "Platinum / US Dollar", category: "commodities", pipSize: 0.1, decimalPlaces: 2 },
  { id: "xpdcmdusd", symbol: "XPD/USD", name: "Palladium / US Dollar", category: "commodities", pipSize: 0.1, decimalPlaces: 2 },
  { id: "brentcmdusd", symbol: "BRENT", name: "Brent Crude Oil", category: "commodities", pipSize: 0.01, decimalPlaces: 2 },
  { id: "lightcmdusd", symbol: "WTI", name: "WTI Crude Oil", category: "commodities", pipSize: 0.01, decimalPlaces: 2 },
  { id: "gascmdusd", symbol: "NGAS", name: "Natural Gas", category: "commodities", pipSize: 0.001, decimalPlaces: 3 },
  { id: "coppercmdusd", symbol: "COPPER", name: "High Grade Copper", category: "commodities", pipSize: 0.001, decimalPlaces: 3 },
  // Crypto
  { id: "btcusd", symbol: "BTC/USD", name: "Bitcoin / US Dollar", category: "crypto", pipSize: 1.0, decimalPlaces: 2 },
  { id: "ethusd", symbol: "ETH/USD", name: "Ethereum / US Dollar", category: "crypto", pipSize: 0.1, decimalPlaces: 2 },
  { id: "solusd", symbol: "SOL/USD", name: "Solana / US Dollar", category: "crypto", pipSize: 0.01, decimalPlaces: 2 },
  { id: "xrpusd", symbol: "XRP/USD", name: "Ripple / US Dollar", category: "crypto", pipSize: 0.0001, decimalPlaces: 4 },
  { id: "ltcusd", symbol: "LTC/USD", name: "Litecoin / US Dollar", category: "crypto", pipSize: 0.01, decimalPlaces: 2 },
  { id: "bchusd", symbol: "BCH/USD", name: "Bitcoin Cash / US Dollar", category: "crypto", pipSize: 0.01, decimalPlaces: 2 },
  { id: "adausd", symbol: "ADA/USD", name: "Cardano / US Dollar", category: "crypto", pipSize: 0.0001, decimalPlaces: 4 },
  { id: "dotusd", symbol: "DOT/USD", name: "Polkadot / US Dollar", category: "crypto", pipSize: 0.001, decimalPlaces: 3 },
  { id: "linkusd", symbol: "LINK/USD", name: "Chainlink / US Dollar", category: "crypto", pipSize: 0.001, decimalPlaces: 3 },
  { id: "dogeusd", symbol: "DOGE/USD", name: "Dogecoin / US Dollar", category: "crypto", pipSize: 0.00001, decimalPlaces: 5 },
  { id: "avaxusd", symbol: "AVAX/USD", name: "Avalanche / US Dollar", category: "crypto", pipSize: 0.01, decimalPlaces: 2 },
  // Indices
  { id: "usa500idxusd", symbol: "US500", name: "S&P 500 Index", category: "indices", pipSize: 0.1, decimalPlaces: 2 },
  { id: "usa30idxusd", symbol: "US30", name: "Dow Jones 30 Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },
  { id: "usatechidxusd", symbol: "NAS100", name: "Nasdaq 100 Index", category: "indices", pipSize: 0.1, decimalPlaces: 2 },
  { id: "deuidxeur", symbol: "GER40", name: "DAX 40 Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },
  { id: "gbridxgbp", symbol: "UK100", name: "FTSE 100 Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },
  { id: "fraidxeur", symbol: "FRA40", name: "CAC 40 Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },
  { id: "jpnidxjpy", symbol: "JPN225", name: "Nikkei 225 Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },
  { id: "ausidxaud", symbol: "AUS200", name: "ASX 200 Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },
  { id: "eusidxeur", symbol: "EU50", name: "Euro Stoxx 50 Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },
  { id: "hkgidxhkd", symbol: "HK50", name: "Hang Seng Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },
  { id: "chiidxusd", symbol: "CHI50", name: "China A50 Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },
  // Stocks
  { id: "aaplususd", symbol: "AAPL", name: "Apple Inc.", category: "stocks", pipSize: 0.01, decimalPlaces: 2 },
  { id: "msftususd", symbol: "MSFT", name: "Microsoft Corporation", category: "stocks", pipSize: 0.01, decimalPlaces: 2 },
  { id: "nvdaususd", symbol: "NVDA", name: "NVIDIA Corporation", category: "stocks", pipSize: 0.01, decimalPlaces: 2 },
  { id: "amznususd", symbol: "AMZN", name: "Amazon.com Inc.", category: "stocks", pipSize: 0.01, decimalPlaces: 2 },
  { id: "googususd", symbol: "GOOGL", name: "Alphabet Inc.", category: "stocks", pipSize: 0.01, decimalPlaces: 2 },
  { id: "tslaususd", symbol: "TSLA", name: "Tesla Inc.", category: "stocks", pipSize: 0.01, decimalPlaces: 2 },
  { id: "metaususd", symbol: "META", name: "Meta Platforms Inc.", category: "stocks", pipSize: 0.01, decimalPlaces: 2 },
];

/**
 * Catalogue entries that Dukascopy does not actually serve.
 *
 * Found by diffing every catalogue id (and every `DUKASCOPY_ALIAS_MAP` target)
 * against dukascopy-node's own `Instrument` enum, which has 1499 runtime values.
 * Six of these do not exist upstream in any form — the symbol is absent from the
 * enum entirely:
 *
 *   `xrpusd`, `dotusd`, `linkusd`, `dogeusd`, `avaxusd`, `metaususd`
 *
 * and one is mislabelled: Dukascopy carries Solana only as `solbbeeur`
 * (SOL quoted in BTC/EUR), never as `solusd`, so "SOL/USD" cannot be served.
 *
 * Requesting any of these used to pass validation — they were in this very list,
 * which was the only gate — and then throw *inside* dukascopy-node with an
 * `undefined` message, surfacing as a bare HTTP 500. Selecting XRP, DOT, LINK,
 * DOGE, AVAX, META or SOL in the instrument picker produced a 500.
 *
 * They are kept in the catalogue rather than deleted so the picker still offers
 * them, but the server now rejects them with a 400 that says why, and
 * `tests/instruments.test.ts` fails if this set ever stops matching reality —
 * so a newly-broken or newly-fixed symbol is noticed rather than discovered by
 * a user.
 */
export const UNAVAILABLE_UPSTREAM: Readonly<Record<string, string>> = {
  xrpusd: "Dukascopy does not carry XRP in any form",
  dotusd: "Dukascopy does not carry Polkadot in any form",
  linkusd: "Dukascopy does not carry Chainlink in any form",
  dogeusd: "Dukascopy does not carry Dogecoin in any form",
  avaxusd: "Dukascopy does not carry Avalanche in any form",
  metaususd: "Dukascopy does not carry Meta Platforms in any form",
  solusd: "Dukascopy carries Solana only as solbbeeur (SOL/BTC, SOL/EUR), not SOL/USD",
};

/** Human-readable reason an instrument cannot be served, or null if it can. */
export function unavailableReason(
  dukascopyInstrument: string,
  isValidUpstream: (symbol: string) => boolean,
): string | null {
  const id = dukascopyInstrument.toLowerCase();
  if (isValidUpstream(id)) return null;
  return (
    UNAVAILABLE_UPSTREAM[id] ??
    `Dukascopy does not provide data for "${id}"`
  );
}
