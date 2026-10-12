// Detects this machine's LAN IPv4 address so the launcher can print a
// join address other devices on the same network can actually reach.
// We deliberately skip loopback and APIPA (169.254.x.x) addresses.

import { networkInterfaces } from "node:os";

export function detectLanIp(): string | null {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      // IPv4 only
      if (net.family !== "IPv4") continue;
      if (net.internal) continue; // skip 127.0.0.1
      if (net.address.startsWith("169.254.")) continue; // skip link-local
      return net.address;
    }
  }
  return null;
}
