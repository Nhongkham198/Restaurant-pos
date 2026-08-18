
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { UIProvider } from './contexts/UIContext';
import { DataProvider } from './contexts/DataContext';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    
    // Check if error is a chunk load error
    const isChunkLoadError = 
      error.name === 'ChunkLoadError' || 
      /Failed to fetch dynamically imported module/.test(error.message) ||
      /Loading chunk .* failed/.test(error.message);

    if (isChunkLoadError) {
      // Use sessionStorage to prevent infinite refresh loops
      const hasReloaded = sessionStorage.getItem('last_chunk_error_reload');
      const now = Date.now();
      
      // If we haven't reloaded in the last 10 seconds for this reason
      if (!hasReloaded || now - parseInt(hasReloaded) > 10000) {
        sessionStorage.setItem('last_chunk_error_reload', now.toString());
        console.warn("Chunk load error detected. Attempting automatic recovery via refresh...");
        window.location.reload();
      }
    }
  }

  handleResetAndClear = () => {
    try {
      // Clear all potential corrupt local state & caches
      localStorage.clear();
      sessionStorage.clear();
      
      // Safely try to unregister service workers if any
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          for (const registration of registrations) {
            registration.unregister();
          }
        });
      }
      
      console.log("Caches and session data successfully cleared.");
    } catch (e) {
      console.error("Error clearing caches:", e);
    }
    // Reload the application from scratch
    window.location.href = window.location.origin + window.location.pathname;
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4 font-sans">
          <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-xl max-w-md w-full border border-gray-100 animate-in fade-in zoom-in duration-200">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <h1 className="text-xl font-extrabold text-gray-800 text-center mb-2">เกิดข้อผิดพลาดในการโหลดระบบ</h1>
            <p className="text-sm text-gray-500 text-center mb-6 leading-relaxed">
              ระบบพบอุปสรรคชั่วคราวในการประมวลผลข้อมูลหน้าจอ (เช่น ข้อมูลจำลองค้างสะสม หรือเซสชันหมดอายุ) คุณสามารถกู้คืนระบบได้ทันทีด้วยสองทางเลือกด้านล่างครับ
            </p>
            
            <div className="bg-red-50/50 p-3 rounded-xl border border-red-100 overflow-auto max-h-32 mb-6 scrollbar-hide">
              <code className="text-xs text-red-700 font-mono block text-center break-all">{this.state.error?.toString()}</code>
            </div>
            
            <div className="space-y-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold transition-all text-sm shadow-md hover:shadow-lg active:scale-98"
              >
                🔄 รีเฟรชหน้าจอ (โหลดซ้ำ)
              </button>
              
              <button
                onClick={this.handleResetAndClear}
                className="w-full bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-700 py-3 rounded-xl font-bold transition-all text-sm border border-gray-200 hover:border-red-200"
                title="ล้างข้อมูลค้างที่ผิดพลาดทั้งหมดแล้วเริ่มใหม่"
              >
                🧹 ล้างแคชทั้งหมดแล้วเริ่มใหม่ (แก้หน้าจอขาว)
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(
  <ErrorBoundary>
    <UIProvider>
      <DataProvider>
        <App />
      </DataProvider>
    </UIProvider>
  </ErrorBoundary>
);
