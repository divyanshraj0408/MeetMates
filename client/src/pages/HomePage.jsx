import Nav from "../components/Navbar";

import "./homepage.css";
const HomePage = () => {
  return (
    <>
      <Nav />
      <div className="content">
        <div className="pref"></div>
        <div>
          <div className="sq1 videos"></div>
          <div className="sq2 videos"></div>
        </div>
        <div>
          <div className="chat"></div>
        </div>
      </div>
    </>
  );
};
export default HomePage;
