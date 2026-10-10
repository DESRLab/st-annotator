import { Alert, Col, Container, Row } from "react-bootstrap";

import { normalizeError } from "./errors";

export type AlertsProps =
  | { error: string }
  | { success: string }
  | {
      error?: unknown;
      success?: unknown;
    }
  | { errors: Record<string, unknown> };

export interface PageContentArgs {
  title?: React.ReactNode;
  header?: React.ReactNode;
  main?: React.ReactNode;
  /**
   * Page-scoped flash only (load failures and post-submit success), rendered
   * above the page body. An action's `error` belongs to the form that produced
   * it: a dialog keeps `error` in its own body, so passing it here as well
   * reports the same rejection twice, once behind the dialog backdrop.
   */
  alerts?: AlertsProps;
}

export function PageAlerts({ alerts }: { alerts: AlertsProps }) {
  if ("errors" in alerts && alerts.errors) {
    const error = Object.entries(alerts.errors)
      .map(([k, v]) => `${k}: ${normalizeError(v)}`)
      .join("\n");

    return <Alert variant="danger">{error}</Alert>;
  }
  if ("error" in alerts && alerts.error) {
    return <Alert variant="danger">{normalizeError(alerts.error)}</Alert>;
  }
  if ("success" in alerts && alerts.success) {
    return <Alert variant="success">{normalizeError(alerts.success)}</Alert>;
  }

  return null;
}

export function createPageContent(args: PageContentArgs) {
  return (
    <>
      <title>{args.title}</title>
      <Container fluid className="p-4">
        <Row>
          <Col>
            <header>{args.header}</header>
            <hr />
            {args.alerts && <PageAlerts alerts={args.alerts} />}
            <main>{args.main}</main>
          </Col>
        </Row>
      </Container>
    </>
  );
}
