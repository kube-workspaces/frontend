"use client";

import { useState } from "react";
import Link from "next/link";

interface SSHCredentialFormProps {
  defaultUser?: string;
  onSubmit: (user: string, privateKey: string) => void;
}

// Overlay shown before an SSH bridge can open: the private key matching one of
// the caller's SshKey public keys seeded into the guest, plus the guest login.
// The key is used only for this browser session and never persisted anywhere.
export default function SSHCredentialForm({
  defaultUser = "debian",
  onSubmit,
}: SSHCredentialFormProps) {
  const [user, setUser] = useState(defaultUser);
  const [privateKey, setPrivateKey] = useState("");

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#1a1b26]/90 z-10">
      <div className="w-[min(90%,480px)] p-6">
        <p className="text-gray-200 text-sm font-medium mb-1 mb-4">
          SSH connection
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Username</label>
            <input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-[#24283b] border border-gray-700 rounded text-gray-200 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] font-mono"
              autoComplete="username"
              spellCheck={false}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Private key
            </label>
            <textarea
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
              rows={6}
              className="w-full px-3 py-2 text-xs bg-[#24283b] border border-gray-700 rounded text-gray-200 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] font-mono resize-y"
              spellCheck={false}
            />
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            Use the private key matching an SSH public key added in{" "}
            <Link
              href="/profile"
              className="text-[var(--color-primary)] hover:underline"
            >
              Profile
            </Link>
            . Public keys are seeded into the VM&rsquo;s{" "}
            <code className="text-gray-400">authorized_keys</code> via
            cloud-init on next (re)start.
          </p>
          <button
            onClick={() => onSubmit(user.trim(), privateKey.trim())}
            disabled={!user.trim() || !privateKey.trim()}
            className="w-full px-3 py-2 text-sm bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-foreground)] rounded transition-colors disabled:opacity-50"
          >
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}