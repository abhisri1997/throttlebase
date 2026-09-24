/// <reference types="nativewind/types" />

/**
 * TypeScript 6 rejects a side-effect import of a module it has no declaration
 * for (TS2882). Metro resolves `global.css` through the NativeWind transform,
 * so there is nothing to import at the type level -- this just tells tsc the
 * module exists.
 */
declare module "*.css" {}
