export const GENDERS = ["man", "woman", "non-binary", "prefer not to say"];

function GenderField({ value, onChange }) {
  return (
    <div className="pf-chips">
      {GENDERS.map((g) => (
        <button
          key={g}
          type="button"
          className={`pf-chip pf-chip-plain ${value === g ? "pf-chip-on" : ""}`}
          onClick={() => onChange(value === g ? "" : g)}
        >
          {g}
        </button>
      ))}
    </div>
  );
}

export default GenderField;
