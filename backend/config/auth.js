// auth.js - Handles authentication logic

const verifyCollegeEmail = (email) => {
  return email.endsWith("@adgitmdelhi.ac.in");
};

const authenticateUser = (socket, collegeEmail) => {
  if (!verifyCollegeEmail(collegeEmail)) {
    socket.emit("error", "Please use your college email");
    return false;
  }
  return true;
};

module.exports = { authenticateUser };
