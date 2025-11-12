import React from 'react';

interface PieChartProps {
    data: number[];
    labels: string[];
    colors: string[];
    title: string;
}

const PieChart: React.FC<PieChartProps> = ({ data, labels, colors, title }) => {
    const total = data.reduce((sum, value) => sum + value, 0);

    if (total === 0) {
        return (
            <div className="bg-white p-4 sm:p-6 rounded-xl shadow-md text-center h-full flex flex-col">
                <h3 className="text-lg font-bold text-gray-800 mb-2">{title}</h3>
                <div className="flex-1 flex items-center justify-center text-gray-500">
                    <p>ไม่มีข้อมูล</p>
                </div>
            </div>
        );
    }

    let cumulativeAngle = 0;

    const slices = data.map((value, index) => {
        const sliceAngle = (value / total) * 360;
        // If the angle is 360, it won't render as an arc. Use a slightly smaller value to force rendering a full circle.
        const angle = sliceAngle >= 360 ? 359.99 : sliceAngle;
        
        const startAngleRad = (cumulativeAngle * Math.PI) / 180;
        const endAngleRad = ((cumulativeAngle + angle) * Math.PI) / 180;

        const x1 = 50 + 40 * Math.cos(startAngleRad);
        const y1 = 50 + 40 * Math.sin(startAngleRad);
        const x2 = 50 + 40 * Math.cos(endAngleRad);
        const y2 = 50 + 40 * Math.sin(endAngleRad);

        const largeArcFlag = angle > 180 ? 1 : 0;

        const pathData = `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

        let transform = '';
        // Explode the "takeaway" slice. The label is "กลับบ้าน"
        if (labels[index] === 'กลับบ้าน') {
            const explosionFactor = 5; // How much to pull the slice out
            const middleAngle = cumulativeAngle + (angle / 2);
            const middleAngleRad = (middleAngle * Math.PI) / 180;
            
            const offsetX = explosionFactor * Math.cos(middleAngleRad);
            const offsetY = explosionFactor * Math.sin(middleAngleRad);
            
            transform = `translate(${offsetX}, ${offsetY})`;
        }

        cumulativeAngle += sliceAngle;

        return <path key={index} d={pathData} fill={colors[index % colors.length]} transform={transform} />;
    });

    return (
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-md h-full">
            <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">{title}</h3>
            <div className="flex flex-col items-center justify-center gap-6">
                <div className="w-40 h-40 flex-shrink-0">
                    <svg viewBox="0 0 100 100" className="transform -rotate-90">
                        {slices}
                    </svg>
                </div>
                <div className="space-y-2 text-base w-full">
                    {labels.map((label, index) => {
                         const percentage = total > 0 ? ((data[index] / total) * 100).toFixed(1) : 0;
                        return (
                            <div key={index} className="flex items-center">
                                <span
                                    className="w-4 h-4 rounded-sm mr-3 flex-shrink-0"
                                    style={{ backgroundColor: colors[index % colors.length] }}
                                ></span>
                                <span className="text-gray-700 font-medium truncate">{label}:</span>
                                <span className="ml-auto text-gray-800 font-semibold whitespace-nowrap pl-2">{data[index].toLocaleString()} ({percentage}%)</span>
                            </div>
                        );
                    })}
                     <div className="flex items-center pt-2 border-t mt-2">
                        <span className="w-4 h-4 rounded-sm mr-3 invisible"></span>
                        <span className="text-gray-900 font-bold">รวม:</span>
                        <span className="ml-auto text-gray-900 font-bold">{total.toLocaleString()} (100.0%)</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PieChart;