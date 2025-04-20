import "./Navbar.css";
const Navbar = ({ onGoToLogin, goBack, doBackDisplay, doLoginDisplay }) => {
  return (
    <>
      <header className="navbar">
        <div
          className="menu-icon"
          onClick={goBack}
          style={{ display: `${doBackDisplay}` }}
        >
          {
            <span className="material-symbols-outlined">
              arrow_back_ios_new
            </span>
          }
        </div>
        <p className="logo">pingo</p>
        <button
          className="cta-btn"
          onClick={onGoToLogin}
          style={{ display: `${doLoginDisplay}` }}
        >
          Log In
        </button>
        <div style={{ display: `${!doLoginDisplay}` }}></div>
      </header>
    </>
  );
};
export default Navbar;
