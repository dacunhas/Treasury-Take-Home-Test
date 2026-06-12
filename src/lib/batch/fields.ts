/**
 * T4.1 — map a parsed batch row's expected values to the flat string fields the
 * `/api/verify` route expects (the same names the single-label form posts:
 * brand, classType, abv, netContents, beverageType).
 *
 * Pure so the row->request mapping is unit-tested without building a real
 * `FormData` or making a request. `BatchForm` calls this, then appends the
 * matched image File under the `image` key. ABV is passed through verbatim
 * (including ''), preserving the conditional-by-beverage-type handling that the
 * server + comparison engine own (CONTEXT §5).
 */
import type { BatchExpectedInput } from './types';

export type VerifyFields = {
  brand: string;
  classType: string;
  abv: string;
  netContents: string;
  beverageType: string;
};

export function toVerifyFields(expected: BatchExpectedInput): VerifyFields {
  return {
    brand: expected.brand,
    classType: expected.classType,
    abv: expected.abv,
    netContents: expected.netContents,
    beverageType: expected.beverageType,
  };
}
