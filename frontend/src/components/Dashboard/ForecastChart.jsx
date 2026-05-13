import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { VARIABLES, getColor } from '../../constants/variables';

/**
 * Komponent odpowiedzialny za wizualizację szeregów czasowych oraz punktów interwencji.
 */
const ForecastChart = ({ data, shocks }) => {
    // Określenie daty początkowej prognozy dla celów graficznych
    const forecastStartKey = useMemo(() => {
        const forecastStartObj = data.find(d => d.is_forecast);
        return forecastStartObj ? forecastStartObj.date : null;
    }, [data]);

    // Dynamiczne generowanie linii pionowych dla każdego impulsu w harmonogramie
    const shockLines = useMemo(() => {
        if (!forecastStartKey) return [];
        return shocks.map(s => {
            const fDate = new Date(forecastStartKey);
            fDate.setMonth(fDate.getMonth() + s.delay);
            const shockDateStr = fDate.toISOString().split('T')[0].substring(0, 7);
            const actualDate = data.find(d => d.date.startsWith(shockDateStr))?.date;

            return actualDate ? (
                <ReferenceLine 
                    key={`shock-${s.id}`}
                    yAxisId="left"
                    x={actualDate}
                    stroke={getColor(s.variable)}
                    strokeOpacity={0.3}
                />
            ) : null;
        }).filter(Boolean);
    }, [shocks, forecastStartKey, data]);

    return (
        <div className="chart-panel glass">
            <h3>Symulacja Prognostyczna i Analiza Impulsów</h3>
            <div style={{ width: '100%', height: 400 }}>
                <ResponsiveContainer>
                    <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.05} />
                        <XAxis dataKey="date" tick={{fill: '#64748b', fontSize: 11}} />
                        <YAxis yAxisId="left" tick={{fill: '#64748b'}} />
                        <YAxis yAxisId="right" orientation="right" tick={{fill: '#64748b'}} />
                        
                        <Tooltip 
                            contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px'}} 
                            itemStyle={{fontSize: '13px'}}
                        />
                        <Legend verticalAlign="top" height={36} iconType="circle"/>

                        {forecastStartKey && (
                            <ReferenceLine 
                                yAxisId="left" 
                                x={forecastStartKey} 
                                stroke="#334155" 
                                strokeDasharray="4 4" 
                                label={{ position: 'top', value: 'PROGNOZA', fill: '#64748b', fontSize: 10, letterSpacing: '1px' }} 
                            />
                        )}

                        {shockLines}

                        {Object.entries(VARIABLES).map(([key, info]) => (
                            <Line 
                                key={key}
                                yAxisId={info.axis} 
                                type="monotone" 
                                dataKey={key} 
                                name={info.label} 
                                stroke={info.color} 
                                dot={false} 
                                strokeWidth={2} 
                                isAnimationActive={true} 
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default ForecastChart;
