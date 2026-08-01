// Default (native) half of the ads facade's platform split.
//
// Metro resolves `./sdk` to `sdk.web.ts` on web and falls back to this file
// everywhere else; TypeScript, which knows nothing about platform extensions,
// also resolves to this one — which is why the native implementation lives in
// the extensionless file rather than in a `.native.ts`.
//
// The web bundler **statically resolves every `require`**, even one inside a
// `try`, and react-native-google-mobile-ads imports RN internals that don't
// exist on web — so a lazy require in `index.ts` breaks `expo export -p web`
// outright. Metro's platform-extension resolution is the fix: web gets
// `sdk.web.ts` (a null) and never sees the package at all.
//
// The try/catch still earns its place here: in Expo Go (or any build where the
// native side isn't linked) the JS package resolves but its native module is
// missing, and degrading to `null` is what keeps the app launching.

let sdk: typeof import("react-native-google-mobile-ads") | null = null;
try {
  sdk = require("react-native-google-mobile-ads");
} catch {
  sdk = null;
}

export { sdk };
