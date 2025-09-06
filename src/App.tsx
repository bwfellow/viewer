import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";
import { Toaster } from "sonner";
import { OptimizedLogViewer } from "./OptimizedLogViewer";
import { AppManager } from "./AppManager";
import { AlertManager } from "./AlertManager";
import { SetupGuide } from "./SetupGuide";
import { SuperAdminDashboard } from "./SuperAdminDashboard";
import { useState } from "react";

export default function App() {
  const [activeTab, setActiveTab] = useState<"logs" | "apps" | "alerts" | "setup" | "superadmin">("logs");

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm h-16 flex justify-between items-center border-b shadow-sm px-4">
        <h2 className="text-xl font-semibold text-primary">Multi-App Health Monitor</h2>
        <SignOutButton />
      </header>
      <main className="flex-1 p-4">
        <Content activeTab={activeTab} setActiveTab={setActiveTab} />
      </main>
      <Toaster />
    </div>
  );
}

function Content({ activeTab, setActiveTab }: { 
  activeTab: "logs" | "apps" | "alerts" | "setup" | "superadmin", 
  setActiveTab: (tab: "logs" | "apps" | "alerts" | "setup" | "superadmin") => void 
}) {
  const loggedInUser = useQuery(api.auth.loggedInUser);

  if (loggedInUser === undefined) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <Authenticated>
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            App Suite Health Dashboard
          </h1>
          <p className="text-gray-600">
            Welcome back, {loggedInUser?.email ?? "friend"}! Monitor all your applications from one central dashboard.
          </p>
          {/* Debug info */}
          <div className="mt-2 text-xs text-gray-500 bg-gray-100 p-2 rounded">
            Debug: Email = "{loggedInUser?.email || 'No email found'}" | 
            SuperAdmin Access = {loggedInUser ? "✅ YES (All users for now)" : "❌ NO"}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab("logs")}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === "logs"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              🚀 Log Viewer
            </button>
            <button
              onClick={() => setActiveTab("apps")}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === "apps"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              App Management
            </button>
            <button
              onClick={() => setActiveTab("alerts")}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === "alerts"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Alerts
            </button>
            <button
              onClick={() => setActiveTab("setup")}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === "setup"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Setup Guide
            </button>
            {loggedInUser && (
              <button
                onClick={() => setActiveTab("superadmin")}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === "superadmin"
                    ? "border-red-500 text-red-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                🔐 SuperAdmin
              </button>
            )}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === "logs" && <OptimizedLogViewer />}
        {activeTab === "apps" && <AppManager />}
        {activeTab === "alerts" && <AlertManager />}
        {activeTab === "setup" && <SetupGuide />}
        {activeTab === "superadmin" && <SuperAdminDashboard />}
      </Authenticated>
      
      <Unauthenticated>
        <div className="max-w-md mx-auto mt-20">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              Multi-App Health Monitor
            </h1>
            <p className="text-gray-600">Sign in to monitor your application suite</p>
          </div>
          <SignInForm />
        </div>
      </Unauthenticated>
    </div>
  );
}
