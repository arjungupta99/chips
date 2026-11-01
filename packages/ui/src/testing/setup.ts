/** Testing Library unmounts what a test rendered only when `afterEach` is global, and here it is not. */

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);
