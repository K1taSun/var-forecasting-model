import React from 'react';
import { PRESETS } from '../../constants/presets';

/**
 * Sekcja wyboru predefiniowanych scenariuszy analitycznych.
 */
const PresetScenarios = ({ onApplyPreset }) => (
    <section className="presets-container glass">
        <h3>Gotowe scenariusze testowe</h3>
        <div className="presets-grid">
            {Object.entries(PRESETS).map(([key, preset]) => (
                <button key={key} className="preset-card" onClick={() => onApplyPreset(preset.shocks)}>
                    <strong>{preset.name}</strong>
                    <p>{preset.desc}</p>
                </button>
            ))}
        </div>
    </section>
);

export default PresetScenarios;
