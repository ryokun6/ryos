import { resolveBoundedConcurrency } from "./_concurrency.js";

export function getApnsSendConcurrency(): number {
  return resolveBoundedConcurrency(process.env.APNS_SEND_CONCURRENCY, 4);
}

export function getPushMetadataLookupConcurrency(): number {
  return resolveBoundedConcurrency(
    process.env.PUSH_METADATA_LOOKUP_CONCURRENCY,
    8
  );
}
