
import React from 'react';

interface SalesChartProps {
    data: number[] | number[][];
    labels: string[];
    seriesLabels?: string[];
    images?: string[];
    maxValue: number;
    title: string;
    formatValue?: (value: number) => string;
    onBarClick?: (index: number) => void;
    selectedIndex?: number | null;
}

export const SalesChart: React.FC<SalesChartProps> = ({ data, labels, seriesLabels, images, maxValue, title, formatValue, onBarClick, selectedIndex }) => {
    // Gradient Palette
    const gradientColors = [
        '#63C7D4', // Teal
        '#6BCFA6', // Teal-Green
        '#7CD571', // Green
        '#90DB46', // Lime-Green
        '#A4DF37'  // Yellow-Green
    ];

    const isMultiSeries = Array.isArray(data[0]);
    const multiData = isMultiSeries ? (data as number[][]) : [(data as number[])];

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
                {title && <h3 className="text-lg font-bold text-gray-800">{title}</h3>}
                {isMultiSeries && seriesLabels && (
                    <div className="flex gap-4">
                        {seriesLabels.map((label, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: i === 0 ? '#3b82f6' : '#ef4444' }}></div>
                                <span className="text-xs font-bold text-gray-600">{label}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            {/* Container with horizontal scroll support */}
            <div className="w-full border border-gray-200 rounded-lg bg-gray-50 overflow-x-auto">
                {/* Inner container with min-width to ensure bars are not squashed */}
                <div className="h-64 flex items-end gap-2 sm:gap-6 p-4 pt-10 pb-2 min-w-[600px]">
                    {labels.map((label, index) => {
                        const isSelected = selectedIndex === index;
                        const isInteractable = !!onBarClick;
                        
                        return (
                            <div 
                                key={index} 
                                className={`flex-1 h-full flex flex-col items-center justify-end group relative ${isInteractable ? 'cursor-pointer' : ''}`}
                                onClick={() => isInteractable && onBarClick && onBarClick(index)}
                            >
                                {/* Group of Bars */}
                                <div className="w-full flex items-end justify-center gap-0.5 h-full relative">
                                    {multiData.map((series, sIdx) => {
                                        const value = series[index];
                                        const barColor = isMultiSeries 
                                            ? (sIdx === 0 ? '#3b82f6' : '#ef4444') 
                                            : (isSelected ? '#f97316' : gradientColors[index % gradientColors.length]);
                                        
                                        const heightPercent = maxValue !== 0 ? (Math.abs(value) / Math.abs(maxValue)) * 100 : 0;
                                        const isNegative = value < 0;

                                        return (
                                            <div 
                                                key={sIdx}
                                                className={`flex-1 rounded-t-sm transition-all duration-300 ease-out min-w-[10px] relative ${
                                                    isSelected ? 'shadow-md ring-1 ring-orange-300' : 'hover:opacity-90'
                                                }`}
                                                style={{ 
                                                    height: `${heightPercent}%`,
                                                    backgroundColor: barColor,
                                                    marginBottom: isNegative ? `-${heightPercent}%` : '0',
                                                    transform: isNegative ? 'scaleY(-1)' : 'none',
                                                    transformOrigin: 'bottom'
                                                }}
                                            >
                                                {/* Value Label */}
                                                {value !== 0 && (
                                                    <div className={`absolute ${isNegative ? 'top-full mt-1' : 'bottom-full mb-1'} w-max left-1/2 -translate-x-1/2 z-10`}>
                                                        <span className={`text-[8px] sm:text-[10px] font-bold px-1 py-0.5 rounded ${isSelected ? 'bg-gray-800 text-white' : 'text-gray-600 bg-white/80 shadow-sm border border-gray-200'}`}>
                                                            {formatValue ? formatValue(value) : value.toLocaleString()}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                
                                {/* X-Axis Label */}
                                <div className="mt-2 flex flex-col items-center justify-start h-12">
                                    {images && images[index] && (
                                        <div className={`w-6 h-6 rounded-md overflow-hidden border mb-1 shadow-sm flex-shrink-0 ${isSelected ? 'border-orange-500 ring-2 ring-orange-200' : 'border-gray-300 bg-white'}`}>
                                            <img 
                                                src={images[index]} 
                                                alt={labels[index]} 
                                                className="w-full h-full object-cover"
                                                onError={(e) => e.currentTarget.style.display = 'none'}
                                            />
                                        </div>
                                    )}
                                    <span className={`text-[10px] text-center leading-tight line-clamp-2 max-w-[60px] ${isSelected ? 'font-bold text-orange-600' : 'text-gray-600'}`} title={labels[index]}>
                                        {labels[index]}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
