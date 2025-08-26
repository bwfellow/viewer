import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { toast } from "sonner";
import { Id } from "../convex/_generated/dataModel";

export function AppManager() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newAppName, setNewAppName] = useState("");
  const [newAppDescription, setNewAppDescription] = useState("");
  
  const apps = useQuery(api.apps.getUserApps);
  const webhookBaseUrl = useQuery(api.config.getWebhookUrl);
  const createApp = useMutation(api.apps.createApp);
  const updateApp = useMutation(api.apps.updateApp);
  const deleteApp = useMutation(api.apps.deleteApp);
  const regenerateApiKey = useMutation(api.apps.regenerateApiKey);
  
  const handleCreateApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAppName.trim()) return;
    
    try {
      await createApp({
        name: newAppName.trim(),
        description: newAppDescription.trim() || undefined,
      });
      
      setNewAppName("");
      setNewAppDescription("");
      setShowCreateForm(false);
      toast.success("App created successfully!");
    } catch (error) {
      toast.error("Failed to create app");
    }
  };
  
  const handleToggleApp = async (appId: Id<"apps">, isActive: boolean) => {
    try {
      await updateApp({ appId, isActive: !isActive });
      toast.success(isActive ? "App deactivated" : "App activated");
    } catch (error) {
      toast.error("Failed to update app");
    }
  };
  
  const handleDeleteApp = async (appId: Id<"apps">, appName: string) => {
    if (!confirm(`Are you sure you want to delete "${appName}"? This will also delete all its logs.`)) {
      return;
    }
    
    try {
      await deleteApp({ appId });
      toast.success("App deleted successfully");
    } catch (error) {
      toast.error("Failed to delete app");
    }
  };
  
  const handleRegenerateApiKey = async (appId: Id<"apps">) => {
    if (!confirm("Are you sure you want to regenerate the API key? The old key will stop working immediately.")) {
      return;
    }
    
    try {
      const newKey = await regenerateApiKey({ appId });
      toast.success("API key regenerated successfully");
      // Copy to clipboard
      navigator.clipboard.writeText(newKey);
      toast.info("New API key copied to clipboard");
    } catch (error) {
      toast.error("Failed to regenerate API key");
    }
  };
  
  const copyApiKey = (apiKey: string) => {
    navigator.clipboard.writeText(apiKey);
    toast.success("API key copied to clipboard");
  };

  const testWebhook = async (apiKey: string, appName: string) => {
    try {
      // Send a test log event to the webhook
      const testLogData = {
        topic: "verification",
        timestamp: Date.now(),
        message: `Test webhook from ${appName} at ${new Date().toISOString()}`,
        convex: {
          deployment_name: "test-deployment",
          deployment_type: "dev",
          project_name: appName,
          project_slug: appName.toLowerCase().replace(/\s+/g, '-'),
        }
      };

      // Get the Convex deployment URL dynamically
      if (!webhookBaseUrl) {
        toast.error("Unable to determine webhook URL. Please try again.");
        return;
      }
      
      const webhookUrl = `${webhookBaseUrl}/webhook/logs?api_key=${apiKey}`;

      // Show debug info
      console.group('🔍 Webhook Test Debug Info');
      console.log('URL:', webhookUrl);
      console.log('Request Data:', testLogData);
      console.log('Headers:', {
        'Content-Type': 'application/json'
      });

      // First try a GET request to verify the endpoint is accessible
      console.log('🔍 Testing GET request first...');
      const getResponse = await fetch(webhookUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        mode: 'cors',
      });

      console.log('GET Response Status:', getResponse.status);
      const getText = await getResponse.text();
      try {
        console.log('GET Response:', JSON.parse(getText));
      } catch {
        console.log('GET Response (raw):', getText);
      }

      // Now try the actual POST request
      console.log('🔍 Sending POST request...');
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        mode: 'cors',
        body: JSON.stringify(testLogData),
      });

      console.log('POST Response Status:', response.status);
      const responseText = await response.text();
      console.log('POST Response (raw):', responseText);

      if (response.ok) {
        const result = JSON.parse(responseText);
        console.log('POST Response (parsed):', result);
        console.groupEnd();
        toast.success(`Webhook test successful! Check the Log Viewer for the test message.`);
      } else {
        let errorMessage;
        try {
          const errorJson = JSON.parse(responseText);
          errorMessage = errorJson.error || 'Unknown error';
          console.log('Error Response (parsed):', errorJson);
        } catch {
          errorMessage = `HTTP ${response.status}: ${responseText.slice(0, 100)}...`;
          console.log('Error Response (raw):', responseText);
        }
        console.groupEnd();
        toast.error(`Webhook test failed: ${errorMessage}`);
      }
    } catch (error) {
      console.error('🔥 Webhook Test Error:', error);
      console.groupEnd();
      
      // More detailed error message
      let errorMessage = 'Network error';
      if (error instanceof Error) {
        errorMessage = `${error.name}: ${error.message}`;
        if (error.cause) {
          errorMessage += `\nCause: ${error.cause}`;
        }
        if ('code' in error) {
          errorMessage += `\nCode: ${(error as any).code}`;
        }
      }
      
      toast.error(`Webhook test failed: ${errorMessage}`, {
        duration: 5000, // Show longer for errors
      });

      // Show a help message
      toast.info(
        "Debug tips:\n" +
        "1. Check browser console for details\n" +
        "2. Verify the webhook URL is correct\n" +
        "3. Check if CORS is enabled\n" +
        "4. Try using curl to test the endpoint",
        {
          duration: 10000,
        }
      );
    }
  };
  
  if (apps === undefined || webhookBaseUrl === undefined) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header with Create Button */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Your Applications</h2>
          <p className="text-gray-600">Manage your apps and their API keys</p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Add New App
        </button>
      </div>
      
      {/* Create App Form */}
      {showCreateForm && (
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Create New App</h3>
          <form onSubmit={handleCreateApp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                App Name *
              </label>
              <input
                type="text"
                value={newAppName}
                onChange={(e) => setNewAppName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="My Awesome App"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={newAppDescription}
                onChange={(e) => setNewAppDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Brief description of your app"
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Create App
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
      
      {/* Apps List */}
      <div className="space-y-4">
        {apps.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow border text-center">
            <p className="text-gray-500 mb-4">No apps created yet</p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Create Your First App
            </button>
          </div>
        ) : (
          apps.map((app) => (
            <div key={app._id} className="bg-white p-6 rounded-lg shadow border">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-medium text-gray-900">{app.name}</h3>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        app.isActive
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {app.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {app.description && (
                    <p className="text-gray-600 mb-3">{app.description}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleToggleApp(app._id, app.isActive)}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      app.isActive
                        ? "bg-red-100 text-red-700 hover:bg-red-200"
                        : "bg-green-100 text-green-700 hover:bg-green-200"
                    }`}
                  >
                    {app.isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    onClick={() => handleDeleteApp(app._id, app.name)}
                    className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
              
              {/* API Key Section */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">API Key</label>
                  <button
                    onClick={() => handleRegenerateApiKey(app._id)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Regenerate
                  </button>
                </div>
                <div className="flex gap-2">
                  <code className="flex-1 bg-gray-100 text-gray-800 p-2 rounded text-sm font-mono break-all">
                    {app.apiKey}
                  </code>
                  <button
                    onClick={() => copyApiKey(app.apiKey)}
                    className="px-3 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors text-sm"
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => testWebhook(app.apiKey, app.name)}
                    className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
                    disabled={!app.isActive}
                  >
                    Test
                  </button>
                </div>
                
                {/* Webhook URL */}
                <div className="mt-3">
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    Webhook URL
                  </label>
                  <code className="block bg-blue-50 text-blue-800 p-2 rounded text-sm font-mono break-all">
                    {webhookBaseUrl}/webhook/logs?api_key={app.apiKey}
                  </code>
                  <p className="text-xs text-gray-500 mt-1">
                    Or send the API key in the "x-api-key" header
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
