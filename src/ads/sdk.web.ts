// Web half of the ads facade's platform split — see `sdk.native.ts` for why
// this file exists. There is no ad SDK on web, and the facade's every function
// degrades to the no-SDK path (which grants the reward).
//
// The type annotation is erased at build time, so naming the package here does
// NOT pull it into the web bundle.

export const sdk: typeof import("react-native-google-mobile-ads") | null = null;
