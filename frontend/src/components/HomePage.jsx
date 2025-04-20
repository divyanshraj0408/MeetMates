import "./homepage.css";
import Navbar from "./Navbar";

const HomePage = ({ onGoToLogin, goBack, doBackDisplay, doLoginDisplay }) => {
  return (
    <>
      <Navbar
        onGoToLogin={onGoToLogin}
        goBack={goBack}
        doBackDisplay={doBackDisplay}
        doLoginDisplay={doLoginDisplay}
      />
      <div className="home-page">
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
