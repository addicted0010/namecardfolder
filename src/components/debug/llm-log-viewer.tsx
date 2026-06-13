"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { X, Copy, Check, ChevronDown, ChevronRight, Loader2 } from "lucide-react";

interface LlmLogSummary {
  id: string;
  provider: string;
  model: string;
  durationMs: number;
  responseStatus: number;
  errorMessage: string | null;
  createdAt: string;
}

interface LlmLogDetail extends LlmLogSummary {
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  responseBody: unknown;
}

interface LlmLogViewerProps {
  cardId: string;
  onClose: () => void;
}

export function LlmLogViewer({ cardId, onClose }: LlmLogViewerProps) {
  const t = useTranslations("debug");
  const tc = useTranslations("common");
  const [logs, setLogs] = useState<LlmLogSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LlmLogDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/llm-logs?cardId=${cardId}`);
      if (!res.ok) throw new Error("Failed to fetch logs");
      const data = await res.json();
      setLogs(data.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [cardId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs();
  }, [fetchLogs]);

  async function fetchDetail(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }

    setExpandedId(id);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/llm-logs/${id}`);
      if (!res.ok) throw new Error("Failed to fetch log detail");
      const data = await res.json();
      setDetail(data);
    } catch {
      // ignore
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleCopyAll() {
    if (!detail) return;
    const text = JSON.stringify(
      {
        provider: detail.provider,
        model: detail.model,
        requestHeaders: detail.requestHeaders,
        requestBody: detail.requestBody,
        responseBody: detail.responseBody,
        responseStatus: detail.responseStatus,
        durationMs: detail.durationMs,
      },
      null,
      2
    );
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{t("viewLogs")}</h2>
          <div className="flex items-center gap-2">
            {detail && (
              <button
                onClick={handleCopyAll}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-green-600" />
                    {tc("copied")}
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    {t("copyAll")}
                  </>
                )}
              </button>
            )}
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-center text-gray-500 py-12">{t("noLogs")}</p>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="min-w-0 border border-gray-200 rounded-lg overflow-hidden"
                >
                  {/* Summary row */}
                  <button
                    onClick={() => fetchDetail(log.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left"
                  >
                    {expandedId === log.id ? (
                      <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">
                          {log.provider}
                        </span>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                          {log.model}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            log.responseStatus === 200
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {log.responseStatus}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span>{log.durationMs}{t("ms")}</span>
                        <span>{new Date(log.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {expandedId === log.id && (
                    <div className="min-w-0 border-t border-gray-200 px-4 py-3 bg-gray-50">
                      {loadingDetail ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                        </div>
                      ) : detail ? (
                        <div className="space-y-4">
                          {detail.errorMessage && (
                            <div>
                              <h4 className="text-sm font-medium text-red-700 mb-1">
                                {t("errorMessage")}
                              </h4>
                              <pre className="text-xs bg-red-50 text-red-800 p-3 rounded-lg overflow-x-auto">
                                {detail.errorMessage}
                              </pre>
                            </div>
                          )}
                          <JsonSection title={t("requestHeaders")} data={detail.requestHeaders} />
                          <JsonSection title={t("requestBody")} data={detail.requestBody} />
                          <JsonSection title={t("responseBody")} data={detail.responseBody} />
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function JsonSection({ title, data }: { title: string; data: unknown }) {
  const [expanded, setExpanded] = useState(true);
  const json = JSON.stringify(data, null, 2);

  return (
    <div className="min-w-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
        {title}
      </button>
      {expanded && (
        <pre className="max-w-full max-h-[60vh] overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-all rounded-lg border border-gray-200 bg-white p-3 text-xs leading-relaxed [overflow-wrap:anywhere]">
          {json}
        </pre>
      )}
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="text-xs text-gray-500 bg-white border border-gray-200 p-3 rounded-lg w-full text-left hover:bg-gray-50"
        >
          {title}
        </button>
      )}
    </div>
  );
}
