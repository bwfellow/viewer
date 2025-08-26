import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

export function SetupGuide() {
  const apps = useQuery(api.apps.getUserApps);

  if (apps === undefined) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Setup Guide</h2>
        <p className="text-gray-600">Configure your Convex apps to send logs to this monitoring system</p>
      </div>

      {/* Prerequisites */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-medium text-blue-900 mb-3">Prerequisites</h3>
        <ul className="list-disc list-inside text-blue-800 space-y-1">
          <li>Convex Pro plan (required for log streams)</li>
          <li>At least one app created in the App Management tab</li>
          <li>Admin access to your Convex dashboard</li>
        </ul>
      </div>

      {/* Step-by-step setup */}
      <div className="bg-white rounded-lg shadow border">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Setting up Convex Log Streams</h3>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="border-l-4 border-blue-500 pl-4">
            <h4 className="font-medium text-gray-900 mb-2">Step 1: Create an App</h4>
            <p className="text-gray-600 mb-2">
              If you haven't already, go to the <strong>App Management</strong> tab and create an app for each Convex project you want to monitor.
            </p>
          </div>

          <div className="border-l-4 border-blue-500 pl-4">
            <h4 className="font-medium text-gray-900 mb-2">Step 2: Configure Log Stream in Convex Dashboard</h4>
            <ol className="list-decimal list-inside text-gray-600 space-y-2">
              <li>Go to your Convex project dashboard</li>
              <li>Navigate to Settings → Integrations → Log Streams</li>
              <li>Click "Add Log Stream"</li>
              <li>Select "Webhook" as the destination type</li>
              <li>Use one of the webhook URLs below based on your app</li>
            </ol>
          </div>

          <div className="border-l-4 border-blue-500 pl-4">
            <h4 className="font-medium text-gray-900 mb-2">Step 3: Webhook URLs</h4>
            {apps.length === 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-800">
                  No apps created yet. Go to <strong>App Management</strong> to create your first app and get webhook URLs.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {apps.map((app) => (
                  <div key={app._id} className="bg-gray-50 rounded-lg p-4">
                    <h5 className="font-medium text-gray-900 mb-2">{app.name}</h5>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Webhook URL (Query Parameter)
                        </label>
                        <code className="block bg-white border rounded px-3 py-2 text-sm font-mono break-all">
                          {window.location.origin}/webhook/logs?api_key={app.apiKey}
                        </code>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Alternative: Use Header Authentication
                        </label>
                        <div className="space-y-1">
                          <code className="block bg-white border rounded px-3 py-2 text-sm font-mono">
                            URL: {window.location.origin}/webhook/logs
                          </code>
                          <code className="block bg-white border rounded px-3 py-2 text-sm font-mono">
                            Header: x-api-key: {app.apiKey}
                          </code>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-l-4 border-blue-500 pl-4">
            <h4 className="font-medium text-gray-900 mb-2">Step 4: Test the Integration</h4>
            <ol className="list-decimal list-inside text-gray-600 space-y-2">
              <li>Save the log stream configuration in your Convex dashboard</li>
              <li>Convex will send a verification event to test the webhook</li>
              <li>Check the <strong>Log Viewer</strong> tab to see if logs are appearing</li>
              <li>Run some functions in your Convex app to generate more logs</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Supported Event Types */}
      <div className="bg-white rounded-lg shadow border">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Supported Log Event Types</h3>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Console Events</h4>
              <p className="text-gray-600 text-sm mb-2">
                Captures console.log, console.error, etc. from your Convex functions
              </p>
              <ul className="text-sm text-gray-500 list-disc list-inside">
                <li>Function execution context</li>
                <li>Log level and message</li>
                <li>Request ID for tracing</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 mb-2">Function Execution</h4>
              <p className="text-gray-600 text-sm mb-2">
                Performance and status information for all function calls
              </p>
              <ul className="text-sm text-gray-500 list-disc list-inside">
                <li>Execution time and status</li>
                <li>Database and file usage</li>
                <li>Error messages and retry counts</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 mb-2">Scheduler Stats</h4>
              <p className="text-gray-600 text-sm mb-2">
                Information about scheduled function performance
              </p>
              <ul className="text-sm text-gray-500 list-disc list-inside">
                <li>Queue lag and running jobs</li>
                <li>Scheduled function health</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 mb-2">Audit Logs</h4>
              <p className="text-gray-600 text-sm mb-2">
                Deployment and configuration changes
              </p>
              <ul className="text-sm text-gray-500 list-disc list-inside">
                <li>Config pushes and deployments</li>
                <li>Environment variable changes</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Troubleshooting */}
      <div className="bg-white rounded-lg shadow border">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Troubleshooting</h3>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">No logs appearing?</h4>
            <ul className="list-disc list-inside text-gray-600 space-y-1">
              <li>Check that your app is marked as "Active" in App Management</li>
              <li>Verify the webhook URL and API key are correct</li>
              <li>Ensure your Convex project has a Pro plan</li>
              <li>Check the browser network tab for webhook request errors</li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-2">Missing some log types?</h4>
            <ul className="list-disc list-inside text-gray-600 space-y-1">
              <li>Convex sends different event types based on activity</li>
              <li>Console events only appear when your functions use console.log</li>
              <li>Function execution events appear for all function calls</li>
              <li>Try running some functions to generate more diverse logs</li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-2">Performance considerations</h4>
            <ul className="list-disc list-inside text-gray-600 space-y-1">
              <li>Logs are automatically cleaned up after 30 days</li>
              <li>Use the cleanup function for manual maintenance</li>
              <li>Consider filtering high-volume debug logs</li>
              <li>Set up alerts to catch issues proactively</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Links */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="font-medium text-gray-900 mb-3">Helpful Resources</h3>
        <div className="space-y-2">
          <a
            href="https://docs.convex.dev/production/integrations/log-streams/"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-blue-600 hover:text-blue-800 underline"
          >
            📖 Official Convex Log Streams Documentation
          </a>
          <a
            href="https://dashboard.convex.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-blue-600 hover:text-blue-800 underline"
          >
            🚀 Convex Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
