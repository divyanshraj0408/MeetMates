// Initials circle. The hue is derived from the opaque uid, so a given person is
// always the same color without the client ever seeing their email.
function hueFromUid(uid) {
  let hash = 0;
  const source = String(uid || "");
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) % 360;
  }
  return hash;
}

function initialsFrom(name) {
  const parts = String(name || "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function Avatar({ uid, name }) {
  const hue = hueFromUid(uid);
  return (
    <div
      className="gc-avatar"
      style={{ backgroundColor: `hsl(${hue}, 55%, 45%)` }}
      title={name}
      aria-hidden="true"
    >
      {initialsFrom(name)}
    </div>
  );
}

export default Avatar;
export { hueFromUid, initialsFrom };
