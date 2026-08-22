export const AGE_BANDS = ["18-21", "22-25", "26-30", "31-40", "41+"];

function AgeField({ value, onChange }) {
  return (
    <div className="pf-chips">
      {AGE_BANDS.map((band) => (
        <button
          key={band}
          type="button"
          className={`pf-chip pf-chip-plain ${value === band ? "pf-chip-on" : ""}`}
          onClick={() => onChange(value === band ? "" : band)}
        >
          {band}
        </button>
      ))}
    </div>
  );
}

export default AgeField;
