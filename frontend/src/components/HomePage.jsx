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

        <main className="main-content" >
         
          <div className="container">
 <a
            href="https://www.producthunt.com/products/ping-pals?embed=true&utm_source=badge-featured&utm_medium=badge"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1003754&theme=light&t=1755161217854"
              alt="Ping Pals - No bios. No filters. Just unhinged energy. | Product Hunt"
              style={{ width: "250px", height: "54px", borderRadius: "30px", backgroundColor: "#ffea00" }}
              width="250"
              height="54"
            />
          </a>
            <h1>

              Social anxiety?
              <br />
              Let's multiply it.
            </h1>
            <p>No bios. No filters. Just unhinged energy.</p>
            <div className="cta-sec">
              <button className="wild-btn" onClick={onGoToLogin}>
                Let’s Go Wild!
              </button>
              Meet someone new

            </div>

          </div>

        </main>
      </div>
    </>
  );
};

export default HomePage;
