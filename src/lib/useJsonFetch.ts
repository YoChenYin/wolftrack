"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 共用的client端fetch+JSON狀態管理，取代ThemeHeatmap/ChainSignalLights/ThemeFlowChart
 * 原本各自重複、且完全沒有錯誤處理的`fetch().then(res=>res.json())`——原本fetch失敗或
 * API回傳非2xx時會永遠卡在「載入中」，使用者不會知道發生什麼事、也無法重試。
 */
export function useJsonFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setData(null);
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: T) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "載入失敗");
      });
    return () => {
      cancelled = true;
    };
  }, [url, version]);

  return { data, error, retry };
}
