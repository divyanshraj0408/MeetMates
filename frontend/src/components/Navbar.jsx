import "./Navbar.css";
const Navbar = ({ onGoToLogin, goBack, doDisplay }) => {
  return (
    <>
      <header className="navbar">
        <div
          className="menu-icon"
          onClick={goBack}
          style={{ display: `${doDisplay}` }}
        >
          {
            <span className="material-symbols-outlined">
              arrow_back_ios_new
            </span>
          }
        </div>
        <p className="logo">pingo</p>
        <button className="cta-btn" onClick={onGoToLogin}>
          Log In
        </button>
      </header>
    </>
  );
};
export default Navbar;
