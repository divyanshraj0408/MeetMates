// Five segments, one per content step. The 18+ gate and the done screen are not
// segments: counting them would make the bar start part-full and finish early.
function ProgressBar({ total, done }) {
  return (
    <div className="pf-progress">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`pf-progress-seg ${i < done ? "pf-progress-seg-on" : ""}`}
        />
      ))}
    </div>
  );
}

export default ProgressBar;
