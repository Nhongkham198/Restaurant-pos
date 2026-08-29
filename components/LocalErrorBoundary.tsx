import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  title?: string;
  className?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class LocalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("LocalErrorBoundary caught an error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className={`flex flex-col items-center justify-center p-8 bg-amber-50/50 border border-amber-200/60 rounded-3xl text-center max-w-lg mx-auto my-6 ${this.props.className || ''}`}>
          <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          
          <h3 className="text-base font-black text-gray-800 mb-1.5">
            {this.props.title || 'ไม่สามารถแสดงผลส่วนนี้ได้ชั่วคราว'}
          </h3>
          <p className="text-xs text-gray-500 max-w-xs leading-relaxed mb-5">
            ระบบพบอุปสรรคชั่วคราวในการโหลดข้อมูลส่วนนี้ คุณสามารถกดเพื่อลองใหม่อีกครั้งครับ
          </p>
          
          <button
            onClick={this.handleRetry}
            className="bg-white hover:bg-gray-50 text-gray-800 border border-gray-200/80 px-5 py-2.5 rounded-2xl text-xs font-bold shadow-sm transition-all hover:scale-98 active:scale-95"
          >
            🔄 โหลดข้อมูลส่วนนี้ใหม่
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
