/**
 * The first module the app evaluates. Importing it installs `globalThis.crypto`; it exports
 * nothing, so nobody can import it for a value and get the order wrong by accident.
 */

import { installRuntime } from "./install";

installRuntime();
