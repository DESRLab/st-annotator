import { Alert, Col, Container, Row } from "react-bootstrap";

export type AlertsProps = { error: string } | { success: string } | {
  error?: unknown,
  success?: unknown,
} | { errors: Record<string, unknown> };

export type PageContentArgs = {
  title?: React.ReactNode,
  header?: React.ReactNode,
  main?: React.ReactNode,
  alerts?: AlertsProps,
};

function formatError(x: unknown) {
  // Avoid unnecessarily escaping JSON strings
  if (typeof x === "string") return x;

  return JSON.stringify(x);
}

export function PageAlerts({ alerts }: { alerts: AlertsProps }) {
  if ("errors" in alerts && alerts.errors) {
    const error = Object.entries(alerts.errors)
      .map(([k, v]) => `${k}: ${formatError(v)}`)
      .join("\n");

    return <Alert variant="danger">{error}</Alert>;
  }
  if ("error" in alerts && alerts.error) {
    return <Alert variant="danger">{formatError(alerts.error)}</Alert>;
  }
  if ("success" in alerts && alerts.success) {
    return <Alert variant="success">{formatError(alerts.success)}</Alert>;
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
    )
}