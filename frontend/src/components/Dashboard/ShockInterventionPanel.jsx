import React from 'react';
import { VARIABLES, getUnit } from '../../constants/variables';

/**
 * Panel kontrolny służący do definiowania własnych impulsów (shocks) w modelu.
 * Pozwala na dynamiczne dodawanie, usuwanie i modyfikację parametrów interwencji.
 */
const ShockInterventionPanel = ({ shocks, onAdd, onRemove, onUpdate, onReset }) => (
    <div className="simulator-panel glass">
        <div className="panel-header">
            <h2>Scenariusze i Harmonogram Interwencji</h2>
            <button className="add-btn" onClick={onAdd}>+ Nowy impuls</button>
        </div>

        <div className="shocks-list">
            {shocks.length === 0 && (
                <p className="empty-msg">Brak aktywnych interwencji. Wybierz scenariusz testowy lub dodaj impuls ręcznie.</p>
            )}
            
            {shocks.map((s) => (
                <div key={s.id} className={`shock-row card shock-var-${s.variable}`}>
                    <div className="shock-col">
                        <label>Zmienna docelowa:</label>
                        <select 
                            value={s.variable} 
                            onChange={(e) => onUpdate(s.id, 'variable', e.target.value)}
                        >
                            {Object.entries(VARIABLES).map(([key, info]) => (
                                <option key={key} value={key}>{info.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="shock-col">
                        <label>Amplituda ({getUnit(s.variable)}):</label>
                        <input 
                            type="number" 
                            value={s.value} 
                            onChange={(e) => onUpdate(s.id, 'value', e.target.value)}
                        />
                    </div>

                    <div className="shock-col">
                        <label>Przesunięcie (t+ k):</label>
                        <input 
                            type="number" min="0" max="23"
                            value={s.delay} 
                            onChange={(e) => onUpdate(s.id, 'delay', e.target.value)}
                        />
                    </div>

                    <button className="remove-btn" onClick={() => onRemove(s.id)}>Usuń</button>
                </div>
            ))}
        </div>

        {shocks.length > 0 && (
            <div className="panel-footer">
                <button className="reset-btn" onClick={onReset}>Wyczyść harmonogram</button>
                <small className="hint">Trajektoria IRF (Impulse Response Function) jest rekurencyjnie przeliczana dla każdego punktu interwencji.</small>
            </div>
        )}
    </div>
);

export default ShockInterventionPanel;
