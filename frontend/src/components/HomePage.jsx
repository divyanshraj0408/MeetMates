import "./homepage.css";

const HomePage = ({ onGoToLogin }) => {
  return (
    <>
      <div className="home-page">
        <header className="navbar">
          <div className="menu-icon">☰</div>
          <p className="logo">pingo</p>
          <button className="login-btn" onClick={onGoToLogin}>
            Log In
          </button>
        </header>
        <main className="main-content">
          <div className="container">
            <h1>
              Social anxiety?
              <br />
              Let's multiply it.
            </h1>
            <p>No bios. No filters. Just unhinged energy.</p>
            <button className="wild-btn" onClick={onGoToLogin}>
              Let’s Go Wild!
            </button>
          </div>
        </main>
      </div>
    </>
  );
};

export default HomePage;
