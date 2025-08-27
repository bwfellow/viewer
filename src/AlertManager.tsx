import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { toast } from "sonner";

export function AlertManager() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedApp, setSelectedApp] = useState<Id<"apps"> | "">("");
  const [newAlert, setNewAlert] = useState({
    name: "",
    type: "error_count" as "error_count" | "error_rate" | "function_duration" | "no_logs" | "flag_triggered",
    threshold: 5,
    timeWindow: 15,
    functionPattern: "",
  });

  const apps = useQuery(api.apps.getUserApps);
  const alerts = useQuery(api.alerts.getUserAlerts, {
    appId: selectedApp || undefined,
  });
  const alertHistory = useQuery(api.alerts.getAlertHistory, {
    appId: selectedApp || undefined,
    limit: 20,
  });

  const createAlert = useMutation(api.alerts.createAlert);
  const updateAlert = useMutation(api.alerts.updateAlert);
  const deleteAlert = useMutation(api.alerts.deleteAlert);

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp || !newAlert.name.trim()) return;

    try {
      await createAlert({
        appId: selectedApp,
        name: newAlert.name.trim(),
        condition: {
          type: newAlert.type,
          threshold: newAlert.threshold,
          timeWindow: newAlert.timeWindow,
          functionPattern: newAlert.functionPattern || undefined,
        },
      });

      setNewAlert({
        name: "",
        type: "error_count",
        threshold: 5,
        timeWindow: 15,
        functionPattern: "",
      });
      setShowCreateForm(false);
      toast.success("Alert created successfully!");
    } catch (error) {
      toast.error("Failed to create alert");
    }
  };

  const handleToggleAlert = async (alertId: Id<"alerts">, isActive: boolean) => {
    try {
      await updateAlert({ alertId, isActive: !isActive });
      toast.success(isActive ? "Alert disabled" : "Alert enabled");
    } catch (error) {
      toast.error("Failed to update alert");
    }
  };

  const handleDeleteAlert = async (alertId: Id<"alerts">, alertName: string) => {
    if (!confirm(`Are you sure you want to delete "${alertName}"?`)) {
      return;
    }

    try {
      await deleteAlert({ alertId });
      toast.success("Alert deleted successfully");
    } catch (error) {
      toast.error("Failed to delete alert");
    }
  };

  const getAlertTypeDescription = (type: string) => {
    switch (type) {
      case "error_count":
        return "Triggers when error count exceeds threshold";
      case "error_rate":
        return "Triggers when error rate (%) exceeds threshold";
      case "function_duration":
        return "Triggers when function duration exceeds threshold (ms)";
      case "no_logs":
        return "Triggers when no logs received in time window";
      case "flag_triggered":
        return "Triggers when flagged events occur (🚩)";
      default:
        return "Unknown alert type";
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getAppName = (appId: Id<"apps">) => {
    return apps?.find(app => app._id === appId)?.name || "Unknown App";
  };

  if (apps === undefined || alerts === undefined || alertHistory === undefined) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Alert Management</h2>
          <p className="text-gray-600">Monitor your applications and get notified of issues</p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          disabled={apps.length === 0}
        >
          Create Alert
        </button>
      </div>

      {/* App Filter */}
      <div className="bg-white p-4 rounded-lg shadow border">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">
            Filter by App:
          </label>
          <select
            value={selectedApp}
            onChange={(e) => setSelectedApp(e.target.value as Id<"apps"> | "")}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Apps</option>
            {apps.map((app) => (
              <option key={app._id} value={app._id}>
                {app.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Create Alert Form */}
      {showCreateForm && (
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Create New Alert</h3>
          <form onSubmit={handleCreateAlert} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  App *
                </label>
                <select
                  value={selectedApp}
                  onChange={(e) => setSelectedApp(e.target.value as Id<"apps">)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select an app</option>
                  {apps.map((app) => (
                    <option key={app._id} value={app._id}>
                      {app.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Alert Name *
                </label>
                <input
                  type="text"
                  value={newAlert.name}
                  onChange={(e) => setNewAlert(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="High Error Rate Alert"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Alert Type
                </label>
                <select
                  value={newAlert.type}
                  onChange={(e) => setNewAlert(prev => ({ ...prev, type: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="error_count">Error Count</option>
                  <option value="error_rate">Error Rate (%)</option>
                  <option value="function_duration">Function Duration (ms)</option>
                  <option value="no_logs">No Logs</option>
                  <option value="flag_triggered">Flag Triggered 🚩</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {getAlertTypeDescription(newAlert.type)}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Threshold
                </label>
                <input
                  type="number"
                  value={newAlert.threshold}
                  onChange={(e) => setNewAlert(prev => ({ ...prev, threshold: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Time Window (minutes)
                </label>
                <input
                  type="number"
                  value={newAlert.timeWindow}
                  onChange={(e) => setNewAlert(prev => ({ ...prev, timeWindow: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                />
              </div>
            </div>

            {newAlert.type === "function_duration" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Function Pattern (optional)
                </label>
                <input
                  type="text"
                  value={newAlert.functionPattern}
                  onChange={(e) => setNewAlert(prev => ({ ...prev, functionPattern: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., messages:send"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave empty to monitor all functions
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                disabled={!selectedApp}
              >
                Create Alert
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Alerts List */}
      <div className="bg-white rounded-lg shadow border">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Active Alerts ({alerts.length})
          </h3>
        </div>
        
        <div className="divide-y divide-gray-200">
          {alerts.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p>No alerts configured yet.</p>
              {apps.length === 0 ? (
                <p className="mt-2">Create an app first to set up alerts.</p>
              ) : (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="mt-2 text-blue-600 hover:text-blue-800 underline"
                >
                  Create your first alert
                </button>
              )}
            </div>
          ) : (
            alerts.map((alert) => (
              <div key={alert._id} className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-medium text-gray-900">{alert.name}</h4>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          alert.isActive
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {alert.isActive ? "Active" : "Disabled"}
                      </span>
                      <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
                        {getAppName(alert.appId)}
                      </span>
                    </div>
                    
                    <div className="text-sm text-gray-600 space-y-1">
                      <p>{getAlertTypeDescription(alert.condition.type)}</p>
                      <p>
                        Threshold: <span className="font-mono">{alert.condition.threshold}</span>
                        {alert.condition.type === "error_rate" && "%"}
                        {alert.condition.type === "function_duration" && "ms"}
                      </p>
                      <p>Time Window: <span className="font-mono">{alert.condition.timeWindow} minutes</span></p>
                      {alert.condition.functionPattern && (
                        <p>Function Pattern: <span className="font-mono">{alert.condition.functionPattern}</span></p>
                      )}
                      {alert.lastTriggered && (
                        <p className="text-orange-600">
                          Last Triggered: {formatTimestamp(alert.lastTriggered)} 
                          ({alert.triggerCount} times total)
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleToggleAlert(alert._id, alert.isActive)}
                      className={`px-3 py-1 text-sm rounded-md transition-colors ${
                        alert.isActive
                          ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                          : "bg-green-100 text-green-700 hover:bg-green-200"
                      }`}
                    >
                      {alert.isActive ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => handleDeleteAlert(alert._id, alert.name)}
                      className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Alert History */}
      {alertHistory.length > 0 && (
        <div className="bg-white rounded-lg shadow border">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Recent Alert Triggers</h3>
          </div>
          
          <div className="divide-y divide-gray-200">
            {alertHistory.map((alert) => (
              <div key={alert._id} className="p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-medium text-gray-900">{alert.name}</h4>
                    <p className="text-sm text-gray-600">
                      {getAppName(alert.appId)} • {getAlertTypeDescription(alert.condition.type)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-900">
                      {formatTimestamp(alert.lastTriggered!)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {alert.triggerCount} times total
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
