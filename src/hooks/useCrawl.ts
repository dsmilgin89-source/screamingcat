import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { CrawlConfig, CrawlResult, CrawlStats } from "@/types/crawl";

export function useCrawl() {
  const [results, setResults] = useState<CrawlResult[]>([]);
  const [stats, setStats] = useState<CrawlStats>({
    urls_crawled: 0,
    urls_queued: 0,
    urls_total: 0,
    status_2xx: 0,
    status_3xx: 0,
    status_4xx: 0,
    status_5xx: 0,
    avg_response_ms: 0,
    is_running: false,
    elapsed_seconds: 0,
  });
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    let stale = false;
    const unlisteners: (() => void)[] = [];

    const setup = async () => {
      const unlistenResult = await listen<CrawlResult>(
        "crawl-result",
        (event) => {
          if (stale) return;
          setResults((prev) => {
            // Deduplicate by URL as safety net
            if (prev.some((r) => r.url === event.payload.url)) return prev;
            return [...prev, event.payload];
          });
          setStats((prev) => {
            const s = { ...prev };
            const code = event.payload.status_code;
            if (code >= 200 && code < 300) s.status_2xx++;
            else if (code >= 300 && code < 400) s.status_3xx++;
            else if (code >= 400 && code < 500) s.status_4xx++;
            else if (code >= 500) s.status_5xx++;
            return s;
          });
        }
      );
      if (stale) { unlistenResult(); return; }
      unlisteners.push(unlistenResult);

      const unlistenStats = await listen<CrawlStats>(
        "crawl-stats",
        (event) => {
          if (stale) return;
          setStats((prev) => ({
            ...prev,
            urls_crawled: event.payload.urls_crawled,
            urls_queued: event.payload.urls_queued,
            urls_total: event.payload.urls_total,
            is_running: event.payload.is_running,
            elapsed_seconds: event.payload.elapsed_seconds,
          }));
        }
      );
      if (stale) { unlistenStats(); return; }
      unlisteners.push(unlistenStats);

      const unlistenComplete = await listen("crawl-complete", () => {
        if (stale) return;
        setIsRunning(false);
      });
      if (stale) { unlistenComplete(); return; }
      unlisteners.push(unlistenComplete);
    };

    setup();
    return () => {
      stale = true;
      unlisteners.forEach((fn) => fn());
    };
  }, []);

  const startCrawl = useCallback(async (config: CrawlConfig) => {
    setResults([]);
    setStats({
      urls_crawled: 0,
      urls_queued: 0,
      urls_total: 0,
      status_2xx: 0,
      status_3xx: 0,
      status_4xx: 0,
      status_5xx: 0,
      avg_response_ms: 0,
      is_running: true,
      elapsed_seconds: 0,
    });
    setIsRunning(true);
    try {
      await invoke("start_crawl", { config });
    } catch (e) {
      console.error("start_crawl failed:", e);
      alert("Crawl failed to start: " + String(e));
      setIsRunning(false);
    }
  }, []);

  const stopCrawl = useCallback(async () => {
    await invoke("stop_crawl");
    setIsRunning(false);
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
    setStats({
      urls_crawled: 0,
      urls_queued: 0,
      urls_total: 0,
      status_2xx: 0,
      status_3xx: 0,
      status_4xx: 0,
      status_5xx: 0,
      avg_response_ms: 0,
      is_running: false,
      elapsed_seconds: 0,
    });
  }, []);

  const setResultsExternal = useCallback((data: CrawlResult[]) => {
    setResults(data);
    // Recalculate stats from loaded data
    const s: CrawlStats = {
      urls_crawled: data.length,
      urls_queued: 0,
      urls_total: data.length,
      status_2xx: data.filter((r) => r.status_code >= 200 && r.status_code < 300).length,
      status_3xx: data.filter((r) => r.status_code >= 300 && r.status_code < 400).length,
      status_4xx: data.filter((r) => r.status_code >= 400 && r.status_code < 500).length,
      status_5xx: data.filter((r) => r.status_code >= 500).length,
      avg_response_ms: data.length > 0
        ? Math.round(data.reduce((sum, r) => sum + r.response_time_ms, 0) / data.length)
        : 0,
      is_running: false,
      elapsed_seconds: 0,
    };
    setStats(s);
  }, []);

  return { results, stats, isRunning, startCrawl, stopCrawl, clearResults, setResults: setResultsExternal };
}
