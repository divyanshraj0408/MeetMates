import "./Navbar.css";
const Navbar = ({ onGoToLogin }) => {
  return (
    <>
      <header className="navbar">
        <div className="menu-icon">☰</div>
        <p className="logo">pingo</p>
        <button className="cta-btn" onClick={onGoToLogin}>
          Log In
        </button>
      </header>
    </>
  );
};
export default Navbar;
