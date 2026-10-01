"use client";

import { useEffect, useState } from "react";
import { DeviceInfo, listDevices, revokeDevice } from "@/lib/api";

export default function DevicesPanel() {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const items = await listDevices(controller.signal);
        if (!controller.signal.aborted) setDevices(items);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Failed to list devices");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const handleRevoke = async (device: DeviceInfo) => {
    setBusy(device.deviceId);
    setError(null);
    try {
      await revokeDevice(device.deviceId);
      setDevices((items) => items.filter((item) => item.deviceId !== device.deviceId));
      setConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke device");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm mb-6">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">Devices</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Desktop sign-ins with long-lived credentials. Revoking a device prevents new authenticated requests; already-open connections may remain until disconnected.
        </p>
      </div>
      <div className="p-6">
        {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
        {loading ? <p className="text-sm text-gray-500">Loading devices...</p> : devices.length === 0 ? (
          <p className="text-sm text-gray-500">No registered devices. Devices appear here after signing in with the desktop client.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {devices.map((device) => (
              <li key={device.deviceId} className="py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">{device.name}</p>
                  <p className="text-xs text-gray-500 mt-1">Created {new Date(device.createdAt * 1000).toLocaleString()}</p>
                  <p className="text-xs text-gray-500">Expires {new Date(device.expiresAt * 1000).toLocaleString()}</p>
                </div>
                <div className="shrink-0 flex gap-3 text-xs">
                  {confirm === device.deviceId ? <>
                    <button disabled={busy !== null} onClick={() => handleRevoke(device)} className="text-red-600 dark:text-red-400 hover:underline disabled:opacity-50">{busy === device.deviceId ? "Revoking..." : "Confirm revoke"}</button>
                    <button disabled={busy !== null} onClick={() => setConfirm(null)} className="text-gray-500 hover:underline">Cancel</button>
                  </> : <button disabled={busy !== null} onClick={() => setConfirm(device.deviceId)} className="text-red-600 dark:text-red-400 hover:underline disabled:opacity-50">Revoke</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
