"use client";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { type TestResult } from "@/app/api/speed/recent/route";

interface Props {
  host?: string;
}

export function RecentTests(params: Props) {
  const { host } = params;
  const t = useTranslations("RecentTests");
  const tRank = useTranslations("rank");
  const fetcher = ({ url, args }: { url: string; args: never }) =>
    fetch(`${url}?${new URLSearchParams(args)}`).then((res) => res.json());

  const {
    data,
    error,
    isLoading: loading,
  } = useSWR<{ recentTests: TestResult[] }>(
    { url: "/api/speed/recent", args: host ? { host } : {} },
    fetcher
  );

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white shadow overflow-hidden rounded-lg p-4 text-center text-gray-500">
          加载中...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-red-50 text-red-500 shadow overflow-hidden rounded-lg p-4 text-center">
          {error}
        </div>
      </div>
    );
  }

  // 添加更好的 null 检查
  if (!data || !data.recentTests || data.recentTests.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-gray-50 shadow overflow-hidden rounded-lg p-4 text-center text-gray-500">
          暂无测试记录
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl text-center font-semibold mb-4">
        {t("recentTests")}
      </h2>
      <div className="bg-white shadow overflow-hidden rounded-lg">
        <ul className="divide-y divide-gray-200">
          {data.recentTests.map((test) => (
            <li key={test.id} className="px-4 py-3">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {test.model}
                  </p>
                  <p className="text-sm text-gray-500">
                    {new URL(test.baseUrl).host}
                  </p>
                  <div className="mt-1 text-xs text-gray-400">
                    <span className="mr-4">
                      {tRank("table.avgTokens")}{" "}
                      {test.avgTokensPerSecond?.toFixed(2)} t/s
                    </span>
                    <span>
                      {tRank("table.avgLatency")}{" "}
                      {test.avgFirstTokenLatency
                        ? (test.avgFirstTokenLatency / 1000).toFixed(2)
                        : "-"}
                      s
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-500">
                  {new Date(test.timestamp).toLocaleString()}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}