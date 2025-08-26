import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

interface AppCardProps {
  app: {
    _id: Id<"apps">;
    name: string;
    description?: string;
    isActive: boolean;
  };
  onSelect: () => void;
}

export function AppCard({ app, onSelect }: AppCardProps) {
  const appStats = useQuery(api.logs.getLogStats, { appId: app._id });
  const appStorageStats = useQuery(api.logs.getStorageStats, { appId: app._id });

  if (!appStats || !appStorageStats) {
    return (
      <div className="p-4 rounded-lg border-2 border-gray-200 bg-gray-50">
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isHealthy = app.isActive && appStats.total > 0;
  const statusColor = isHealthy
    ? "border-green-200 bg-green-50 hover:bg-green-100"
    : app.isActive
    ? "border-yellow-200 bg-yellow-50 hover:bg-yellow-100"
    : "border-red-200 bg-red-50 hover:bg-red-100";

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div
      className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${statusColor}`}
      onClick={onSelect}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h4 className="text-lg font-medium text-gray-900">{app.name}</h4>
          <p className="text-sm text-gray-600">{app.description}</p>
        </div>
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            isHealthy
              ? "bg-green-100 text-green-800"
              : app.isActive
              ? "bg-yellow-100 text-yellow-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {isHealthy ? "Healthy" : app.isActive ? "No Logs" : "Inactive"}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white p-2 rounded border">
          <p className="text-xs text-gray-500">Total Logs</p>
          <p className="text-lg font-semibold">{appStats.total}</p>
        </div>
        <div className="bg-white p-2 rounded border">
          <p className="text-xs text-gray-500">Recent (1h)</p>
          <p className="text-lg font-semibold">{appStats.recentCount}</p>
        </div>
        <div className="bg-white p-2 rounded border">
          <p className="text-xs text-gray-500">Errors</p>
          <p className="text-lg font-semibold text-red-600">{appStats.byLevel.error || 0}</p>
        </div>
        <div className="bg-white p-2 rounded border">
          <p className="text-xs text-gray-500">Warnings</p>
          <p className="text-lg font-semibold text-yellow-600">{appStats.byLevel.warn || 0}</p>
        </div>
      </div>

      {/* Storage Stats */}
      <div className="border-t pt-3">
        <div className="flex justify-between items-baseline mb-2">
          <p className="text-sm font-medium text-gray-700">Storage Usage</p>
          <p className="text-xs text-gray-500">{formatBytes(appStorageStats.totalSizeBytes)}</p>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div>
            <p className="text-gray-500">24h</p>
            <p className="font-medium text-green-600">{appStorageStats.logsByPeriod.last24h}</p>
          </div>
          <div>
            <p className="text-gray-500">7d</p>
            <p className="font-medium text-blue-600">{appStorageStats.logsByPeriod.last7d}</p>
          </div>
          <div>
            <p className="text-gray-500">30d</p>
            <p className="font-medium text-yellow-600">{appStorageStats.logsByPeriod.last30d}</p>
          </div>
          <div>
            <p className="text-gray-500">Older</p>
            <p className="font-medium text-red-600">{appStorageStats.logsByPeriod.older}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
