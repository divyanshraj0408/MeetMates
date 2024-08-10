import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  Link,
  Button,
} from "@nextui-org/react";

export default function Nav() {
  const navigate = useNavigate();
  const handleAuth = () => {
    navigate(`/auth`);
  };
  return (
    <Navbar>
      <NavbarBrand>
        <p className="font-bold text-inherit">Room Ball</p>
      </NavbarBrand>
      <NavbarContent justify="end">
        <NavbarItem>
          <Button as={Link} color="primary" variant="flat" onClick={handleAuth}>
            Sign Up
          </Button>
        </NavbarItem>
      </NavbarContent>
    </Navbar>
  );
}
