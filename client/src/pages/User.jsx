import { Avatar } from "@nextui-org/react";
import Nav from "../components/Navbar";

const User = () => {
  return (
    <>
      <Nav />
      <Avatar
        src="https://i.pravatar.cc/150?u=a04258114e29026708c"
        className="w-20 h-20 text-large"
      />
    </>
  );
};
export default User;
