import { Outlet, useNavigate } from "react-router";
import Button from 'react-bootstrap/Button';
import Container from 'react-bootstrap/Container';
import Form from 'react-bootstrap/Form';
import Nav from 'react-bootstrap/Nav';
import Navbar from 'react-bootstrap/Navbar';


export function PublicNavBar() {
  const navigate = useNavigate();

  return (
    <Navbar bg="light" data-bs-theme="light" expand="lg">
      <Container fluid>
        <Navbar.Brand href="/"><img src="/assets/logo.png" alt="ST Annotator Platform" height="32" /></Navbar.Brand>
        <Navbar.Toggle aria-controls="basic-navbar-nav" />
        <Navbar.Collapse id="main-navbar">
          <Nav className="me-auto" />
          <Form
            onSubmit={(event) => {
              event.preventDefault();
              navigate("/login");
            }}
          >
            <Button href="/login" variant="outline-primary">Sign in</Button>
          </Form>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}


export default function PublicLayout() {
  return (
    <>
      <PublicNavBar />
      <Outlet />
    </>
  );
}
