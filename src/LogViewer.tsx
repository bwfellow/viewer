import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

export function LogViewer() {
  const [selectedApp, setSelectedApp] = useState<Id<"apps"> | "">("");
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [selectedSource, setSelectedSource] = useState<string>("");
  const [selectedEventType, setSelectedEventType] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [numItems, setNumItems] = useState(50);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [dateRange, setDateRange] = useState<{start: string, end: string}>({
    start: "",
    end: "",
  });
  
  const apps = useQuery(api.apps.getUserApps);
  
  // Use search API instead of basic getLogs
  const logs = useQuery(api.logs.searchLogs, {
    paginationOpts: { numItems, cursor: null },
    appId: selectedApp || undefined,
    level: selectedLevel || undefined,
    source: selectedSource || undefined,
    eventType: selectedEventType || undefined,
    searchTerm: searchTerm || undefined,
    dateRange: (dateRange.start && dateRange.end) ? {
      start: new Date(dateRange.start).getTime(),
      end: new Date(dateRange.end).getTime(),
    } : undefined,
  });
  
  const stats = useQuery(api.logs.getLogStats, {
    appId: selectedApp || undefined,
  });
  
  const storageStats = useQuery(api.logs.getStorageStats, {
    appId: selectedApp || undefined,
  });
  const logSources = useQuery(api.logs.getLogSources, {
    appId: selectedApp || undefined,
  });
  const eventTypes = useQuery(api.logs.getEventTypes, {
    appId: selectedApp || undefined,
  });
  
  const clearLogs = useMutation(api.logs.clearLogs);
  const cleanupOldLogs = useMutation(api.logs.cleanupOldLogsManual);
  
  const handleClearLogs = async () => {
    const appName = selectedApp ? apps?.find(app => app._id === selectedApp)?.name : "all apps";
    if (confirm(`Are you sure you want to clear logs for ${appName}? This action cannot be undone.`)) {
      await clearLogs({ appId: selectedApp || undefined });
    }
  };

  const handleCleanupOldLogs = async () => {
    if (confirm("Are you sure you want to cleanup logs older than 30 days? This action cannot be undone.")) {
      await cleanupOldLogs({ retentionDays: 30 });
    }
  };

  const resetFilters = () => {
    setSelectedApp("");
    setSelectedLevel("");
    setSelectedSource("");
    setSelectedEventType("");
    setSearchTerm("");
    setDateRange({ start: "", end: "" });
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  const getLevelColor = (level: string) => {
    switch (level.toLowerCase()) {
      case "error":
        return "text-red-600 bg-red-50 border-red-200";
      case "warn":
        return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "info":
        return "text-blue-600 bg-blue-50 border-blue-200";
      case "debug":
        return "text-gray-600 bg-gray-50 border-gray-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };
  
  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };
  
  const getAppName = (appId: Id<"apps">) => {
    return apps?.find(app => app._id === appId)?.name || "Unknown App";
  };
  
  if (logs === undefined || stats === undefined || apps === undefined || 
      storageStats === undefined || logSources === undefined || eventTypes === undefined) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* App Stats Dashboard */}
      {selectedApp && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="bg-white p-4 rounded-lg shadow border">
              <h3 className="text-sm font-medium text-gray-500">Total Logs</h3>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              {logs.totalResults !== undefined && logs.totalResults !== stats.total && (
                <p className="text-xs text-gray-500">({logs.totalResults} filtered)</p>
              )}
            </div>
            <div className="bg-white p-4 rounded-lg shadow border">
              <h3 className="text-sm font-medium text-gray-500">Recent (1h)</h3>
              <p className="text-2xl font-bold text-gray-900">{stats.recentCount}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow border">
              <h3 className="text-sm font-medium text-gray-500">Errors</h3>
              <p className="text-2xl font-bold text-red-600">{stats.byLevel.error || 0}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow border">
              <h3 className="text-sm font-medium text-gray-500">Warnings</h3>
              <p className="text-2xl font-bold text-yellow-600">{stats.byLevel.warn || 0}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow border">
              <h3 className="text-sm font-medium text-gray-500">Storage Used</h3>
              <p className="text-2xl font-bold text-blue-600">{formatBytes(storageStats.totalSizeBytes)}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow border">
              <h3 className="text-sm font-medium text-gray-500">Cleanup Available</h3>
              <p className="text-2xl font-bold text-purple-600">{storageStats.logsByPeriod.older}</p>
              <p className="text-xs text-gray-500">logs &gt; 30d old</p>
            </div>
          </div>
          
          {/* Storage Breakdown */}
          {storageStats.totalLogs > 0 && (
            <div className="bg-white p-4 rounded-lg shadow border">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Storage Breakdown</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-500">Last 24h</p>
                  <p className="text-lg font-bold text-green-600">{storageStats.logsByPeriod.last24h}</p>
                  <p className="text-xs text-gray-500">{formatBytes(storageStats.sizeByPeriod.last24h)}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-500">Last 7d</p>
                  <p className="text-lg font-bold text-blue-600">{storageStats.logsByPeriod.last7d}</p>
                  <p className="text-xs text-gray-500">{formatBytes(storageStats.sizeByPeriod.last7d)}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-500">Last 30d</p>
                  <p className="text-lg font-bold text-yellow-600">{storageStats.logsByPeriod.last30d}</p>
                  <p className="text-xs text-gray-500">{formatBytes(storageStats.sizeByPeriod.last30d)}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-500">Older</p>
                  <p className="text-lg font-bold text-red-600">{storageStats.logsByPeriod.older}</p>
                  <p className="text-xs text-gray-500">{formatBytes(storageStats.sizeByPeriod.older)}</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      
      {/* App Selection Grid */}
      {!selectedApp && apps.length > 0 && (
        <div className="bg-white p-4 rounded-lg shadow border">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Select an App to View Logs</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {apps.map((app) => {
              const appStats = useQuery(api.logs.getLogStats, { appId: app._id });
              const appStorageStats = useQuery(api.logs.getStorageStats, { appId: app._id });
              
              if (!appStats || !appStorageStats) {
                return (
                  <div key={app._id} className="p-4 rounded-lg border-2 border-gray-200 bg-gray-50">
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
              
              return (
                <div
                  key={app._id}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${statusColor}`}
                  onClick={() => setSelectedApp(app._id)}
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
            })}
          </div>
        </div>
      )}
      
      {/* Enhanced Filters and Controls */}
      <div className="bg-white p-4 rounded-lg shadow border">
        {/* Search Bar */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Search Logs
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search messages, functions, errors..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`px-4 py-2 rounded-md transition-colors ${
                showAdvancedFilters
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Advanced
            </button>
            <button
              onClick={resetFilters}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Basic Filters */}
        <div className="flex flex-wrap gap-4 items-center mb-4">
          {selectedApp && (
            <button
              onClick={() => setSelectedApp("")}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
            >
              ← Back to App Selection
            </button>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Level Filter
            </label>
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Levels</option>
              <option value="error">Error</option>
              <option value="warn">Warning</option>
              <option value="info">Info</option>
              <option value="debug">Debug</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Items per page
            </label>
            <select
              value={numItems}
              onChange={(e) => setNumItems(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
        </div>

        {/* Advanced Filters */}
        {showAdvancedFilters && (
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Advanced Filters</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Source/Function
                </label>
                <select
                  value={selectedSource}
                  onChange={(e) => setSelectedSource(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Sources</option>
                  {logSources.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Event Type
                </label>
                <select
                  value={selectedEventType}
                  onChange={(e) => setSelectedEventType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Event Types</option>
                  {eventTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="datetime-local"
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  type="datetime-local"
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}
        
        {/* Action Buttons */}
        <div className="flex gap-2 justify-end border-t pt-4">
          {storageStats.logsByPeriod.older > 0 && (
            <button
              onClick={handleCleanupOldLogs}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
            >
              Cleanup Old Logs ({storageStats.logsByPeriod.older})
            </button>
          )}
          <button
            onClick={handleClearLogs}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
          >
            Clear Logs
          </button>
        </div>
      </div>
      
      {/* Logs List */}
      <div className="bg-white rounded-lg shadow border">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Recent Logs ({logs.page.length} of {stats.total})
            {selectedApp && ` - ${getAppName(selectedApp)}`}
          </h3>
        </div>
        
        <div className="divide-y divide-gray-200">
          {logs.page.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p>
                {apps.length === 0
                  ? "No apps created yet. Go to App Management to create your first app."
                  : "No logs found. Make sure your apps are sending logs to the webhook endpoint."}
              </p>
            </div>
          ) : (
            logs.page.map((log) => (
              <div key={log._id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getLevelColor(
                          log.level
                        )}`}
                      >
                        {log.level.toUpperCase()}
                      </span>
                      <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded font-medium">
                        {getAppName(log.appId)}
                      </span>
                      {log.source && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          {log.source}
                        </span>
                      )}
                      {log.requestId && (
                        <span className="text-xs text-gray-400 font-mono">
                          {log.requestId.slice(0, 8)}...
                        </span>
                      )}
                    </div>
                    
                    <p className="text-sm text-gray-900 mb-2">{log.message}</p>
                    
                    {log.metadata && (
                      <div className="text-xs text-gray-500 space-y-1">
                        {log.metadata.eventType && (
                          <div className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">
                            {log.metadata.eventType}
                          </div>
                        )}
                        {log.metadata.functionName && (
                          <div>Function: <span className="font-mono">{log.metadata.functionName}</span></div>
                        )}
                        {log.metadata.functionType && (
                          <div>Type: <span className="font-mono text-blue-600">{log.metadata.functionType}</span></div>
                        )}
                        {log.metadata.duration && (
                          <div>Duration: <span className="font-mono">{log.metadata.duration}ms</span></div>
                        )}
                        {log.metadata.status && (
                          <div>Status: <span className={`font-mono ${log.metadata.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                            {log.metadata.status}
                          </span></div>
                        )}
                        {log.metadata.cached && (
                          <div className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">
                            Cached
                          </div>
                        )}
                        {log.metadata.mutationRetryCount && log.metadata.mutationRetryCount > 0 && (
                          <div>Retries: <span className="font-mono text-yellow-600">{log.metadata.mutationRetryCount}</span></div>
                        )}
                        {log.metadata.usage && (
                          <div className="space-y-1">
                            {log.metadata.usage.databaseReadBytes > 0 && (
                              <div>DB Read: <span className="font-mono">{formatBytes(log.metadata.usage.databaseReadBytes)}</span></div>
                            )}
                            {log.metadata.usage.databaseWriteBytes > 0 && (
                              <div>DB Write: <span className="font-mono">{formatBytes(log.metadata.usage.databaseWriteBytes)}</span></div>
                            )}
                            {log.metadata.usage.actionMemoryUsedMb > 0 && (
                              <div>Memory: <span className="font-mono">{log.metadata.usage.actionMemoryUsedMb}MB</span></div>
                            )}
                          </div>
                        )}
                        {log.metadata.environment && (
                          <div>Environment: <span className="font-mono">{log.metadata.environment}</span></div>
                        )}
                        {log.metadata.version && (
                          <div>Version: <span className="font-mono">{log.metadata.version}</span></div>
                        )}
                        {log.metadata.error && (
                          <div className="text-red-600">Error: <span className="font-mono">{log.metadata.error}</span></div>
                        )}
                        {log.metadata.lagSeconds && (
                          <div>Scheduler Lag: <span className="font-mono text-orange-600">{log.metadata.lagSeconds}s</span></div>
                        )}
                        {log.metadata.numRunningJobs && (
                          <div>Running Jobs: <span className="font-mono">{log.metadata.numRunningJobs}</span></div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="text-xs text-gray-500 ml-4 flex-shrink-0">
                    {formatTimestamp(log.timestamp)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        
        {logs.continueCursor && (
          <div className="p-4 border-t border-gray-200 text-center">
            <p className="text-sm text-gray-500">
              Showing {logs.page.length} logs. Use pagination controls to load more.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
