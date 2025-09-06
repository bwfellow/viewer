import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { toast } from "sonner";

export function SuperAdminDashboard() {
  const [confirmationCode, setConfirmationCode] = useState("");
  const [isWiping, setIsWiping] = useState(false);

  const logStats = useQuery(api.logs.getLogStats);
  const wipeAllLogs = useMutation(api.logs.superAdminWipeAllLogs);
  const cleanupOldLogs = useMutation(api.logs.cleanupOldLogsManual);
  const loggedInUser = useQuery(api.auth.loggedInUser);

  // Check if user is authenticated (allowing all users for now)
  const isAdmin = !!loggedInUser;
  const isTestMode = false;

  const handleWipeAllLogs = async () => {
    if (!confirmationCode || confirmationCode !== "WIPE_ALL_LOGS_CONFIRM") {
      toast.error("Please enter the correct confirmation code");
      return;
    }

    if (!isAdmin) {
      toast.error("Superadmin access required");
      return;
    }

    setIsWiping(true);
    try {
      const result = await wipeAllLogs({ confirmationCode });
      toast.success(
        `Successfully wiped all logs! Deleted: ${result.deletedLogs} logs, ${result.deletedSummaries} summaries, ${result.deletedMetrics} metrics`
      );
      setConfirmationCode("");
    } catch (error) {
      toast.error(`Failed to wipe logs: ${error}`);
    } finally {
      setIsWiping(false);
    }
  };

  const handleCleanupOldLogs = async () => {
    try {
      const result = await cleanupOldLogs({});
      toast.success(`Cleaned up ${result.deletedCount} old log entries`);
    } catch (error) {
      toast.error(`Failed to cleanup logs: ${error}`);
    }
  };


  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
          <div className="text-red-600 mb-4">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.988-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-red-800 mb-2">Access Denied</h3>
          <p className="text-red-600">
            Authentication required to access this dashboard.
          </p>
          <p className="text-sm text-red-500 mt-2">
            Current user: {loggedInUser?.email || "Not logged in"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800">
              🔐 Superadmin Dashboard
            </h3>
            <div className="mt-2 text-sm text-yellow-700">
              <p>You have superadmin privileges (all authenticated users for now). Use these controls carefully.</p>
              <p className="text-xs mt-1">Logged in as: {loggedInUser?.email || "No email"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Log Statistics */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">📊 Log Statistics</h3>
          
          {logStats ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{logStats.totalLogs.toLocaleString()}</div>
                <div className="text-sm text-blue-800">Total Logs</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{logStats.totalSummaries.toLocaleString()}</div>
                <div className="text-sm text-green-800">Log Summaries</div>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{logStats.errorLogs.toLocaleString()}</div>
                <div className="text-sm text-red-800">Error Logs</div>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">{logStats.normalLogsOlderThan72Hours.toLocaleString()}</div>
                <div className="text-sm text-yellow-800">Normal Logs &gt;72h</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{logStats.errorLogsOlderThan2Weeks.toLocaleString()}</div>
                <div className="text-sm text-purple-800">Error Logs &gt;2w</div>
              </div>
            </div>
          ) : (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
          )}

          <div className="mt-6">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Retention Policy</h4>
            <div className="text-sm text-gray-600 space-y-1">
              <div className="flex items-center">
                <span className="w-3 h-3 bg-blue-400 rounded-full mr-2"></span>
                Normal logs (info, warn, debug): Kept for 72 hours
              </div>
              <div className="flex items-center">
                <span className="w-3 h-3 bg-red-400 rounded-full mr-2"></span>
                Error logs: Kept for 2 weeks
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Log Management Actions */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">🔧 Log Management</h3>
          
          <div className="space-y-4">
            {/* Clean up old logs */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2">Clean Up Old Logs</h4>
              <p className="text-sm text-gray-600 mb-3">
                Remove logs that exceed the retention policy (72h for normal logs, 2 weeks for errors)
              </p>
              <button
                onClick={handleCleanupOldLogs}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Clean Up Old Logs
              </button>
            </div>

            {/* Wipe all logs - dangerous action */}
            <div className="border border-red-200 rounded-lg p-4 bg-red-50">
              <h4 className="font-medium text-red-900 mb-2">⚠️ DANGER ZONE: Complete Database Wipe</h4>
              <p className="text-sm text-red-700 mb-4">
                This action will permanently delete ALL logs, summaries, and metrics from the entire system. 
                This cannot be undone!
              </p>
              
              <div className="space-y-3">
                <div>
                  <label htmlFor="confirmation" className="block text-sm font-medium text-red-700 mb-1">
                    Type "WIPE_ALL_LOGS_CONFIRM" to confirm:
                  </label>
                  <input
                    id="confirmation"
                    type="text"
                    value={confirmationCode}
                    onChange={(e) => setConfirmationCode(e.target.value)}
                    className="block w-full border border-red-300 rounded-md px-3 py-2 text-sm"
                    placeholder="WIPE_ALL_LOGS_CONFIRM"
                  />
                </div>
                
                <button
                  onClick={handleWipeAllLogs}
                  disabled={isWiping || confirmationCode !== "WIPE_ALL_LOGS_CONFIRM"}
                  className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-6 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  {isWiping ? "Wiping..." : "🗑️ WIPE ALL LOGS"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* System Information */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">ℹ️ System Information</h3>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Auto Cleanup Frequency:</span>
              <span className="font-medium">Every 6 hours</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Normal Log Retention:</span>
              <span className="font-medium">72 hours</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Error Log Retention:</span>
              <span className="font-medium">2 weeks</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Metrics Retention:</span>
              <span className="font-medium">90 days</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
