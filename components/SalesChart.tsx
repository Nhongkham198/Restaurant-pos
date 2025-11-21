import React from 'react';

interface SalesChartProps {
    data: number[];
    labels: string[];
    maxValue: number;
    title: string;
}

export const SalesChart: React.FC<SalesChartProps> = ({ data, labels, maxValue, title }) => {
    return (
        <div>
            <h3 className="text-lg font-bold text-gray-800 mb-4">{title}</h3>
            <div className="w-full h-64 flex items-end gap-1 sm:gap-2 p-4 pt-10 border border-gray-200 rounded-lg bg-gray-50 overflow-hidden">
                {data.map((value, index) => (
                    <div key={index} className="flex-1 h-full flex flex-col items-center justify-end group relative">
                        <div 
                            className="w-full bg-blue-400 hover:bg-blue-600 rounded-t-md transition-all duration-300 ease-out"
                            style={{ height: `${(value / maxValue) * 100}%` }}
                        >
                             <div className="absolute bottom-full mb-2 w-max left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm font-bold px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                {value.toLocaleString('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 })}
                            </div>
                        </div>
                        <span className="text-xs text-gray-500 mt-1">{labels[index]}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};