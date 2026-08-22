import { COUNTRIES } from "../../../countries.js";

// A native select, not a custom combobox: on mobile it already has type-ahead
// and an optimised picker, for no custom code and no accessibility risk.
function PlaceField({ countryCode, city, onChange }) {
  return (
    <>
      <select
        className="pf-select"
        value={countryCode || ""}
        onChange={(e) => onChange({ countryCode: e.target.value, city })}
      >
        <option value="">pick a country</option>
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>

      <div style={{ height: 10 }} />

      <input
        className="pf-input"
        placeholder="city"
        value={city || ""}
        onChange={(e) => onChange({ countryCode, city: e.target.value })}
        maxLength={85}
      />
      <p className="pf-hint">city is fine, street is weird</p>
    </>
  );
}

export default PlaceField;
