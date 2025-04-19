import "./homepage.css";
import Navbar from "./Navbar";

const HomePage = ({ onGoToLogin }) => {
  return (
    <>
      <Navbar onGoToLogin={onGoToLogin} />
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
