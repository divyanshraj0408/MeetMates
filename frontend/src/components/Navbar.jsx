import "./Navbar.css";
const Navbar = ({ onGoToLogin, goBack, doDisplay }) => {
  return (
    <>
      <header className="navbar">
        <button
          className="menu-icon"
          onClick={goBack}
          style={{ display: `${doDisplay}` }}
        >
          {"<-"}
        </button>
        <p className="logo">pingo</p>
        <button className="cta-btn" onClick={onGoToLogin}>
          Log In
        </button>
      </header>
    </>
  );
};
export default Navbar;
