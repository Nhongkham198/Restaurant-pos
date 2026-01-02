
import React from 'react';

interface SalesChartProps {
    data: number[];
    labels: string[];
    images?: string[]; // Add optional images prop
    maxValue: number;
    title: string;
    formatValue?: (value: number) => string;
}

export const SalesChart: React.FC<SalesChartProps> = ({ data, labels, images, maxValue, title, formatValue }) => {
    return (
        <div>
            <h3 className="text-lg font-bold text-gray-800 mb-4">{title}</h3>
            {/* Container with horizontal scroll support */}
            <div className="w-full border border-gray-200 rounded-lg bg-gray-50 overflow-x-auto">
                {/* Inner container with min-width to ensure bars are not squashed */}
                <div className="h-64 flex items-end gap-1 sm:gap-4 p-4 pt-10 pb-2 min-w-[600px]">
                    {data.map((value, index) => (
                        <div key={index} className="flex-1 h-full flex flex-col items-center justify-end group relative">
                            {/* Bar */}
                            <div 
                                className="w-full bg-blue-400 hover:bg-blue-600 rounded-t-md transition-all duration-300 ease-out min-w-[20px] relative"
                                style={{ height: `${(value / maxValue) * 100}%` }}
                            >
                                 <div className="absolute bottom-full mb-2 w-max left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm font-bold px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                    {formatValue ? formatValue(value) : value.toLocaleString('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 })}
                                </div>
                            </div>
                            
                            {/* X-Axis Label (Image + Text) */}
                            <div className="mt-2 flex flex-col items-center justify-start h-16">
                                {images && images[index] ? (
                                    <div className="w-8 h-8 rounded-md overflow-hidden border border-gray-300 bg-white mb-1 shadow-sm flex-shrink-0">
                                        <img 
                                            src={images[index]} 
                                            alt={labels[index]} 
                                            className="w-full h-full object-cover"
                                            onError={(e) => e.currentTarget.style.display = 'none'}
                                        />
                                    </div>
                                ) : (
                                    // Placeholder if image is missing but images prop is passed
                                    images && (
                                        <div className="w-8 h-8 rounded-md bg-gray-200 border border-gray-300 mb-1 flex items-center justify-center text-gray-400">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                    )
                                )}
                                <span className="text-xs text-gray-600 text-center leading-tight line-clamp-2 max-w-[80px]" title={labels[index]}>
                                    {labels[index]}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
