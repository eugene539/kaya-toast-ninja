// Type-level check that src/core implements spec/api.d.ts exactly (typecheck only).
import type * as Api from "../../spec/api";
import * as Impl from "./index";

export const conformance: typeof Api = Impl;
