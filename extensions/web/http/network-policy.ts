import { lookup as lookupAsync } from "node:dns/promises";
import type { LookupFunction } from "node:net";
import ipaddr from "ipaddr.js";
import { networkError } from "./network-errors.ts";

function isPublicAddress(address: string): boolean {
  let parsed = ipaddr.parse(address);
  if (parsed instanceof ipaddr.IPv6 && parsed.isIPv4MappedAddress()) {
    parsed = parsed.toIPv4Address();
  }
  return parsed.range() === "unicast";
}

export function assertAllowedUrl(url: URL, allowPrivateNetwork: boolean): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("request blocked: only HTTP and HTTPS URLs are allowed");
  }
  if (url.username || url.password) {
    throw new Error(
      "request blocked: URLs containing credentials are not allowed",
    );
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (
    !allowPrivateNetwork &&
    ipaddr.isValid(hostname) &&
    !isPublicAddress(hostname)
  ) {
    throw new Error(`request blocked: ${url.hostname} is a non-public address`);
  }
}

export const publicNetworkLookup: LookupFunction = (
  hostname,
  options,
  callback,
) => {
  lookupAsync(hostname, {
    all: true,
    verbatim: true,
    family: options.family,
  }).then(
    (addresses) => {
      const blocked = addresses.find(
        ({ address }) => !isPublicAddress(address),
      );
      if (blocked) {
        callback(
          new Error(
            `request blocked: ${hostname} resolved to non-public address ${blocked.address}`,
          ),
          "",
          0,
        );
        return;
      }
      const selected = addresses[0];
      if (!selected) {
        callback(
          new Error(`request failed: ${hostname} resolved to no addresses`),
          "",
          0,
        );
        return;
      }
      if (options.all) callback(null, addresses);
      else callback(null, selected.address, selected.family);
    },
    (error) => callback(networkError(error), "", 0),
  );
};
