import { useAppStore } from '../store/useAppStore';
import { Save } from 'lucide-react';
import { useState } from 'react';

export function SettingsPanel() {
  const { settings, updateSettings } = useAppStore();
  const [local, setLocal] = useState({ ...settings });
  const [saved, setSaved] = useState(false);

  const update = (key: keyof typeof local, value: unknown) => {
    setLocal((s) => ({ ...s, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    await updateSettings(local);
    setSaved(true);
  };

  return (
    <div className="settings-panel">
      <div className="section-title">Settings</div>

      <div className="settings-group">
        <label>Default plate diameter (m)</label>
        <input
          type="number"
          step="0.01"
          min="0.1"
          max="1"
          value={local.defaultPlateDiameter}
          onChange={(e) => update('defaultPlateDiameter', parseFloat(e.target.value))}
          className="input-full"
        />
        <span className="hint">Standard competition plate: 0.45 m</span>
      </div>

      <div className="settings-group">
        <label>Analysis sample rate (fps)</label>
        <input
          type="number"
          step="1"
          min="5"
          max="60"
          value={local.sampleRate}
          onChange={(e) => update('sampleRate', parseInt(e.target.value))}
          className="input-full"
        />
        <span className="hint">Higher = more accurate but slower. 15–30 is typical.</span>
      </div>

      <div className="settings-group">
        <label>Marker search radius (pixels)</label>
        <input
          type="number"
          step="5"
          min="20"
          max="200"
          value={local.markerSearchRadius}
          onChange={(e) => update('markerSearchRadius', parseInt(e.target.value))}
          className="input-full"
        />
        <span className="hint">How far to search each frame for the marker. Bigger = more robust but slower.</span>
      </div>

      <div className="settings-group">
        <label>Preferred units</label>
        <div className="radio-row">
          <label><input type="radio" value="lb" checked={local.units === 'lb'} onChange={() => update('units', 'lb')} /> lb</label>
          <label><input type="radio" value="kg" checked={local.units === 'kg'} onChange={() => update('units', 'kg')} /> kg</label>
        </div>
      </div>

      <div className="settings-group">
        <label>Default load increment</label>
        <div className="radio-row">
          {([2.5, 5] as const).map((v) => (
            <label key={v}><input type="radio" value={v} checked={local.defaultIncrement === v && local.units === 'lb'} onChange={() => { update('defaultIncrement', v); update('units', 'lb'); }} /> {v} lb</label>
          ))}
          {([1.25, 2.5] as const).map((v) => (
            <label key={`kg${v}`}><input type="radio" value={v} checked={local.defaultIncrement === v && local.units === 'kg'} onChange={() => { update('defaultIncrement', v); update('units', 'kg'); }} /> {v} kg</label>
          ))}
        </div>
      </div>

      <button className="btn-primary full-width" onClick={handleSave}>
        <Save size={16} /> {saved ? 'Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}
