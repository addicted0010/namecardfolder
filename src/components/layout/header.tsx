"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/contexts/auth-context";
import { LocaleSwitcher } from "./locale-switcher";
import { useState, useRef, useEffect, useCallback } from "react";
import { LogOut, User, KeyRound, Coins } from "lucide-react";
import Image from "next/image";
import { useRouter } from "@/i18n/navigation";
import { ChangePasswordModal } from "@/components/auth/change-password-modal";

interface DailyCreditStatus {
  remaining: number | null;
  isUnlimited: boolean;
}

export function Header() {
  const t = useTranslations("auth");
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [creditStatus, setCreditStatus] = useState<DailyCreditStatus | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const fetchCreditStatus = useCallback(async () => {
    if (!user) return;

    try {
      const res = await fetch("/api/credits");
      if (!res.ok) return;
      const data = await res.json();
      setCreditStatus(data.creditStatus);
    } catch {
      // Keep the header compact; failures should not block navigation.
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const handleCreditUpdate = () => {
      void fetchCreditStatus();
    };

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchCreditStatus();
    window.addEventListener("focus", handleCreditUpdate);
    window.addEventListener("cardvault:credits-updated", handleCreditUpdate);

    return () => {
      window.removeEventListener("focus", handleCreditUpdate);
      window.removeEventListener("cardvault:credits-updated", handleCreditUpdate);
    };
  }, [user, fetchCreditStatus]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    logout();
    setUserMenuOpen(false);
    router.push("/login");
  }

  function handleChangePasswordSuccess() {
    setChangePasswordOpen(false);
    logout();
    router.push("/login");
  }

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-lg text-gray-900">
            <Image src="/logo.png" alt="CardVault" width={96} height={96} className="w-7 h-7" />
            <span>CardVault</span>
            <span className="text-xs font-normal text-gray-400 tracking-wide">
              v{process.env.NEXT_PUBLIC_APP_VERSION}
            </span>
          </Link>



          {/* Right section */}
          <div className="flex items-center gap-2">
            {!loading && user && creditStatus && (
              <div
                className="flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium tabular-nums text-amber-700"
                title="Daily credits"
              >
                <Coins className="h-4 w-4" />
                <span>{creditStatus.isUnlimited ? "∞" : creditStatus.remaining ?? 0}</span>
              </div>
            )}
            <LocaleSwitcher />

            {!loading && user && (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <User className="w-4 h-4" />
                  <span className="hidden sm:inline">{user.displayName || user.username}</span>
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {user.displayName || user.username}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{user.username}</p>
                    </div>
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        setChangePasswordOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <KeyRound className="w-4 h-4" />
                      {t("changePassword")}
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      {t("logout")}
                    </button>
                  </div>
                )}
              </div>
            )}

            {!loading && !user && (
              <Link
                href="/login"
                className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {t("login")}
              </Link>
            )}


          </div>
        </div>

      </div>

      {/* Change Password Modal */}
      <ChangePasswordModal
        open={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
        onSuccess={handleChangePasswordSuccess}
      />
    </header>
  );
}
