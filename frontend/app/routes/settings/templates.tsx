import { Col, Container, Nav, Row } from 'react-bootstrap';

import { LayoutNavLink } from '../../components/LayoutNavLink';
import { getCurrentSession, getUser, redirectAndCommit } from '../../loaders';
import { createPageContent, type AlertsProps } from '../../templates';

import type { Route } from "../+types/dashboard";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getCurrentSession(request);

  const user = getUser(session);
  if (!user) {
    session.flash("error", "Your session has expired. Please log in again.");
    return redirectAndCommit("/login", session);
  }

  return { user };
}

type SettingsMainContentArgs = {
  main?: React.ReactNode,
};

export function SettingsMainContent({ main }: SettingsMainContentArgs) {
  return (
    <Container>
      <Row>
        <Col
          className="d-flex flex-column flex-shrink-0 p-3"
          style={{ maxWidth: "256px" }}
        >
          <a href="/settings" className="d-flex align-items-center mb-3 mb-md-0 me-md-auto text-decoration-none">
            <i className="fas fa-cogs fa-fw"></i>
            <span className="fs-4">&nbsp;Settings</span>
          </a>
          <hr />
          <Nav variant="pills" className="flex-column mb-auto">
            <LayoutNavLink href="/settings/profile"><i className="fas fa-user fa-fw"></i>&nbsp;Profile</LayoutNavLink>
            <LayoutNavLink href="/settings/account"><i className="fas fa-cog fa-fw"></i>&nbsp;Account</LayoutNavLink>
            <LayoutNavLink href="/settings/authentication"><i className="fas fa-lock fa-fw"></i>&nbsp;Authentication</LayoutNavLink>
            <LayoutNavLink href="/settings/preferences"><i className="fas fa-bars fa-fw"></i>&nbsp;Preferences</LayoutNavLink>
          </Nav>
        </Col>
        <Col
          className="d-flex flex-column flex-shrink-0 p-3"
          id="main-content-right"
        >
          {main}
        </Col>
      </Row>
    </Container>
  )
}

type SettingsPageContentArgs = {
  main?: React.ReactNode,
  alerts?: AlertsProps,
};

export function createSettingsPageContent({ main, alerts }: SettingsPageContentArgs) {
  return createPageContent({
    title: "Settings",
    main: SettingsMainContent({ main }),
    alerts: alerts,
  })
}
