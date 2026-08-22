const MAX_BIO = 200;

function BioField({ value = "", onChange }) {
  return (
    <>
      <textarea
        className="pf-bio"
        placeholder="one or two lines. what should someone know?"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={MAX_BIO}
      />
      <p className="pf-hint">
        {MAX_BIO - value.length} left. no handles or numbers — nobody can find
        you after a call and we'd like to keep it that way
      </p>
    </>
  );
}

export default BioField;
