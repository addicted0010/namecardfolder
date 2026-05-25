"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/contexts/auth-context";
import { LocaleSwitcher } from "./locale-switcher";
import { useState, useRef, useEffect } from "react";
import { LogOut, User, CreditCard, Menu, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";

export function Header() {
  const t = useTranslations("auth");
  const tc = useTranslations("cards");
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    logout();
    setUserMenuOpen(false);
    router.push("/login");
  }

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-lg text-blue-600">
            <CreditCard className="w-5 h-5" />
            <span>CardVault</span>
          </Link>

          {/* Desktop nav */}
          {user && (
            <nav className="hidden md:flex items-center gap-4">
              <Link
                href="/cards"
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                {tc("title")}
              </Link>
            </nav>
          )}

          {/* Right section */}
          <div className="flex items-center gap-2">
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

            {/* Mobile menu button */}
            {user && (
              <button
                className="md:hidden p-1.5 rounded-lg hover:bg-gray-100"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            )}
          </div>
        </div>

        {/* Mobile nav */}
        {mobileMenuOpen && user && (
          <div className="md:hidden border-t border-gray-100 py-2">
            <Link
              href="/cards"
              className="block px-2 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg"
              onClick={() => setMobileMenuOpen(false)}
            >
              {tc("title")}
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
